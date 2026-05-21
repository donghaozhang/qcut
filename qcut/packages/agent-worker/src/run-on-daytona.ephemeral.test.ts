import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
	buildMaterializeQcutEnvCommand,
	CODEX_AGENT_COMMAND,
	flattenInsertedEvents,
	makeJob,
	makeSupabase,
	runOnDaytona,
} from "./run-on-daytona.test-utils";

describe("runOnDaytona ephemeral jobs", () => {
	it("creates an ephemeral image sandbox, executes qcut, downloads artifacts, and deletes the sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents } = makeSupabase();
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const sessionCalls: string[] = [];
		let stdoutReads = 0;
		const clientConfigs: Array<{ apiKey: string }> = [];
		const createCalls: unknown[] = [];
		const executeCommandCalls: Array<{
			command: string;
			env?: Record<string, string>;
			timeout?: number;
		}> = [];
		const deleteCalls: string[] = [];
		const downloaded: Array<{ remotePath: string; localPath: string }> = [];

		const sandbox = {
			id: "sandbox-1",
			process: {
				executeCommand(
					command: string,
					_cwd?: string,
					env?: Record<string, string>,
					timeout?: number
				) {
					executeCommandCalls.push({ command, env, timeout });
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				},
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
						request.command.includes("__QCUT_FILE_SIZE__=") &&
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
							stdout:
								'__QCUT_FILE_SIZE__=43\n{"kind":"cli_progress","message":"halfway"}\n',
							stderr: "",
							exitCode: 0,
						});
					}
					if (
						request.command.startsWith("cat ") &&
						request.command.includes("qcut-stdout.txt")
					) {
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
		expect(executeCommandCalls).toEqual([
			{
				command: buildMaterializeQcutEnvCommand({
					envVars: {
						QCUT_SESSION_ROLE: "agent",
						OPENAI_API_KEY: "sk-test",
					},
				}),
				env: undefined,
				timeout: 120,
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

	it("streams Codex live stdout without duplicating final aggregated output", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents } = makeSupabase();
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const codexEvent = JSON.stringify({
			item: {
				id: "item_0",
				type: "command_execution",
				status: "completed",
				command:
					"/bin/bash -lc 'echo LIVE_1 | tee -a /tmp/qcut-output/codex-live-stdout.log'",
				exit_code: 0,
				aggregated_output: "LIVE_1\n",
			},
			type: "item.completed",
		});
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
					if (
						request.command.includes("__QCUT_FILE_SIZE__=") &&
						request.command.includes("codex-live-stdout.log")
					) {
						return Promise.resolve({
							stdout: request.command.includes("offset=0")
								? "__QCUT_FILE_SIZE__=7\nLIVE_1\n"
								: "__QCUT_FILE_SIZE__=7\n",
							stderr: "",
							exitCode: 0,
						});
					}
					if (request.command.includes("codex-live-stdout.log")) {
						return Promise.resolve({
							stdout: "LIVE_1\n",
							stderr: "",
							exitCode: 0,
						});
					}
					if (
						request.command.includes("__QCUT_FILE_SIZE__=") &&
						request.command.includes("codex-events.jsonl")
					) {
						return Promise.resolve({
							stdout: request.command.includes("offset=0")
								? `__QCUT_FILE_SIZE__=${Buffer.byteLength(`${codexEvent}\n`)}\n${codexEvent}\n`
								: `__QCUT_FILE_SIZE__=${Buffer.byteLength(`${codexEvent}\n`)}\n`,
							stderr: "",
							exitCode: 0,
						});
					}
					if (request.command.includes("codex-events.jsonl")) {
						return Promise.resolve({
							stdout: `${codexEvent}\n`,
							stderr: "",
							exitCode: 0,
						});
					}
					if (request.command.includes(".qcut-agent-wrapper-stderr")) {
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
					return Promise.resolve({ stdout: "ok", stderr: "", exitCode: 0 });
				},
			},
			fs: {
				downloadFile() {
					return Promise.resolve();
				},
			},
		};

		class FakeDaytonaClient {
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

		await runOnDaytona({
			supabase: client,
			job: makeJob({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Run a streaming probe." },
			}),
			deps: {
				DaytonaClient: FakeDaytonaClient,
				makeOutputDir: () => Promise.resolve(outputDir),
				makeSessionId: () => "session-1",
				sleep: () => Promise.resolve(),
				extractArchive: () => Promise.resolve(),
			},
		});

		const stdoutEvents = flattenInsertedEvents({ insertedEvents }).filter(
			(event) => event.kind === "codex_stdout"
		);
		expect(stdoutEvents).toHaveLength(1);
		expect(stdoutEvents[0]?.payload).toMatchObject({
			message: "LIVE_1",
			source: "codex-live-stdout.log",
		});

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
});
