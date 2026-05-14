/**
 * Local-docker container runner. Pulls workspace secrets, mounts an
 * output dir, runs `docker run --rm qcut-cli:vX bash -c "<command> -o
 * /output"`, returns the captured stdio + the output dir for artifact
 * upload.
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

export interface ContainerResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	outputDir: string;
}

export async function runContainer(
	supabase: SupabaseClient,
	job: AgentJob,
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

	// Single command: the entrypoint materializes ~/.qcut/.env then execs.
	// `${job.command} -o /output` overrides any -o the caller embedded.
	const args = [
		"run",
		"--rm",
		...envFlags,
		IMAGE_TAG,
		"bash",
		"-c",
		`${job.command} -o /output`,
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
