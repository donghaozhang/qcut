/**
 * Tests for PR enrichment, agent summary enrichment, issue title enrichment,
 * and the full metadata enrichment pipeline
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
	SCM,
	Agent,
	Tracker,
	ProjectConfig,
	OrchestratorConfig,
	PluginRegistry,
} from "@composio/ao-core";
import {
	sessionToDashboard,
	enrichSessionPR,
	enrichSessionAgentSummary,
	enrichSessionIssueTitle,
	enrichSessionsMetadata,
} from "../serialize";
import { prCache, prCacheKey } from "../cache";
import type { DashboardSession } from "../types";
import {
	createCoreSession,
	createPRInfo,
	createMockSCM,
	createFailingSCM,
} from "./serialize-test-helpers";

describe("enrichSessionPR", () => {
	beforeEach(() => {
		prCache.clear();
	});

	it("should enrich PR with live SCM data", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createMockSCM();

		await enrichSessionPR(dashboard, scm, pr);

		expect(dashboard.pr?.state).toBe("open");
		expect(dashboard.pr?.additions).toBe(100);
		expect(dashboard.pr?.deletions).toBe(50);
		expect(dashboard.pr?.ciStatus).toBe("passing");
		expect(dashboard.pr?.reviewDecision).toBe("approved");
		expect(dashboard.pr?.mergeability.mergeable).toBe(true);
		expect(dashboard.pr?.ciChecks).toHaveLength(1);
		expect(dashboard.pr?.ciChecks[0]?.name).toBe("test");
	});

	it("should cache successful enrichment results", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createMockSCM();

		await enrichSessionPR(dashboard, scm, pr);

		const cacheKey = prCacheKey(pr.owner, pr.repo, pr.number);
		const cached = prCache.get(cacheKey);
		expect(cached).not.toBeNull();
		expect(cached?.additions).toBe(100);
		expect(cached?.deletions).toBe(50);
	});

	it("should use cached data on subsequent calls", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard1 = sessionToDashboard(coreSession);
		const dashboard2 = sessionToDashboard(coreSession);
		const scm = createMockSCM();

		// First call: fetch from SCM
		await enrichSessionPR(dashboard1, scm, pr);
		expect(scm.getPRSummary).toHaveBeenCalledTimes(1);

		// Second call: use cache
		await enrichSessionPR(dashboard2, scm, pr);
		expect(scm.getPRSummary).toHaveBeenCalledTimes(1); // Still 1, not 2
		expect(dashboard2.pr?.additions).toBe(100);
	});

	it("should handle rate limit errors gracefully", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createFailingSCM();

		// Spy on console.warn (enrichSessionPR uses warn for rate-limit, not error)
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		await enrichSessionPR(dashboard, scm, pr);

		// Should keep default values but update blocker message
		expect(dashboard.pr?.additions).toBe(0);
		expect(dashboard.pr?.deletions).toBe(0);
		expect(dashboard.pr?.mergeability.blockers).toContain(
			"API rate limited or unavailable"
		);

		// Should log warning
		expect(consoleWarnSpy).toHaveBeenCalled();

		consoleWarnSpy.mockRestore();
	});

	it("should cache even when most requests fail (to reduce API pressure)", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createFailingSCM();

		await enrichSessionPR(dashboard, scm, pr);

		// Even with all failures, we cache the default/partial data to prevent repeated API hits
		const cacheKey = prCacheKey(pr.owner, pr.repo, pr.number);
		const cached = prCache.get(cacheKey);
		expect(cached).not.toBeNull();
		expect(cached?.mergeability.blockers).toContain(
			"API rate limited or unavailable"
		);
	});

	it("should handle partial failures gracefully", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		// Mock SCM with partial failures
		const scm: SCM = {
			...createMockSCM(),
			getCISummary: vi.fn().mockRejectedValue(new Error("CI API failed")),
			getMergeability: vi.fn().mockRejectedValue(new Error("Merge API failed")),
		};

		await enrichSessionPR(dashboard, scm, pr);

		// Successful fields should be populated
		expect(dashboard.pr?.additions).toBe(100);
		expect(dashboard.pr?.deletions).toBe(50);
		expect(dashboard.pr?.reviewDecision).toBe("approved");

		// Failed fields should have graceful defaults
		expect(dashboard.pr?.mergeability.blockers).toContain(
			"Merge status unavailable"
		);

		// Should still cache partial results
		const cacheKey = prCacheKey(pr.owner, pr.repo, pr.number);
		const cached = prCache.get(cacheKey);
		expect(cached).not.toBeNull();
	});

	it("should do nothing if dashboard.pr is null", async () => {
		const dashboard: DashboardSession = {
			id: "test-1",
			projectId: "test",
			status: "working",
			activity: "active",
			branch: "feat/test",
			issueId: null,
			issueUrl: null,
			issueLabel: null,
			issueTitle: null,
			summary: null,
			summaryIsFallback: false,
			createdAt: new Date().toISOString(),
			lastActivityAt: new Date().toISOString(),
			tokenUsage: null,
			pr: null,
			metadata: {},
			managed: true,
		};
		const pr = createPRInfo();
		const scm = createMockSCM();

		await enrichSessionPR(dashboard, scm, pr);

		expect(scm.getPRSummary).not.toHaveBeenCalled();
	});

	it("should handle missing optional SCM methods", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		// SCM without getPRSummary
		const scm: SCM = {
			...createMockSCM(),
			getPRSummary: undefined,
		};

		await enrichSessionPR(dashboard, scm, pr);

		// Should fall back to getPRState
		expect(scm.getPRState).toHaveBeenCalled();
		expect(dashboard.pr?.state).toBe("open");
	});
});

describe("enrichSessionAgentSummary", () => {
	function createMockAgent(
		info: Partial<Awaited<ReturnType<Agent["getSessionInfo"]>>> | null = null
	): Agent {
		return {
			name: "mock",
			processName: "mock",
			getLaunchCommand: vi.fn().mockReturnValue("mock"),
			getEnvironment: vi.fn().mockReturnValue({}),
			detectActivity: vi.fn().mockReturnValue("active"),
			getActivityState: vi.fn().mockResolvedValue({ activity: "active" }),
			getSessionInfo: vi.fn().mockResolvedValue(
				info
					? {
							summary: info.summary ?? null,
							summaryIsFallback: info.summaryIsFallback,
							agentSessionId: info.agentSessionId ?? null,
							cost: info.cost,
						}
					: null
			),
			sendMessage: vi.fn(),
		};
	}

	it("should set summary and summaryIsFallback false from agent", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		expect(dashboard.summary).toBeNull();

		const agent = createMockAgent({
			summary: "Working on feature X",
			summaryIsFallback: false,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should propagate summaryIsFallback true from agent", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent = createMockAgent({
			summary: "You are working on issue #42...",
			summaryIsFallback: true,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("You are working on issue #42...");
		expect(dashboard.summaryIsFallback).toBe(true);
	});

	it("should default summaryIsFallback to false when agent omits it", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent = createMockAgent({
			summary: "Working on feature X",
			// summaryIsFallback intentionally omitted (backwards compat)
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should set token usage from agent session info", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
		});

		const agent = createMockAgent({
			cost: {
				inputTokens: 2000,
				outputTokens: 750,
				estimatedCostUsd: 0.042,
			},
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 2000,
			outputTokens: 750,
			totalTokens: 2750,
			estimatedCostUsd: 0.042,
		});
	});

	it("should skip enrichment when summary and token usage already exist", async () => {
		const core = createCoreSession({
			agentInfo: {
				summary: "Existing summary",
				summaryIsFallback: false,
				agentSessionId: "abc",
				cost: {
					inputTokens: 1000,
					outputTokens: 500,
					estimatedCostUsd: 0.01,
				},
			},
		});
		const dashboard = sessionToDashboard(core);
		expect(dashboard.summary).toBe("Existing summary");
		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
			estimatedCostUsd: 0.01,
		});

		const agent = createMockAgent({
			summary: "New summary from agent",
			summaryIsFallback: false,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		// Should keep original summary, not overwrite
		expect(dashboard.summary).toBe("Existing summary");
		expect(agent.getSessionInfo).not.toHaveBeenCalled();
	});

	it("should handle agent.getSessionInfo throwing", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent: Agent = {
			...createMockAgent(),
			getSessionInfo: vi.fn().mockRejectedValue(new Error("JSONL corrupted")),
		};

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should not update when agent returns null info", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		const agent = createMockAgent(null);

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should not update when agent returns info with null summary", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		const agent = createMockAgent({ summary: null });

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});
});

describe("enrichSessionIssueTitle", () => {
	function makeProject(overrides?: Partial<ProjectConfig>): ProjectConfig {
		return {
			name: "test",
			repo: "test/repo",
			path: "/test",
			defaultBranch: "main",
			sessionPrefix: "test",
			...overrides,
		};
	}

	function createMockTracker(title = "Add user authentication"): Tracker {
		return {
			name: "mock",
			getIssue: vi.fn().mockResolvedValue({
				id: "42",
				title,
				description: "Description",
				url: "https://github.com/test/repo/issues/42",
				state: "open",
				labels: [],
			}),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi
				.fn()
				.mockReturnValue("https://github.com/test/repo/issues/42"),
			issueLabel: vi.fn().mockReturnValue("#42"),
			branchName: vi.fn().mockReturnValue("feat/issue-42"),
			generatePrompt: vi.fn().mockResolvedValue("prompt"),
		};
	}

	function makeDashboard(
		overrides?: Partial<DashboardSession>
	): DashboardSession {
		return {
			id: "test-1",
			projectId: "test",
			status: "working",
			activity: "active",
			branch: "feat/test",
			issueId: null,
			issueUrl: null,
			issueLabel: null,
			issueTitle: null,
			summary: null,
			summaryIsFallback: false,
			createdAt: new Date().toISOString(),
			lastActivityAt: new Date().toISOString(),
			tokenUsage: null,
			pr: null,
			metadata: {},
			managed: true,
			...overrides,
		};
	}

	it("should enrich issue title from tracker", async () => {
		const dashboard = makeDashboard({
			issueUrl: "https://github.com/test/repo/issues/42",
			issueLabel: "#42",
		});
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(dashboard.issueTitle).toBe("Add user authentication");
		expect(tracker.getIssue).toHaveBeenCalledWith("42", project);
	});

	it("should strip # prefix from GitHub-style labels", async () => {
		const dashboard = makeDashboard({
			issueUrl: "https://github.com/test/repo/issues/99",
			issueLabel: "#99",
		});
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(tracker.getIssue).toHaveBeenCalledWith("99", project);
	});

	it("should pass through non-GitHub labels unchanged", async () => {
		const dashboard = makeDashboard({
			issueUrl: "https://linear.app/team/INT-100",
			issueLabel: "INT-100",
		});
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(tracker.getIssue).toHaveBeenCalledWith("INT-100", project);
	});

	it("should skip when issueUrl is null", async () => {
		const dashboard = makeDashboard({ issueUrl: null, issueLabel: "#42" });
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(tracker.getIssue).not.toHaveBeenCalled();
		expect(dashboard.issueTitle).toBeNull();
	});

	it("should skip when issueLabel is null", async () => {
		const dashboard = makeDashboard({
			issueUrl: "https://github.com/test/repo/issues/42",
			issueLabel: null,
		});
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(tracker.getIssue).not.toHaveBeenCalled();
		expect(dashboard.issueTitle).toBeNull();
	});

	it("should handle tracker errors gracefully", async () => {
		// Unique URL to avoid cache from other tests
		const dashboard = makeDashboard({
			issueUrl: "https://github.com/test/repo/issues/error-test",
			issueLabel: "#error-test",
		});
		const tracker: Tracker = {
			...createMockTracker(),
			getIssue: vi.fn().mockRejectedValue(new Error("API error")),
		};
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard, tracker, project);

		expect(dashboard.issueTitle).toBeNull();
	});

	it("should cache results across calls", async () => {
		// Unique URL to avoid cache from other tests
		const issueUrl = "https://github.com/test/repo/issues/cache-test";
		const dashboard1 = makeDashboard({ issueUrl, issueLabel: "#cache-test" });
		const dashboard2 = makeDashboard({ issueUrl, issueLabel: "#cache-test" });
		const tracker = createMockTracker();
		const project = makeProject();

		await enrichSessionIssueTitle(dashboard1, tracker, project);
		await enrichSessionIssueTitle(dashboard2, tracker, project);

		expect(tracker.getIssue).toHaveBeenCalledTimes(1);
		expect(dashboard2.issueTitle).toBe("Add user authentication");
	});
});

describe("enrichSessionsMetadata", () => {
	// Unique URL base to avoid cross-test cache collisions
	const urlBase = "https://github.com/test/repo/issues/meta";

	function mockTracker(title = "Add user authentication"): Tracker {
		return {
			name: "mock-tracker",
			getIssue: vi.fn().mockResolvedValue({
				id: "42",
				title,
				description: "",
				url: `${urlBase}-default`,
				state: "open",
				labels: [],
			}),
			isCompleted: vi.fn().mockResolvedValue(false),
			issueUrl: vi.fn().mockReturnValue(`${urlBase}-default`),
			issueLabel: vi.fn().mockReturnValue("#42"),
			branchName: vi.fn().mockReturnValue("feat/issue-42"),
			generatePrompt: vi.fn().mockResolvedValue("prompt"),
		};
	}

	function mockAgent(summary = "Working on feature"): Agent {
		return {
			name: "mock-agent",
			processName: "mock",
			getLaunchCommand: vi.fn().mockReturnValue("mock"),
			getEnvironment: vi.fn().mockReturnValue({}),
			detectActivity: vi.fn().mockReturnValue("active"),
			getActivityState: vi.fn().mockResolvedValue({ activity: "active" }),
			getSessionInfo: vi.fn().mockResolvedValue({
				summary,
				summaryIsFallback: false,
				agentSessionId: "abc",
			}),
			sendMessage: vi.fn(),
		};
	}

	function mockRegistry(
		tracker: Tracker | null,
		agent: Agent | null
	): PluginRegistry {
		return {
			get: vi.fn((slot: string) => {
				if (slot === "tracker") return tracker;
				if (slot === "agent") return agent;
				return null;
			}),
			register: vi.fn(),
			list: vi.fn().mockReturnValue([]),
			loadBuiltins: vi.fn(),
			loadFromConfig: vi.fn(),
		} as unknown as PluginRegistry;
	}

	const testProject: ProjectConfig = {
		name: "test",
		repo: "test/repo",
		path: "/test",
		defaultBranch: "main",
		sessionPrefix: "test",
		tracker: { plugin: "mock-tracker" },
		agent: "mock-agent",
	};

	const testConfig = {
		configPath: "/test",
		defaults: {
			runtime: "tmux",
			agent: "mock-agent",
			workspace: "worktree",
			notifiers: [],
		},
		projects: { test: testProject },
		notifiers: {},
		notificationRouting: { urgent: [], action: [], warning: [], info: [] },
		reactions: {},
		readyThresholdMs: 300000,
	} as OrchestratorConfig;

	it("should enrich issue labels, agent summaries, and issue titles", async () => {
		const tracker = mockTracker("Fix auth bug");
		const agent = mockAgent("Implementing auth fix");
		const registry = mockRegistry(tracker, agent);

		const core = createCoreSession({ issueId: `${urlBase}-full` });
		const dashboard = sessionToDashboard(core);
		expect(dashboard.summary).toBeNull();

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		// Issue label enriched (sync)
		expect(dashboard.issueLabel).toBe("#42");
		// Summary enriched (async)
		expect(dashboard.summary).toBe("Implementing auth fix");
		// Issue title enriched (async, depends on issueLabel from sync step)
		expect(dashboard.issueTitle).toBe("Fix auth bug");
	});

	it("should skip sessions without issue URLs", async () => {
		const tracker = mockTracker();
		const agent = mockAgent();
		const registry = mockRegistry(tracker, agent);

		const core = createCoreSession({ issueId: null });
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		expect(tracker.issueLabel).not.toHaveBeenCalled();
		expect(tracker.getIssue).not.toHaveBeenCalled();
		// Summary still enriched (independent of issue)
		expect(dashboard.summary).toBe("Working on feature");
	});

	it("should skip summary enrichment when session already has one", async () => {
		const tracker = mockTracker();
		const agent = mockAgent();
		const registry = mockRegistry(tracker, agent);

		const core = createCoreSession({
			agentInfo: {
				summary: "Existing summary",
				summaryIsFallback: false,
				agentSessionId: "x",
				cost: {
					inputTokens: 100,
					outputTokens: 20,
					estimatedCostUsd: 0.001,
				},
			},
		});
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		expect(agent.getSessionInfo).not.toHaveBeenCalled();
		expect(dashboard.summary).toBe("Existing summary");
	});

	it("should handle missing tracker plugin gracefully", async () => {
		const agent = mockAgent();
		const registry = mockRegistry(null, agent);

		const core = createCoreSession({ issueId: `${urlBase}-no-tracker` });
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		// Issue enrichment skipped (no tracker)
		expect(dashboard.issueLabel).toBeNull();
		expect(dashboard.issueTitle).toBeNull();
		// Agent summary still works
		expect(dashboard.summary).toBe("Working on feature");
	});

	it("should handle missing agent plugin gracefully", async () => {
		const tracker = mockTracker();
		const registry = mockRegistry(tracker, null);

		const core = createCoreSession({ issueId: `${urlBase}-no-agent` });
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		// Issue enrichment still works
		expect(dashboard.issueLabel).toBe("#42");
		// Summary stays null (no agent)
		expect(dashboard.summary).toBeNull();
	});

	it("should handle project with no tracker config", async () => {
		const agent = mockAgent();
		const registry = mockRegistry(null, agent);
		const configNoTracker = {
			...testConfig,
			projects: {
				test: { ...testProject, tracker: undefined } as ProjectConfig,
			},
		} as OrchestratorConfig;

		const core = createCoreSession({ issueId: `${urlBase}-no-tracker-cfg` });
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata(
			[core],
			[dashboard],
			configNoTracker,
			registry
		);

		// No tracker resolution attempted
		expect(registry.get).not.toHaveBeenCalledWith("tracker", expect.anything());
		expect(dashboard.issueLabel).toBeNull();
		// Agent still works
		expect(dashboard.summary).toBe("Working on feature");
	});

	it("should enrich multiple sessions independently", async () => {
		const tracker = mockTracker();
		const agent = mockAgent();
		const registry = mockRegistry(tracker, agent);

		const cores = [
			createCoreSession({ id: "test-1", issueId: `${urlBase}-multi-1` }),
			createCoreSession({ id: "test-2", issueId: null }), // no issue
			createCoreSession({
				id: "test-3",
				issueId: `${urlBase}-multi-3`,
				agentInfo: {
					summary: "Already has one",
					summaryIsFallback: false,
					agentSessionId: "y",
					cost: {
						inputTokens: 50,
						outputTokens: 10,
						estimatedCostUsd: 0.0005,
					},
				},
			}),
		];
		const dashboards = cores.map(sessionToDashboard);

		await enrichSessionsMetadata(cores, dashboards, testConfig, registry);

		// Session 1: full enrichment
		expect(dashboards[0].issueLabel).toBe("#42");
		expect(dashboards[0].summary).toBe("Working on feature");

		// Session 2: no issue, but summary enriched
		expect(dashboards[1].issueLabel).toBeNull();
		expect(dashboards[1].summary).toBe("Working on feature");

		// Session 3: issue enriched, summary kept from agentInfo
		expect(dashboards[2].issueLabel).toBe("#42");
		expect(dashboards[2].summary).toBe("Already has one");
		// Agent not called for session 3 (already had summary)
		expect(agent.getSessionInfo).toHaveBeenCalledTimes(2); // sessions 1 and 2 only
	});

	it("should use default agent when project has no agent override", async () => {
		const tracker = mockTracker();
		const agent = mockAgent("From default agent");
		const registry = mockRegistry(tracker, agent);
		const configNoProjectAgent = {
			...testConfig,
			projects: {
				test: { ...testProject, agent: undefined } as ProjectConfig,
			},
		} as OrchestratorConfig;

		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata(
			[core],
			[dashboard],
			configNoProjectAgent,
			registry
		);

		// Falls back to config.defaults.agent
		expect(registry.get).toHaveBeenCalledWith("agent", "mock-agent");
		expect(dashboard.summary).toBe("From default agent");
	});
});
