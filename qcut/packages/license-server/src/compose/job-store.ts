import { sql } from "@qcut/db";
import { db } from "../db/drizzle";
import type { ComposeIntent, ComposeSnapshot } from "@qcut/editor-core/compose";

export interface ComposeCloudInput {
	snapshot: ComposeSnapshot;
	intent: ComposeIntent;
}
export interface ComposeCloudRow extends Record<string, unknown> {
	id: string;
	user_id: string;
	status: "queued" | "running" | "completed" | "failed" | "canceled";
	input: ComposeCloudInput;
	input_hash: string;
	result: unknown;
	attempt: number;
	lease_token: string | null;
	error_code: string | null;
}

export const composeJobStore = {
	async create({
		id,
		userId,
		input,
		inputHash,
	}: {
		id: string;
		userId: string;
		input: ComposeCloudInput;
		inputHash: string;
	}): Promise<ComposeCloudRow> {
		return db.transaction(async (tx) => {
			// Serialize admission per account: concurrent submits cannot evade the quota.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
			const existing = await tx.execute<ComposeCloudRow>(
				sql`SELECT * FROM compose_jobs WHERE id = ${id} AND user_id = ${userId}`
			);
			if (existing[0]) {
				if (existing[0].input_hash !== inputHash)
					throw new Error("compose_idempotency_conflict");
				return existing[0];
			}
			const counts = await tx.execute<{ active: number; daily: number }>(
				sql`SELECT count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS active, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS daily FROM compose_jobs WHERE user_id = ${userId}`
			);
			if (counts[0].active >= 3 || counts[0].daily >= 20)
				throw new Error("compose_quota_exceeded");
			const rows = await tx.execute<ComposeCloudRow>(
				sql`INSERT INTO compose_jobs (id, user_id, input, input_hash) VALUES (${id}, ${userId}, ${JSON.stringify(input)}::jsonb, ${inputHash}) ON CONFLICT DO NOTHING RETURNING *`
			);
			if (!rows[0]) throw new Error("compose_idempotency_conflict");
			return rows[0];
		});
	},
	async get({
		id,
		userId,
	}: {
		id: string;
		userId: string;
	}): Promise<ComposeCloudRow | undefined> {
		const rows = await db.execute<ComposeCloudRow>(
			sql`SELECT * FROM compose_jobs WHERE id = ${id} AND user_id = ${userId}`
		);
		return rows[0];
	},
	async cancel({
		id,
		userId,
	}: {
		id: string;
		userId: string;
	}): Promise<ComposeCloudRow | undefined> {
		await db.execute(
			sql`UPDATE compose_jobs SET status = 'canceled', lease_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND user_id = ${userId} AND status IN ('queued', 'running')`
		);
		return this.get({ id, userId });
	},
	async claim(): Promise<ComposeCloudRow | undefined> {
		const token = crypto.randomUUID();
		await db.execute(
			sql`UPDATE compose_jobs SET status = 'failed', error_code = 'retry-limit', updated_at = now() WHERE status = 'running' AND lease_expires_at < now() AND attempt >= 3`
		);
		const rows = await db.execute<ComposeCloudRow>(
			sql`UPDATE compose_jobs SET status = 'running', attempt = attempt + 1, lease_token = ${token}, lease_expires_at = now() + interval '5 minutes', updated_at = now() WHERE id = (SELECT id FROM compose_jobs WHERE (status = 'queued' OR (status = 'running' AND lease_expires_at < now())) AND attempt < 3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`
		);
		return rows[0];
	},
	async finish({
		id,
		leaseToken,
		result,
		errorCode,
	}: {
		id: string;
		leaseToken: string;
		result?: unknown;
		errorCode?: string;
	}): Promise<boolean> {
		const rows = await db.execute(
			sql`UPDATE compose_jobs SET status = ${errorCode ? "failed" : "completed"}, result = ${JSON.stringify(result ?? null)}::jsonb, error_code = ${errorCode ?? null}, lease_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND lease_token = ${leaseToken} AND status = 'running' AND lease_expires_at > now() RETURNING id`
		);
		return rows.length === 1;
	},
};
