import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SCM } from "@composio/ao-core";
import { sessionToDashboard, enrichSessionPR } from "../serialize";
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

		await enrichSessionPR(dashboard1, scm, pr);
		expect(scm.getPRSummary).toHaveBeenCalledTimes(1);

		await enrichSessionPR(dashboard2, scm, pr);
		expect(scm.getPRSummary).toHaveBeenCalledTimes(1);
		expect(dashboard2.pr?.additions).toBe(100);
	});

	it("should handle rate limit errors gracefully", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createFailingSCM();

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		await enrichSessionPR(dashboard, scm, pr);

		expect(dashboard.pr?.additions).toBe(0);
		expect(dashboard.pr?.deletions).toBe(0);
		expect(dashboard.pr?.mergeability.blockers).toContain(
			"API rate limited or unavailable",
		);
		expect(consoleWarnSpy).toHaveBeenCalled();

		consoleWarnSpy.mockRestore();
	});

	it("should cache even when most requests fail (to reduce API pressure)", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);
		const scm = createFailingSCM();

		await enrichSessionPR(dashboard, scm, pr);

		const cacheKey = prCacheKey(pr.owner, pr.repo, pr.number);
		const cached = prCache.get(cacheKey);
		expect(cached).not.toBeNull();
		expect(cached?.mergeability.blockers).toContain(
			"API rate limited or unavailable",
		);
	});

	it("should handle partial failures gracefully", async () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		const scm: SCM = {
			...createMockSCM(),
			getCISummary: vi.fn().mockRejectedValue(new Error("CI API failed")),
			getMergeability: vi.fn().mockRejectedValue(new Error("Merge API failed")),
		};

		await enrichSessionPR(dashboard, scm, pr);

		expect(dashboard.pr?.additions).toBe(100);
		expect(dashboard.pr?.deletions).toBe(50);
		expect(dashboard.pr?.reviewDecision).toBe("approved");
		expect(dashboard.pr?.mergeability.blockers).toContain(
			"Merge status unavailable",
		);

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

		const scm: SCM = {
			...createMockSCM(),
			getPRSummary: undefined,
		};

		await enrichSessionPR(dashboard, scm, pr);

		expect(scm.getPRState).toHaveBeenCalled();
		expect(dashboard.pr?.state).toBe("open");
	});
});
