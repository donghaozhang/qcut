import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { composeJobStore, type ComposeCloudInput } from "./job-store";

const database = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock("../db/drizzle", () => ({ db: database }));
let pg: PGlite;
const dialect = new PgDialect();
const input = {
	snapshot: { id: "snapshot" },
	intent: { kind: "full-compose" },
} as ComposeCloudInput;

beforeEach(async () => {
	pg = new PGlite();
	await pg.exec(
		"CREATE TABLE users (id text PRIMARY KEY); INSERT INTO users VALUES ('owner'), ('other');"
	);
	await pg.exec(
		await readFile(
			new URL("../../../db/migrations/0010_compose_jobs.sql", import.meta.url),
			"utf8"
		)
	);
	database.execute.mockImplementation(async (statement: SQL) => {
		const query = dialect.sqlToQuery(statement);
		return (await pg.query(query.sql, query.params)).rows;
	});
	database.transaction.mockImplementation(
		(
			action: (tx: {
				execute: (sql: SQL) => Promise<unknown[]>;
			}) => Promise<unknown>
		) =>
			pg.transaction((tx) =>
				action({
					execute: async (statement) => {
						const query = dialect.sqlToQuery(statement);
						return (await tx.query(query.sql, query.params)).rows;
					},
				})
			)
	);
});
afterEach(async () => {
	await pg.close();
});

async function create({
	id = "job",
	userId = "owner",
	inputHash = "hash",
}: {
	id?: string;
	userId?: string;
	inputHash?: string;
} = {}) {
	return composeJobStore.create({ id, userId, input, inputHash });
}

describe("Compose PostgreSQL queue", () => {
	it("applies the real migration, preserves idempotency and rejects ownership collisions", async () => {
		expect((await create()).status).toBe("queued");
		expect((await create()).id).toBe("job");
		await expect(create({ inputHash: "different" })).rejects.toThrow(
			"compose_idempotency_conflict"
		);
		await expect(create({ userId: "other" })).rejects.toThrow(
			"compose_idempotency_conflict"
		);
		expect(
			await composeJobStore.get({ id: "job", userId: "other" })
		).toBeUndefined();
	});
	it("enforces active and daily admission limits", async () => {
		await create({ id: "a" });
		await create({ id: "b" });
		await create({ id: "c" });
		await expect(create({ id: "d" })).rejects.toThrow("compose_quota_exceeded");
		await pg.exec(
			"UPDATE compose_jobs SET status = 'completed'; INSERT INTO compose_jobs (id,user_id,input,input_hash,status) SELECT 'seed-' || n, 'owner', '{}'::jsonb, 'hash', 'completed' FROM generate_series(1,17) n;"
		);
		await expect(create({ id: "daily" })).rejects.toThrow(
			"compose_quota_exceeded"
		);
	});
	it("reclaims an expired lease and rejects the stale worker's result", async () => {
		await create();
		const first = await composeJobStore.claim();
		expect(first?.attempt).toBe(1);
		expect(await composeJobStore.claim()).toBeUndefined();
		await pg.exec(
			"UPDATE compose_jobs SET lease_expires_at = now() - interval '1 second';"
		);
		const second = await composeJobStore.claim();
		expect(second?.attempt).toBe(2);
		expect(second?.lease_token).not.toBe(first?.lease_token);
		expect(
			await composeJobStore.finish({
				id: "job",
				leaseToken: first?.lease_token ?? "",
				result: "stale",
			})
		).toBe(false);
		expect(
			await composeJobStore.finish({
				id: "job",
				leaseToken: second?.lease_token ?? "",
				result: { operations: [] },
			})
		).toBe(true);
		expect(
			(await composeJobStore.get({ id: "job", userId: "owner" }))?.result
		).toEqual({ operations: [] });
	});
	it("does not let completion overwrite cancellation and only owners can cancel", async () => {
		await create();
		const claimed = await composeJobStore.claim();
		expect(
			await composeJobStore.cancel({ id: "job", userId: "other" })
		).toBeUndefined();
		expect(
			(await composeJobStore.cancel({ id: "job", userId: "owner" }))?.status
		).toBe("canceled");
		expect(
			await composeJobStore.finish({
				id: "job",
				leaseToken: claimed?.lease_token ?? "",
				result: "late",
			})
		).toBe(false);
	});
	it("stops reclaiming after three attempts", async () => {
		await create();
		await pg.exec(
			"UPDATE compose_jobs SET status = 'running', attempt = 3, lease_expires_at = now() - interval '1 second';"
		);
		expect(await composeJobStore.claim()).toBeUndefined();
		expect(
			await composeJobStore.get({ id: "job", userId: "owner" })
		).toMatchObject({ status: "failed", error_code: "retry-limit" });
	});
});
