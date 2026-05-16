import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentJob } from "@qcut/db";

import {
	buildDaytonaCommand,
	buildDaytonaEnv,
	cleanupDaytonaAgentSessions,
	runOnDaytona,
} from "./run-on-daytona";

const originalDaytonaApiKey = process.env.DAYTONA_API_KEY;
const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";
const EXPECTED_QCUT_DOCTOR_DAYTONA_COMMAND = [
	"mkdir -p /tmp/qcut-output",
	"set +e",
	"/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health -o /tmp/qcut-output > /tmp/qcut-output/qcut-stdout.txt 2> /tmp/qcut-output/qcut-stderr.txt",
	"exit_code=$?",
	'printf \'{"exitCode":%s}\\n\' "$exit_code" > /tmp/qcut-output/qcut-exit.json',
	'[ "$exit_code" -eq 0 ]',
].join("; ");
const EXPECTED_QCUT_IMAGE_DAYTONA_COMMAND = [
	"mkdir -p /tmp/qcut-output",
	"set +e",
	"/usr/local/bin/qcut-entrypoint qcut gen image -t icon,logo -m flux_dev --json -o /tmp/qcut-output > /tmp/qcut-output/qcut-stdout.txt 2> /tmp/qcut-output/qcut-stderr.txt",
	"exit_code=$?",
	'printf \'{"exitCode":%s}\\n\' "$exit_code" > /tmp/qcut-output/qcut-exit.json',
	'[ "$exit_code" -eq 0 ]',
].join("; ");

afterEach(() => {
	process.env.DAYTONA_API_KEY = originalDaytonaApiKey;
	vi.restoreAllMocks();
});

function makeJob(overrides: Partial<AgentJob> = {}): AgentJob {
	return {
		id: "job-1",
		userId: "user-1",
		sessionId: null,
		status: "running",
		command: "qcut system doctor --json --skip-health",
		args: {},
		createdAt: new Date("2026-05-14T00:00:00.000Z"),
		claimedAt: new Date("2026-05-14T00:00:01.000Z"),
		finishedAt: null,
		exitCode: null,
		error: null,
		runnerId: "runner-1",
		...overrides,
	};
}

function makeSupabase({
	secrets = [{ key: "OPENAI_API_KEY", value: "sk-test" }],
	agentSessions = [],
}: {
	secrets?: Array<{ key: string; value: string }>;
	agentSessions?: Array<Record<string, unknown>>;
} = {}): {
	client: SupabaseClient;
	insertedEvents: unknown[];
	sessionUpdates: Array<Record<string, unknown>>;
} {
	const insertedEvents: unknown[] = [];
	const sessionUpdates: Array<Record<string, unknown>> = [];
	const client = {
		from(table: string) {
			if (table === "agent_secrets") {
				return {
					select() {
						return {
							eq() {
								return Promise.resolve({ data: secrets, error: null });
							},
						};
					},
				};
			}
			if (table === "agent_sessions") {
				return {
					select() {
						const filters: Record<string, unknown> = {};
						const chain = {
							eq(column: string, value: unknown) {
								filters[column] = value;
								return chain;
							},
							maybeSingle() {
								const row = agentSessions.find((session) =>
									Object.entries(filters).every(
										([column, value]) => session[column] === value
									)
								);
								return Promise.resolve({ data: row ?? null, error: null });
							},
							in() {
								return chain;
							},
							or() {
								return chain;
							},
							limit() {
								return Promise.resolve({
									data: agentSessions,
									error: null,
								});
							},
						};
						return chain;
					},
					update(values: Record<string, unknown>) {
						sessionUpdates.push(values);
						return {
							eq() {
								return {
									eq() {
										return Promise.resolve({ data: null, error: null });
									},
								};
							},
						};
					},
				};
			}

			return {
				insert(row: unknown) {
					insertedEvents.push(row);
					return Promise.resolve({ data: null, error: null });
				},
			};
		},
	} as unknown as SupabaseClient;

	return { client, insertedEvents, sessionUpdates };
}

function flattenInsertedEvents({
	insertedEvents,
}: {
	insertedEvents: unknown[];
}): Array<{ kind?: unknown; payload?: unknown }> {
	const rows: Array<{ kind?: unknown; payload?: unknown }> = [];
	for (const entry of insertedEvents) {
		if (Array.isArray(entry)) {
			for (const row of entry) {
				rows.push(row as { kind?: unknown; payload?: unknown });
			}
			continue;
		}
		rows.push(entry as { kind?: unknown; payload?: unknown });
	}
	return rows;
}

describe("buildDaytonaCommand", () => {
	it("wraps qcut through the container entrypoint and archives /output", () => {
		expect(
			buildDaytonaCommand({
				command: "qcut system doctor --json --skip-health",
			})
		).toMatchObject({
			command: EXPECTED_QCUT_DOCTOR_DAYTONA_COMMAND,
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
			streams: [
				{
					path: "/tmp/qcut-output/qcut-stdout.txt",
					kind: "daytona_stdout",
					source: "qcut-stdout.txt",
				},
				{
					path: "/tmp/qcut-output/qcut-stderr.txt",
					kind: "daytona_stderr",
					source: "qcut-stderr.txt",
				},
				{
					path: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
					kind: "daytona_stderr",
					source: ".qcut-agent-wrapper-stderr",
				},
			],
			stdoutPath: "/tmp/qcut-output/qcut-stdout.txt",
			stderrPath: "/tmp/qcut-output/qcut-stderr.txt",
			exitPath: "/tmp/qcut-output/qcut-exit.json",
		});
	});

	it("quotes reconstructed qcut argv before building the SDK command string", () => {
		expect(
			buildDaytonaCommand({
				command: "qcut gen image -t icon,logo -m flux_dev --json",
			})
		).toMatchObject({
			command: EXPECTED_QCUT_IMAGE_DAYTONA_COMMAND,
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
		});
	});

	it("rejects shell metacharacters before building the SDK command string", () => {
		expect(() =>
			buildDaytonaCommand({ command: "qcut system doctor; curl bad" })
		).toThrow("shell-metacharacters");
	});

	it("builds a codex stdin command without interpolating the prompt", () => {
		const commandParts = buildDaytonaCommand({
			command: CODEX_AGENT_COMMAND,
			args: { codexPrompt: "Explain QCut's agent path." },
		});
		expect(commandParts).toMatchObject({
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
			streams: [
				{
					path: "/tmp/qcut-output/codex-events.jsonl",
					kind: "codex_event",
					source: "codex-events.jsonl",
				},
				{
					path: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
					kind: "daytona_stderr",
					source: ".qcut-agent-wrapper-stderr",
				},
			],
			stdoutPath: "/tmp/qcut-output/codex-events.jsonl",
			stderrPath: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
			exitPath: "/tmp/qcut-output/qcut-exit.json",
		});
		const command = commandParts.command;
		expect(command).toContain("export QCUT_CODEX_PROMPT_B64=");
		expect(command).toContain("export QCUT_BOOTSTRAP_CODEX=1");
		expect(command).toContain("/usr/local/bin/qcut-entrypoint codex exec");
		expect(command).not.toContain("Explain QCut's agent path.");
	});
});

describe("buildDaytonaEnv", () => {
	it("adds the agent role and preserves user secrets", () => {
		expect(
			buildDaytonaEnv({
				secrets: [
					{ key: "OPENAI_API_KEY", value: "sk-test" },
					{ key: "GEMINI_API_KEY", value: "gm-test" },
				],
			})
		).toEqual({
			QCUT_SESSION_ROLE: "agent",
			OPENAI_API_KEY: "sk-test",
			GEMINI_API_KEY: "gm-test",
		});
	});

	it("adds codex prompt bootstrap env for codex jobs", () => {
		const env = buildDaytonaEnv({
			secrets: [
				{ key: "CODEX_AUTH_JSON", value: '{"tokens":{"id_token":"x"}}' },
			],
			job: makeJob({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Explain QCut's agent path." },
			}),
		});

		expect(env.QCUT_BOOTSTRAP_CODEX).toBe("1");
		expect(env.CODEX_AUTH_JSON).toBe('{"tokens":{"id_token":"x"}}');
		expect(
			Buffer.from(env.QCUT_CODEX_PROMPT_B64, "base64").toString("utf8")
		).toContain(
			"The QCut native CLI skill is available at /home/qcut/qcut/.claude/skills/native-cli/SKILL.md."
		);
		expect(
			Buffer.from(env.QCUT_CODEX_PROMPT_B64, "base64").toString("utf8")
		).toContain("User task:\nExplain QCut's agent path.");
	});

	it("rejects codex jobs without prompt args before sandbox creation", () => {
		expect(() =>
			buildDaytonaEnv({
				secrets: [],
				job: makeJob({ command: CODEX_AGENT_COMMAND, args: {} }),
			})
		).toThrow("codexPrompt is required");
	});
});

describe("runOnDaytona", () => {
	it("creates an ephemeral image sandbox, executes qcut, downloads artifacts, and deletes the sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents } = makeSupabase();
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const sessionCalls: string[] = [];
		let stdoutReads = 0;
		const clientConfigs: Array<{ apiKey: string }> = [];
		const createCalls: unknown[] = [];
		const deleteCalls: string[] = [];
		const downloaded: Array<{ remotePath: string; localPath: string }> = [];

		const sandbox = {
			id: "sandbox-1",
			process: {
				createSession(sessionId: string) {
					sessionCalls.push(`create:${sessionId}`);
					return Promise.resolve();
				},
				deleteSession(sessionId: string) {
					sessionCalls.push(`delete:${sessionId}`);
					return Promise.resolve();
				},
				executeSessionCommand(
					sessionId: string,
					request: { command: string },
					timeout?: number
				) {
					sessionCalls.push(`${sessionId}:${request.command}:${timeout}`);
					if (
						request.command.startsWith("cat ") &&
						request.command.includes("qcut-stdout.txt")
					) {
						stdoutReads += 1;
						if (stdoutReads === 1) {
							return Promise.reject(
								new Error(
									'DaytonaError: failed to execute command: bad request: failed to convert exit code to int: strconv.Atoi: parsing "": invalid syntax'
								)
							);
						}
						return Promise.resolve({
							stdout: '{"kind":"cli_progress","message":"halfway"}\n',
							stderr: "",
							exitCode: 0,
						});
					}
					if (
						request.command.includes("qcut-stderr.txt") ||
						request.command.includes(".qcut-agent-wrapper-stderr")
					) {
						return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
					}
					if (request.command.includes(".qcut-agent-done")) {
						return Promise.resolve({ stdout: "yes", stderr: "", exitCode: 0 });
					}
					if (request.command.includes("qcut-exit.json")) {
						return Promise.resolve({
							stdout: '{"exitCode":0}\n',
							stderr: "",
							exitCode: 0,
						});
					}
					return Promise.resolve({
						stdout: "ok",
						stderr: "",
						exitCode: 0,
					});
				},
			},
			fs: {
				downloadFile(remotePath: string, localPath: string) {
					downloaded.push({ remotePath, localPath });
					return Promise.resolve();
				},
			},
		};

		class FakeDaytonaClient {
			constructor(config: { apiKey: string }) {
				clientConfigs.push(config);
			}

			create(params: unknown) {
				createCalls.push(params);
				return Promise.resolve(sandbox);
			}

			get() {
				return Promise.reject(
					new Error("get should not run for one-shot jobs")
				);
			}

			delete(target: { id: string }) {
				deleteCalls.push(target.id);
				return Promise.resolve();
			}
		}

		const result = await runOnDaytona({
			supabase: client,
			job: makeJob(),
			deps: {
				DaytonaClient: FakeDaytonaClient,
				makeOutputDir: () => Promise.resolve(outputDir),
				makeSessionId: () => "session-1",
				sleep: () => Promise.resolve(),
				extractArchive: () => Promise.resolve(),
			},
		});

		expect(clientConfigs).toEqual([{ apiKey: "daytona-test" }]);
		expect(createCalls).toEqual([
			{
				image:
					"ghcr.io/quriosity-agent/qcut-cli@sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923",
				envVars: {
					QCUT_SESSION_ROLE: "agent",
					OPENAI_API_KEY: "sk-test",
				},
				resources: { cpu: 2, memory: 4 },
				ephemeral: true,
				autoStopInterval: 30,
			},
		]);
		expect(
			sessionCalls.some((call) => call.includes("rm -rf /tmp/qcut-output"))
		).toBe(true);
		expect(sessionCalls.some((call) => call.includes("&;"))).toBe(false);
		expect(sessionCalls.some((call) => call.includes("& pid=$!"))).toBe(true);
		expect(sessionCalls).toContain(
			"session-1:tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .:1800"
		);
		expect(downloaded).toEqual([
			{
				remotePath: "/tmp/qcut-output.tar",
				localPath: join(outputDir, "qcut-output.tar"),
			},
		]);
		expect(deleteCalls).toEqual(["sandbox-1"]);
		expect(result).toMatchObject({
			stdout: '{"kind":"cli_progress","message":"halfway"}\n',
			stderr: "",
			exitCode: 0,
			outputDir,
			artifactsFallback: false,
			eventsStreamed: true,
		});
		expect(
			flattenInsertedEvents({ insertedEvents }).map((event) => event.kind)
		).toEqual([
			"daytona_sandbox_ready",
			"daytona_command_started",
			"cli_progress",
			"daytona_command_finished",
		]);
		expect(stdoutReads).toBeGreaterThan(1);

		await rm(outputDir, { recursive: true, force: true });
	});

	it("stages stderr and records an event when artifact download fails", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { client, insertedEvents } = makeSupabase();
		const clientConfigs: Array<{ apiKey: string }> = [];
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));

		const sandbox = {
			id: "sandbox-1",
			process: {
				createSession() {
					return Promise.resolve();
				},
				deleteSession() {
					return Promise.resolve();
				},
				executeSessionCommand(
					_sessionId: string,
					request: { command: string }
				) {
					if (request.command.includes("qcut-stderr.txt")) {
						return Promise.resolve({
							stdout: "stderr text",
							stderr: "",
							exitCode: 0,
						});
					}
					if (
						request.command.includes("qcut-stdout.txt") ||
						request.command.includes(".qcut-agent-wrapper-stderr")
					) {
						return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
					}
					if (request.command.includes(".qcut-agent-done")) {
						return Promise.resolve({ stdout: "yes", stderr: "", exitCode: 0 });
					}
					if (request.command.includes("qcut-exit.json")) {
						return Promise.resolve({
							stdout: '{"exitCode":0}\n',
							stderr: "",
							exitCode: 0,
						});
					}
					return Promise.resolve({
						stdout: "",
						stderr: "stderr text",
						exitCode: 0,
					});
				},
			},
			fs: {
				downloadFile() {
					return Promise.reject(new Error("download failed"));
				},
			},
		};

		class FakeDaytonaClient {
			constructor(config: { apiKey: string }) {
				clientConfigs.push(config);
			}

			create() {
				return Promise.resolve(sandbox);
			}

			get() {
				return Promise.reject(
					new Error("get should not run for one-shot jobs")
				);
			}

			delete() {
				return Promise.resolve();
			}
		}

		const result = await runOnDaytona({
			supabase: client,
			job: makeJob(),
			deps: {
				DaytonaClient: FakeDaytonaClient,
				makeOutputDir: () => Promise.resolve(outputDir),
				makeSessionId: () => "session-1",
				sleep: () => Promise.resolve(),
			},
		});

		await expect(readFile(join(outputDir, "exec.log"), "utf8")).resolves.toBe(
			"stderr text"
		);
		expect(clientConfigs).toEqual([{ apiKey: "daytona-test" }]);
		expect(
			flattenInsertedEvents({ insertedEvents }).some(
				(event) => event.kind === "artifact_fallback"
			)
		).toBe(true);
		expect(result.artifactsFallback).toBe(true);

		await rm(outputDir, { recursive: true, force: true });
	});

	it("reuses a persisted agent session sandbox and keeps it alive after the job", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "active",
					provider_session_id: "sandbox-persisted",
					image_tag:
						"ghcr.io/quriosity-agent/qcut-cli@sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923",
					last_active_at: "2026-05-14T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: null,
				},
			],
		});
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const getCalls: string[] = [];
		const deleteCalls: string[] = [];

		const sandbox = {
			id: "sandbox-persisted",
			process: {
				createSession() {
					return Promise.resolve();
				},
				deleteSession() {
					return Promise.resolve();
				},
				executeSessionCommand(
					_sessionId: string,
					request: { command: string }
				) {
					if (request.command.includes(".qcut-agent-done")) {
						return Promise.resolve({ stdout: "yes", stderr: "", exitCode: 0 });
					}
					if (request.command.includes("qcut-exit.json")) {
						return Promise.resolve({
							stdout: '{"exitCode":0}\n',
							stderr: "",
							exitCode: 0,
						});
					}
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				},
			},
			fs: {
				downloadFile() {
					return Promise.resolve();
				},
			},
		};

		class FakeDaytonaClient {
			get(sandboxId: string) {
				getCalls.push(sandboxId);
				return Promise.resolve(sandbox);
			}

			create() {
				return Promise.reject(
					new Error("create should not run for an existing session")
				);
			}

			delete(target: { id: string }) {
				deleteCalls.push(target.id);
				return Promise.resolve();
			}
		}

		await runOnDaytona({
			supabase: client,
			job: makeJob({ sessionId: "agent-session-1" }),
			deps: {
				DaytonaClient: FakeDaytonaClient,
				makeOutputDir: () => Promise.resolve(outputDir),
				makeSessionId: () => "session-1",
				sleep: () => Promise.resolve(),
				extractArchive: () => Promise.resolve(),
			},
		});

		expect(getCalls).toEqual(["sandbox-persisted"]);
		expect(deleteCalls).toEqual([]);
		expect(sessionUpdates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider_session_id: "sandbox-persisted",
					runner_id: "runner-1",
				}),
			])
		);
		expect(
			flattenInsertedEvents({ insertedEvents }).map((event) => event.kind)
		).toContain("agent_session_ready");

		await rm(outputDir, { recursive: true, force: true });
	});

	it("cleans up idle Daytona agent sessions", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "active",
					provider_session_id: "sandbox-persisted",
					image_tag: "qcut-cli",
					last_active_at: "2026-05-14T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: null,
				},
			],
		});
		const deleteCalls: string[] = [];
		const sandbox = {
			id: "sandbox-persisted",
			process: {
				createSession() {
					return Promise.resolve();
				},
				deleteSession() {
					return Promise.resolve();
				},
				executeSessionCommand() {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				},
			},
			fs: {
				downloadFile() {
					return Promise.resolve();
				},
			},
		};

		class FakeDaytonaClient {
			get() {
				return Promise.resolve(sandbox);
			}

			create() {
				return Promise.reject(
					new Error("create should not run during cleanup")
				);
			}

			delete(target: { id: string }) {
				deleteCalls.push(target.id);
				return Promise.resolve();
			}
		}

		const count = await cleanupDaytonaAgentSessions({
			supabase: client,
			runnerId: "runner-cleanup",
			deps: { DaytonaClient: FakeDaytonaClient },
		});

		expect(count).toBe(1);
		expect(deleteCalls).toEqual(["sandbox-persisted"]);
		expect(sessionUpdates).toEqual([
			expect.objectContaining({
				status: "ended",
				end_reason: "idle_timeout",
				runner_id: "runner-cleanup",
			}),
		]);
		expect(
			flattenInsertedEvents({ insertedEvents }).map((event) => event.kind)
		).toContain("agent_session_ended");
	});
});
