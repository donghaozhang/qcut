import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSessionManager } from "../session-manager.js";
import { writeMetadata, readMetadataRaw } from "../metadata.js";
import type {
	Runtime,
	Agent,
	PluginRegistry,
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

describe("sendOrRestart", () => {
	it("sends message normally when agent is alive", async () => {
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
		const result = await sm.sendOrRestart("app-1", "Fix CI");

		expect(result.restarted).toBe(false);
		expect(env.mockRuntime.sendMessage).toHaveBeenCalledWith(
			makeHandle("rt-1"),
			"Fix CI",
		);
	});

	it("re-launches agent when process is dead", async () => {
		const deadAgent: Agent = {
			...env.mockAgent,
			isProcessRunning: vi.fn().mockResolvedValue(false),
			getLaunchCommand: vi.fn().mockReturnValue("claude --resume"),
		};
		const registryWithDead: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return deadAgent;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "pr_open",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-1")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithDead,
		});
		const result = await sm.sendOrRestart("app-1", "CI failed, fix it");

		expect(result.restarted).toBe(true);
		expect(deadAgent.getLaunchCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "app-1",
				prompt: "CI failed, fix it",
			}),
		);
		expect(env.mockRuntime.sendMessage).toHaveBeenCalledWith(
			makeHandle("rt-1"),
			"claude --resume",
		);

		// Verify metadata was updated
		const meta = readMetadataRaw(env.sessionsDir, "app-1");
		expect(meta?.status).toBe("spawning");
		expect(meta?.restartedAt).toBeDefined();
	});

	it("throws for nonexistent session", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.sendOrRestart("nope", "hello")).rejects.toThrow(
			"not found",
		);
	});

	it("falls back to basic send when no runtime/agent plugins", async () => {
		const noPluginsRegistry: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockReturnValue(null),
		};
		// Need runtime for the fallback send path
		const registryWithRuntimeOnly: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
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
			registry: registryWithRuntimeOnly,
		});
		const result = await sm.sendOrRestart("app-1", "hello");

		expect(result.restarted).toBe(false);
	});

	it("throws when agent is dead and no runtime handle", async () => {
		const deadAgent: Agent = {
			...env.mockAgent,
			isProcessRunning: vi.fn().mockResolvedValue(false),
		};
		const registryWithDead: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return deadAgent;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "pr_open",
			project: "my-app",
			// No runtimeHandle stored
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithDead,
		});
		await expect(sm.sendOrRestart("app-1", "hello")).rejects.toThrow(
			"No runtime handle",
		);
	});
});
