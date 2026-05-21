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

import type { ContainerResult } from "./run-container.js";
import {
	buildAsyncStartCommand,
	buildDaytonaCommand,
	parseExitCode,
	quoteShellArg,
} from "./daytona/command.js";
import { buildDaytonaEnv } from "./daytona/env.js";
import { recordAgentEvent } from "./daytona/events.js";
import {
	downloadOutputDir,
	executeShellCommand,
	extractArchive,
	readRemoteFile,
} from "./daytona/remote-files.js";
import {
	cleanupDaytonaAgentSessions,
	prepareDaytonaSandbox,
	updateAgentSession,
} from "./daytona/sessions.js";
import { waitForRemoteCommand } from "./daytona/streaming.js";
import { QCUT_ENV_FILE, TIMEOUT_SECONDS } from "./daytona/constants.js";
import type {
	AgentSecretRow,
	DaytonaClientCtor,
	DaytonaSandbox,
	DaytonaSessionCommandResult,
	RunOnDaytonaParams,
} from "./daytona/types.js";

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function quoteEnvValue({ value }: { value: string }): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildQcutEnvFileContent({
	envVars,
}: {
	envVars: Record<string, string>;
}): string {
	const lines = ["# qcut Daytona agent env"];
	for (const [key, value] of Object.entries(envVars)) {
		if (!ENV_KEY_PATTERN.test(key)) continue;
		lines.push(`${key}=${quoteEnvValue({ value })}`);
	}
	return `${lines.join("\n")}\n`;
}

export function buildMaterializeQcutEnvCommand({
	envVars,
}: {
	envVars: Record<string, string>;
}): string {
	const encodedEnv = Buffer.from(
		buildQcutEnvFileContent({ envVars }),
		"utf8"
	).toString("base64");
	return `umask 077; printf ${quoteShellArg({ arg: encodedEnv })} | base64 -d > ${QCUT_ENV_FILE}`;
}

async function materializeQcutEnv({
	sandbox,
	envVars,
}: {
	sandbox: DaytonaSandbox;
	envVars: Record<string, string>;
}): Promise<void> {
	if (!sandbox.process.executeCommand) {
		console.warn(
			"[agent-worker] Daytona SDK executeCommand unavailable; qcut session will rely on sandbox env inheritance"
		);
		return;
	}
	const result = await sandbox.process.executeCommand(
		buildMaterializeQcutEnvCommand({ envVars }),
		undefined,
		undefined,
		120
	);
	if (typeof result.exitCode === "number" && result.exitCode !== 0) {
		throw new Error(
			`Failed to materialize qcut env in Daytona sandbox: exit ${result.exitCode}`
		);
	}
}

export { buildDaytonaCommand } from "./daytona/command.js";
export { buildDaytonaEnv } from "./daytona/env.js";
export { cleanupDaytonaAgentSessions } from "./daytona/sessions.js";

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
	const envVars = buildDaytonaEnv({
		secrets: (secrets ?? []) as AgentSecretRow[],
		job,
	});
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

		await materializeQcutEnv({ sandbox, envVars });
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
