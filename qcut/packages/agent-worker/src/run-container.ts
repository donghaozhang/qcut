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
const CODEX_PROMPT_ENV = "QCUT_CODEX_PROMPT_B64";
const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";
const NATIVE_CLI_SKILL_PATH =
	"/home/qcut/qcut/.claude/skills/native-cli/SKILL.md";
const NATIVE_CLI_SKILL_DIR = "/home/qcut/qcut/.claude/skills/native-cli";
const CODEX_SANDBOX_CONTEXT = [
	"You are running inside QCut's Daytona CLI image.",
	`The QCut native CLI skill is available at ${NATIVE_CLI_SKILL_PATH}.`,
	`Related native-cli references live under ${NATIVE_CLI_SKILL_DIR}/references and editor docs live under ${NATIVE_CLI_SKILL_DIR}/editor.`,
	"Read that skill before running nontrivial QCut CLI workflows or when command syntax is unclear.",
	"yt-dlp and deno are available for authorized video download probes.",
	"For long-running shell commands, stream user-visible stdout with tee -a /tmp/qcut-output/codex-live-stdout.log.",
	"Put temporary tools, caches, and package installs under /tmp/qcut-tools or /tmp, not /tmp/qcut-output.",
	"Write only final user-requested files and small diagnostic summaries/logs under /tmp/qcut-output.",
].join("\n");

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
	/** True when the runner already streamed agent_events during execution. */
	eventsStreamed?: boolean;
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

export function isCodexAgentCommand({ command }: { command: string }): boolean {
	return command.trim() === CODEX_AGENT_COMMAND;
}

export function getCodexPrompt({ args }: { args: unknown }): string {
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		return "";
	}
	const prompt = (args as { codexPrompt?: unknown }).codexPrompt;
	return typeof prompt === "string" ? prompt.trim() : "";
}

export function buildCodexSandboxPrompt({
	prompt,
}: {
	prompt: string;
}): string {
	return [CODEX_SANDBOX_CONTEXT, "", "User task:", prompt].join("\n");
}

export function buildCodexPromptEnv({
	prompt,
}: {
	prompt: string;
}): Record<string, string> {
	if (prompt.length === 0) {
		throw new Error("codexPrompt is required for codex agent jobs");
	}
	const sandboxPrompt = buildCodexSandboxPrompt({ prompt });
	return {
		[CODEX_PROMPT_ENV]: Buffer.from(sandboxPrompt, "utf8").toString("base64"),
		QCUT_BOOTSTRAP_CODEX: "1",
	};
}

export function buildCodexShellCommand({
	outputDir,
}: {
	outputDir: string;
}): string {
	return [
		"set -o pipefail",
		`mkdir -p ${outputDir}`,
		`printf '%s' "$${CODEX_PROMPT_ENV}" | base64 -d | /usr/local/bin/qcut-entrypoint codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json --output-last-message ${outputDir}/codex-last-message.md - > ${outputDir}/codex-events.jsonl`,
	].join("; ");
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

	const userArgv = tokenizeCommand(job.command);
	const isCodexJob = isCodexAgentCommand({ command: job.command });
	const codexPrompt = isCodexJob ? getCodexPrompt({ args: job.args }) : "";
	const commandArgs = isCodexJob
		? ["bash", "-lc", buildCodexShellCommand({ outputDir: "/output" })]
		: [...userArgv, "-o", "/output"];

	if (isCodexJob) {
		for (const [key, value] of Object.entries(
			buildCodexPromptEnv({ prompt: codexPrompt })
		)) {
			envFlags.push("-e", `${key}=${value}`);
		}
	}

	const args = ["run", "--rm", ...envFlags, IMAGE_TAG, ...commandArgs];

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
