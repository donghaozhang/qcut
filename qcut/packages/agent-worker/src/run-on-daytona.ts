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
const DAYTONA_CREATE_TIMEOUT_SECONDS = 300;
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
const CODEX_LIVE_STDOUT_FILE = "codex-live-stdout.log";
const STREAM_POLL_MS = 2000;
const SESSION_SANDBOX_AUTO_STOP_MINUTES = 120;
const DEFAULT_AGENT_SESSION_IDLE_MS = 20 * 60 * 1000;
const AGENT_SESSION_CLEANUP_LIMIT = 20;

interface AgentSecretRow {
	key: string;
	value: string;
}

interface AgentSessionRow {
	id: string;
	user_id: string;
	status: string;
	provider_session_id: string | null;
	image_tag: string;
	last_active_at: string;
	expires_at: string;
	end_reason?: string | null;
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
	get(sandboxId: string): Promise<DaytonaSandbox>;
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

interface CleanupDaytonaAgentSessionsParams {
	supabase: SupabaseClient;
	runnerId: string;
	deps?: Pick<RunOnDaytonaDeps, "DaytonaClient">;
}

interface CommandParts {
	command: string;
	archiveCommand: string;
	streams: StreamSpec[];
	stdoutPath: string;
	stderrPath: string;
	exitPath: string;
}

interface PreparedSandbox {
	sandbox: DaytonaSandbox;
	deleteSandboxOnFinish: boolean;
	agentSessionId: string | null;
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

interface StreamState {
	liveStdoutMessages: Set<string>;
}

function isDaytonaEmptyExitCodeError({ error }: { error: unknown }): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("failed to convert exit code to int") ||
		message.includes('strconv.Atoi: parsing ""')
	);
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

function buildCodexShellCommandForJob({ args }: { args?: unknown }): string {
	const env = buildCodexPromptEnv({ prompt: getCodexPrompt({ args }) });
	return [
		`export QCUT_CODEX_PROMPT_B64=${quoteShellArg({ arg: env.QCUT_CODEX_PROMPT_B64 })}`,
		"export QCUT_BOOTSTRAP_CODEX=1",
		buildCodexShellCommand({ outputDir: DAYTONA_OUTPUT_DIR }),
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
			command: buildCodexShellCommandForJob({ args }),
			archiveCommand: ARCHIVE_COMMAND,
			streams: [
				{
					path: outputPath({ filename: CODEX_LIVE_STDOUT_FILE }),
					kind: "codex_stdout",
					source: CODEX_LIVE_STDOUT_FILE,
				},
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

function getJobSessionId({ job }: { job: AgentJob }): string | null {
	const value = job.sessionId;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
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

function getAgentSessionIdleMs(): number {
	const parsed = Number(process.env.AGENT_SESSION_IDLE_MS);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_AGENT_SESSION_IDLE_MS;
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

async function fetchAgentSession({
	supabase,
	job,
	sessionId,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	sessionId: string;
}): Promise<AgentSessionRow> {
	const { data, error } = await supabase
		.from("agent_sessions")
		.select(
			"id, user_id, status, provider_session_id, image_tag, last_active_at, expires_at, end_reason"
		)
		.eq("id", sessionId)
		.eq("user_id", job.userId)
		.maybeSingle();
	if (error) {
		throw new Error(`agent_sessions fetch failed: ${error.message}`);
	}
	if (!data) {
		throw new Error(`agent session ${sessionId} was not found`);
	}
	const row = data as AgentSessionRow;
	if (row.status !== "active") {
		throw new Error(`agent session ${sessionId} is ${row.status}`);
	}
	if (Date.parse(row.expires_at) <= Date.now()) {
		throw new Error(`agent session ${sessionId} expired`);
	}
	return row;
}

async function updateAgentSession({
	supabase,
	sessionId,
	userId,
	values,
}: {
	supabase: SupabaseClient;
	sessionId: string;
	userId: string;
	values: Record<string, unknown>;
}): Promise<void> {
	const { error } = await supabase
		.from("agent_sessions")
		.update(values)
		.eq("id", sessionId)
		.eq("user_id", userId);
	if (error) {
		throw new Error(`agent_sessions update failed: ${error.message}`);
	}
}

async function createDaytonaSandbox({
	daytona,
	envVars,
	imageTag,
	autoStopInterval,
}: {
	daytona: DaytonaClient;
	envVars: Record<string, string>;
	imageTag: string;
	autoStopInterval: number;
}): Promise<DaytonaSandbox> {
	return daytona.create(
		{
			image: imageTag,
			envVars,
			resources: { cpu: 2, memory: 4 },
			ephemeral: true,
			autoStopInterval,
		},
		{ timeout: DAYTONA_CREATE_TIMEOUT_SECONDS }
	);
}

async function getReusableSandbox({
	daytona,
	session,
}: {
	daytona: DaytonaClient;
	session: AgentSessionRow;
}): Promise<DaytonaSandbox | null> {
	if (!session.provider_session_id) {
		return null;
	}
	try {
		return await daytona.get(session.provider_session_id);
	} catch (error) {
		console.warn(
			`[agent-worker] Daytona session ${session.id} sandbox ${session.provider_session_id} is unavailable; creating a replacement:`,
			error
		);
		return null;
	}
}

async function prepareDaytonaSandbox({
	supabase,
	job,
	daytona,
	envVars,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	daytona: DaytonaClient;
	envVars: Record<string, string>;
}): Promise<PreparedSandbox> {
	const agentSessionId = getJobSessionId({ job });
	if (!agentSessionId) {
		const sandbox = await createDaytonaSandbox({
			daytona,
			envVars,
			imageTag: IMAGE_TAG,
			autoStopInterval: 30,
		});
		await recordAgentEvent({
			supabase,
			job,
			kind: "daytona_sandbox_ready",
			payload: { sandboxId: sandbox.id, image: IMAGE_TAG },
		});
		return {
			sandbox,
			deleteSandboxOnFinish: true,
			agentSessionId: null,
		};
	}

	const agentSession = await fetchAgentSession({
		supabase,
		job,
		sessionId: agentSessionId,
	});
	const reusableSandbox = await getReusableSandbox({
		daytona,
		session: agentSession,
	});
	const sandbox =
		reusableSandbox ??
		(await createDaytonaSandbox({
			daytona,
			envVars,
			imageTag: agentSession.image_tag || IMAGE_TAG,
			autoStopInterval: SESSION_SANDBOX_AUTO_STOP_MINUTES,
		}));
	await updateAgentSession({
		supabase,
		sessionId: agentSession.id,
		userId: job.userId,
		values: {
			provider_session_id: sandbox.id,
			image_tag: IMAGE_TAG,
			last_active_at: new Date().toISOString(),
			runner_id: job.runnerId ?? null,
		},
	});
	await recordAgentEvent({
		supabase,
		job,
		kind: "agent_session_ready",
		payload: {
			sessionId: agentSession.id,
			sandboxId: sandbox.id,
			reused: Boolean(reusableSandbox),
			image: IMAGE_TAG,
		},
	});
	return {
		sandbox,
		deleteSandboxOnFinish: false,
		agentSessionId: agentSession.id,
	};
}

function getSessionEndReason({
	session,
	nowMs,
}: {
	session: AgentSessionRow;
	nowMs: number;
}): "idle_timeout" | "ttl" | "user_kill" {
	if (session.status === "stopping") {
		return "user_kill";
	}
	if (Date.parse(session.expires_at) <= nowMs) {
		return "ttl";
	}
	return "idle_timeout";
}

async function endDaytonaAgentSession({
	supabase,
	daytona,
	session,
	runnerId,
}: {
	supabase: SupabaseClient;
	daytona: DaytonaClient;
	session: AgentSessionRow;
	runnerId: string;
}): Promise<void> {
	const now = new Date();
	const endReason = getSessionEndReason({
		session,
		nowMs: now.getTime(),
	});
	if (session.provider_session_id) {
		try {
			const sandbox = await daytona.get(session.provider_session_id);
			await daytona.delete(sandbox, 60);
		} catch (error) {
			console.warn(
				`[agent-worker] cleanup could not delete Daytona sandbox ${session.provider_session_id}:`,
				error
			);
		}
	}
	await supabase
		.from("agent_sessions")
		.update({
			status: "ended",
			ended_at: now.toISOString(),
			end_reason: endReason,
			runner_id: runnerId,
		})
		.eq("id", session.id);
	await supabase.from("agent_events").insert({
		job_id: null,
		user_id: session.user_id,
		kind: "agent_session_ended",
		payload: {
			sessionId: session.id,
			sandboxId: session.provider_session_id,
			reason: endReason,
		},
		created_at: now.toISOString(),
	});
}

export async function cleanupDaytonaAgentSessions({
	supabase,
	runnerId,
	deps = {},
}: CleanupDaytonaAgentSessionsParams): Promise<number> {
	const apiKey = process.env.DAYTONA_API_KEY;
	if (!apiKey) {
		return 0;
	}
	const DaytonaClient =
		deps.DaytonaClient ?? (Daytona as unknown as DaytonaClientCtor);
	const daytona = new DaytonaClient({ apiKey });
	const now = new Date();
	const idleCutoff = new Date(now.getTime() - getAgentSessionIdleMs());
	const { data, error } = await supabase
		.from("agent_sessions")
		.select(
			"id, user_id, status, provider_session_id, image_tag, last_active_at, expires_at, end_reason"
		)
		.in("status", ["active", "stopping"])
		.or(
			`status.eq.stopping,expires_at.lt.${now.toISOString()},last_active_at.lt.${idleCutoff.toISOString()}`
		)
		.limit(AGENT_SESSION_CLEANUP_LIMIT);
	if (error) {
		throw new Error(`agent_sessions cleanup select failed: ${error.message}`);
	}
	const sessions = (data ?? []) as AgentSessionRow[];
	await Promise.all(
		sessions.map((session) =>
			endDaytonaAgentSession({ supabase, daytona, session, runnerId })
		)
	);
	return sessions.length;
}

async function executeShellCommand({
	sandbox,
	sessionId,
	command,
	timeout = 60,
	allowEmptyExitCodeError = false,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	command: string;
	timeout?: number;
	allowEmptyExitCodeError?: boolean;
}): Promise<DaytonaSessionCommandResult> {
	try {
		return await sandbox.process.executeSessionCommand(
			sessionId,
			{
				command,
				runAsync: false,
				suppressInputEcho: true,
			},
			timeout
		);
	} catch (error) {
		if (allowEmptyExitCodeError && isDaytonaEmptyExitCodeError({ error })) {
			return { stdout: "", stderr: "", exitCode: 0 };
		}
		throw error;
	}
}

async function readRemoteFile({
	sandbox,
	sessionId,
	path,
	allowEmptyExitCodeError = false,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
	allowEmptyExitCodeError?: boolean;
}): Promise<string> {
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: `cat ${quoteShellArg({ arg: path })} 2>/dev/null || true`,
		allowEmptyExitCodeError,
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
		allowEmptyExitCodeError: true,
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

function filterDuplicateStdoutRows({
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

async function flushStreamEvents({
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
	const envVars = buildDaytonaEnv({ secrets: secrets ?? [], job });
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
	let deleteSandboxOnFinish = true;
	let agentSessionId: string | null = null;

	try {
		const prepared = await prepareDaytonaSandbox({
			supabase,
			job,
			daytona,
			envVars,
		});
		sandbox = prepared.sandbox;
		deleteSandboxOnFinish = prepared.deleteSandboxOnFinish;
		agentSessionId = prepared.agentSessionId;

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
		if (agentSessionId) {
			await updateAgentSession({
				supabase,
				sessionId: agentSessionId,
				userId: job.userId,
				values: { last_active_at: new Date().toISOString() },
			});
		}
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
			if (deleteSandboxOnFinish) {
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
}
