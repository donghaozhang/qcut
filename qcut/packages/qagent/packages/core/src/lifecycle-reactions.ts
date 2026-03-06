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
		const event = createEvent("reaction.escalated", {
			sessionId,
			projectId,
			message: `Reaction '${reactionKey}' escalated after ${tracker.attempts} attempts`,
			data: { reactionKey, attempts: tracker.attempts },
		});
		await deps.notifyHuman(event, reactionConfig.priority ?? "urgent");
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
					success: true,
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
