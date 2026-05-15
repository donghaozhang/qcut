/**
 * Atomic job claim via the `claim_one_agent_job(text)` RPC.
 *
 * The RPC runs `FOR UPDATE SKIP LOCKED` + UPDATE → running in a single
 * round-trip, so multiple workers can race safely. We never observe a
 * row "claimed" by two runners.
 *
 * @module @qcut/agent-worker/claim
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db";

type RawAgentJobRow = Record<string, unknown>;

function getString({
	row,
	camelKey,
	snakeKey,
}: {
	row: RawAgentJobRow;
	camelKey: string;
	snakeKey: string;
}): string | null {
	const value = row[camelKey] ?? row[snakeKey];
	return typeof value === "string" ? value : null;
}

function getNullableString({
	row,
	camelKey,
	snakeKey,
}: {
	row: RawAgentJobRow;
	camelKey: string;
	snakeKey: string;
}): string | null {
	const value = row[camelKey] ?? row[snakeKey];
	if (value === null || value === undefined) return null;
	return typeof value === "string" ? value : null;
}

function getNullableNumber({
	row,
	camelKey,
	snakeKey,
}: {
	row: RawAgentJobRow;
	camelKey: string;
	snakeKey: string;
}): number | null {
	const value = row[camelKey] ?? row[snakeKey];
	if (value === null || value === undefined) return null;
	return typeof value === "number" ? value : null;
}

function getDate({
	row,
	camelKey,
	snakeKey,
}: {
	row: RawAgentJobRow;
	camelKey: string;
	snakeKey: string;
}): Date {
	const value = row[camelKey] ?? row[snakeKey];
	if (value instanceof Date) return value;
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) return date;
	}
	throw new Error(`agent_jobs.${snakeKey} is not a valid timestamp`);
}

function getNullableDate({
	row,
	camelKey,
	snakeKey,
}: {
	row: RawAgentJobRow;
	camelKey: string;
	snakeKey: string;
}): Date | null {
	const value = row[camelKey] ?? row[snakeKey];
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value;
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) return date;
	}
	throw new Error(`agent_jobs.${snakeKey} is not a valid timestamp`);
}

function getArgs({ row }: { row: RawAgentJobRow }): Record<string, unknown> {
	const value = row.args;
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

export function normalizeAgentJob({
	row,
}: {
	row: RawAgentJobRow;
}): AgentJob | null {
	const id = getString({ row, camelKey: "id", snakeKey: "id" });
	if (!id) return null;
	const userId = getString({ row, camelKey: "userId", snakeKey: "user_id" });
	const status = getString({ row, camelKey: "status", snakeKey: "status" });
	const command = getString({ row, camelKey: "command", snakeKey: "command" });
	if (!userId || !status || !command) return null;

	return {
		id,
		userId,
		status: status as AgentJob["status"],
		command,
		args: getArgs({ row }),
		createdAt: getDate({
			row,
			camelKey: "createdAt",
			snakeKey: "created_at",
		}),
		claimedAt: getNullableDate({
			row,
			camelKey: "claimedAt",
			snakeKey: "claimed_at",
		}),
		finishedAt: getNullableDate({
			row,
			camelKey: "finishedAt",
			snakeKey: "finished_at",
		}),
		exitCode: getNullableNumber({
			row,
			camelKey: "exitCode",
			snakeKey: "exit_code",
		}),
		error: getNullableString({ row, camelKey: "error", snakeKey: "error" }),
		runnerId: getNullableString({
			row,
			camelKey: "runnerId",
			snakeKey: "runner_id",
		}),
	};
}

export async function claimOneJob(
	supabase: SupabaseClient,
	runnerId: string
): Promise<AgentJob | null> {
	const { data, error } = await supabase.rpc("claim_one_agent_job", {
		_runner_id: runnerId,
	});
	if (error) throw error;
	// `data` is the row, or null when the queue is empty / the SECURITY
	// DEFINER function returned NULL.
	if (!data) return null;
	if (typeof data !== "object") return null;
	return normalizeAgentJob({ row: data as RawAgentJobRow });
}
