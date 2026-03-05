import { describe, it, expect, vi } from "vitest";
import type {
	Tracker,
	Agent,
	ProjectConfig,
	OrchestratorConfig,
	PluginRegistry,
} from "@composio/ao-core";
import { sessionToDashboard, enrichSessionsMetadata } from "../serialize";
import { createCoreSession } from "./serialize-test-helpers";

describe("enrichSessionsMetadata", () => {
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
		agent: Agent | null,
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

		expect(dashboard.issueLabel).toBe("#42");
		expect(dashboard.summary).toBe("Implementing auth fix");
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

		expect(dashboard.issueLabel).toBeNull();
		expect(dashboard.issueTitle).toBeNull();
		expect(dashboard.summary).toBe("Working on feature");
	});

	it("should handle missing agent plugin gracefully", async () => {
		const tracker = mockTracker();
		const registry = mockRegistry(tracker, null);

		const core = createCoreSession({ issueId: `${urlBase}-no-agent` });
		const dashboard = sessionToDashboard(core);

		await enrichSessionsMetadata([core], [dashboard], testConfig, registry);

		expect(dashboard.issueLabel).toBe("#42");
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

		await enrichSessionsMetadata([core], [dashboard], configNoTracker, registry);

		expect(registry.get).not.toHaveBeenCalledWith("tracker", expect.anything());
		expect(dashboard.issueLabel).toBeNull();
		expect(dashboard.summary).toBe("Working on feature");
	});

	it("should enrich multiple sessions independently", async () => {
		const tracker = mockTracker();
		const agent = mockAgent();
		const registry = mockRegistry(tracker, agent);

		const cores = [
			createCoreSession({ id: "test-1", issueId: `${urlBase}-multi-1` }),
			createCoreSession({ id: "test-2", issueId: null }),
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

		expect(dashboards[0].issueLabel).toBe("#42");
		expect(dashboards[0].summary).toBe("Working on feature");

		expect(dashboards[1].issueLabel).toBeNull();
		expect(dashboards[1].summary).toBe("Working on feature");

		expect(dashboards[2].issueLabel).toBe("#42");
		expect(dashboards[2].summary).toBe("Already has one");
		expect(agent.getSessionInfo).toHaveBeenCalledTimes(2);
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
			registry,
		);

		expect(registry.get).toHaveBeenCalledWith("agent", "mock-agent");
		expect(dashboard.summary).toBe("From default agent");
	});
});
