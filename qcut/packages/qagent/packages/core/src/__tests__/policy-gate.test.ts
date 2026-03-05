import { describe, it, expect, vi } from "vitest";
import { evaluatePolicyGate } from "../policy-gate.js";
import {
	DEFAULT_WORKFLOW_POLICY,
	type WorkflowPolicy,
} from "../workflow-contract.js";
import type { PRInfo, SCM } from "../types.js";

const pr: PRInfo = {
	number: 42,
	url: "https://github.com/acme/app/pull/42",
	title: "feat: policy",
	owner: "acme",
	repo: "app",
	branch: "feat/policy",
	baseBranch: "main",
	isDraft: false,
};

function createSCM(overrides: Partial<SCM> = {}): Pick<
	SCM,
	| "getReviewDecision"
	| "getPendingComments"
	| "getAutomatedComments"
	| "getCISummary"
	| "getMergeability"
	| "getCIChecks"
> {
	return {
		getReviewDecision: vi.fn().mockResolvedValue("approved"),
		getPendingComments: vi.fn().mockResolvedValue([]),
		getAutomatedComments: vi.fn().mockResolvedValue([]),
		getCISummary: vi.fn().mockResolvedValue("passing"),
		getMergeability: vi.fn().mockResolvedValue({
			mergeable: true,
			ciPassing: true,
			approved: true,
			noConflicts: true,
			blockers: [],
		}),
		getCIChecks: vi.fn().mockResolvedValue([
			{ name: "lint", status: "passed" },
			{ name: "test", status: "passed" },
		]),
		...overrides,
	};
}

function createPolicy(overrides: Partial<WorkflowPolicy> = {}): WorkflowPolicy {
	return {
		...DEFAULT_WORKFLOW_POLICY,
		reviewGate: {
			...DEFAULT_WORKFLOW_POLICY.reviewGate,
			...(overrides.reviewGate ?? {}),
		},
		mergeGate: {
			...DEFAULT_WORKFLOW_POLICY.mergeGate,
			...(overrides.mergeGate ?? {}),
		},
		blockedPolicy: {
			...DEFAULT_WORKFLOW_POLICY.blockedPolicy,
			...(overrides.blockedPolicy ?? {}),
		},
		activeStates: overrides.activeStates ?? DEFAULT_WORKFLOW_POLICY.activeStates,
	};
}

describe("evaluatePolicyGate", () => {
	it("passes when reviews, CI, and mergeability satisfy policy", async () => {
		const result = await evaluatePolicyGate({
			scm: createSCM(),
			pr,
			mode: "enforced",
			policy: createPolicy({
				mergeGate: { ...DEFAULT_WORKFLOW_POLICY.mergeGate, requiredChecks: ["lint"] },
			}),
		});

		expect(result.passed).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("fails when actionable review feedback exists", async () => {
		const result = await evaluatePolicyGate({
			scm: createSCM({
				getPendingComments: vi.fn().mockResolvedValue([
					{
						id: "c1",
						author: "reviewer",
						body: "Please fix",
						path: "src/file.ts",
						line: 10,
						isResolved: false,
						createdAt: new Date(),
						url: "https://example.com/c1",
					},
				]),
			}),
			pr,
			mode: "enforced",
			policy: createPolicy(),
		});

		expect(result.passed).toBe(false);
		expect(result.violations.some((v) => v.code === "review_feedback_pending")).toBe(
			true
		);
	});

	it("fails when required checks are missing or failing", async () => {
		const result = await evaluatePolicyGate({
			scm: createSCM({
				getCIChecks: vi.fn().mockResolvedValue([
					{ name: "lint", status: "passed" },
					{ name: "test", status: "failed" },
				]),
			}),
			pr,
			mode: "enforced",
			policy: createPolicy({
				mergeGate: {
					...DEFAULT_WORKFLOW_POLICY.mergeGate,
					requiredChecks: ["lint", "test", "typecheck"],
				},
			}),
		});

		expect(result.passed).toBe(false);
		expect(
			result.violations.some(
				(violation) => violation.code === "required_check_missing_or_failed"
			)
		).toBe(true);
	});

	it("fails when CI is not passing", async () => {
		const result = await evaluatePolicyGate({
			scm: createSCM({
				getCISummary: vi.fn().mockResolvedValue("failing"),
			}),
			pr,
			mode: "advisory",
			policy: createPolicy(),
		});

		expect(result.passed).toBe(false);
		expect(result.mode).toBe("advisory");
		expect(result.violations.some((v) => v.code === "ci_not_passing")).toBe(true);
	});
});
