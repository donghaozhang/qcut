/**
 * Tracker state sync helpers for the lifecycle manager.
 * Handles issue state routing and workpad updates.
 */

import type {
	OrchestratorConfig,
	SessionId,
	Session,
	SessionStatus,
	OrchestratorEvent,
	EventPriority,
	PluginRegistry,
	Tracker,
} from "./types.js";
import { updateMetadata } from "./metadata.js";
import { getSessionsDir } from "./paths.js";
import { createEvent } from "./lifecycle-events.js";
import type { SessionPolicyEvaluation } from "./lifecycle-policy.js";
import {
	buildWorkpadSnapshot,
	renderWorkpadBody,
	type WorkpadSnapshot,
	type WorkpadPolicyGate,
} from "./workpad-schema.js";

export type { WorkpadSnapshot };

export function normalizeTrackerIssueIdentifier({
	issueId,
	project,
	tracker,
}: {
	issueId: string;
	project: OrchestratorConfig["projects"][string];
	tracker: Tracker;
}): string {
	try {
		if (!issueId.startsWith("http://") && !issueId.startsWith("https://")) {
			return issueId.replace(/^#/, "");
		}
		if (tracker.issueLabel) {
			const label = tracker.issueLabel(issueId, project);
			return label.replace(/^#/, "");
		}
		const urlParts = issueId.split("/");
		const last = urlParts[urlParts.length - 1] ?? "";
		return (last || issueId).replace(/^#/, "");
	} catch {
		return issueId.replace(/^#/, "");
	}
}

export async function syncIssueStateRouting({
	session,
	project,
	oldStatus,
	newStatus,
	config,
	registry,
	notifyHuman,
}: {
	session: Session;
	project: OrchestratorConfig["projects"][string];
	oldStatus: SessionStatus;
	newStatus: SessionStatus;
	config: OrchestratorConfig;
	registry: PluginRegistry;
	notifyHuman: (event: OrchestratorEvent, priority: EventPriority) => Promise<void>;
}): Promise<void> {
	if (!session.issueId || !project.tracker) {
		return;
	}

	const tracker = registry.get<Tracker>("tracker", project.tracker.plugin);
	if (!tracker) {
		return;
	}

	// Auto-close the issue when the PR is merged
	if (newStatus === "merged" && tracker.updateIssue) {
		const identifier = normalizeTrackerIssueIdentifier({
			issueId: session.issueId,
			project,
			tracker,
		});
		try {
			const issue = await tracker.getIssue(identifier, project);
			if (issue.state !== "closed") {
				await tracker.updateIssue(identifier, { state: "closed" }, project);
			}
		} catch (error) {
			const event = createEvent("reaction.escalated", {
				sessionId: session.id,
				projectId: session.projectId,
				message: `${session.id}: failed to close issue after merge: ${error}`,
			});
			await notifyHuman(event, "warning");
		}
	}
}

/** Build WorkpadPolicyGate from a SessionPolicyEvaluation. */
function buildWorkpadPolicyGate(
	policyEvaluation: SessionPolicyEvaluation | null
): WorkpadPolicyGate | null {
	if (!policyEvaluation) return null;
	const gate = policyEvaluation.gate;
	return {
		mode: gate.mode,
		passed: gate.passed,
		ciStatus: gate.ciStatus ?? null,
		reviewDecision: gate.reviewSweep?.reviewDecision ?? null,
		violations: gate.violations.map((v) => ({
			code: v.code,
			message: v.message,
			blockerClass: v.blockerClass,
		})),
		failingChecks: gate.requiredChecks.filter((c) => !c.passed).map((c) => c.name),
	};
}

/**
 * Build a structured WorkpadSnapshot from session state and return both the
 * snapshot and its rendered Markdown body.
 */
export function buildWorkpadBody({
	session,
	status,
	policyEvaluation,
}: {
	session: Session;
	status: SessionStatus;
	policyEvaluation: SessionPolicyEvaluation | null;
}): { snapshot: WorkpadSnapshot; body: string } {
	const policyGate = buildWorkpadPolicyGate(policyEvaluation);
	const snapshot = buildWorkpadSnapshot({
		sessionId: session.id,
		status,
		branch: session.branch,
		issueId: session.issueId,
		prNumber: session.pr?.number ?? null,
		prUrl: session.pr?.url ?? null,
		agentSummary: session.agentInfo?.summary ?? null,
		trackerState: session.metadata.issueState ?? null,
		policyGate,
	});
	return { snapshot, body: renderWorkpadBody(snapshot) };
}

export async function syncSessionWorkpad({
	session,
	project,
	status,
	config,
	registry,
	policyEvaluationBySession,
	notifyHuman,
}: {
	session: Session;
	project: OrchestratorConfig["projects"][string];
	status: SessionStatus;
	config: OrchestratorConfig;
	registry: PluginRegistry;
	policyEvaluationBySession: Map<SessionId, SessionPolicyEvaluation>;
	notifyHuman: (event: OrchestratorEvent, priority: EventPriority) => Promise<void>;
}): Promise<void> {
	if (!session.issueId || !project.tracker) {
		return;
	}

	const tracker = registry.get<Tracker>("tracker", project.tracker.plugin);
	if (!tracker) {
		return;
	}

	try {
		const trackerIdentifier = normalizeTrackerIssueIdentifier({
			issueId: session.issueId,
			project,
			tracker,
		});
		const existingWorkpad = await tracker.getWorkpad(trackerIdentifier, project);
		const policyEvaluation = policyEvaluationBySession.get(session.id) ?? null;
		const { snapshot } = buildWorkpadBody({ session, status, policyEvaluation });
		const workpad = await tracker.upsertWorkpad(snapshot, project, existingWorkpad?.id);

		const sessionsDir = getSessionsDir(config.configPath, project.path);
		updateMetadata(sessionsDir, session.id, {
			workpadId: workpad.id.replace(/\n/g, " "),
			workpadUrl: (workpad.url ?? "").replace(/\n/g, " "),
		});
		session.metadata.workpadId = workpad.id;
		session.metadata.workpadUrl = workpad.url ?? "";
	} catch (error) {
		const event = createEvent("reaction.escalated", {
			sessionId: session.id,
			projectId: session.projectId,
			message: `${session.id}: failed to sync workpad for status ${status}: ${error}`,
			data: { status },
		});
		try {
			await notifyHuman(event, "warning");
		} catch {
			// ignore secondary notification failure
		}
	}
}
