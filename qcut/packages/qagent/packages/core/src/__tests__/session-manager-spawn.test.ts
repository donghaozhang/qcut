import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSessionManager } from "../session-manager.js";
import { writeMetadata, readMetadata, readMetadataRaw } from "../metadata.js";
import type {
	Tracker,
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

describe("spawn", () => {
	it("creates a session with workspace, runtime, and agent", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		const session = await sm.spawn({ projectId: "my-app" });

		expect(session.id).toBe("app-1");
		expect(session.status).toBe("spawning");
		expect(session.projectId).toBe("my-app");
		expect(session.runtimeHandle).toEqual(makeHandle("rt-1"));

		// Verify workspace was created
		expect(env.mockWorkspace.create).toHaveBeenCalled();
		// Verify agent launch command was requested
		expect(env.mockAgent.getLaunchCommand).toHaveBeenCalled();
		// Verify runtime was created
		expect(env.mockRuntime.create).toHaveBeenCalled();
	});

	it("uses issue ID to derive branch name", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		const session = await sm.spawn({
			projectId: "my-app",
			issueId: "INT-100",
		});

		expect(session.branch).toBe("feat/INT-100");
		expect(session.issueId).toBe("INT-100");
	});

	it("uses tracker.branchName when tracker is available", async () => {
		const mockTracker: Tracker = {
			name: "mock-tracker",
			getIssue: vi.fn().mockResolvedValue({}),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi.fn().mockReturnValue(""),
			branchName: vi.fn().mockReturnValue("custom/INT-100-my-feature"),
			generatePrompt: vi.fn().mockResolvedValue(""),
		};

		const registryWithTracker: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				if (slot === "tracker") return mockTracker;
				return null;
			}),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithTracker,
		});

		const session = await sm.spawn({
			projectId: "my-app",
			issueId: "INT-100",
		});
		expect(session.branch).toBe("custom/INT-100-my-feature");
	});

	it("increments session numbers correctly", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		// Pre-create some metadata to simulate existing sessions
		writeMetadata(env.sessionsDir, "app-3", {
			worktree: "/tmp",
			branch: "b",
			status: "working",
		});
		writeMetadata(env.sessionsDir, "app-7", {
			worktree: "/tmp",
			branch: "b",
			status: "working",
		});

		const session = await sm.spawn({ projectId: "my-app" });
		expect(session.id).toBe("app-8");
	});

	it("writes metadata file", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await sm.spawn({ projectId: "my-app", issueId: "INT-42" });

		const meta = readMetadata(env.sessionsDir, "app-1");
		expect(meta).not.toBeNull();
		expect(meta!.status).toBe("spawning");
		expect(meta!.project).toBe("my-app");
		expect(meta!.issue).toBe("INT-42");
	});

	it("throws for unknown project", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});
		await expect(sm.spawn({ projectId: "nonexistent" })).rejects.toThrow(
			"Unknown project",
		);
	});

	it("throws when runtime plugin is missing", async () => {
		const emptyRegistry: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockReturnValue(null),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: emptyRegistry,
		});
		await expect(sm.spawn({ projectId: "my-app" })).rejects.toThrow(
			"not found",
		);
	});

	describe("agent override", () => {
		let mockCodexAgent: Agent;
		let registryWithMultipleAgents: PluginRegistry;

		beforeEach(() => {
			mockCodexAgent = {
				name: "codex",
				processName: "codex",
				getLaunchCommand: vi.fn().mockReturnValue("codex --start"),
				getEnvironment: vi.fn().mockReturnValue({ CODEX_VAR: "1" }),
				detectActivity: vi.fn().mockReturnValue("active"),
				getActivityState: vi.fn().mockResolvedValue(null),
				isProcessRunning: vi.fn().mockResolvedValue(true),
				getSessionInfo: vi.fn().mockResolvedValue(null),
			};

			registryWithMultipleAgents = {
				...env.mockRegistry,
				get: vi
					.fn()
					.mockImplementation((slot: string, name: string) => {
						if (slot === "runtime") return env.mockRuntime;
						if (slot === "agent") {
							if (name === "mock-agent") return env.mockAgent;
							if (name === "codex") return mockCodexAgent;
							return null;
						}
						if (slot === "workspace") return env.mockWorkspace;
						return null;
					}),
			};
		});

		it("uses overridden agent when spawnConfig.agent is provided", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await sm.spawn({ projectId: "my-app", agent: "codex" });

			expect(mockCodexAgent.getLaunchCommand).toHaveBeenCalled();
			expect(env.mockAgent.getLaunchCommand).not.toHaveBeenCalled();
		});

		it("throws when agent override plugin is not found", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await expect(
				sm.spawn({ projectId: "my-app", agent: "nonexistent" }),
			).rejects.toThrow("Agent plugin 'nonexistent' not found");
		});

		it("uses default agent when no override specified", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await sm.spawn({ projectId: "my-app" });

			expect(env.mockAgent.getLaunchCommand).toHaveBeenCalled();
			expect(mockCodexAgent.getLaunchCommand).not.toHaveBeenCalled();
		});

		it("persists agent name in metadata when override is used", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await sm.spawn({ projectId: "my-app", agent: "codex" });

			const meta = readMetadataRaw(env.sessionsDir, "app-1");
			expect(meta).not.toBeNull();
			expect(meta!.agent).toBe("codex");
		});

		it("persists default agent name in metadata when no override", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await sm.spawn({ projectId: "my-app" });

			const meta = readMetadataRaw(env.sessionsDir, "app-1");
			expect(meta).not.toBeNull();
			expect(meta!.agent).toBe("mock-agent");
		});

		it("readMetadata returns agent field (typed SessionMetadata)", async () => {
			const sm = createSessionManager({
				config: env.config,
				registry: registryWithMultipleAgents,
			});

			await sm.spawn({ projectId: "my-app", agent: "codex" });

			const meta = readMetadata(env.sessionsDir, "app-1");
			expect(meta).not.toBeNull();
			expect(meta!.agent).toBe("codex");
		});
	});

	it("validates issue exists when issueId provided", async () => {
		const mockTracker: Tracker = {
			name: "mock-tracker",
			getIssue: vi.fn().mockResolvedValue({
				id: "INT-100",
				title: "Test issue",
				description: "Test description",
				url: "https://linear.app/test/issue/INT-100",
				state: "open",
				labels: [],
			}),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi
				.fn()
				.mockReturnValue("https://linear.app/test/issue/INT-100"),
			branchName: vi.fn().mockReturnValue("feat/INT-100"),
			generatePrompt: vi.fn().mockResolvedValue("Work on INT-100"),
		};

		const registryWithTracker: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				if (slot === "tracker") return mockTracker;
				return null;
			}),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithTracker,
		});

		const session = await sm.spawn({
			projectId: "my-app",
			issueId: "INT-100",
		});

		expect(mockTracker.getIssue).toHaveBeenCalledWith(
			"INT-100",
			env.config.projects["my-app"],
		);
		expect(session.issueId).toBe("INT-100");
	});

	it("succeeds with ad-hoc issue string when tracker returns IssueNotFoundError", async () => {
		const mockTracker: Tracker = {
			name: "mock-tracker",
			getIssue: vi
				.fn()
				.mockRejectedValue(new Error("Issue INT-9999 not found")),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi.fn().mockReturnValue(""),
			branchName: vi.fn().mockReturnValue("feat/INT-9999"),
			generatePrompt: vi.fn().mockResolvedValue(""),
		};

		const registryWithTracker: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				if (slot === "tracker") return mockTracker;
				return null;
			}),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithTracker,
		});

		// Ad-hoc issue string should succeed — IssueNotFoundError is gracefully ignored
		const session = await sm.spawn({
			projectId: "my-app",
			issueId: "INT-9999",
		});

		expect(session.issueId).toBe("INT-9999");
		expect(session.branch).toBe("feat/INT-9999");
		// Workspace and runtime should still be created
		expect(env.mockWorkspace.create).toHaveBeenCalled();
		expect(env.mockRuntime.create).toHaveBeenCalled();
	});

	it("fails on tracker auth errors", async () => {
		const mockTracker: Tracker = {
			name: "mock-tracker",
			getIssue: vi.fn().mockRejectedValue(new Error("Unauthorized")),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi.fn().mockReturnValue(""),
			branchName: vi.fn().mockReturnValue("feat/INT-100"),
			generatePrompt: vi.fn().mockResolvedValue(""),
		};

		const registryWithTracker: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return env.mockAgent;
				if (slot === "workspace") return env.mockWorkspace;
				if (slot === "tracker") return mockTracker;
				return null;
			}),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithTracker,
		});

		await expect(
			sm.spawn({ projectId: "my-app", issueId: "INT-100" }),
		).rejects.toThrow("Failed to fetch issue");

		// Should not create workspace or runtime when auth fails
		expect(env.mockWorkspace.create).not.toHaveBeenCalled();
		expect(env.mockRuntime.create).not.toHaveBeenCalled();
	});

	it("spawns without issue tracking when no issueId provided", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		const session = await sm.spawn({ projectId: "my-app" });

		expect(session.issueId).toBeNull();
		// Uses session/{sessionId} to avoid conflicts with default branch
		expect(session.branch).toMatch(/^session\/app-\d+$/);
		expect(session.branch).not.toBe("main");
	});
});

describe("spawnOrchestrator", () => {
	it("creates orchestrator session with correct ID", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		const session = await sm.spawnOrchestrator({ projectId: "my-app" });

		expect(session.id).toBe("app-orchestrator");
		expect(session.status).toBe("working");
		expect(session.projectId).toBe("my-app");
		expect(session.branch).toBe("main");
		expect(session.issueId).toBeNull();
		expect(session.workspacePath).toBe(join(env.tmpDir, "my-app"));
	});

	it("writes metadata with proper fields", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		await sm.spawnOrchestrator({ projectId: "my-app" });

		const meta = readMetadata(env.sessionsDir, "app-orchestrator");
		expect(meta).not.toBeNull();
		expect(meta!.status).toBe("working");
		expect(meta!.project).toBe("my-app");
		expect(meta!.worktree).toBe(join(env.tmpDir, "my-app"));
		expect(meta!.branch).toBe("main");
		expect(meta!.tmuxName).toBeDefined();
		expect(meta!.runtimeHandle).toBeDefined();
	});

	it("skips workspace creation", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		await sm.spawnOrchestrator({ projectId: "my-app" });
		expect(env.mockWorkspace.create).not.toHaveBeenCalled();
	});

	it("calls agent.setupWorkspaceHooks on project path", async () => {
		const agentWithHooks: Agent = {
			...env.mockAgent,
			setupWorkspaceHooks: vi.fn().mockResolvedValue(undefined),
		};
		const registryWithHooks: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockImplementation((slot: string) => {
				if (slot === "runtime") return env.mockRuntime;
				if (slot === "agent") return agentWithHooks;
				if (slot === "workspace") return env.mockWorkspace;
				return null;
			}),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: registryWithHooks,
		});
		await sm.spawnOrchestrator({ projectId: "my-app" });

		expect(agentWithHooks.setupWorkspaceHooks).toHaveBeenCalledWith(
			join(env.tmpDir, "my-app"),
			expect.objectContaining({ dataDir: env.sessionsDir }),
		);
	});

	it("calls runtime.create with proper config", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		await sm.spawnOrchestrator({ projectId: "my-app" });

		expect(env.mockRuntime.create).toHaveBeenCalledWith(
			expect.objectContaining({
				workspacePath: join(env.tmpDir, "my-app"),
				launchCommand: "mock-agent --start",
			}),
		);
	});

	it("writes system prompt to file and passes systemPromptFile to agent", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		await sm.spawnOrchestrator({
			projectId: "my-app",
			systemPrompt: "You are the orchestrator.",
		});

		// Should pass systemPromptFile (not inline systemPrompt) to avoid tmux truncation
		expect(env.mockAgent.getLaunchCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "app-orchestrator",
				systemPromptFile: expect.stringContaining(
					"orchestrator-prompt.md",
				),
			}),
		);

		// Verify the file was actually written
		const callArgs = vi.mocked(env.mockAgent.getLaunchCommand).mock
			.calls[0][0];
		const promptFile = callArgs.systemPromptFile!;
		expect(existsSync(promptFile)).toBe(true);
		const { readFileSync } = await import("node:fs");
		expect(readFileSync(promptFile, "utf-8")).toBe(
			"You are the orchestrator.",
		);
	});

	it("throws for unknown project", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		await expect(
			sm.spawnOrchestrator({ projectId: "nonexistent" }),
		).rejects.toThrow("Unknown project");
	});

	it("throws when runtime plugin is missing", async () => {
		const emptyRegistry: PluginRegistry = {
			...env.mockRegistry,
			get: vi.fn().mockReturnValue(null),
		};

		const sm = createSessionManager({
			config: env.config,
			registry: emptyRegistry,
		});

		await expect(
			sm.spawnOrchestrator({ projectId: "my-app" }),
		).rejects.toThrow("not found");
	});

	it("returns session with runtimeHandle", async () => {
		const sm = createSessionManager({
			config: env.config,
			registry: env.mockRegistry,
		});

		const session = await sm.spawnOrchestrator({ projectId: "my-app" });

		expect(session.runtimeHandle).toEqual(makeHandle("rt-1"));
	});
});
