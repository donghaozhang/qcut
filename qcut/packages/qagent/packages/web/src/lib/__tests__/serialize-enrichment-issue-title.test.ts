import { describe, it, expect, vi } from "vitest";
import type { Tracker, ProjectConfig } from "@composio/ao-core";
import type { DashboardSession } from "../types";
import { enrichSessionIssueTitle } from "../serialize";

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

function makeDashboard(overrides?: Partial<DashboardSession>): DashboardSession {
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

describe("enrichSessionIssueTitle", () => {
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
