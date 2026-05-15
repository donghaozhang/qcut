/**
 * Daytona-backed runner for agent jobs.
 *
 * Same external contract as run-container.ts: execute one qcut command,
 * return captured stdio, and materialize /output locally for artifact
 * upload.
 *
 * @module @qcut/agent-worker/run-on-daytona
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Daytona } from "@daytona/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { execa } from "execa";

import type { AgentJob } from "@qcut/db";

import {
	buildCodexPromptEnv,
	buildCodexShellCommand,
	getCodexPrompt,
	isCodexAgentCommand,
	tokenizeCommand,
} from "./run-container.js";
import type { ContainerResult } from "./run-container.js";

const DEFAULT_DAYTONA_IMAGE =
	"ghcr.io/quriosity-agent/qcut-cli@sha256:07ab8298aefb308a5aeefd5c2a7a3b64493c446c84f323c384b0ebeb16ae673a";
const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? DEFAULT_DAYTONA_IMAGE;
const TIMEOUT_SECONDS = 30 * 60;
const DAYTONA_OUTPUT_DIR = "/tmp/qcut-output";
const OUTPUT_ARCHIVE = "/tmp/qcut-output.tar";

interface AgentSecretRow {
	key: string;
	value: string;
}

interface DaytonaSessionCommandResult {
	stdout?: string;
	stderr?: string;
	output?: string;
	exitCode?: number;
}

interface DaytonaSandbox {
	id: string;
	process: {
		createSession(sessionId: string): Promise<void>;
		deleteSession(sessionId: string): Promise<void>;
		executeSessionCommand(
			sessionId: string,
			request: {
				command: string;
				runAsync?: boolean;
				suppressInputEcho?: boolean;
			},
			timeout?: number
		): Promise<DaytonaSessionCommandResult>;
	};
	fs: {
		downloadFile(
			remotePath: string,
			localPath: string,
			timeout?: number
		): Promise<void>;
	};
}

interface DaytonaClient {
	create(
		params: {
			image: string;
			envVars: Record<string, string>;
			resources: { cpu: number; memory: number };
			ephemeral: boolean;
			autoStopInterval: number;
		},
		options: { timeout: number }
	): Promise<DaytonaSandbox>;
	delete(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
}

interface DaytonaClientCtor {
	new (config: { apiKey: string }): DaytonaClient;
}

interface RunOnDaytonaDeps {
	DaytonaClient?: DaytonaClientCtor;
	makeOutputDir?: () => Promise<string>;
	makeSessionId?: () => string;
	extractArchive?: (params: {
		archivePath: string;
		outputDir: string;
	}) => Promise<void>;
}

interface RunOnDaytonaParams {
	supabase: SupabaseClient;
	job: AgentJob;
	deps?: RunOnDaytonaDeps;
}

interface CommandParts {
	command: string;
	archiveCommand: string;
}

function quoteShellArg({ arg }: { arg: string }): string {
	if (/^[A-Za-z0-9_\-./:=,@+]+$/.test(arg)) {
		return arg;
	}
	return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function buildDaytonaCommand({
	command,
	args,
}: {
	command: string;
	args?: unknown;
}): CommandParts {
	const safeArgv = tokenizeCommand(command);
	if (isCodexAgentCommand({ command })) {
		getCodexPrompt({ args });
		return {
			command: buildCodexShellCommand({ outputDir: DAYTONA_OUTPUT_DIR }),
			archiveCommand: `tar -C ${DAYTONA_OUTPUT_DIR} -cf ${OUTPUT_ARCHIVE} .`,
		};
	}

	const quotedArgv = safeArgv.map((arg) => quoteShellArg({ arg })).join(" ");
	const qcutCommand = `/usr/local/bin/qcut-entrypoint ${quotedArgv} -o ${DAYTONA_OUTPUT_DIR}`;

	return {
		command: `mkdir -p ${DAYTONA_OUTPUT_DIR} && ${qcutCommand}`,
		archiveCommand: `tar -C ${DAYTONA_OUTPUT_DIR} -cf ${OUTPUT_ARCHIVE} .`,
	};
}

export function buildDaytonaEnv({
	secrets,
	job,
}: {
	secrets: AgentSecretRow[];
	job?: AgentJob;
}): Record<string, string> {
	const env: Record<string, string> = { QCUT_SESSION_ROLE: "agent" };
	for (const secret of secrets) env[secret.key] = secret.value;
	if (job && isCodexAgentCommand({ command: job.command })) {
		Object.assign(
			env,
			buildCodexPromptEnv({ prompt: getCodexPrompt({ args: job.args }) })
		);
	}
	return env;
}

async function extractArchive({
	archivePath,
	outputDir,
}: {
	archivePath: string;
	outputDir: string;
}): Promise<void> {
	await execa("tar", ["-xf", archivePath, "-C", outputDir]);
}

async function downloadOutputDir({
	sandbox,
	outputDir,
	extract,
}: {
	sandbox: DaytonaSandbox;
	outputDir: string;
	extract: (params: {
		archivePath: string;
		outputDir: string;
	}) => Promise<void>;
}): Promise<void> {
	const localArchive = join(outputDir, "qcut-output.tar");
	await sandbox.fs.downloadFile(OUTPUT_ARCHIVE, localArchive, TIMEOUT_SECONDS);
	await extract({ archivePath: localArchive, outputDir });
}

export async function runOnDaytona({
	supabase,
	job,
	deps = {},
}: RunOnDaytonaParams): Promise<ContainerResult> {
	const apiKey = process.env.DAYTONA_API_KEY;
	if (!apiKey) {
		throw new Error("DAYTONA_API_KEY not set; cannot run job on Daytona");
	}

	const { data: secrets, error: secErr } = await supabase
		.from("agent_secrets")
		.select("key, value")
		.eq("user_id", job.userId);
	if (secErr) {
		throw new Error(
			`agent_secrets fetch failed for user ${job.userId}: ${secErr.message}`
		);
	}
	if (!secrets || secrets.length === 0) {
		console.warn(
			`[agent-worker] no agent_secrets configured for user ${job.userId}; container will only see QCUT_SESSION_ROLE`
		);
	}

	const DaytonaClient =
		deps.DaytonaClient ?? (Daytona as unknown as DaytonaClientCtor);
	const daytona = new DaytonaClient({ apiKey });
	const outputDir = deps.makeOutputDir
		? await deps.makeOutputDir()
		: await mkdtemp(join(tmpdir(), "qcut-daytona-"));
	const sessionId = deps.makeSessionId?.() ?? `qcut-${randomUUID()}`;
	const { command, archiveCommand } = buildDaytonaCommand({
		command: job.command,
		args: job.args,
	});

	let sandbox: DaytonaSandbox | undefined;
	let result: DaytonaSessionCommandResult | undefined;
	let artifactsFallback = false;

	try {
		sandbox = await daytona.create(
			{
				image: IMAGE_TAG,
				envVars: buildDaytonaEnv({ secrets: secrets ?? [], job }),
				resources: { cpu: 2, memory: 4 },
				ephemeral: true,
				autoStopInterval: 30,
			},
			{ timeout: 120 }
		);

		await sandbox.process.createSession(sessionId);
		result = await sandbox.process.executeSessionCommand(
			sessionId,
			{
				command,
				runAsync: false,
				suppressInputEcho: true,
			},
			TIMEOUT_SECONDS
		);
		await sandbox.process.executeSessionCommand(
			sessionId,
			{
				command: archiveCommand,
				runAsync: false,
				suppressInputEcho: true,
			},
			TIMEOUT_SECONDS
		);

		try {
			await downloadOutputDir({
				sandbox,
				outputDir,
				extract: deps.extractArchive ?? extractArchive,
			});
		} catch (err) {
			artifactsFallback = true;
			console.warn(
				"[agent-worker] daytona artifact download failed; staging stderr log:",
				err
			);
			await mkdir(outputDir, { recursive: true });
			await writeFile(join(outputDir, "exec.log"), result.stderr ?? "");
			try {
				await supabase.from("agent_events").insert({
					job_id: job.id,
					user_id: job.userId,
					kind: "artifact_fallback",
					payload: {
						reason: "daytona_artifact_download_failed",
						error: err instanceof Error ? err.message : String(err),
					},
					created_at: new Date().toISOString(),
				});
			} catch (logErr) {
				console.error(
					"[agent-worker] failed to record artifact_fallback event:",
					logErr
				);
			}
		}

		return {
			stdout: result.stdout ?? result.output ?? "",
			stderr: result.stderr ?? "",
			exitCode: result.exitCode ?? 1,
			outputDir,
			artifactsFallback,
		};
	} finally {
		if (sandbox) {
			try {
				await sandbox.process.deleteSession(sessionId);
			} catch (err) {
				console.warn("[agent-worker] daytona session cleanup failed:", err);
			}
			try {
				await daytona.delete(sandbox, 60);
			} catch (err) {
				console.error(
					`[agent-worker] delete sandbox ${sandbox.id} failed:`,
					err
				);
			}
		}
	}
}
