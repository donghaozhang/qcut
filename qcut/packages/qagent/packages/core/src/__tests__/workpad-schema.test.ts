import { describe, it, expect } from "vitest";
import {
	buildWorkpadSnapshot,
	renderWorkpadBody,
	parseWorkpadSnapshot,
	type WorkpadSnapshot,
	type WorkpadPolicyGate,
} from "../workpad-schema.js";
import { buildWorkpadBody } from "../lifecycle-tracker.js";
import type { Session, SessionStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "app-1",
		projectId: "my-app",
		status: "working",
		activity: "active",
		branch: "feat/test",
		issueId: "42",
		pr: null,
		workspacePath: "/tmp/ws",
		runtimeHandle: { id: "rt-1", runtimeName: "mock", data: {} },
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// buildWorkpadSnapshot
// ---------------------------------------------------------------------------

describe("buildWorkpadSnapshot", () => {
	it("sets envStamp as session-id:branch@status", () => {
		const snap = buildWorkpadSnapshot({
			sessionId: "app-1",
			status: "working",
			branch: "feat/test",
			issueId: "42",
			prNumber: null,
			prUrl: null,
			agentSummary: null,
			trackerState: null,
			policyGate: null,
		});
		expect(snap.envStamp).toBe("app-1:feat/test@working");
		expect(snap.sessionId).toBe("app-1");
		expect(snap.status).toBe("working");
		expect(snap.branch).toBe("feat/test");
	});

	it("uses 'no-branch' when branch is null", () => {
		const snap = buildWorkpadSnapshot({
			sessionId: "app-1",
			status: "working",
			branch: null,
			issueId: null,
			prNumber: null,
			prUrl: null,
			agentSummary: null,
			trackerState: null,
			policyGate: null,
		});
		expect(snap.envStamp).toBe("app-1:no-branch@working");
	});

	it("sets blockerBrief for blocked statuses", () => {
		const blockedStatuses: SessionStatus[] = [
			"ci_failed",
			"changes_requested",
			"needs_input",
			"stuck",
			"errored",
		];
		for (const status of blockedStatuses) {
			const snap = buildWorkpadSnapshot({
				sessionId: "app-1",
				status,
				branch: "feat/test",
				issueId: null,
				prNumber: null,
				prUrl: null,
				agentSummary: null,
				trackerState: null,
				policyGate: null,
			});
			expect(snap.blockerBrief, `status=${status}`).not.toBeNull();
			expect(snap.blockerBrief?.what, `status=${status}`).toBeTruthy();
			expect(snap.blockerBrief?.whyBlocks, `status=${status}`).toBeTruthy();
			expect(snap.blockerBrief?.actionNeeded, `status=${status}`).toBeTruthy();
		}
	});

	it("does not set blockerBrief for non-blocked statuses", () => {
		const nonBlockedStatuses: SessionStatus[] = ["working", "pr_open", "mergeable", "merged"];
		for (const status of nonBlockedStatuses) {
			const snap = buildWorkpadSnapshot({
				sessionId: "app-1",
				status,
				branch: "feat/test",
				issueId: null,
				prNumber: null,
				prUrl: null,
				agentSummary: null,
				trackerState: null,
				policyGate: null,
			});
			expect(snap.blockerBrief, `status=${status}`).toBeNull();
		}
	});

	it("sets updatedAt as ISO string", () => {
		const snap = buildWorkpadSnapshot({
			sessionId: "app-1",
			status: "working",
			branch: null,
			issueId: null,
			prNumber: null,
			prUrl: null,
			agentSummary: null,
			trackerState: null,
			policyGate: null,
		});
		expect(() => new Date(snap.updatedAt)).not.toThrow();
		const d = new Date(snap.updatedAt);
		expect(d.getFullYear()).toBeGreaterThan(2020);
	});
});

// ---------------------------------------------------------------------------
// renderWorkpadBody + parseWorkpadSnapshot round-trip
// ---------------------------------------------------------------------------

describe("renderWorkpadBody / parseWorkpadSnapshot round-trip", () => {
	it("embeds snapshot JSON and can be extracted", () => {
		const snap = buildWorkpadSnapshot({
			sessionId: "app-1",
			status: "ci_failed",
			branch: "feat/test",
			issueId: "42",
			prNumber: 7,
			prUrl: "https://github.com/org/repo/pull/7",
			agentSummary: "Fixed the thing",
			trackerState: "in_progress",
			policyGate: null,
		});
		const body = renderWorkpadBody(snap);
		const parsed = parseWorkpadSnapshot(body);

		expect(parsed).not.toBeNull();
		expect(parsed?.sessionId).toBe("app-1");
		expect(parsed?.status).toBe("ci_failed");
		expect(parsed?.branch).toBe("feat/test");
		expect(parsed?.issueId).toBe("42");
		expect(parsed?.prNumber).toBe(7);
		expect(parsed?.prUrl).toBe("https://github.com/org/repo/pull/7");
		expect(parsed?.agentSummary).toBe("Fixed the thing");
		expect(parsed?.trackerState).toBe("in_progress");
		expect(parsed?.blockerBrief).not.toBeNull();
	});

	it("renders policy gate section when present", () => {
		const gate: WorkpadPolicyGate = {
			mode: "enforced",
			passed: false,
			ciStatus: "failing",
			reviewDecision: "pending",
			violations: [
				{ code: "ci_not_passing", message: "CI is failing", blockerClass: "policy_gate_failed" },
			],
			failingChecks: ["lint", "test"],
		};
		const snap = buildWorkpadSnapshot({
			sessionId: "app-1",
			status: "working",
			branch: "feat/test",
			issueId: null,
			prNumber: null,
			prUrl: null,
			agentSummary: null,
			trackerState: null,
			policyGate: gate,
		});
		const body = renderWorkpadBody(snap);
		expect(body).toContain("Policy Gate");
		expect(body).toContain("enforced");
		expect(body).toContain("ci_not_passing");
		expect(body).toContain("lint");

		const parsed = parseWorkpadSnapshot(body);
		expect(parsed?.policyGate?.mode).toBe("enforced");
		expect(parsed?.policyGate?.passed).toBe(false);
		expect(parsed?.policyGate?.violations).toHaveLength(1);
		expect(parsed?.policyGate?.failingChecks).toEqual(["lint", "test"]);
	});

	it("returns null for body without snapshot marker", () => {
		expect(parseWorkpadSnapshot("# Some plain markdown\nNo snapshot here")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildWorkpadBody (lifecycle-tracker integration)
// ---------------------------------------------------------------------------

describe("buildWorkpadBody (lifecycle-tracker)", () => {
	it("returns a snapshot and a body string", () => {
		const session = makeSession();
		const result = buildWorkpadBody({
			session,
			status: "working",
			policyEvaluation: null,
		});
		expect(result.snapshot).toBeDefined();
		expect(result.snapshot.sessionId).toBe("app-1");
		expect(result.snapshot.status).toBe("working");
		expect(typeof result.body).toBe("string");
		expect(result.body.length).toBeGreaterThan(0);
	});

	it("snapshot is round-trippable from the body", () => {
		const session = makeSession({ branch: "feat/round-trip", issueId: "99" });
		const { body, snapshot } = buildWorkpadBody({
			session,
			status: "pr_open",
			policyEvaluation: null,
		});
		const parsed = parseWorkpadSnapshot(body);
		expect(parsed?.sessionId).toBe(snapshot.sessionId);
		expect(parsed?.status).toBe(snapshot.status);
		expect(parsed?.branch).toBe(snapshot.branch);
	});

	it("includes policy gate when policyEvaluation is provided", () => {
		const session = makeSession();
		const policyEvaluation = {
			gate: {
				mode: "advisory" as const,
				passed: false,
				violations: [
					{
						code: "ci_not_passing" as const,
						message: "CI is not passing",
						blockerClass: "policy_gate_failed" as const,
					},
				],
				reviewSweep: null,
				ciStatus: "failing" as const,
				mergeability: null,
				requiredChecks: [],
				checkedAt: new Date(),
			},
			effectivePolicy: {
				mode: "advisory" as const,
				policy: {
					activeStates: [],
					reviewGate: {
						enabled: true,
						requireReviewSweep: true,
						requireDecision: "approved" as const,
						maxUnresolvedComments: 0,
					},
					mergeGate: {
						enabled: true,
						requireCiPassing: true,
						requireApproval: true,
						requireNoConflicts: true,
						requireMergeable: true,
						requiredChecks: [],
					},
					blockedPolicy: {
						escalation: "notify" as const,
						classes: [],
					},
				},
				promptTemplate: null,
			},
		};

		const { snapshot } = buildWorkpadBody({
			session,
			status: "pr_open",
			policyEvaluation,
		});

		expect(snapshot.policyGate).not.toBeNull();
		expect(snapshot.policyGate?.mode).toBe("advisory");
		expect(snapshot.policyGate?.passed).toBe(false);
		expect(snapshot.policyGate?.violations).toHaveLength(1);
	});
});
