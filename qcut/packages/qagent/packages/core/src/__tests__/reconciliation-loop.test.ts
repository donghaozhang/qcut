import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReconciliationLoop, type ReconciliationDeps } from "../reconciliation-loop.js";
import type { Session, OrchestratorConfig, PluginRegistry, SCM, Tracker } from "../types.js";
import type { SessionManager } from "../types/service-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "app-1",
		projectId: "my-app",
		status: "pr_open",
		activity: "active",
		branch: "feat/test",
		issueId: "42",
		pr: {
			number: 42,
			url: "https://github.com/org/repo/pull/42",
			title: "Fix things",
			owner: "org",
			repo: "repo",
			branch: "feat/test",
			baseBranch: "main",
			isDraft: false,
		},
		workspacePath: "/tmp/ws",
		runtimeHandle: { id: "rt-1", runtimeName: "mock", data: {} },
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
		...overrides,
	};
}

function makeConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
	return {
		configPath: "/tmp/test/config.yaml",
		readyThresholdMs: 300_000,
		defaults: {
			runtime: "mock",
			agent: "mock-agent",
			workspace: "mock-ws",
			notifiers: ["desktop"],
		},
		projects: {
			"my-app": {
				name: "My App",
				repo: "org/my-app",
				path: "/tmp/my-app",
				defaultBranch: "main",
				sessionPrefix: "app",
				scm: { plugin: "github" },
				tracker: { plugin: "github" },
			},
		},
		notifiers: {},
		notificationRouting: {
			urgent: [],
			action: [],
			warning: [],
			info: [],
		},
		reactions: {},
		...overrides,
	};
}

function makeMockSCM(overrides: Partial<SCM> = {}): SCM {
	return {
		name: "mock-scm",
		detectPR: vi.fn().mockResolvedValue(null),
		getPRState: vi.fn().mockResolvedValue("open"),
		mergePR: vi.fn().mockResolvedValue(undefined),
		closePR: vi.fn().mockResolvedValue(undefined),
		getCIChecks: vi.fn().mockResolvedValue([]),
		getCISummary: vi.fn().mockResolvedValue("none"),
		getReviews: vi.fn().mockResolvedValue([]),
		getReviewDecision: vi.fn().mockResolvedValue("none"),
		getPendingComments: vi.fn().mockResolvedValue([]),
		getAutomatedComments: vi.fn().mockResolvedValue([]),
		getMergeability: vi.fn().mockResolvedValue({
			mergeable: false,
			ciPassing: false,
			approved: false,
			noConflicts: true,
			blockers: [],
		}),
		...overrides,
	};
}

function makeMockTracker(overrides: Partial<Tracker> = {}): Tracker {
	return {
		name: "mock-tracker",
		getIssue: vi.fn().mockResolvedValue({ id: "42", title: "Test", description: "", url: "", state: "open", labels: [] }),
		isCompleted: vi.fn().mockResolvedValue(false),
		issueUrl: vi.fn().mockReturnValue(""),
		branchName: vi.fn().mockReturnValue("feat/42"),
		generatePrompt: vi.fn().mockResolvedValue(""),
		getWorkpad: vi.fn().mockResolvedValue(null),
		upsertWorkpad: vi.fn().mockResolvedValue({ id: "wp-1", snapshot: {} }),
		...overrides,
	};
}

function makeDeps(overrides: {
	config?: OrchestratorConfig;
	scm?: SCM | null;
	tracker?: Tracker | null;
	applyStatus?: ReconciliationDeps["applyStatus"];
	notifyHuman?: ReconciliationDeps["notifyHuman"];
} = {}): ReconciliationDeps {
	const config = overrides.config ?? makeConfig();
	const scm = overrides.scm ?? makeMockSCM();
	const tracker = overrides.tracker ?? makeMockTracker();

	const mockSessionManager: SessionManager = {
		spawn: vi.fn(),
		spawnOrchestrator: vi.fn(),
		restore: vi.fn(),
		list: vi.fn().mockResolvedValue([]),
		get: vi.fn().mockResolvedValue(null),
		kill: vi.fn(),
		cleanup: vi.fn(),
		send: vi.fn(),
	};

	const mockRegistry: PluginRegistry = {
		register: vi.fn(),
		get: vi.fn().mockImplementation((slot: string, name: string) => {
			if (slot === "scm") return scm;
			if (slot === "tracker") return tracker;
			return null;
		}),
		list: vi.fn().mockReturnValue([]),
		loadBuiltins: vi.fn(),
		loadFromConfig: vi.fn(),
	};

	return {
		config,
		registry: mockRegistry,
		sessionManager: mockSessionManager,
		applyStatus: overrides.applyStatus ?? vi.fn().mockResolvedValue(undefined),
		notifyHuman: overrides.notifyHuman ?? vi.fn().mockResolvedValue(undefined),
	};
}

// ---------------------------------------------------------------------------
// ReconciliationLoop.run
// ---------------------------------------------------------------------------

describe("ReconciliationLoop.run", () => {
	let loop: ReconciliationLoop;

	beforeEach(() => {
		loop = new ReconciliationLoop();
	});

	it("returns empty results when no sessions have drift", async () => {
		const session = makeSession({ status: "pr_open" });
		const deps = makeDeps({
			scm: makeMockSCM({ getPRState: vi.fn().mockResolvedValue("open") }),
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(false) }),
		});

		const results = await loop.run([session], deps);
		expect(results).toHaveLength(0);
	});

	it("detects PR merged externally and auto-corrects", async () => {
		const session = makeSession({ status: "pr_open" });
		const applyStatus = vi.fn().mockResolvedValue(undefined);
		const notifyHuman = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			scm: makeMockSCM({ getPRState: vi.fn().mockResolvedValue("merged") }),
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(false) }),
			applyStatus,
			notifyHuman,
		});

		const results = await loop.run([session], deps);
		expect(results).toHaveLength(1);
		expect(results[0]?.sessionId).toBe("app-1");
		expect(results[0]?.drifts).toHaveLength(1);

		const drift = results[0]?.drifts[0];
		expect(drift?.kind).toBe("pr_merged_externally");
		expect(drift?.corrected).toBe(true);
		expect(drift?.newStatus).toBe("merged");

		// Should have called applyStatus to auto-correct
		expect(applyStatus).toHaveBeenCalledWith(session, "merged");
		// Should have notified human
		expect(notifyHuman).toHaveBeenCalled();
	});

	it("detects PR closed externally and escalates (no auto-correct)", async () => {
		const session = makeSession({ status: "pr_open" });
		const applyStatus = vi.fn().mockResolvedValue(undefined);
		const notifyHuman = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			scm: makeMockSCM({ getPRState: vi.fn().mockResolvedValue("closed") }),
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(false) }),
			applyStatus,
			notifyHuman,
		});

		const results = await loop.run([session], deps);
		const drift = results[0]?.drifts.find((d) => d.kind === "pr_closed_externally");
		expect(drift).toBeDefined();
		expect(drift?.corrected).toBe(false);
		// Should NOT auto-apply status
		expect(applyStatus).not.toHaveBeenCalled();
		// Should have escalated to human
		expect(notifyHuman).toHaveBeenCalled();
	});

	it("detects issue closed externally and auto-corrects to done", async () => {
		const session = makeSession({ status: "working", pr: null });
		const applyStatus = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			scm: makeMockSCM(),
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(true) }),
			applyStatus,
		});

		const results = await loop.run([session], deps);
		const drift = results[0]?.drifts.find((d) => d.kind === "issue_closed_externally");
		expect(drift).toBeDefined();
		expect(drift?.corrected).toBe(true);
		expect(drift?.newStatus).toBe("done");
		expect(applyStatus).toHaveBeenCalledWith(session, "done");
	});

	it("skips terminal sessions", async () => {
		const terminalStatuses = ["merged", "killed", "errored", "done"] as const;
		for (const status of terminalStatuses) {
			const session = makeSession({ status });
			const applyStatus = vi.fn().mockResolvedValue(undefined);
			const deps = makeDeps({
				scm: makeMockSCM({ getPRState: vi.fn().mockResolvedValue("merged") }),
				applyStatus,
			});

			const results = await loop.run([session], deps);
			expect(results, `status=${status}`).toHaveLength(0);
			expect(applyStatus, `status=${status}`).not.toHaveBeenCalled();
		}
	});

	it("isolates errors per check — one check failure does not abort others", async () => {
		const session = makeSession({ status: "working", pr: null });
		const applyStatus = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			// SCM throws — PR checks will fail
			scm: makeMockSCM({ getPRState: vi.fn().mockRejectedValue(new Error("API error")) }),
			// Tracker shows issue closed — issue check should still run
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(true) }),
			applyStatus,
		});

		const results = await loop.run([session], deps);
		// Issue drift should still be detected even though SCM failed
		const issueDrift = results[0]?.drifts.find((d) => d.kind === "issue_closed_externally");
		expect(issueDrift).toBeDefined();
		expect(applyStatus).toHaveBeenCalledWith(session, "done");
	});

	it("handles multiple sessions independently", async () => {
		const session1 = makeSession({ id: "app-1", status: "pr_open" });
		const session2 = makeSession({ id: "app-2", status: "working", pr: null });
		const applyStatus = vi.fn().mockResolvedValue(undefined);

		const deps = makeDeps({
			scm: makeMockSCM({ getPRState: vi.fn().mockResolvedValue("merged") }),
			tracker: makeMockTracker({ isCompleted: vi.fn().mockResolvedValue(false) }),
			applyStatus,
		});

		const results = await loop.run([session1, session2], deps);
		// session1 should have PR merged drift
		const r1 = results.find((r) => r.sessionId === "app-1");
		expect(r1?.drifts.some((d) => d.kind === "pr_merged_externally")).toBe(true);
		// session2 has no PR, no issue closed — no drift
		const r2 = results.find((r) => r.sessionId === "app-2");
		expect(r2).toBeUndefined();
	});
});
