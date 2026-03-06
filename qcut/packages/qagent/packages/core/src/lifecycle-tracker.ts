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
import {
	resolveProjectWorkflowPolicy,
	type SessionPolicyEvaluation,
} from "./lifecycle-policy.js";

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
		return (urlParts[urlParts.length - 1] ?? issueId).replace(/^#/, "");
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
	if (!tracker?.transitionIssueState) {
		return;
	}

	const effectivePolicy = resolveProjectWorkflowPolicy({ config, project });
	if (!effectivePolicy.policy.issueStateRouting.enabled) {
		return;
	}

	const targetState = effectivePolicy.policy.issueStateRouting.stateMap[newStatus];
	if (!targetState) {
		return;
	}

	if (session.metadata.issueState === targetState) {
		return;
	}

	try {
		const trackerIdentifier = normalizeTrackerIssueIdentifier({
			issueId: session.issueId,
			project,
			tracker,
		});
		await tracker.transitionIssueState(trackerIdentifier, targetState, project);

		const sessionsDir = getSessionsDir(config.configPath, project.path);
		updateMetadata(sessionsDir, session.id, {
			issueState: targetState,
			issueStateFromStatus: newStatus,
		});
		session.metadata.issueState = targetState;
		session.metadata.issueStateFromStatus = newStatus;
	} catch (error) {
		const event = createEvent("reaction.escalated", {
			sessionId: session.id,
			projectId: session.projectId,
			message: `${session.id}: failed to sync tracker issue state ${oldStatus} -> ${newStatus}: ${error}`,
			data: { oldStatus, newStatus, targetState },
		});
		await notifyHuman(event, "warning");
	}
}

export function buildWorkpadBody({
	session,
	status,
	policyEvaluation,
}: {
	session: Session;
	status: SessionStatus;
	policyEvaluation: SessionPolicyEvaluation | null;
}): string {
	const lines = [
		"# QAgent Workpad",
		"",
		`- Session: ${session.id}`,
		`- Status: ${status}`,
		`- Branch: ${session.branch ?? "n/a"}`,
		`- Updated At: ${new Date().toISOString()}`,
	];

	if (session.pr) {
		lines.push(`- PR: #${String(session.pr.number)} ${session.pr.url}`);
	}
	if (session.agentInfo?.summary) {
		lines.push(`- Summary: ${session.agentInfo.summary}`);
	}
	if (session.metadata.issueState) {
		lines.push(`- Tracker State: ${session.metadata.issueState}`);
	}

	if (policyEvaluation) {
		lines.push(
			`- Policy: ${policyEvaluation.gate.mode} / ${policyEvaluation.gate.passed ? "pass" : "fail"}`
		);
		if (!policyEvaluation.gate.passed) {
			const violations = policyEvaluation.gate.violations
				.slice(0, 5)
				.map((violation) => `  - ${violation.code}: ${violation.message}`);
			lines.push("- Policy Violations:");
			lines.push(...violations);
		}
	}

	return lines.join("\n");
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
	if (!tracker?.upsertWorkpad) {
		return;
	}

	try {
		const trackerIdentifier = normalizeTrackerIssueIdentifier({
			issueId: session.issueId,
			project,
			tracker,
		});
		const existingWorkpad = tracker.getWorkpad
			? await tracker.getWorkpad(trackerIdentifier, project)
			: null;
		const policyEvaluation = policyEvaluationBySession.get(session.id) ?? null;
		const workpad = await tracker.upsertWorkpad(
			{
				identifier: trackerIdentifier,
				id: existingWorkpad?.id,
				body: buildWorkpadBody({ session, status, policyEvaluation }),
			},
			project
		);

		const sessionsDir = getSessionsDir(config.configPath, project.path);
		updateMetadata(sessionsDir, session.id, {
			workpadId: workpad.id,
			workpadUrl: workpad.url ?? "",
		});
		session.metadata.workpadId = workpad.id;
		if (workpad.url) {
			session.metadata.workpadUrl = workpad.url;
		}
	} catch (error) {
		const event = createEvent("reaction.escalated", {
			sessionId: session.id,
			projectId: session.projectId,
			message: `${session.id}: failed to sync workpad for status ${status}: ${error}`,
			data: { status },
		});
		await notifyHuman(event, "warning");
	}
}
