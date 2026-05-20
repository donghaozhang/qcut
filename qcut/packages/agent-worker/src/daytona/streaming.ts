import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentJob } from "@qcut/db";

import {
	AGENT_DONE_FILE,
	CODEX_LIVE_STDOUT_FILE,
	STREAM_POLL_MS,
	TIMEOUT_SECONDS,
} from "./constants.js";
import { outputPath } from "./command.js";
import { recordAgentEvent } from "./events.js";
import { readRemoteFile, remoteFileExists } from "./remote-files.js";
import { insertAgentEvents, parseEventText } from "../stream-events.js";
import type {
	DaytonaSandbox,
	StreamCursor,
	StreamSpec,
	StreamState,
} from "./types.js";

export function takeNewCompleteLines({
	text,
	cursor,
	includePartial = false,
}: {
	text: string;
	cursor: StreamCursor;
	includePartial?: boolean;
}): string {
	if (text.length < cursor.size) {
		cursor.size = 0;
		cursor.partial = "";
	}
	const chunk = text.slice(cursor.size);
	cursor.size = text.length;
	if (chunk.length === 0) {
		if (!includePartial) return "";
		const partial = cursor.partial;
		cursor.partial = "";
		return partial;
	}
	const combined = `${cursor.partial}${chunk}`;
	if (includePartial) {
		cursor.partial = "";
		return combined;
	}
	if (!combined.includes("\n")) {
		cursor.partial = combined;
		return "";
	}
	const lines = combined.split("\n");
	cursor.partial = lines.pop() ?? "";
	return lines.join("\n");
}

export function filterDuplicateStdoutRows({
	rows,
	stream,
	state,
}: {
	rows: ReturnType<typeof parseEventText>;
	stream: StreamSpec;
	state: StreamState;
}): ReturnType<typeof parseEventText> {
	return rows.filter((row) => {
		if (row.kind !== "codex_stdout") {
			return true;
		}
		const message =
			typeof row.payload.message === "string" ? row.payload.message : "";
		if (message.length === 0) {
			return true;
		}
		if (stream.source === CODEX_LIVE_STDOUT_FILE) {
			state.liveStdoutMessages.add(message);
			return true;
		}
		if (
			row.payload.source === "codex-events.jsonl:aggregated_output" &&
			state.liveStdoutMessages.has(message)
		) {
			return false;
		}
		return true;
	});
}

export async function flushStreamEvents({
	supabase,
	job,
	sandbox,
	sessionId,
	streams,
	cursors,
	state,
	includePartial = false,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	sandbox: DaytonaSandbox;
	sessionId: string;
	streams: StreamSpec[];
	cursors: Map<string, StreamCursor>;
	state: StreamState;
	includePartial?: boolean;
}): Promise<void> {
	for (const stream of streams) {
		const cursor = cursors.get(stream.path) ?? { partial: "", size: 0 };
		cursors.set(stream.path, cursor);
		const text = await readRemoteFile({
			sandbox,
			sessionId,
			path: stream.path,
			allowEmptyExitCodeError: true,
		});
		const newLines = takeNewCompleteLines({ text, cursor, includePartial });
		const rows = parseEventText({
			text: newLines,
			job,
			defaultKind: stream.kind,
			source: stream.source,
		});
		await insertAgentEvents({
			supabase,
			rows: filterDuplicateStdoutRows({ rows, stream, state }),
		});
	}
}

export async function waitForRemoteCommand({
	supabase,
	job,
	sandbox,
	sessionId,
	streams,
	sleepFn,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	sandbox: DaytonaSandbox;
	sessionId: string;
	streams: StreamSpec[];
	sleepFn: (ms: number) => Promise<void>;
}): Promise<void> {
	const startedAt = Date.now();
	const cursors = new Map<string, StreamCursor>();
	const state: StreamState = { liveStdoutMessages: new Set() };
	const donePath = outputPath({ filename: AGENT_DONE_FILE });
	while (Date.now() - startedAt < TIMEOUT_SECONDS * 1000) {
		await sleepFn(STREAM_POLL_MS);
		await flushStreamEvents({
			supabase,
			job,
			sandbox,
			sessionId,
			streams,
			cursors,
			state,
		});
		if (await remoteFileExists({ sandbox, sessionId, path: donePath })) {
			await flushStreamEvents({
				supabase,
				job,
				sandbox,
				sessionId,
				streams,
				cursors,
				state,
				includePartial: true,
			});
			return;
		}
	}
	await recordAgentEvent({
		supabase,
		job,
		kind: "daytona_timeout",
		payload: { timeoutSeconds: TIMEOUT_SECONDS },
	});
	throw new Error(`Daytona command timed out after ${TIMEOUT_SECONDS}s`);
}
