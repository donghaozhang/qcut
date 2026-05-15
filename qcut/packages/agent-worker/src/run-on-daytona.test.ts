import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentJob } from "@qcut/db";

import {
	buildDaytonaCommand,
	buildDaytonaEnv,
	runOnDaytona,
} from "./run-on-daytona";

const originalDaytonaApiKey = process.env.DAYTONA_API_KEY;

afterEach(() => {
	process.env.DAYTONA_API_KEY = originalDaytonaApiKey;
	vi.restoreAllMocks();
});

function makeJob(): AgentJob {
	return {
		id: "job-1",
		userId: "user-1",
		status: "running",
		command: "qcut system doctor --json --skip-health",
		args: {},
		createdAt: new Date("2026-05-14T00:00:00.000Z"),
		claimedAt: new Date("2026-05-14T00:00:01.000Z"),
		finishedAt: null,
		exitCode: null,
		error: null,
		runnerId: "runner-1",
	};
}

function makeSupabase({
	secrets = [{ key: "OPENAI_API_KEY", value: "sk-test" }],
}: {
	secrets?: Array<{ key: string; value: string }>;
} = {}): {
	client: SupabaseClient;
	insertedEvents: unknown[];
} {
	const insertedEvents: unknown[] = [];
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

			return {
				insert(row: unknown) {
					insertedEvents.push(row);
					return Promise.resolve({ data: null, error: null });
				},
			};
		},
	} as unknown as SupabaseClient;

	return { client, insertedEvents };
}

describe("buildDaytonaCommand", () => {
	it("wraps qcut through the container entrypoint and archives /output", () => {
		expect(
			buildDaytonaCommand({
				command: "qcut system doctor --json --skip-health",
			})
		).toEqual({
			command:
				"mkdir -p /tmp/qcut-output && /usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health -o /tmp/qcut-output",
			archiveCommand: "tar -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
		});
	});

	it("rejects shell metacharacters before building the SDK command string", () => {
		expect(() =>
			buildDaytonaCommand({ command: "qcut system doctor; curl bad" })
		).toThrow("shell-metacharacters");
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
});

describe("runOnDaytona", () => {
	it("creates an ephemeral image sandbox, executes qcut, downloads artifacts, and deletes the sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client } = makeSupabase();
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const sessionCalls: string[] = [];
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
				extractArchive: () => Promise.resolve(),
			},
		});

		expect(clientConfigs).toEqual([{ apiKey: "daytona-test" }]);
		expect(createCalls).toEqual([
			{
				image: "ghcr.io/quriosity-agent/qcut-cli:v0",
				envVars: {
					QCUT_SESSION_ROLE: "agent",
					OPENAI_API_KEY: "sk-test",
				},
				resources: { cpu: 2, memory: 4 },
				ephemeral: true,
				autoStopInterval: 30,
			},
		]);
		expect(sessionCalls).toContain(
			"session-1:mkdir -p /tmp/qcut-output && /usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health -o /tmp/qcut-output:1800"
		);
		expect(sessionCalls).toContain(
			"session-1:tar -C /tmp/qcut-output -cf /tmp/qcut-output.tar .:1800"
		);
		expect(downloaded).toEqual([
			{
				remotePath: "/tmp/qcut-output.tar",
				localPath: join(outputDir, "qcut-output.tar"),
			},
		]);
		expect(deleteCalls).toEqual(["sandbox-1"]);
		expect(result).toMatchObject({
			stdout: "ok",
			stderr: "",
			exitCode: 0,
			outputDir,
			artifactsFallback: false,
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
				executeSessionCommand() {
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
			},
		});

		await expect(readFile(join(outputDir, "exec.log"), "utf8")).resolves.toBe(
			"stderr text"
		);
		expect(clientConfigs).toEqual([{ apiKey: "daytona-test" }]);
		expect(insertedEvents).toHaveLength(1);
		expect(result.artifactsFallback).toBe(true);

		await rm(outputDir, { recursive: true, force: true });
	});
});
