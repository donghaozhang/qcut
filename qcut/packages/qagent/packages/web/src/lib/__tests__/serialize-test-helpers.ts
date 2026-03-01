/**
 * Shared test factories for serialize test suites
 */

import { vi } from "vitest";
import type { Session, PRInfo, SCM } from "@composio/ao-core";

/** Create a minimal Session for testing */
export function createCoreSession(overrides?: Partial<Session>): Session {
	return {
		id: "test-1",
		projectId: "test",
		status: "working",
		activity: "active",
		branch: "feat/test",
		issueId: null,
		pr: null,
		workspacePath: "/test",
		runtimeHandle: null,
		agentInfo: null,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		lastActivityAt: new Date("2025-01-01T01:00:00Z"),
		metadata: {},
		...overrides,
	};
}

/** Create a minimal PRInfo for testing */
export function createPRInfo(overrides?: Partial<PRInfo>): PRInfo {
	return {
		number: 1,
		url: "https://github.com/test/repo/pull/1",
		title: "Test PR",
		owner: "test",
		repo: "repo",
		branch: "feat/test",
		baseBranch: "main",
		isDraft: false,
		...overrides,
	};
}

/** Mock SCM that succeeds */
export function createMockSCM(): SCM {
	return {
		name: "mock",
		detectPR: vi.fn(),
		getPRState: vi.fn().mockResolvedValue("open"),
		getPRSummary: vi.fn().mockResolvedValue({
			state: "open",
			title: "Test PR",
			additions: 100,
			deletions: 50,
		}),
		getCIChecks: vi
			.fn()
			.mockResolvedValue([
				{ name: "test", status: "passed", url: "https://example.com" },
			]),
		getCISummary: vi.fn().mockResolvedValue("passing"),
		getReviewDecision: vi.fn().mockResolvedValue("approved"),
		getMergeability: vi.fn().mockResolvedValue({
			mergeable: true,
			ciPassing: true,
			approved: true,
			noConflicts: true,
			blockers: [],
		}),
		getPendingComments: vi.fn().mockResolvedValue([]),
		getReviews: vi.fn(),
		getAutomatedComments: vi.fn(),
		mergePR: vi.fn(),
		closePR: vi.fn(),
	};
}

/** Mock SCM that fails all requests */
export function createFailingSCM(): SCM {
	const error = new Error("API rate limited");
	return {
		name: "mock-failing",
		detectPR: vi.fn(),
		getPRState: vi.fn().mockRejectedValue(error),
		getPRSummary: vi.fn().mockRejectedValue(error),
		getCIChecks: vi.fn().mockRejectedValue(error),
		getCISummary: vi.fn().mockRejectedValue(error),
		getReviewDecision: vi.fn().mockRejectedValue(error),
		getMergeability: vi.fn().mockRejectedValue(error),
		getPendingComments: vi.fn().mockRejectedValue(error),
		getReviews: vi.fn(),
		getAutomatedComments: vi.fn(),
		mergePR: vi.fn(),
		closePR: vi.fn(),
	};
}
