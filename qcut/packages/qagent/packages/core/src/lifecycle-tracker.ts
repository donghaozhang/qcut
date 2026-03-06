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
	if (!tracker?.transitionIssueState) {
		return;
	}

	// issueStateRouting was removed from WorkflowPolicy; feature is disabled
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
	const now = new Date().toISOString();
	const sections: string[] = [];

	// Environment stamp (Symphony-style single source of truth)
	const envStamp = `${session.id}:${session.branch ?? "no-branch"}@${status}`;
	sections.push(`# QAgent Workpad\n\n\`\`\`text\n${envStamp}\n\`\`\``);

	// Status section
	const statusLines = [
		"### Status",
		"",
		`- **Session**: ${session.id}`,
		`- **Status**: \`${status}\``,
		`- **Branch**: ${session.branch ?? "n/a"}`,
		`- **Updated**: ${now}`,
	];
	if (session.issueId) {
		statusLines.push(`- **Issue**: ${session.issueId}`);
	}
	if (session.pr) {
		statusLines.push(`- **PR**: [#${String(session.pr.number)}](${session.pr.url})`);
	}
	if (session.agentInfo?.summary) {
		statusLines.push(`- **Summary**: ${session.agentInfo.summary.replace(/\n/g, " ")}`);
	}
	if (session.metadata.issueState) {
		statusLines.push(`- **Tracker State**: ${session.metadata.issueState}`);
	}
	sections.push(statusLines.join("\n"));

	// Policy Gate section (when evaluated)
	if (policyEvaluation) {
		const passIcon = policyEvaluation.gate.passed ? "✅" : "❌";
		const gateLines = [
			"### Policy Gate",
			"",
			`- Mode: \`${policyEvaluation.gate.mode}\` ${passIcon} ${policyEvaluation.gate.passed ? "pass" : "fail"}`,
		];
		if (policyEvaluation.gate.ciStatus) {
			gateLines.push(`- CI: \`${policyEvaluation.gate.ciStatus}\``);
		}
		if (policyEvaluation.gate.reviewSweep) {
			const sweep = policyEvaluation.gate.reviewSweep;
			gateLines.push(`- Review decision: \`${sweep.reviewDecision ?? "pending"}\``);
			if (sweep.actionableCount > 0) {
				gateLines.push(`- Unresolved actionable comments: ${sweep.actionableCount}`);
			}
		}
		if (!policyEvaluation.gate.passed && policyEvaluation.gate.violations.length > 0) {
			gateLines.push("- **Violations**:");
			for (const v of policyEvaluation.gate.violations.slice(0, 5)) {
				gateLines.push(`  - \`${v.code}\` [${v.blockerClass}]: ${v.message}`);
			}
		}
		const failingChecks = policyEvaluation.gate.requiredChecks.filter((c) => !c.passed);
		if (failingChecks.length > 0) {
			gateLines.push(
				`- Failing required checks: ${failingChecks.map((c) => `\`${c.name}\``).join(", ")}`
			);
		}
		sections.push(gateLines.join("\n"));
	}

	// Blocker Brief — Symphony's blocked-access escape hatch pattern, adapted for qagent
	const BLOCKED_STATUSES = new Set<SessionStatus>([
		"ci_failed",
		"changes_requested",
		"needs_input",
		"stuck",
		"errored",
	]);
	if (BLOCKED_STATUSES.has(status)) {
		const blockerLines = ["### Blocker Brief", ""];
		switch (status) {
			case "ci_failed":
				blockerLines.push("- **What**: CI checks are failing on the PR");
				blockerLines.push("- **Why it blocks**: PR cannot merge with failing CI");
				blockerLines.push("- **Action needed**: Review CI output and fix failing checks");
				break;
			case "changes_requested":
				blockerLines.push("- **What**: Reviewer has requested changes on the PR");
				blockerLines.push("- **Why it blocks**: Changes must be addressed before approval");
				blockerLines.push("- **Action needed**: Review PR feedback and implement requested changes");
				break;
			case "needs_input":
				blockerLines.push("- **What**: Agent is waiting for human input");
				blockerLines.push("- **Why it blocks**: Agent cannot proceed without clarification");
				blockerLines.push("- **Action needed**: Attach to session and provide the required input");
				break;
			case "stuck":
				blockerLines.push("- **What**: Agent appears unresponsive or stuck");
				blockerLines.push("- **Why it blocks**: No progress is being made");
				blockerLines.push(
					"- **Action needed**: Attach to session to investigate; consider sending guidance or re-spawning"
				);
				break;
			case "errored":
				blockerLines.push("- **What**: Agent session encountered an error");
				blockerLines.push("- **Why it blocks**: Execution halted unexpectedly");
				blockerLines.push("- **Action needed**: Check session logs and re-spawn if necessary");
				break;
		}
		sections.push(blockerLines.join("\n"));
	}

	// Notes
	sections.push(`### Notes\n\n- Status transitioned to \`${status}\` at ${now}`);

	return sections.join("\n\n");
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
		await notifyHuman(event, "warning");
	}
}
