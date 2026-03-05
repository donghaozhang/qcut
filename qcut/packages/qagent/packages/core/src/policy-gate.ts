import type {
	CICheck,
	CIStatus,
	MergeReadiness,
	PolicyMode,
	PRInfo,
	SCM,
} from "./types.js";
import type {
	PolicyBlockerClass,
	WorkflowPolicy,
} from "./workflow-contract.js";
import { POLICY_BLOCKER_CLASS } from "./workflow-contract.js";
import {
	collectPRFeedbackSweep,
	type PRFeedbackSweepResult,
} from "./review-sweep.js";

export interface PolicyGateViolation {
	code:
		| "review_decision_not_approved"
		| "review_feedback_pending"
		| "too_many_unresolved_comments"
		| "ci_not_passing"
		| "approval_missing"
		| "merge_conflicts"
		| "not_mergeable"
		| "required_check_missing_or_failed"
		| "policy_evaluation_error";
	message: string;
	blockerClass: PolicyBlockerClass;
	details?: Record<string, unknown>;
}

export interface RequiredCheckStatus {
	name: string;
	status: CICheck["status"] | "missing";
	passed: boolean;
}

export interface PolicyGateResult {
	mode: PolicyMode;
	passed: boolean;
	violations: PolicyGateViolation[];
	reviewSweep: PRFeedbackSweepResult | null;
	ciStatus: CIStatus | null;
	mergeability: MergeReadiness | null;
	requiredChecks: RequiredCheckStatus[];
	checkedAt: Date;
}

function addViolation({
	violations,
	code,
	message,
	blockerClass,
	details,
}: {
	violations: PolicyGateViolation[];
	code: PolicyGateViolation["code"];
	message: string;
	blockerClass: PolicyBlockerClass;
	details?: Record<string, unknown>;
}): void {
	violations.push({
		code,
		message,
		blockerClass,
		details,
	});
}

function mapRequiredChecks({
	requiredChecks,
	checks,
}: {
	requiredChecks: string[];
	checks: CICheck[];
}): RequiredCheckStatus[] {
	const checksByName = new Map<string, CICheck>();
	for (const check of checks) {
		checksByName.set(check.name.trim().toLowerCase(), check);
	}

	return requiredChecks.map((requiredCheckName) => {
		const normalizedName = requiredCheckName.trim().toLowerCase();
		const check = checksByName.get(normalizedName);
		if (!check) {
			return {
				name: requiredCheckName,
				status: "missing",
				passed: false,
			};
		}

		const passed = check.status === "passed" || check.status === "skipped";
		return {
			name: requiredCheckName,
			status: check.status,
			passed,
		};
	});
}

export async function evaluatePolicyGate({
	scm,
	pr,
	mode,
	policy,
}: {
	scm: Pick<
		SCM,
		| "getReviewDecision"
		| "getPendingComments"
		| "getAutomatedComments"
		| "getCISummary"
		| "getMergeability"
		| "getCIChecks"
	>;
	pr: PRInfo;
	mode: PolicyMode;
	policy: WorkflowPolicy;
}): Promise<PolicyGateResult> {
	try {
		const violations: PolicyGateViolation[] = [];
		let reviewSweep: PRFeedbackSweepResult | null = null;
		let ciStatus: CIStatus | null = null;
		let mergeability: MergeReadiness | null = null;
		let requiredChecks: RequiredCheckStatus[] = [];

		if (policy.reviewGate.enabled) {
			try {
				reviewSweep = await collectPRFeedbackSweep({ scm, pr });
			} catch (error) {
				addViolation({
					violations,
					code: "policy_evaluation_error",
					message: `Review sweep failed: ${error}`,
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
				});
			}

			if (reviewSweep) {
				if (
					policy.reviewGate.requireDecision === "approved" &&
					reviewSweep.reviewDecision !== "approved"
				) {
					addViolation({
						violations,
						code: "review_decision_not_approved",
						message: `Review decision is '${reviewSweep.reviewDecision}', expected 'approved'`,
						blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
						details: { reviewDecision: reviewSweep.reviewDecision },
					});
				}

				if (
					policy.reviewGate.requireReviewSweep &&
					reviewSweep.hasBlockingFeedback
				) {
					addViolation({
						violations,
						code: "review_feedback_pending",
						message:
							"Actionable review feedback is still pending resolution",
						blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
						details: { actionableCount: reviewSweep.actionableCount },
					});
				}

				if (
					reviewSweep.actionableHumanComments.length >
					policy.reviewGate.maxUnresolvedComments
				) {
					addViolation({
						violations,
						code: "too_many_unresolved_comments",
						message:
							"Unresolved human review comments exceed configured maximum",
						blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
						details: {
							maxUnresolvedComments: policy.reviewGate.maxUnresolvedComments,
							actualUnresolvedComments:
								reviewSweep.actionableHumanComments.length,
						},
					});
				}
			}
		}

		if (policy.mergeGate.enabled) {
			try {
				ciStatus = await scm.getCISummary(pr);
			} catch (error) {
				addViolation({
					violations,
					code: "policy_evaluation_error",
					message: `CI status lookup failed: ${error}`,
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
				});
			}

			try {
				mergeability = await scm.getMergeability(pr);
			} catch (error) {
				addViolation({
					violations,
					code: "policy_evaluation_error",
					message: `Mergeability lookup failed: ${error}`,
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
				});
			}

			if (policy.mergeGate.requireCiPassing && ciStatus !== "passing") {
				addViolation({
					violations,
					code: "ci_not_passing",
					message: `CI status is '${ciStatus ?? "unknown"}', expected 'passing'`,
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
					details: { ciStatus },
				});
			}

			if (policy.mergeGate.requireApproval && mergeability?.approved !== true) {
				addViolation({
					violations,
					code: "approval_missing",
					message: "Mergeability reports missing approval",
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
					details: { approved: mergeability?.approved ?? null },
				});
			}

			if (policy.mergeGate.requireNoConflicts && mergeability?.noConflicts !== true) {
				addViolation({
					violations,
					code: "merge_conflicts",
					message: "Mergeability reports unresolved conflicts",
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
					details: { noConflicts: mergeability?.noConflicts ?? null },
				});
			}

			if (policy.mergeGate.requireMergeable && mergeability?.mergeable !== true) {
				addViolation({
					violations,
					code: "not_mergeable",
					message: "Mergeability reports PR is not mergeable",
					blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
					details: { mergeable: mergeability?.mergeable ?? null },
				});
			}

			if (policy.mergeGate.requiredChecks.length > 0) {
				try {
					const checks = await scm.getCIChecks(pr);
					requiredChecks = mapRequiredChecks({
						requiredChecks: policy.mergeGate.requiredChecks,
						checks,
					});

					const failingRequiredChecks = requiredChecks.filter(
						(check) => !check.passed
					);
					if (failingRequiredChecks.length > 0) {
						addViolation({
							violations,
							code: "required_check_missing_or_failed",
							message: "Required checks are missing or not passing",
							blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
							details: {
								requiredChecks: failingRequiredChecks,
							},
						});
					}
				} catch (error) {
					addViolation({
						violations,
						code: "policy_evaluation_error",
						message: `Required check lookup failed: ${error}`,
						blockerClass: POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
					});
				}
			}
		}

		return {
			mode,
			passed: violations.length === 0,
			violations,
			reviewSweep,
			ciStatus,
			mergeability,
			requiredChecks,
			checkedAt: new Date(),
		};
	} catch (error) {
		throw new Error(`Failed to evaluate policy gate for PR #${String(pr.number)}: ${error}`, {
			cause: error,
		});
	}
}
