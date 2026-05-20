import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
	flattenInsertedEvents,
	makeJob,
	makeSupabase,
	runOnDaytona,
} from "./run-on-daytona.test-utils";

describe("runOnDaytona persisted sessions", () => {
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

	it("creates a persistent sandbox for a new agent session and leaves it running", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, insertedEvents, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "active",
					provider_session_id: null,
					image_tag: "qcut-cli:session-row",
					last_active_at: "2026-05-14T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: null,
				},
			],
		});
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const createCalls: unknown[] = [];
		const deleteCalls: string[] = [];
		const sandbox = {
			id: "sandbox-new-session",
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
			get() {
				return Promise.reject(new Error("no existing sandbox"));
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

		expect(createCalls).toEqual([
			expect.objectContaining({
				image: "qcut-cli:session-row",
				autoStopInterval: 120,
			}),
		]);
		expect(deleteCalls).toEqual([]);
		expect(sessionUpdates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider_session_id: "sandbox-new-session",
					runner_id: "runner-1",
				}),
			])
		);
		expect(
			flattenInsertedEvents({ insertedEvents }).find(
				(event) => event.kind === "agent_session_ready"
			)?.payload
		).toMatchObject({
			sessionId: "agent-session-1",
			sandboxId: "sandbox-new-session",
			reused: false,
		});

		await rm(outputDir, { recursive: true, force: true });
	});

	it("replaces a missing persisted agent session sandbox without deleting the replacement", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { client, insertedEvents, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "active",
					provider_session_id: "sandbox-gone",
					image_tag: "qcut-cli:session-row",
					last_active_at: "2026-05-14T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: null,
				},
			],
		});
		const outputDir = await mkdtemp(join(tmpdir(), "qcut-daytona-test-"));
		const createCalls: unknown[] = [];
		const deleteCalls: string[] = [];
		const sandbox = {
			id: "sandbox-replacement",
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
			get() {
				return Promise.reject(new Error("sandbox not found"));
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

		expect(createCalls).toEqual([
			expect.objectContaining({ image: "qcut-cli:session-row" }),
		]);
		expect(deleteCalls).toEqual([]);
		expect(sessionUpdates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider_session_id: "sandbox-replacement",
				}),
			])
		);
		expect(
			flattenInsertedEvents({ insertedEvents }).find(
				(event) => event.kind === "agent_session_ready"
			)?.payload
		).toMatchObject({ reused: false, sandboxId: "sandbox-replacement" });

		await rm(outputDir, { recursive: true, force: true });
	});
});
