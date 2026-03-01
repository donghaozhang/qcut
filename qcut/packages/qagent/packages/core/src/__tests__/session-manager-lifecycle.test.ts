import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSessionManager } from "../session-manager.js";
import { writeMetadata, readMetadata } from "../metadata.js";
import type {
	Runtime,
	Agent,
	Workspace,
	PluginRegistry,
	Tracker,
	SCM,
} from "../types.js";
import {
	createTestEnvironment,
	cleanupTestEnvironment,
	makeHandle,
	type TestEnvironment,
} from "./session-manager-setup.js";

let env: TestEnvironment;

beforeEach(() => {
	env = createTestEnvironment();
});

afterEach(() => {
	cleanupTestEnvironment(env);
});

describe("list", () => {
	it("lists sessions from metadata", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp/w1",
			branch: "feat/a",
			status: "working",
			project: "my-app",
		});
		writeMetadata(env.sessionsDir, "app-2", {
			worktree: "/tmp/w2",
			branch: "feat/b",
			status: "pr_open",
			project: "my-app",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const sessions = await sm.list();

		expect(sessions).toHaveLength(2);
		expect(sessions.map((s) => s.id).sort()).toEqual(["app-1", "app-2"]);
	});

	it("filters by project ID", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const sessions = await sm.list("my-app");

		expect(sessions).toHaveLength(1);
		expect(sessions[0].id).toBe("app-1");
	});

	it("marks dead runtimes as killed", async () => {
		const deadRuntime: Runtime = {
			...env.mockRuntime,
			isAlive: vi.fn().mockResolvedValue(false),
		};
		const registryWithDead: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return deadRuntime;
				if (slot === "agent") return env.mockAgent;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithDead,
		});
		const sessions = await sm.list();

		expect(sessions[0].status).toBe("killed");
		expect(sessions[0].activity).toBe("exited");
	});

	it("detects activity using agent-native mechanism", async () => {
		const agentWithState: Agent = {
			...env.mockAgent,
			getActivityState: vi.fn().mockResolvedValue({ state: "active" }),
		};
		const registryWithState: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithState;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithState,
		});
		const sessions = await sm.list();

		expect(agentWithState.getActivityState).toHaveBeenCalled();
		expect(sessions[0].activity).toBe("active");
	});

	it("keeps existing activity when getActivityState throws", async () => {
		const agentWithError: Agent = {
			...env.mockAgent,
			getActivityState: vi
				.fn()
				.mockRejectedValue(new Error("detection failed")),
		};
		const registryWithError: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithError;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithError,
		});
		const sessions = await sm.list();

		expect(sessions[0].activity).toBeNull();
	});

	it("keeps existing activity when getActivityState returns null", async () => {
		const agentWithNull: Agent = {
			...env.mockAgent,
			getActivityState: vi.fn().mockResolvedValue(null),
		};
		const registryWithNull: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithNull;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithNull,
		});
		const sessions = await sm.list();

		expect(agentWithNull.getActivityState).toHaveBeenCalled();
		expect(sessions[0].activity).toBeNull();
	});

	it("updates lastActivityAt when detection timestamp is newer", async () => {
		const newerTimestamp = new Date(Date.now() + 60_000);
		const agentWithTimestamp: Agent = {
			...env.mockAgent,
			getActivityState: vi
				.fn()
				.mockResolvedValue({
					state: "active",
					timestamp: newerTimestamp,
				}),
		};
		const registryWithTimestamp: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithTimestamp;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithTimestamp,
		});
		const sessions = await sm.list();

		expect(sessions[0].activity).toBe("active");
		expect(sessions[0].lastActivityAt).toEqual(newerTimestamp);
	});

	it("does not downgrade lastActivityAt when detection timestamp is older", async () => {
		const olderTimestamp = new Date(0);
		const agentWithOldTimestamp: Agent = {
			...env.mockAgent,
			getActivityState: vi
				.fn()
				.mockResolvedValue({
					state: "active",
					timestamp: olderTimestamp,
				}),
		};
		const registryWithOldTimestamp: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithOldTimestamp;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "a",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithOldTimestamp,
		});
		const sessions = await sm.list();

		expect(sessions[0].activity).toBe("active");
		expect(sessions[0].lastActivityAt.getTime()).toBeGreaterThan(
			olderTimestamp.getTime(),
		);
	});
});

describe("get", () => {
	it("returns session by ID", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
			pr: "https://github.com/org/repo/pull/42",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const session = await sm.get("app-1");

		expect(session).not.toBeNull();
		expect(session!.id).toBe("app-1");
		expect(session!.pr).not.toBeNull();
		expect(session!.pr!.number).toBe(42);
		expect(session!.pr!.url).toBe(
			"https://github.com/org/repo/pull/42",
		);
	});

	it("detects activity using agent-native mechanism", async () => {
		const agentWithState: Agent = {
			...env.mockAgent,
			getActivityState: vi.fn().mockResolvedValue({ state: "idle" }),
		};
		const registryWithState: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithState;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithState,
		});
		const session = await sm.get("app-1");

		expect(agentWithState.getActivityState).toHaveBeenCalled();
		expect(session!.activity).toBe("idle");
	});

	it("returns null for nonexistent session", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		expect(await sm.get("nonexistent")).toBeNull();
	});
});

describe("kill", () => {
	it("destroys runtime, workspace, and archives metadata", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp/ws",
			branch: "main",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await sm.kill("app-1");

		expect(env.mockRuntime.destroy).toHaveBeenCalledWith(
			makeHandle("rt-1"),
		);
		expect(env.mockWorkspace.destroy).toHaveBeenCalledWith("/tmp/ws");
		expect(readMetadata(env.sessionsDir, "app-1")).toBeNull();
	});

	it("throws for nonexistent session", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.kill("nonexistent")).rejects.toThrow("not found");
	});

	it("tolerates runtime destroy failure", async () => {
		const failRuntime: Runtime = {
			...env.mockRuntime,
			destroy: vi.fn().mockRejectedValue(new Error("already gone")),
		};
		const registryWithFail: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return failRuntime;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithFail,
		});
		await expect(sm.kill("app-1")).resolves.toBeUndefined();
	});
});

describe("cleanup", () => {
	it("kills sessions with merged PRs", async () => {
		const mockSCM: SCM = {
			name: "mock-scm",
			detectPR: vi.fn(),
			getPRState: vi.fn().mockResolvedValue("merged"),
			mergePR: vi.fn(),
			closePR: vi.fn(),
			getCIChecks: vi.fn(),
			getCISummary: vi.fn(),
			getReviews: vi.fn(),
			getReviewDecision: vi.fn(),
			getPendingComments: vi.fn(),
			getAutomatedComments: vi.fn(),
			getMergeability: vi.fn(),
		};

		const registryWithSCM: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				if (slot === "scm") return mockSCM;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "pr_open",
			project: "my-app",
			pr: "https://github.com/org/repo/pull/10",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithSCM,
		});
		const result = await sm.cleanup();

		expect(result.killed).toContain("app-1");
		expect(result.skipped).toHaveLength(0);
	});

	it("skips sessions without merged PRs or completed issues", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const result = await sm.cleanup();

		expect(result.killed).toHaveLength(0);
		expect(result.skipped).toContain("app-1");
	});

	it("kills sessions with dead runtimes", async () => {
		const deadRuntime: Runtime = {
			...env.mockRuntime,
			isAlive: vi.fn().mockResolvedValue(false),
		};
		const registryWithDead: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return deadRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithDead,
		});
		const result = await sm.cleanup();

		expect(result.killed).toContain("app-1");
	});
});

describe("send", () => {
	it("sends message via runtime.sendMessage", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await sm.send("app-1", "Fix the CI failures");

		expect(env.mockRuntime.sendMessage).toHaveBeenCalledWith(
			makeHandle("rt-1"),
			"Fix the CI failures",
		);
	});

	it("throws for nonexistent session", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.send("nope", "hello")).rejects.toThrow("not found");
	});

	it("falls back to session ID as runtime handle when no runtimeHandle stored", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "working",
			project: "my-app",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await sm.send("app-1", "hello");
		expect(env.mockRuntime.sendMessage).toHaveBeenCalledWith(
			{ id: "app-1", runtimeName: "mock", data: {} },
			"hello",
		);
	});
});
