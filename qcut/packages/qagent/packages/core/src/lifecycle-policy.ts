/**
 * Policy gate evaluation helpers for the lifecycle manager.
 */

import type {
	OrchestratorConfig,
	SessionId,
	Session,
	SCM,
	EventPriority,
} from "./types.js";
import { evaluatePolicyGate, type PolicyGateResult } from "./policy-gate.js";
import {
	loadWorkflowContract,
	resolveEffectiveWorkflowPolicy,
	type EffectiveWorkflowPolicy,
	POLICY_BLOCKER_CLASS,
} from "./workflow-contract.js";

export interface SessionPolicyEvaluation {
	gate: PolicyGateResult;
	effectivePolicy: EffectiveWorkflowPolicy;
}

export function summarizePolicyGate({
	policyGate,
}: {
	policyGate: PolicyGateResult;
}): string {
	const details = policyGate.violations
		.slice(0, 3)
		.map((violation) => violation.message)
		.join("; ");
	return details || "Policy gate failed";
}

export function toWarningPriorityForBlockerClass({
	blockerClass,
}: {
	blockerClass: string;
}): EventPriority {
	try {
		if (
			blockerClass === POLICY_BLOCKER_CLASS.AUTH_MISSING ||
			blockerClass === POLICY_BLOCKER_CLASS.PERMISSION_DENIED
		) {
			return "urgent";
		}
		if (blockerClass === POLICY_BLOCKER_CLASS.EXTERNAL_DEPENDENCY_UNAVAILABLE) {
			return "action";
		}
		return "warning";
	} catch {
		return "warning";
	}
}

export function getBlockedPolicyViolations({
	evaluation,
}: {
	evaluation: SessionPolicyEvaluation;
}): PolicyGateResult["violations"] {
	try {
		const enabledClasses = new Set(
			evaluation.effectivePolicy.policy.blockedPolicy.classes
		);
		return evaluation.gate.violations.filter((violation) =>
			enabledClasses.has(violation.blockerClass)
		);
	} catch {
		return evaluation.gate.violations;
	}
}

export function resolveViolationPriority({
	violations,
}: {
	violations: PolicyGateResult["violations"];
}): EventPriority {
	try {
		let priority: EventPriority = "warning";
		for (const violation of violations) {
			const current = toWarningPriorityForBlockerClass({
				blockerClass: violation.blockerClass,
			});
			if (current === "urgent") {
				return "urgent";
			}
			if (current === "action") {
				priority = "action";
			}
		}
		return priority;
	} catch {
		return "warning";
	}
}

export function shouldBlockMergeTransition({
	evaluation,
}: {
	evaluation: SessionPolicyEvaluation;
}): boolean {
	try {
		if (evaluation.gate.passed) {
			return false;
		}
		if (evaluation.gate.mode === "enforced") {
			return true;
		}
		const blockedViolations = getBlockedPolicyViolations({ evaluation });
		if (blockedViolations.length === 0) {
			return false;
		}
		return evaluation.effectivePolicy.policy.blockedPolicy.escalation === "block";
	} catch {
		return false;
	}
}

export function resolveProjectWorkflowPolicy({
	config,
	project,
}: {
	config: OrchestratorConfig;
	project: OrchestratorConfig["projects"][string];
}): EffectiveWorkflowPolicy {
	try {
		const workflowContract = loadWorkflowContract({ config, project });
		return resolveEffectiveWorkflowPolicy({ config, project, contract: workflowContract });
	} catch {
		return resolveEffectiveWorkflowPolicy({ config, project, contract: null });
	}
}

export async function evaluateSessionPolicyGate({
	session,
	project,
	scm,
	config,
	policyEvaluationBySession,
}: {
	session: Session;
	project: OrchestratorConfig["projects"][string];
	scm: SCM;
	config: OrchestratorConfig;
	policyEvaluationBySession: Map<SessionId, SessionPolicyEvaluation>;
}): Promise<SessionPolicyEvaluation | null> {
	if (!session.pr) {
		policyEvaluationBySession.delete(session.id);
		return null;
	}

	try {
		const workflowContract = loadWorkflowContract({ config, project });
		const effectivePolicy = resolveEffectiveWorkflowPolicy({
			config,
			project,
			contract: workflowContract,
		});

		const policyGate = await evaluatePolicyGate({
			scm,
			pr: session.pr,
			mode: effectivePolicy.mode,
			policy: effectivePolicy.policy,
		});
		const evaluation: SessionPolicyEvaluation = { gate: policyGate, effectivePolicy };
		policyEvaluationBySession.set(session.id, evaluation);
		return evaluation;
	} catch (error) {
		const fallbackMode = project.policyMode ?? config.policyMode ?? "advisory";
		const fallbackPolicy = resolveEffectiveWorkflowPolicy({
			config,
			project,
			contract: null,
		}).policy;
		const fallback: PolicyGateResult = {
			mode: fallbackMode,
			passed: false,
			violations: [
				{
					code: "policy_evaluation_error",
					message: `Policy gate evaluation failed: ${String(error).replace(/\n/g, " ")}`,
					blockerClass: "policy_gate_failed",
				},
			],
			reviewSweep: null,
			ciStatus: null,
			mergeability: null,
			requiredChecks: [],
			checkedAt: new Date(),
		};
		const evaluation: SessionPolicyEvaluation = {
			gate: fallback,
			effectivePolicy: { mode: fallbackMode, policy: fallbackPolicy, promptTemplate: null },
		};
		policyEvaluationBySession.set(session.id, evaluation);
		return evaluation;
	}
}
