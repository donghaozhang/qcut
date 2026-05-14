/**
 * Local-docker container runner. Pulls workspace secrets, mounts an
 * output dir, invokes the CLI directly as argv (no shell), captures
 * stdio + the output dir for artifact upload.
 *
 * Daytona variant lives in run-on-daytona.ts (PR 05); main.ts swaps in
 * based on the DAYTONA_API_KEY env var.
 *
 * @module @qcut/agent-worker/run-container
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db";

const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? "qcut-cli:dev";
const TIMEOUT_MS = 30 * 60 * 1000;

// Anything beyond simple whitespace-separated tokens with the usual
// flag punctuation (-, =, ., /, :, ,) gets rejected so a forged
// `agent_jobs.command` row can't smuggle shell metacharacters into
// `bash -c`. Real CLI invocations only need this set.
const SAFE_ARG = /^[A-Za-z0-9_\-./:=,@+]+$/;

export interface ContainerResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	outputDir: string;
	/** True when outputDir holds a stand-in (e.g. downloadDir failed), not real artifacts. */
	artifactsFallback?: boolean;
}

/**
 * Whitespace-split a stored `agent_jobs.command` and reject any token
 * containing shell metacharacters. Exported so the Daytona runner can
 * apply the same gate even though its SDK requires a string command.
 */
export function tokenizeCommand(command: string): string[] {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		throw new Error("agent_jobs.command is empty");
	}
	for (const t of tokens) {
		if (!SAFE_ARG.test(t)) {
			throw new Error(
				`agent_jobs.command contains unsafe token (shell-metacharacters not allowed): ${JSON.stringify(
					t
				)}`
			);
		}
	}
	return tokens;
}

export async function runContainer(
	supabase: SupabaseClient,
	job: AgentJob
): Promise<ContainerResult> {
	const { data: secrets } = await supabase
		.from("agent_secrets")
		.select("key, value")
		.eq("user_id", job.userId);

	const envFlags: string[] = [];
	for (const s of secrets ?? []) {
		// `-e KEY=VALUE` style. The entrypoint allow-lists the keys it
		// projects into ~/.qcut/.env, so unknown keys are harmless.
		envFlags.push("-e", `${s.key}=${s.value}`);
	}

	const outputDir = await mkdtemp(join(tmpdir(), "qcut-job-"));
	envFlags.push("-v", `${outputDir}:/output`, "-e", "QCUT_OUTPUT_DIR=/output");

	// Pass the user command as argv (no `bash -c`) so a row in agent_jobs
	// can't inject shell metacharacters. Append `-o /output` always.
	const userArgv = tokenizeCommand(job.command);
	const args = [
		"run",
		"--rm",
		...envFlags,
		IMAGE_TAG,
		...userArgv,
		"-o",
		"/output",
	];

	const result = await execa("docker", args, {
		reject: false,
		timeout: TIMEOUT_MS,
	});

	return {
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		exitCode: typeof result.exitCode === "number" ? result.exitCode : 1,
		outputDir,
	};
}
