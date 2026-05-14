/**
 * Walk the per-job /output mount, upload each file to the `artifacts`
 * Supabase Storage bucket at `agent/<user_id>/<job_id>/<name>`,
 * insert an agent_artifacts row per file.
 *
 * Best-effort: a failed upload logs and continues; the worker's job
 * row still reflects the CLI exit code.
 *
 * @module @qcut/agent-worker/upload-artifacts
 */

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentArtifactKind, AgentJob } from "@qcut/db";

const KIND_BY_EXT: Record<string, AgentArtifactKind> = {
	".png": "image",
	".jpg": "image",
	".jpeg": "image",
	".webp": "image",
	".gif": "image",
	".mp4": "video",
	".mov": "video",
	".webm": "video",
	".wav": "audio",
	".mp3": "audio",
	".m4a": "audio",
	".ogg": "audio",
	".json": "json",
	".log": "log",
	".txt": "log",
	".srt": "log",
};

/**
 * Snake-case insert payload for the `agent_artifacts` REST endpoint.
 * The Drizzle-inferred `AgentArtifact` type is camelCase and only
 * matches columns selected back through Drizzle — supabase-js PostgREST
 * round-trips need the raw column names.
 */
interface AgentArtifactInsert {
	id: string;
	job_id: string;
	user_id: string;
	kind: AgentArtifactKind;
	storage_path: string;
	bytes: number;
	meta: Record<string, unknown>;
	created_at: string;
}

/** Exported for testing. */
export function classify(name: string): AgentArtifactKind {
	const dot = name.lastIndexOf(".");
	if (dot < 0) return "log";
	const ext = name.slice(dot).toLowerCase();
	return KIND_BY_EXT[ext] ?? "log";
}

export async function uploadArtifacts({
	supabase,
	job,
	dir,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	dir: string;
}): Promise<void> {
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch (err) {
		console.error(`[agent-worker] readdir ${dir} failed:`, err);
		return;
	}

	for (const name of entries) {
		const full = join(dir, name);
		let s: Awaited<ReturnType<typeof stat>>;
		try {
			s = await stat(full);
		} catch {
			continue;
		}
		if (!s.isFile()) continue;

		const kind = classify(name);
		const storagePath = `agent/${job.userId}/${job.id}/${name}`;

		// Stream the file straight to Supabase Storage so a multi-GB video
		// artifact doesn't load into RAM (would OOM the worker host).
		const stream = createReadStream(full);
		const { error: upErr } = await supabase.storage
			.from("artifacts")
			.upload(storagePath, stream, {
				upsert: false,
				duplex: "half",
			});
		if (upErr) {
			stream.destroy();
			console.error(
				`[agent-worker] storage upload ${storagePath} failed:`,
				upErr.message
			);
			continue;
		}

		const row: AgentArtifactInsert = {
			id: crypto.randomUUID(),
			job_id: job.id,
			user_id: job.userId,
			kind,
			storage_path: storagePath,
			bytes: s.size,
			meta: { filename: name },
			created_at: new Date().toISOString(),
		};
		const { error: insErr } = await supabase
			.from("agent_artifacts")
			.insert(row);
		if (insErr) {
			console.error(
				`[agent-worker] agent_artifacts insert ${name} failed:`,
				insErr.message
			);
		}
	}
}
