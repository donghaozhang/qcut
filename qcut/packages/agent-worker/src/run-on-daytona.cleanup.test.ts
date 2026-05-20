import { describe, expect, it, vi } from "vitest";

import {
	cleanupDaytonaAgentSessions,
	flattenInsertedEvents,
	makeSupabase,
} from "./run-on-daytona.test-utils";

describe("cleanupDaytonaAgentSessions", () => {
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

	it("marks expired sessions with the ttl cleanup reason", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "active",
					provider_session_id: null,
					image_tag: "qcut-cli",
					last_active_at: "2099-01-01T00:00:00.000Z",
					expires_at: "2000-01-01T00:00:00.000Z",
					end_reason: null,
				},
			],
		});

		class FakeDaytonaClient {
			get() {
				return Promise.reject(new Error("get should not run without sandbox"));
			}

			create() {
				return Promise.reject(
					new Error("create should not run during cleanup")
				);
			}

			delete() {
				return Promise.reject(
					new Error("delete should not run without sandbox")
				);
			}
		}

		const count = await cleanupDaytonaAgentSessions({
			supabase: client,
			runnerId: "runner-cleanup",
			deps: { DaytonaClient: FakeDaytonaClient },
		});

		expect(count).toBe(1);
		expect(sessionUpdates).toEqual([
			expect.objectContaining({ status: "ended", end_reason: "ttl" }),
		]);
	});

	it("marks stopping sessions with the user_kill cleanup reason", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		const { client, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "stopping",
					provider_session_id: null,
					image_tag: "qcut-cli",
					last_active_at: "2099-01-01T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: "user_kill",
				},
			],
		});

		class FakeDaytonaClient {
			get() {
				return Promise.reject(new Error("get should not run without sandbox"));
			}

			create() {
				return Promise.reject(
					new Error("create should not run during cleanup")
				);
			}

			delete() {
				return Promise.reject(
					new Error("delete should not run without sandbox")
				);
			}
		}

		const count = await cleanupDaytonaAgentSessions({
			supabase: client,
			runnerId: "runner-cleanup",
			deps: { DaytonaClient: FakeDaytonaClient },
		});

		expect(count).toBe(1);
		expect(sessionUpdates).toEqual([
			expect.objectContaining({ status: "ended", end_reason: "user_kill" }),
		]);
	});

	it("ends cleanup rows even when Daytona delete reports the sandbox is gone", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { client, sessionUpdates } = makeSupabase({
			agentSessions: [
				{
					id: "agent-session-1",
					user_id: "user-1",
					status: "stopping",
					provider_session_id: "sandbox-gone",
					image_tag: "qcut-cli",
					last_active_at: "2099-01-01T00:00:00.000Z",
					expires_at: "2099-01-01T00:00:00.000Z",
					end_reason: "user_kill",
				},
			],
		});

		class FakeDaytonaClient {
			get() {
				return Promise.reject(new Error("404 sandbox not found"));
			}

			create() {
				return Promise.reject(
					new Error("create should not run during cleanup")
				);
			}

			delete() {
				return Promise.reject(new Error("delete should not run after 404"));
			}
		}

		const count = await cleanupDaytonaAgentSessions({
			supabase: client,
			runnerId: "runner-cleanup",
			deps: { DaytonaClient: FakeDaytonaClient },
		});

		expect(count).toBe(1);
		expect(sessionUpdates).toEqual([
			expect.objectContaining({
				status: "ended",
				end_reason: "user_kill",
				runner_id: "runner-cleanup",
			}),
		]);
	});
});
