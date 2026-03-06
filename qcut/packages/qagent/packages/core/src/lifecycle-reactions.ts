/**
 * Reaction execution for the lifecycle manager.
 * Handles automated responses to session state transitions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	OrchestratorConfig,
	SessionId,
	OrchestratorEvent,
	EventPriority,
	ReactionConfig,
	ReactionResult,
	PluginRegistry,
	SessionManager,
	Notifier,
} from "./types.js";
import { parseDuration, createEvent } from "./lifecycle-events.js";
import {
	resolveEscalationTemplate,
	renderEscalationMessage,
	type EscalationTemplate,
} from "./escalation-template.js";

export interface ReactionTracker {
	attempts: number;
	firstTriggered: Date;
}

export type NotifyHumanFn = (
	event: OrchestratorEvent,
	priority: EventPriority
) => Promise<void>;

/** Send a notification to all configured notifiers. */
export async function notifyHuman(
	event: OrchestratorEvent,
	priority: EventPriority,
	config: OrchestratorConfig,
	registry: PluginRegistry
): Promise<void> {
	const eventWithPriority = { ...event, priority };
	const notifierNames =
		config.notificationRouting[priority] ?? config.defaults.notifiers;

	for (const name of notifierNames) {
		const notifier = registry.get<Notifier>("notifier", name);
		if (notifier) {
			try {
				await notifier.notify(eventWithPriority);
			} catch {
				// Notifier failed — not much we can do
			}
		}
	}
}

export interface ExecuteReactionDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
	reactionTrackers: Map<string, ReactionTracker>;
	notifyHuman: NotifyHumanFn;
	/** Optional escalation templates from the project's workflow policy. */
	escalationTemplates?: EscalationTemplate[];
}

/**
 * Build a structured escalation message per reaction key.
 * Mirrors Symphony's blocked-access escape hatch: what's missing, why it blocks, exact action.
 */
function buildEscalationMessage({
	reactionKey,
	attempts,
	sessionId,
}: {
	reactionKey: string;
	attempts: number;
	sessionId: SessionId;
}): string {
	const attemptNote = `after ${attempts} automated attempt${attempts !== 1 ? "s" : ""}`;
	const header = `**Session \`${sessionId}\`** — reaction \`${reactionKey}\` escalated ${attemptNote}.`;

	switch (reactionKey) {
		case "ci-failed":
			return [
				header,
				"",
				"**What failed**: CI checks continue to fail on the PR.",
				"**Why it blocks**: Automated fix attempts have been exhausted without resolving the failure.",
				"**Action needed**: Review CI logs directly, provide targeted guidance via `qagent send`, or manually fix and push the fix.",
			].join("\n");
		case "changes-requested":
			return [
				header,
				"",
				"**What failed**: PR review feedback has not been fully addressed.",
				"**Why it blocks**: All automated address attempts are exhausted.",
				"**Action needed**: Review the open PR comments directly, resolve or explicitly push back on each, then re-trigger the agent.",
			].join("\n");
		case "agent-stuck":
			return [
				header,
				"",
				"**What failed**: Agent session is unresponsive or stuck.",
				"**Why it blocks**: No progress is being made and the session cannot self-recover.",
				"**Action needed**: Attach to the session (`qagent session attach`), investigate terminal output, send clarification, or kill and re-spawn.",
			].join("\n");
		case "approved-and-green":
			return [
				header,
				"",
				"**Status**: PR is approved and CI is green — ready to merge.",
				"**Action needed**: Review and merge the PR.",
			].join("\n");
		default:
			return `${header}\n\n**Action needed**: Manual intervention required for reaction \`${reactionKey}\`.`;
	}
}

/** Execute a reaction for a session. */
export async function executeReaction(
	sessionId: SessionId,
	projectId: string,
	reactionKey: string,
	reactionConfig: ReactionConfig,
	deps: ExecuteReactionDeps
): Promise<ReactionResult> {
	const { config, registry, sessionManager, reactionTrackers } = deps;
	const trackerKey = `${sessionId}:${reactionKey}`;
	let tracker = reactionTrackers.get(trackerKey);

	if (!tracker) {
		tracker = { attempts: 0, firstTriggered: new Date() };
		reactionTrackers.set(trackerKey, tracker);
	}

	// Increment attempts before checking escalation
	tracker.attempts++;

	// Check if we should escalate
	const maxRetries = reactionConfig.retries ?? Infinity;
	const escalateAfter = reactionConfig.escalateAfter;
	let shouldEscalate = false;

	if (tracker.attempts > maxRetries) {
		shouldEscalate = true;
	}

	if (typeof escalateAfter === "string") {
		const durationMs = parseDuration(escalateAfter);
		if (
			durationMs > 0 &&
			Date.now() - tracker.firstTriggered.getTime() > durationMs
		) {
			shouldEscalate = true;
		}
	}

	if (typeof escalateAfter === "number" && tracker.attempts > escalateAfter) {
		shouldEscalate = true;
	}

	if (shouldEscalate) {
		// Try to find a matching escalation template from the workflow policy
		const template = deps.escalationTemplates
			? resolveEscalationTemplate({
					violations: [
						{
							code: reactionKey,
							message: `Reaction '${reactionKey}' escalated after ${tracker.attempts} attempts`,
							blockerClass: "policy_gate_failed",
						},
					],
					templates: deps.escalationTemplates,
				})
			: null;

		const escalationMessage = template
			? renderEscalationMessage({
					template,
					context: {
						sessionId,
						projectId,
						violationCode: reactionKey,
						violationMessage: `Escalated after ${tracker.attempts} automated attempt${tracker.attempts !== 1 ? "s" : ""}`,
					},
				})
			: buildEscalationMessage({
					reactionKey,
					attempts: tracker.attempts,
					sessionId,
				});

		const priority = template?.severity ?? reactionConfig.priority ?? "urgent";
		const event = createEvent("reaction.escalated", {
			sessionId,
			projectId,
			message: escalationMessage,
			data: { reactionKey, attempts: tracker.attempts },
		});
		await deps.notifyHuman(event, priority);
		return {
			reactionType: reactionKey,
			success: true,
			action: "escalated",
			escalated: true,
		};
	}

	const action = reactionConfig.action ?? "notify";

	switch (action) {
		case "send-to-agent": {
			if (reactionConfig.message) {
				try {
					await sessionManager.send(sessionId, reactionConfig.message);
					return {
						reactionType: reactionKey,
						success: true,
						action: "send-to-agent",
						message: reactionConfig.message,
						escalated: false,
					};
				} catch {
					return {
						reactionType: reactionKey,
						success: false,
						action: "send-to-agent",
						escalated: false,
					};
				}
			}
			break;
		}

		case "notify": {
			const event = createEvent("reaction.triggered", {
				sessionId,
				projectId,
				message: `Reaction '${reactionKey}' triggered notification`,
				data: { reactionKey },
			});
			await deps.notifyHuman(event, reactionConfig.priority ?? "info");
			return {
				reactionType: reactionKey,
				success: true,
				action: "notify",
				escalated: false,
			};
		}

		case "send-structured-review": {
			try {
				const session = await sessionManager.get(sessionId);
				if (!session?.pr) {
					return { reactionType: reactionKey, success: false, action, escalated: false };
				}

				const project = config.projects[projectId];
				const repo = project?.repo ?? "";
				const prNumber = String(session.pr.number);

				const execFileAsync = promisify(execFile);
				const coreDir = dirname(fileURLToPath(import.meta.url));
				const scriptPath = resolve(
					coreDir,
					"../../../scripts/pr-comments/forward-to-agent.sh"
				);

				const { stdout } = await execFileAsync(
					"bash",
					[scriptPath, repo, prNumber],
					{ timeout: 30_000 }
				);

				if (stdout.trim()) {
					await sessionManager.send(sessionId, stdout.trim());
				}

				return {
					reactionType: reactionKey,
					success: true,
					action: "send-structured-review",
					message: `Sent ${stdout.split("###").length - 1} structured review comments`,
					escalated: false,
				};
			} catch {
				if (reactionConfig.message) {
					await sessionManager.send(sessionId, reactionConfig.message);
				}
				return {
					reactionType: reactionKey,
					success: false,
					action: "send-structured-review",
					escalated: false,
				};
			}
		}

		case "auto-merge": {
			const event = createEvent("reaction.triggered", {
				sessionId,
				projectId,
				message: `Reaction '${reactionKey}' triggered auto-merge`,
				data: { reactionKey },
			});
			await deps.notifyHuman(event, "action");
			return {
				reactionType: reactionKey,
				success: true,
				action: "auto-merge",
				escalated: false,
			};
		}
	}

	return { reactionType: reactionKey, success: false, action, escalated: false };
}
