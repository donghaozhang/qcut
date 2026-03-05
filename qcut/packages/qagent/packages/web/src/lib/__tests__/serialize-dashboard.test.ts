/**
 * Tests for sessionToDashboard, resolveProject, and basicPRToDashboard defaults
 */

import { describe, it, expect } from "vitest";
import type { ProjectConfig } from "@composio/ao-core";
import { sessionToDashboard, resolveProject } from "../serialize";
import {
	createCoreSession,
	createPRInfo,
} from "./serialize-test-helpers";

describe("sessionToDashboard", () => {
	it("should convert a core Session to DashboardSession", () => {
		const coreSession = createCoreSession();
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.id).toBe("test-1");
		expect(dashboard.projectId).toBe("test");
		expect(dashboard.status).toBe("working");
		expect(dashboard.activity).toBe("active");
		expect(dashboard.branch).toBe("feat/test");
		expect(dashboard.createdAt).toBe("2025-01-01T00:00:00.000Z");
		expect(dashboard.lastActivityAt).toBe("2025-01-01T01:00:00.000Z");
		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
		});
	});

	it("should use agentInfo summary with summaryIsFallback false", () => {
		const coreSession = createCoreSession({
			agentInfo: {
				summary: "Working on feature X",
				summaryIsFallback: false,
				agentSessionId: "abc123",
			},
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should propagate summaryIsFallback true from agentInfo", () => {
		const coreSession = createCoreSession({
			agentInfo: {
				summary: "You are working on issue #42...",
				summaryIsFallback: true,
				agentSessionId: "abc123",
			},
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.summary).toBe("You are working on issue #42...");
		expect(dashboard.summaryIsFallback).toBe(true);
	});

	it("should default summaryIsFallback to false when agentInfo omits it", () => {
		const coreSession = createCoreSession({
			agentInfo: {
				summary: "Working on feature X",
				agentSessionId: "abc123",
				// summaryIsFallback intentionally omitted (older plugin)
			},
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should set summaryIsFallback false for metadata summary", () => {
		const coreSession = createCoreSession({
			agentInfo: null,
			metadata: { summary: "Metadata summary" },
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.summary).toBe("Metadata summary");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should set summaryIsFallback false when no summary exists", () => {
		const coreSession = createCoreSession({
			agentInfo: null,
			metadata: {},
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should map agent cost into token usage", () => {
		const coreSession = createCoreSession({
			agentInfo: {
				summary: "Working on feature X",
				agentSessionId: "abc123",
				cost: {
					inputTokens: 1200,
					outputTokens: 300,
					estimatedCostUsd: 0.0195,
				},
			},
		});
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 1200,
			outputTokens: 300,
			totalTokens: 1500,
			estimatedCostUsd: 0.0195,
		});
	});

	it("should convert PRInfo to DashboardPR with defaults", () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.pr).not.toBeNull();
		expect(dashboard.pr?.number).toBe(1);
		expect(dashboard.pr?.url).toBe("https://github.com/test/repo/pull/1");
		expect(dashboard.pr?.title).toBe("Test PR");
		expect(dashboard.pr?.state).toBe("open");
		expect(dashboard.pr?.additions).toBe(0);
		expect(dashboard.pr?.deletions).toBe(0);
		expect(dashboard.pr?.ciStatus).toBe("none");
		expect(dashboard.pr?.reviewDecision).toBe("none");
		expect(dashboard.pr?.mergeability.blockers).toContain("Data not loaded");
	});

	it("should set pr to null when session has no PR", () => {
		const coreSession = createCoreSession({ pr: null });
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.pr).toBeNull();
	});
});

describe("resolveProject", () => {
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

	it("should match by explicit projectId", () => {
		const projects = {
			app: makeProject({ name: "app", sessionPrefix: "app" }),
			lib: makeProject({ name: "lib", sessionPrefix: "lib" }),
		};
		const session = createCoreSession({ projectId: "app" });
		expect(resolveProject(session, projects)).toBe(projects.app);
	});

	it("should fall back to session prefix match", () => {
		const projects = {
			app: makeProject({ name: "app", sessionPrefix: "app" }),
			lib: makeProject({ name: "lib", sessionPrefix: "lib" }),
		};
		const session = createCoreSession({ id: "lib-42", projectId: "unknown" });
		expect(resolveProject(session, projects)).toBe(projects.lib);
	});

	it("should fall back to first project when nothing matches", () => {
		const projects = {
			app: makeProject({ name: "app", sessionPrefix: "app" }),
		};
		const session = createCoreSession({ id: "other-1", projectId: "unknown" });
		expect(resolveProject(session, projects)).toBe(projects.app);
	});

	it("should return undefined for empty projects", () => {
		const session = createCoreSession();
		expect(resolveProject(session, {})).toBeUndefined();
	});

	it("should prefer exact projectId over prefix match", () => {
		const projects = {
			app: makeProject({ name: "app", sessionPrefix: "lib" }),
			lib: makeProject({ name: "lib", sessionPrefix: "app" }),
		};
		// session id starts with "app" (matches lib's prefix), but projectId is "app" (direct match)
		const session = createCoreSession({ id: "app-1", projectId: "app" });
		expect(resolveProject(session, projects)).toBe(projects.app);
	});
});

describe("basicPRToDashboard defaults", () => {
	it("should not look like failing CI", () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		// ciStatus "none" is neutral (no checks configured), not failing
		expect(dashboard.pr?.ciStatus).toBe("none");
		expect(dashboard.pr?.ciStatus).not.toBe("failing");
	});

	it("should not look like changes requested", () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		// reviewDecision "none" is neutral (no review required), not changes_requested
		expect(dashboard.pr?.reviewDecision).toBe("none");
		expect(dashboard.pr?.reviewDecision).not.toBe("changes_requested");
	});

	it("should have explicit blocker indicating data not loaded", () => {
		const pr = createPRInfo();
		const coreSession = createCoreSession({ pr });
		const dashboard = sessionToDashboard(coreSession);

		expect(dashboard.pr?.mergeability.blockers).toContain("Data not loaded");
	});
});
