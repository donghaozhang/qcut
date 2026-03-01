import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionManager } from "../session-manager.js";
import {
	writeMetadata,
	readMetadataRaw,
	deleteMetadata,
} from "../metadata.js";
import {
	SessionNotRestorableError,
	WorkspaceMissingError,
	type Agent,
	type Workspace,
	type PluginRegistry,
	type OrchestratorConfig,
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

describe("restore", () => {
	it("restores a killed session with existing workspace", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "killed",
			project: "my-app",
			issue: "TEST-1",
			pr: "https://github.com/org/my-app/pull/10",
			createdAt: "2025-01-01T00:00:00.000Z",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const restored = await sm.restore("app-1");

		expect(restored.id).toBe("app-1");
		expect(restored.status).toBe("spawning");
		expect(restored.activity).toBe("active");
		expect(restored.workspacePath).toBe(wsPath);
		expect(restored.branch).toBe("feat/TEST-1");
		expect(restored.runtimeHandle).toEqual(makeHandle("rt-1"));
		expect(restored.restoredAt).toBeInstanceOf(Date);

		// Verify old runtime was destroyed before creating new one
		expect(env.mockRuntime.destroy).toHaveBeenCalledWith(
			makeHandle("rt-old"),
		);
		expect(env.mockRuntime.create).toHaveBeenCalled();
		// Verify metadata was updated (not rewritten)
		const meta = readMetadataRaw(env.sessionsDir, "app-1");
		expect(meta!.status).toBe("spawning");
		expect(meta!.restoredAt).toBeDefined();
		// Verify original fields are preserved
		expect(meta!.issue).toBe("TEST-1");
		expect(meta!.pr).toBe("https://github.com/org/my-app/pull/10");
		expect(meta!.createdAt).toBe("2025-01-01T00:00:00.000Z");
	});

	it("continues restore even if old runtime destroy fails", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		const failingRuntime = {
			...env.mockRuntime,
			destroy: vi
				.fn()
				.mockRejectedValue(new Error("session not found")),
			create: vi.fn().mockResolvedValue(makeHandle("rt-new")),
		};

		const registryWithFailingDestroy: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return failingRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "killed",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithFailingDestroy,
		});
		const restored = await sm.restore("app-1");

		expect(restored.status).toBe("spawning");
		expect(failingRuntime.destroy).toHaveBeenCalled();
		expect(failingRuntime.create).toHaveBeenCalled();
	});

	it("recreates workspace when missing and plugin supports restore", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		// DO NOT create the directory — it's missing

		const mockWorkspaceWithRestore: Workspace = {
			...env.mockWorkspace,
			exists: vi.fn().mockResolvedValue(false),
			restore: vi.fn().mockResolvedValue({
				path: wsPath,
				branch: "feat/TEST-1",
				sessionId: "app-1",
				projectId: "my-app",
			}),
		};

		const registryWithRestore: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return mockWorkspaceWithRestore;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "terminated",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithRestore,
		});
		const restored = await sm.restore("app-1");

		expect(restored.id).toBe("app-1");
		expect(mockWorkspaceWithRestore.restore).toHaveBeenCalled();
		expect(env.mockRuntime.create).toHaveBeenCalled();
	});

	it("throws SessionNotRestorableError for merged sessions", async () => {
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: "/tmp",
			branch: "main",
			status: "merged",
			project: "my-app",
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.restore("app-1")).rejects.toThrow(
			SessionNotRestorableError,
		);
	});

	it("throws SessionNotRestorableError for working sessions", async () => {
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
		await expect(sm.restore("app-1")).rejects.toThrow(
			SessionNotRestorableError,
		);
	});

	it("throws WorkspaceMissingError when workspace gone and no restore method", async () => {
		const wsPath = join(env.tmpDir, "nonexistent-ws");

		const mockWorkspaceNoRestore: Workspace = {
			...env.mockWorkspace,
			exists: vi.fn().mockResolvedValue(false),
			// No restore method
		};

		const registryNoRestore: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return mockWorkspaceNoRestore;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "killed",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryNoRestore,
		});
		await expect(sm.restore("app-1")).rejects.toThrow(
			WorkspaceMissingError,
		);
	});

	it("restores a session from archive when active metadata is deleted", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "killed",
			project: "my-app",
			issue: "TEST-1",
			pr: "https://github.com/org/my-app/pull/10",
			createdAt: "2025-01-01T00:00:00.000Z",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		// Archive it (deleteMetadata with archive=true is the default)
		deleteMetadata(env.sessionsDir, "app-1");

		// Verify active metadata is gone
		expect(readMetadataRaw(env.sessionsDir, "app-1")).toBeNull();

		// Restore should find it in archive
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const restored = await sm.restore("app-1");

		expect(restored.id).toBe("app-1");
		expect(restored.status).toBe("spawning");
		expect(restored.branch).toBe("feat/TEST-1");
		expect(restored.workspacePath).toBe(wsPath);

		// Verify active metadata was recreated
		const meta = readMetadataRaw(env.sessionsDir, "app-1");
		expect(meta).not.toBeNull();
		expect(meta!.issue).toBe("TEST-1");
		expect(meta!.pr).toBe("https://github.com/org/my-app/pull/10");
	});

	it("restores from archive with multiple archived versions (picks latest)", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		// Manually create two archive entries with different timestamps
		const archiveDir = join(env.sessionsDir, "archive");
		mkdirSync(archiveDir, { recursive: true });

		// Older archive — has stale branch
		writeFileSync(
			join(archiveDir, "app-1_2025-01-01T00-00-00-000Z"),
			"worktree=" +
				wsPath +
				"\nbranch=old-branch\nstatus=killed\nproject=my-app\n",
		);

		// Newer archive — has correct branch
		writeFileSync(
			join(archiveDir, "app-1_2025-06-15T12-00-00-000Z"),
			"worktree=" +
				wsPath +
				"\nbranch=feat/latest\nstatus=killed\nproject=my-app\n" +
				"runtimeHandle=" +
				JSON.stringify(makeHandle("rt-old")) +
				"\n",
		);

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		const restored = await sm.restore("app-1");

		expect(restored.branch).toBe("feat/latest");
	});

	it("throws for nonexistent session (not in active or archive)", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.restore("nonexistent")).rejects.toThrow("not found");
	});

	it("uses getRestoreCommand when available", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		const mockAgentWithRestore: Agent = {
			...env.mockAgent,
			getRestoreCommand: vi
				.fn()
				.mockResolvedValue("claude --resume abc123"),
		};

		const registryWithAgentRestore: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return mockAgentWithRestore;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "errored",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithAgentRestore,
		});
		await sm.restore("app-1");

		expect(mockAgentWithRestore.getRestoreCommand).toHaveBeenCalled();
		// Verify runtime.create was called with the restore command
		const createCall = (
			env.mockRuntime.create as ReturnType<typeof vi.fn>
		).mock.calls[0][0];
		expect(createCall.launchCommand).toBe("claude --resume abc123");
	});

	it("falls back to getLaunchCommand when getRestoreCommand returns null", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		const mockAgentWithNullRestore: Agent = {
			...env.mockAgent,
			getRestoreCommand: vi.fn().mockResolvedValue(null),
		};

		const registryWithNullRestore: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return mockAgentWithNullRestore;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-1",
			status: "killed",
			project: "my-app",
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithNullRestore,
		});
		await sm.restore("app-1");

		expect(mockAgentWithNullRestore.getRestoreCommand).toHaveBeenCalled();
		expect(env.mockAgent.getLaunchCommand).toHaveBeenCalled();
		const createCall = (
			env.mockRuntime.create as ReturnType<typeof vi.fn>
		).mock.calls[0][0];
		expect(createCall.launchCommand).toBe("mock-agent --start");
	});

	it("preserves original createdAt/issue/PR metadata", async () => {
		const wsPath = join(env.tmpDir, "ws-app-1");
		mkdirSync(wsPath, { recursive: true });

		const originalCreatedAt = "2024-06-15T10:00:00.000Z";
		writeMetadata(env.sessionsDir, "app-1", {
			worktree: wsPath,
			branch: "feat/TEST-42",
			status: "killed",
			project: "my-app",
			issue: "TEST-42",
			pr: "https://github.com/org/my-app/pull/99",
			summary: "Implementing feature X",
			createdAt: originalCreatedAt,
			runtimeHandle: JSON.stringify(makeHandle("rt-old")),
		});

		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await sm.restore("app-1");

		const meta = readMetadataRaw(env.sessionsDir, "app-1");
		expect(meta!.createdAt).toBe(originalCreatedAt);
		expect(meta!.issue).toBe("TEST-42");
		expect(meta!.pr).toBe("https://github.com/org/my-app/pull/99");
		expect(meta!.summary).toBe("Implementing feature X");
		expect(meta!.branch).toBe("feat/TEST-42");
	});
});

describe("PluginRegistry.loadBuiltins importFn", () => {
	it("should use provided importFn instead of built-in import", async () => {
		const { createPluginRegistry: createReg } = await import(
			"../plugin-registry.js"
		);
		const registry = createReg();
		const importedPackages: string[] = [];

		const fakeImportFn = async (pkg: string): Promise<unknown> => {
			importedPackages.push(pkg);
			// Return a valid plugin module for runtime-tmux
			if (pkg === "@composio/ao-plugin-runtime-tmux") {
				return {
					manifest: {
						name: "tmux",
						slot: "runtime",
						description: "test",
						version: "0.0.0",
					},
					create: () => ({ name: "tmux" }),
				};
			}
			// Throw for everything else to simulate not-installed
			throw new Error(`Module not found: ${pkg}`);
		};

		await registry.loadBuiltins(undefined, fakeImportFn);

		// importFn should have been called for all builtin plugins
		expect(importedPackages.length).toBeGreaterThan(0);
		expect(importedPackages).toContain(
			"@composio/ao-plugin-runtime-tmux",
		);

		// The tmux plugin should be registered
		const tmux = registry.get("runtime", "tmux");
		expect(tmux).not.toBeNull();
	});

	it("should pass importFn through loadFromConfig to loadBuiltins", async () => {
		const { createPluginRegistry: createReg } = await import(
			"../plugin-registry.js"
		);
		const registry = createReg();
		const importedPackages: string[] = [];

		const fakeImportFn = async (pkg: string): Promise<unknown> => {
			importedPackages.push(pkg);
			throw new Error(`Not found: ${pkg}`);
		};

		await registry.loadFromConfig(env.config, fakeImportFn);

		// Should have attempted to import builtin plugins via the provided importFn
		expect(importedPackages.length).toBeGreaterThan(0);
		expect(importedPackages).toContain(
			"@composio/ao-plugin-runtime-tmux",
		);
	});
});
