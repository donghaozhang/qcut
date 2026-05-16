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
import { insertAgentEvents, parseEventText } from "./stream-events.js";

const DEFAULT_DAYTONA_IMAGE =
	"ghcr.io/quriosity-agent/qcut-cli@sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923";
const IMAGE_TAG = process.env.QCUT_IMAGE_TAG ?? DEFAULT_DAYTONA_IMAGE;
const TIMEOUT_SECONDS = 30 * 60;
const DAYTONA_OUTPUT_DIR = "/tmp/qcut-output";
const OUTPUT_ARCHIVE = "/tmp/qcut-output.tar";
const ARCHIVE_COMMAND = `tar --exclude='.qcut-agent-*' -C ${DAYTONA_OUTPUT_DIR} -cf ${OUTPUT_ARCHIVE} .`;
const QCUT_STDOUT_FILE = "qcut-stdout.txt";
const QCUT_STDERR_FILE = "qcut-stderr.txt";
const QCUT_EXIT_FILE = "qcut-exit.json";
const AGENT_DONE_FILE = ".qcut-agent-done";
const AGENT_PID_FILE = ".qcut-agent-pid";
const WRAPPER_STDOUT_FILE = ".qcut-agent-wrapper-stdout";
const WRAPPER_STDERR_FILE = ".qcut-agent-wrapper-stderr";
const STREAM_POLL_MS = 2000;

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
	sleep?: (ms: number) => Promise<void>;
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
	streams: StreamSpec[];
	stdoutPath: string;
	stderrPath: string;
	exitPath: string;
}

interface StreamSpec {
	path: string;
	kind: string;
	source: string;
}

interface StreamCursor {
	partial: string;
	size: number;
}

function quoteShellArg({ arg }: { arg: string }): string {
	if (/^[A-Za-z0-9_\-./:=,@+]+$/.test(arg)) {
		return arg;
	}
	return `'${arg.replaceAll("'", "'\\''")}'`;
}

function buildQcutShellCommand({ quotedArgv }: { quotedArgv: string }): string {
	const qcutCommand = `/usr/local/bin/qcut-entrypoint ${quotedArgv} -o ${DAYTONA_OUTPUT_DIR}`;
	return [
		`mkdir -p ${DAYTONA_OUTPUT_DIR}`,
		"set +e",
		`${qcutCommand} > ${DAYTONA_OUTPUT_DIR}/${QCUT_STDOUT_FILE} 2> ${DAYTONA_OUTPUT_DIR}/${QCUT_STDERR_FILE}`,
		"exit_code=$?",
		`printf '{"exitCode":%s}\\n' "$exit_code" > ${DAYTONA_OUTPUT_DIR}/${QCUT_EXIT_FILE}`,
		'[ "$exit_code" -eq 0 ]',
	].join("; ");
}

function outputPath({ filename }: { filename: string }): string {
	return `${DAYTONA_OUTPUT_DIR}/${filename}`;
}

function buildAsyncStartCommand({ command }: { command: string }): string {
	const donePath = outputPath({ filename: AGENT_DONE_FILE });
	const pidPath = outputPath({ filename: AGENT_PID_FILE });
	const wrapperStdoutPath = outputPath({ filename: WRAPPER_STDOUT_FILE });
	const wrapperStderrPath = outputPath({ filename: WRAPPER_STDERR_FILE });
	const wrappedCommand = [
		"set +e",
		command,
		"exit_code=$?",
		`[ -f ${outputPath({ filename: QCUT_EXIT_FILE })} ] || printf '{"exitCode":%s}\\n' "$exit_code" > ${outputPath({ filename: QCUT_EXIT_FILE })}`,
		`touch ${donePath}`,
		'exit "$exit_code"',
	].join("; ");
	return [
		`rm -rf ${DAYTONA_OUTPUT_DIR} ${OUTPUT_ARCHIVE}`,
		`mkdir -p ${DAYTONA_OUTPUT_DIR}`,
		`( ${wrappedCommand} ) > ${wrapperStdoutPath} 2> ${wrapperStderrPath} & pid=$!`,
		`printf '{"pid":%s}\\n' "$pid" > ${pidPath}`,
	].join("; ");
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
			archiveCommand: ARCHIVE_COMMAND,
			streams: [
				{
					path: outputPath({ filename: "codex-events.jsonl" }),
					kind: "codex_event",
					source: "codex-events.jsonl",
				},
				{
					path: outputPath({ filename: WRAPPER_STDERR_FILE }),
					kind: "daytona_stderr",
					source: WRAPPER_STDERR_FILE,
				},
			],
			stdoutPath: outputPath({ filename: "codex-events.jsonl" }),
			stderrPath: outputPath({ filename: WRAPPER_STDERR_FILE }),
			exitPath: outputPath({ filename: QCUT_EXIT_FILE }),
		};
	}

	const quotedArgv = safeArgv.map((arg) => quoteShellArg({ arg })).join(" ");

	return {
		command: buildQcutShellCommand({ quotedArgv }),
		archiveCommand: ARCHIVE_COMMAND,
		streams: [
			{
				path: outputPath({ filename: QCUT_STDOUT_FILE }),
				kind: "daytona_stdout",
				source: QCUT_STDOUT_FILE,
			},
			{
				path: outputPath({ filename: QCUT_STDERR_FILE }),
				kind: "daytona_stderr",
				source: QCUT_STDERR_FILE,
			},
			{
				path: outputPath({ filename: WRAPPER_STDERR_FILE }),
				kind: "daytona_stderr",
				source: WRAPPER_STDERR_FILE,
			},
		],
		stdoutPath: outputPath({ filename: QCUT_STDOUT_FILE }),
		stderrPath: outputPath({ filename: QCUT_STDERR_FILE }),
		exitPath: outputPath({ filename: QCUT_EXIT_FILE }),
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

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordAgentEvent({
	supabase,
	job,
	kind,
	payload,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	kind: string;
	payload: Record<string, unknown>;
}): Promise<void> {
	await insertAgentEvents({
		supabase,
		rows: [
			{
				job_id: job.id,
				user_id: job.userId,
				kind,
				payload,
				created_at: new Date().toISOString(),
			},
		],
	});
}

async function executeShellCommand({
	sandbox,
	sessionId,
	command,
	timeout = 60,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	command: string;
	timeout?: number;
}): Promise<DaytonaSessionCommandResult> {
	return sandbox.process.executeSessionCommand(
		sessionId,
		{
			command,
			runAsync: false,
			suppressInputEcho: true,
		},
		timeout
	);
}

async function readRemoteFile({
	sandbox,
	sessionId,
	path,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
}): Promise<string> {
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: `cat ${quoteShellArg({ arg: path })} 2>/dev/null || true`,
	});
	return result.stdout ?? result.output ?? "";
}

async function remoteFileExists({
	sandbox,
	sessionId,
	path,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
}): Promise<boolean> {
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: `test -f ${quoteShellArg({ arg: path })} && printf yes || true`,
	});
	return (result.stdout ?? result.output ?? "").trim() === "yes";
}

function takeNewCompleteLines({
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

async function flushStreamEvents({
	supabase,
	job,
	sandbox,
	sessionId,
	streams,
	cursors,
	includePartial = false,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	sandbox: DaytonaSandbox;
	sessionId: string;
	streams: StreamSpec[];
	cursors: Map<string, StreamCursor>;
	includePartial?: boolean;
}): Promise<void> {
	for (const stream of streams) {
		const cursor = cursors.get(stream.path) ?? { partial: "", size: 0 };
		cursors.set(stream.path, cursor);
		const text = await readRemoteFile({
			sandbox,
			sessionId,
			path: stream.path,
		});
		const newLines = takeNewCompleteLines({ text, cursor, includePartial });
		const rows = parseEventText({
			text: newLines,
			job,
			defaultKind: stream.kind,
			source: stream.source,
		});
		await insertAgentEvents({ supabase, rows });
	}
}

async function waitForRemoteCommand({
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
		});
		if (await remoteFileExists({ sandbox, sessionId, path: donePath })) {
			await flushStreamEvents({
				supabase,
				job,
				sandbox,
				sessionId,
				streams,
				cursors,
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

function parseExitCode({ text }: { text: string }): number {
	try {
		const parsed = JSON.parse(text);
		const value = (parsed as { exitCode?: unknown }).exitCode;
		return typeof value === "number" && Number.isFinite(value) ? value : 1;
	} catch {
		return 1;
	}
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
	const { command, archiveCommand, streams, stdoutPath, stderrPath, exitPath } =
		buildDaytonaCommand({
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
		await recordAgentEvent({
			supabase,
			job,
			kind: "daytona_sandbox_ready",
			payload: { sandboxId: sandbox.id, image: IMAGE_TAG },
		});

		await sandbox.process.createSession(sessionId);
		await recordAgentEvent({
			supabase,
			job,
			kind: "daytona_command_started",
			payload: { sessionId },
		});
		const startResult = await executeShellCommand({
			sandbox,
			sessionId,
			command: buildAsyncStartCommand({ command }),
			timeout: 120,
		});
		if (
			typeof startResult.exitCode === "number" &&
			startResult.exitCode !== 0
		) {
			await recordAgentEvent({
				supabase,
				job,
				kind: "daytona_command_start_failed",
				payload: {
					exitCode: startResult.exitCode,
					stderr: startResult.stderr ?? "",
					stdout: startResult.stdout ?? startResult.output ?? "",
				},
			});
			throw new Error(
				`Daytona command failed to start with exit ${startResult.exitCode}`
			);
		}
		await waitForRemoteCommand({
			supabase,
			job,
			sandbox,
			sessionId,
			streams,
			sleepFn: deps.sleep ?? ((ms) => sleep({ ms })),
		});
		const [stdout, stderr, exitText] = await Promise.all([
			readRemoteFile({ sandbox, sessionId, path: stdoutPath }),
			readRemoteFile({ sandbox, sessionId, path: stderrPath }),
			readRemoteFile({ sandbox, sessionId, path: exitPath }),
		]);
		result = {
			stdout,
			stderr,
			exitCode: parseExitCode({ text: exitText }),
		};
		await recordAgentEvent({
			supabase,
			job,
			kind: "daytona_command_finished",
			payload: { exitCode: result.exitCode },
		});
		await executeShellCommand({
			sandbox,
			sessionId,
			command: archiveCommand,
			timeout: TIMEOUT_SECONDS,
		});

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
			eventsStreamed: true,
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
