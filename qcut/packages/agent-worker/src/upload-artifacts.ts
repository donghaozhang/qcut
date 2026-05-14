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

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentArtifact, AgentArtifactKind, AgentJob } from "@qcut/db";

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

/** Exported for testing. */
export function classify(name: string): AgentArtifactKind {
	const dot = name.lastIndexOf(".");
	if (dot < 0) return "log";
	const ext = name.slice(dot).toLowerCase();
	return KIND_BY_EXT[ext] ?? "log";
}

export async function uploadArtifacts(
	supabase: SupabaseClient,
	job: AgentJob,
	dir: string,
): Promise<void> {
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

		let bytes: Buffer;
		try {
			bytes = await readFile(full);
		} catch (err) {
			console.error(`[agent-worker] read ${full} failed:`, err);
			continue;
		}

		const { error: upErr } = await supabase.storage
			.from("artifacts")
			.upload(storagePath, bytes, { upsert: false });
		if (upErr) {
			console.error(
				`[agent-worker] storage upload ${storagePath} failed:`,
				upErr.message,
			);
			continue;
		}

		const row = {
			id: crypto.randomUUID(),
			job_id: job.id,
			user_id: job.userId,
			kind,
			storage_path: storagePath,
			bytes: s.size,
			meta: { filename: name },
			created_at: new Date().toISOString(),
		} satisfies Partial<AgentArtifact> & { id: string };
		const { error: insErr } = await supabase
			.from("agent_artifacts")
			.insert(row);
		if (insErr) {
			console.error(
				`[agent-worker] agent_artifacts insert ${name} failed:`,
				insErr.message,
			);
		}
	}
}
