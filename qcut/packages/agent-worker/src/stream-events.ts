/**
 * Parse the CLI's stderr (JSONL or plain lines) into agent_events rows.
 * Each non-empty line becomes a row; JSON is preserved when parseable,
 * otherwise the line is wrapped as `{ message }`. All payloads go
 * through the secret masker first.
 *
 * @module @qcut/agent-worker/stream-events
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db";

import { mask } from "./mask.js";

const BATCH = 500;

interface EventRow {
	job_id: string;
	user_id: string;
	kind: string;
	payload: Record<string, unknown>;
	created_at: string;
}

export function parseStderr(stderr: string, job: AgentJob): EventRow[] {
	const rows: EventRow[] = [];
	for (const raw of stderr.split("\n")) {
		if (!raw.trim()) continue;
		const masked = mask(raw);
		let payload: Record<string, unknown>;
		try {
			const parsed = JSON.parse(masked);
			payload =
				typeof parsed === "object" && parsed !== null
					? (parsed as Record<string, unknown>)
					: { message: masked };
		} catch {
			payload = { message: masked };
		}
		const kind =
			typeof payload.kind === "string"
				? (payload.kind as string)
				: "cli_stderr";
		rows.push({
			job_id: job.id,
			user_id: job.userId,
			kind,
			payload,
			created_at: new Date().toISOString(),
		});
	}
	return rows;
}

export async function streamEvents(
	supabase: SupabaseClient,
	job: AgentJob,
	stderr: string
): Promise<void> {
	const rows = parseStderr(stderr, job);
	if (rows.length === 0) return;
	for (let i = 0; i < rows.length; i += BATCH) {
		const slice = rows.slice(i, i + BATCH);
		const { error } = await supabase.from("agent_events").insert(slice);
		if (error) {
			// Don't bring down the worker for telemetry. Log and continue;
			// the job's final status row still gets written.
			console.error(
				"[agent-worker] agent_events insert failed:",
				error.message
			);
			return;
		}
	}
}
