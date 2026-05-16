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

export interface EventRow {
	job_id: string;
	user_id: string;
	kind: string;
	payload: Record<string, unknown>;
	created_at: string;
}

function buildEventRow({
	job,
	kind,
	payload,
	createdAt,
}: {
	job: AgentJob;
	kind: string;
	payload: Record<string, unknown>;
	createdAt: string;
}): EventRow {
	return {
		job_id: job.id,
		user_id: job.userId,
		kind,
		payload,
		created_at: createdAt,
	};
}

function buildCodexStdoutRows({
	payload,
	job,
	createdAt,
}: {
	payload: Record<string, unknown>;
	job: AgentJob;
	createdAt: string;
}): EventRow[] {
	if (payload.source !== "codex-events.jsonl") {
		return [];
	}
	const item =
		payload.item && typeof payload.item === "object"
			? (payload.item as Record<string, unknown>)
			: null;
	if (
		!item ||
		item.type !== "command_execution" ||
		typeof item.aggregated_output !== "string" ||
		item.aggregated_output.trim().length === 0
	) {
		return [];
	}
	const commandContext: Record<string, unknown> = {};
	if (typeof item.id === "string") {
		commandContext.itemId = item.id;
	}
	if (typeof item.command === "string") {
		commandContext.command = mask(item.command);
	}
	return item.aggregated_output
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0)
		.map((line) =>
			buildEventRow({
				job,
				kind: "codex_stdout",
				createdAt,
				payload: {
					message: mask(line),
					source: "codex-events.jsonl:aggregated_output",
					...commandContext,
				},
			})
		);
}

export function parseEventText({
	text,
	job,
	defaultKind = "cli_stderr",
	source,
}: {
	text: string;
	job: AgentJob;
	defaultKind?: string;
	source?: string;
}): EventRow[] {
	const rows: EventRow[] = [];
	for (const raw of text.split("\n")) {
		if (!raw.trim()) continue;
		const createdAt = new Date().toISOString();
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
		if (source && typeof payload.source !== "string") {
			payload = { ...payload, source };
		}
		const kind =
			typeof payload.kind === "string" ? (payload.kind as string) : defaultKind;
		rows.push(
			buildEventRow({
				job,
				kind,
				payload,
				createdAt,
			})
		);
		rows.push(
			...buildCodexStdoutRows({
				payload,
				job,
				createdAt,
			})
		);
	}
	return rows;
}

export function parseStderr(stderr: string, job: AgentJob): EventRow[] {
	return parseEventText({ text: stderr, job });
}

export async function insertAgentEvents({
	supabase,
	rows,
}: {
	supabase: SupabaseClient;
	rows: EventRow[];
}): Promise<void> {
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

export async function streamEvents(
	supabase: SupabaseClient,
	job: AgentJob,
	stderr: string
): Promise<void> {
	const rows = parseStderr(stderr, job);
	await insertAgentEvents({ supabase, rows });
}
