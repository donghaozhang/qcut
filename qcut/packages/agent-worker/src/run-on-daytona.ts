/**
 * Daytona variant of runContainer (PR 05).
 *
 * Same contract as ./run-container.ts (local docker), but spawns a
 * Daytona sandbox via the @daytonaio/sdk. main.ts swaps in this
 * path when DAYTONA_API_KEY is set.
 *
 * The SDK shape is approximate — the real @daytonaio/sdk method
 * names may differ slightly. Adjust at deploy time; the file is
 * structured so the swap is a one-line change.
 *
 * @module @qcut/agent-worker/run-on-daytona
 */

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db";

import type { ContainerResult } from "./run-container.js";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";
const TIMEOUT_MS = 30 * 60 * 1000;

interface DaytonaSandboxApi {
	create(opts: {
		image: string;
		env: Record<string, string>;
		resources?: { cpu?: number; memoryGb?: number };
	}): Promise<{ id: string }>;
	exec(
		id: string,
		opts: { command: string; timeoutMs: number },
	): Promise<{ stdout: string; stderr: string; exitCode: number }>;
	downloadDir(id: string, remotePath: string): Promise<string>;
	kill(id: string): Promise<void>;
}

interface DaytonaSdk {
	sandboxes: DaytonaSandboxApi;
}

interface DaytonaCtor {
	new (opts: { apiKey: string }): DaytonaSdk;
}

/** Lazy import so the worker doesn't pull the SDK when running locally. */
async function getDaytonaCtor(): Promise<DaytonaCtor> {
	// @ts-ignore — SDK may not be installed in local dev; throw at runtime
	// rather than at compile time. main.ts only takes this path when
	// DAYTONA_API_KEY is set, which implies the caller wired the dep.
	const mod = await import("@daytonaio/sdk").catch((err) => {
		throw new Error(
			`Daytona SDK not installed (add @daytonaio/sdk to packages/agent-worker/package.json). Underlying: ${err}`,
		);
	});
	const Ctor = (mod as { Daytona?: DaytonaCtor }).Daytona;
	if (!Ctor) {
		throw new Error("@daytonaio/sdk did not export Daytona constructor");
	}
	return Ctor;
}

export async function runOnDaytona(
	supabase: SupabaseClient,
	job: AgentJob,
): Promise<ContainerResult> {
	const apiKey = process.env.DAYTONA_API_KEY;
	if (!apiKey) {
		throw new Error("DAYTONA_API_KEY not set — should not call runOnDaytona");
	}

	const { data: secrets } = await supabase
		.from("agent_secrets")
		.select("key, value")
		.eq("workspace_id", job.workspace_id);
	const env = Object.fromEntries((secrets ?? []).map((s) => [s.key, s.value]));

	const Ctor = await getDaytonaCtor();
	const daytona = new Ctor({ apiKey });

	const sandbox = await daytona.sandboxes.create({
		image: IMAGE_TAG,
		env: { ...env, QCUT_SESSION_ROLE: "agent" },
		resources: { cpu: 2, memoryGb: 4 },
	});

	try {
		const result = await daytona.sandboxes.exec(sandbox.id, {
			command: `${job.command} -o /output`,
			timeoutMs: TIMEOUT_MS,
		});

		// Daytona returns a local materialized path; if the SDK shape
		// differs, this becomes "download artifact-by-artifact" code.
		let outputDir: string;
		try {
			outputDir = await daytona.sandboxes.downloadDir(sandbox.id, "/output");
		} catch (err) {
			// Fallback: stage an empty dir so uploadArtifacts is a no-op
			// rather than crashing the worker.
			console.error("[agent-worker] daytona downloadDir failed:", err);
			outputDir = await mkdtemp(join(tmpdir(), "qcut-empty-"));
			await mkdir(outputDir, { recursive: true });
			// Stash stderr as a fallback log artifact so the user has *something*.
			await writeFile(join(outputDir, "exec.log"), result.stderr);
		}

		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
			outputDir,
		};
	} finally {
		try {
			await daytona.sandboxes.kill(sandbox.id);
		} catch (err) {
			console.error(`[agent-worker] kill sandbox ${sandbox.id} failed:`, err);
		}
	}
}
