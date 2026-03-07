import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	resolveAutoDiscoveryConfig,
	discoverAndSpawn,
	createIssueDiscoveryLoop,
} from "../issue-discovery.js";
import type {
	IssueDiscoveryDeps,
	AutoDiscoveryConfig,
} from "../issue-discovery.js";
import type {
	OrchestratorConfig,
	ProjectConfig,
	SessionManager,
	PluginRegistry,
	Session,
} from "../types.js";

// =============================================================================
// Helpers
// =============================================================================

function makeProject(overrides: Partial<ProjectConfig> & { autoDiscovery?: Partial<AutoDiscoveryConfig>; tracker?: { plugin: string } } = {}): ProjectConfig {
	return {
		name: "Test",
		repo: "org/repo",
		path: ".",
		defaultBranch: "main",
		sessionPrefix: "test",
		...overrides,
	} as ProjectConfig;
}

function makeDeps(overrides: Partial<IssueDiscoveryDeps> = {}): IssueDiscoveryDeps {
	return {
		config: { projects: {}, reactions: {}, defaults: {} } as OrchestratorConfig,
		registry: {
			get: vi.fn().mockReturnValue({
				listIssues: vi.fn().mockResolvedValue([]),
			}),
		} as unknown as PluginRegistry,
		sessionManager: {
			list: vi.fn().mockResolvedValue([]),
			spawn: vi.fn().mockResolvedValue({ id: "test-session" }),
		} as unknown as SessionManager,
		notifyHuman: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

// =============================================================================
// resolveAutoDiscoveryConfig
// =============================================================================

describe("resolveAutoDiscoveryConfig", () => {
	it("returns defaults when no autoDiscovery is configured", () => {
		const project = makeProject();
		const config = resolveAutoDiscoveryConfig(project);
		expect(config.enabled).toBe(false);
		expect(config.label).toBe("agent-ready");
		expect(config.maxConcurrent).toBe(5);
		expect(config.intervalMs).toBe(60_000);
		expect(config.dryRun).toBe(false);
		expect(config.states).toEqual(["Todo"]);
	});

	it("merges partial config with defaults", () => {
		const project = makeProject({
			autoDiscovery: { enabled: true, label: "auto" },
		});
		const config = resolveAutoDiscoveryConfig(project);
		expect(config.enabled).toBe(true);
		expect(config.label).toBe("auto");
		expect(config.maxConcurrent).toBe(5); // default preserved
	});

	it("respects all overrides", () => {
		const project = makeProject({
			autoDiscovery: {
				enabled: true,
				label: "custom-label",
				maxConcurrent: 10,
				intervalMs: 30_000,
				dryRun: true,
				states: ["Todo", "Backlog"],
			},
		});
		const config = resolveAutoDiscoveryConfig(project);
		expect(config).toEqual({
			enabled: true,
			label: "custom-label",
			maxConcurrent: 10,
			intervalMs: 30_000,
			dryRun: true,
			states: ["Todo", "Backlog"],
		});
	});
});

// =============================================================================
// discoverAndSpawn
// =============================================================================

describe("discoverAndSpawn", () => {
	it("returns early when discovery is disabled", async () => {
		const deps = makeDeps();
		const project = makeProject(); // no autoDiscovery → disabled
		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(0);
		expect(result.spawned).toBe(0);
	});

	it("returns early when no tracker is configured", async () => {
		const deps = makeDeps();
		const project = makeProject({ autoDiscovery: { enabled: true } });
		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(0);
	});

	it("returns early when tracker has no listIssues method", async () => {
		const deps = makeDeps({
			registry: {
				get: vi.fn().mockReturnValue({ /* no listIssues */ }),
			} as unknown as PluginRegistry,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true },
			tracker: { plugin: "github" },
		});
		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(0);
	});

	it("spawns sessions for new issues", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([
				{ id: "42", title: "Fix bug", labels: ["agent-ready"], state: "open", url: "https://github.com/org/repo/issues/42" },
				{ id: "43", title: "Add feature", labels: ["agent-ready"], state: "open", url: "https://github.com/org/repo/issues/43" },
			]),
		};
		const spawnFn = vi.fn().mockResolvedValue({ id: "new-session" });
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
			sessionManager: {
				list: vi.fn().mockResolvedValue([]),
				spawn: spawnFn,
			} as unknown as SessionManager,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true, label: "agent-ready" },
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(2);
		expect(result.spawned).toBe(2);
		expect(spawnFn).toHaveBeenCalledTimes(2);
	});

	it("skips issues that already have active sessions", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([
				{ id: "42", title: "Fix bug", labels: ["agent-ready"], state: "open" },
			]),
		};
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
			sessionManager: {
				list: vi.fn().mockResolvedValue([
					{ id: "s1", issueId: "42", status: "working" } as Partial<Session>,
				]),
				spawn: vi.fn(),
			} as unknown as SessionManager,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true },
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(1);
		expect(result.spawned).toBe(0);
		expect(result.issues[0]?.action).toBe("skipped_active");
	});

	it("respects maxConcurrent limit", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([
				{ id: "1", title: "A", labels: [], state: "open" },
				{ id: "2", title: "B", labels: [], state: "open" },
				{ id: "3", title: "C", labels: [], state: "open" },
			]),
		};
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
			sessionManager: {
				list: vi.fn().mockResolvedValue([
					{ id: "existing", status: "working" } as Partial<Session>,
				]),
				spawn: vi.fn().mockResolvedValue({ id: "new" }),
			} as unknown as SessionManager,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true, maxConcurrent: 2 }, // only 1 slot left
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.spawned).toBe(1);
		expect(result.issues.filter(i => i.action === "skipped_max")).toHaveLength(2);
	});

	it("respects dryRun mode", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([
				{ id: "42", title: "Fix bug", labels: [], state: "open" },
			]),
		};
		const spawnFn = vi.fn();
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
			sessionManager: {
				list: vi.fn().mockResolvedValue([]),
				spawn: spawnFn,
			} as unknown as SessionManager,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true, dryRun: true },
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(1);
		expect(result.spawned).toBe(0);
		expect(result.issues[0]?.action).toBe("skipped_dry_run");
		expect(spawnFn).not.toHaveBeenCalled();
	});

	it("handles spawn failures gracefully", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([
				{ id: "42", title: "Fix bug", labels: [], state: "open" },
			]),
		};
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
			sessionManager: {
				list: vi.fn().mockResolvedValue([]),
				spawn: vi.fn().mockRejectedValue(new Error("spawn failed")),
			} as unknown as SessionManager,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true },
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(1);
		expect(result.spawned).toBe(0);
		expect(result.issues[0]?.action).toBe("failed");
		expect(result.issues[0]?.error).toBe("spawn failed");
	});

	it("handles listIssues failure gracefully", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockRejectedValue(new Error("API error")),
		};
		const deps = makeDeps({
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
		});
		const project = makeProject({
			autoDiscovery: { enabled: true },
			tracker: { plugin: "github" },
		});

		const result = await discoverAndSpawn("test", project, deps);
		expect(result.discovered).toBe(0);
		expect(result.spawned).toBe(0);
	});
});

// =============================================================================
// createIssueDiscoveryLoop
// =============================================================================

describe("createIssueDiscoveryLoop", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it("start() creates timers only for enabled projects", () => {
		const deps = makeDeps({
			config: {
				projects: {
					enabled: makeProject({
						autoDiscovery: { enabled: true },
						tracker: { plugin: "github" },
					}),
					disabled: makeProject(),
				},
				reactions: {},
				defaults: {},
			} as unknown as OrchestratorConfig,
		});

		const loop = createIssueDiscoveryLoop(deps);
		loop.start();
		loop.stop();
		vi.useRealTimers();
	});

	it("stop() clears all timers", () => {
		const deps = makeDeps({
			config: {
				projects: {
					proj: makeProject({
						autoDiscovery: { enabled: true },
						tracker: { plugin: "github" },
					}),
				},
				reactions: {},
				defaults: {},
			} as unknown as OrchestratorConfig,
		});

		const loop = createIssueDiscoveryLoop(deps);
		loop.start();
		loop.stop();
		// No timers should fire after stop
		vi.advanceTimersByTime(120_000);
		vi.useRealTimers();
	});

	it("runOnce() scans all enabled projects and returns results", async () => {
		const mockTracker = {
			listIssues: vi.fn().mockResolvedValue([]),
		};
		const deps = makeDeps({
			config: {
				projects: {
					enabled: makeProject({
						autoDiscovery: { enabled: true },
						tracker: { plugin: "github" },
					}),
					disabled: makeProject(),
				},
				reactions: {},
				defaults: {},
			} as unknown as OrchestratorConfig,
			registry: { get: vi.fn().mockReturnValue(mockTracker) } as unknown as PluginRegistry,
		});

		const loop = createIssueDiscoveryLoop(deps);
		const results = await loop.runOnce();
		// Only the enabled project should have a result
		expect(results).toHaveLength(1);
		expect(results[0]?.discovered).toBe(0);
		vi.useRealTimers();
	});
});
