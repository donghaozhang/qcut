/**
 * Bot review comment detection and settle logic for the lifecycle manager.
 * Polls PR automated comments, waits for them to settle, then triggers reactions.
 */

import type {
	OrchestratorConfig,
	SessionId,
	Session,
	SessionStatus,
	OrchestratorEvent,
	EventPriority,
	ReactionConfig,
	ReactionResult,
	PluginRegistry,
	SessionManager,
	SCM,
} from "./types.js";
import { CI_STATUS } from "./types.js";
import { createEvent } from "./lifecycle-events.js";
import { updateMetadata } from "./metadata.js";
import { getSessionsDir } from "./paths.js";
import {
	evaluateSessionPolicyGate,
	getBlockedPolicyViolations,
	resolveViolationPriority,
	shouldBlockMergeTransition,
	summarizePolicyGate,
	type SessionPolicyEvaluation,
} from "./lifecycle-policy.js";
import type { ReactionTracker, ExecuteReactionDeps } from "./lifecycle-reactions.js";

export interface BotCommentState {
	/** Number of bot comments seen last time we checked */
	lastSeenCount: number;
	/** Timestamp of the most recent bot comment */
	latestCommentAt: Date;
	/** When we last detected new comments (for settle timer) */
	lastNewCommentDetectedAt: Date;
	/** Whether we already fired the reaction for this batch */
	reactionFired: boolean;
	/** When the reaction was last fired (for build-check delay) */
	reactionFiredAt: Date | null;
	/** Whether we already sent the build-check after the review loop converged */
	buildSent: boolean;
	/** When the build-check was sent (for CI poll delay) */
	buildSentAt: Date | null;
	/** Whether we already notified the user that the PR is ready to merge */
	mergeNotified: boolean;
}

/** Settle time: wait this long after last new bot comment before triggering. */
export const BOT_COMMENT_SETTLE_MS = 120_000; // 2 minutes

/** After firing review reaction, wait this long for new comments before sending build check. */
export const BUILD_CHECK_DELAY_MS = 180_000; // 3 minutes

/** After sending build check, wait this long before polling CI status. */
export const CI_POLL_DELAY_MS = 180_000; // 3 minutes

/** Statuses where bot comment detection should run. */
export const BOT_CHECK_STATUSES = new Set<SessionStatus>([
	"working",
	"pr_open",
	"review_pending",
	"ci_failed",
	"changes_requested",
]);

export interface CheckBotCommentsDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
	states: Map<SessionId, SessionStatus>;
	botCommentStates: Map<SessionId, BotCommentState>;
	policyEvaluationBySession: Map<SessionId, SessionPolicyEvaluation>;
	reactionTrackers: Map<string, ReactionTracker>;
	notifyHuman: (event: OrchestratorEvent, priority: EventPriority) => Promise<void>;
	executeReaction: (
		sessionId: SessionId,
		projectId: string,
		reactionKey: string,
		reactionConfig: ReactionConfig,
		deps: ExecuteReactionDeps
	) => Promise<ReactionResult>;
}

/** Check for settled bot review comments on a session's PR and trigger reaction. */
export async function checkBotComments(
	session: Session,
	deps: CheckBotCommentsDeps
): Promise<void> {
	const {
		config,
		registry,
		sessionManager,
		states,
		botCommentStates,
		policyEvaluationBySession,
		reactionTrackers,
		notifyHuman: notify,
		executeReaction,
	} = deps;

	if (!session.pr) {
		botCommentStates.delete(session.id);
		return;
	}

	const currentStatus = states.get(session.id);
	if (!currentStatus || !BOT_CHECK_STATUSES.has(currentStatus)) {
		botCommentStates.delete(session.id);
		return;
	}

	const project = config.projects[session.projectId];
	if (!project?.scm) {
		return;
	}

	const scm = registry.get<SCM>("scm", project.scm.plugin);
	if (!scm) {
		return;
	}

	let comments: Awaited<ReturnType<SCM["getAutomatedComments"]>>;
	try {
		comments = await scm.getAutomatedComments(session.pr);
	} catch {
		return;
	}

	if (comments.length === 0) return;

	const now = new Date();
	const latestComment = comments.reduce(
		(latest, c) => (c.createdAt > latest ? c.createdAt : latest),
		new Date(0)
	);

	const prev = botCommentStates.get(session.id);

	if (!prev) {
		// Restore reaction state from metadata to survive daemon restarts.
		// If we already fired a reaction for this comment count, don't re-fire.
		const firedCount = session.metadata?.botReactionFiredCount
			? Number(session.metadata.botReactionFiredCount)
			: 0;
		const alreadyFired = firedCount > 0 && comments.length <= firedCount;

		botCommentStates.set(session.id, {
			lastSeenCount: comments.length,
			latestCommentAt: latestComment,
			lastNewCommentDetectedAt: now,
			reactionFired: alreadyFired,
			reactionFiredAt: alreadyFired ? now : null,
			buildSent: session.metadata?.botBuildSent === "true",
			buildSentAt: session.metadata?.botBuildSent === "true" ? now : null,
			mergeNotified: session.metadata?.botMergeNotified === "true",
		});
		return;
	}

	const newCommentsArrived =
		comments.length > prev.lastSeenCount ||
		latestComment > prev.latestCommentAt;

	if (newCommentsArrived) {
		prev.lastSeenCount = comments.length;
		prev.latestCommentAt = latestComment;
		prev.lastNewCommentDetectedAt = now;
		if (prev.reactionFired) {
			prev.reactionFired = false;
			prev.reactionFiredAt = null;
			prev.buildSent = false;
			prev.buildSentAt = null;
			prev.mergeNotified = false;
			// Clear persisted state so the reaction can re-fire for new comments
			if (project.path) {
				const sessionsDir = getSessionsDir(config.configPath, project.path);
				updateMetadata(sessionsDir, session.id, {
					botReactionFiredCount: "",
					botBuildSent: "",
					botMergeNotified: "",
				});
			}
		}
		return;
	}

	if (prev.reactionFired) {
		// Step 1: Send /buildit after review loop converges
		if (!prev.buildSent && prev.reactionFiredAt) {
			// Wait for the review-fix agent to exit before sending build-check
			if (session.activity !== "exited") {
				return;
			}
			const sinceReaction = now.getTime() - prev.reactionFiredAt.getTime();
			if (sinceReaction >= BUILD_CHECK_DELAY_MS) {
				await sessionManager.sendOrRestart(
					session.id,
					"# Monitor and Fix CI Build\n\n" +
						"The review comment loop has converged — no new bot comments. " +
						"Now verify the CI build passes.\n\n" +
						"## Steps\n\n" +
						"1. Get the current PR with `gh pr view --json number --jq .number`.\n" +
						"2. Check CI status with `gh pr checks`.\n" +
						"3. If all checks pass, report success and stop.\n" +
						"4. If a check fails, get the logs with `gh run view <run-id> --log-failed`.\n" +
						"5. Diagnose the failure (lint, typecheck, test, build).\n" +
						"6. Fix the code and push the fix.\n" +
						"7. Re-check CI after the push.\n\n" +
						"## Rules\n\n" +
						"- Only fix what's needed to pass CI — no unrelated changes.\n" +
						"- Run `bun run lint && bun run typecheck` locally before pushing.\n"
				);
				prev.buildSent = true;
				prev.buildSentAt = now;
				if (project.path) {
					const sessionsDir = getSessionsDir(config.configPath, project.path);
					updateMetadata(sessionsDir, session.id, { botBuildSent: "true" });
				}
			}
			return;
		}

		// Step 2: After build check sent, poll CI and notify/merge when green
		if (prev.buildSent && !prev.mergeNotified && prev.buildSentAt) {
			const sinceBuild = now.getTime() - prev.buildSentAt.getTime();
			if (sinceBuild < CI_POLL_DELAY_MS) {
				return;
			}

			try {
				const ciStatus = await scm.getCISummary(session.pr);
				if (ciStatus === CI_STATUS.PASSING) {
					const policyEvaluation = await evaluateSessionPolicyGate({
						session,
						project,
						scm,
						config,
						policyEvaluationBySession,
					});
					const policyGate = policyEvaluation?.gate;
					if (policyEvaluation && policyGate && !policyGate.passed) {
						const blockedViolations = getBlockedPolicyViolations({ evaluation: policyEvaluation });
						const violationsForEvent =
							blockedViolations.length > 0
								? blockedViolations
								: policyGate.violations;
						const priority = resolveViolationPriority({
							violations: violationsForEvent,
						});
						const event = createEvent("review.comments_unresolved", {
							sessionId: session.id,
							projectId: session.projectId,
							message: `PR #${session.pr.number}: workflow policy gate failed (${policyGate.mode}) — ${summarizePolicyGate({ policyGate })}`,
							data: {
								mode: policyGate.mode,
								blockedPolicy: policyEvaluation.effectivePolicy.policy.blockedPolicy,
								violations: violationsForEvent,
							},
						});
						await notify(event, priority);

						if (shouldBlockMergeTransition({ evaluation: policyEvaluation })) {
							prev.mergeNotified = true;
							return;
						}
					}

					prev.mergeNotified = true;
					if (project.path) {
						const sessionsDir = getSessionsDir(config.configPath, project.path);
						updateMetadata(sessionsDir, session.id, { botMergeNotified: "true" });
					}

					const mergeReaction =
						project.reactions?.["approved-and-green"] ??
						config.reactions["approved-and-green"];

					if (mergeReaction?.auto === true) {
						try {
							await scm.mergePR(session.pr);
							const event = createEvent("merge.completed", {
								sessionId: session.id,
								projectId: session.projectId,
								message: `PR #${session.pr.number} auto-merged after bot review loop converged and CI passed`,
							});
							await notify(event, "action");
						} catch {
							const event = createEvent("merge.ready", {
								sessionId: session.id,
								projectId: session.projectId,
								message: `PR #${session.pr.number}: bot reviews addressed, CI passing — auto-merge failed, please merge manually`,
							});
							await notify(event, "action");
						}
					} else {
						const event = createEvent("merge.ready", {
							sessionId: session.id,
							projectId: session.projectId,
							message: `PR #${session.pr.number}: all bot review comments addressed, CI passing — ready to merge`,
						});
						await notify(event, "action");
					}
				}
			} catch {
				// SCM check failed — retry next cycle
			}
		}
		return;
	}

	const settleElapsed = now.getTime() - prev.lastNewCommentDetectedAt.getTime();
	if (settleElapsed < BOT_COMMENT_SETTLE_MS) {
		return;
	}

	// Only fire the reaction after the agent has exited.
	// If the agent is still alive, sendOrRestart() would use tmux send-keys
	// into the running Claude TUI, which silently drops the text.
	// Wait for the agent to exit so sendOrRestart() does a clean re-launch.
	if (session.activity !== "exited") {
		return;
	}

	prev.reactionFired = true;
	prev.reactionFiredAt = now;

	// Persist to metadata so daemon restart won't re-fire for the same comments
	if (project.path) {
		const sessionsDir = getSessionsDir(config.configPath, project.path);
		updateMetadata(sessionsDir, session.id, {
			botReactionFiredCount: String(comments.length),
		});
	}

	const reactionKey = "bugbot-comments";
	const globalReaction = config.reactions[reactionKey];
	const projectReaction = project.reactions?.[reactionKey];
	const reactionConfig = projectReaction
		? { ...globalReaction, ...projectReaction }
		: globalReaction;

	if (!reactionConfig || reactionConfig.auto === false) return;

	const executeDeps: ExecuteReactionDeps = {
		config,
		registry,
		sessionManager,
		reactionTrackers,
		notifyHuman: notify,
	};
	try {
		await executeReaction(
			session.id,
			session.projectId,
			reactionKey,
			reactionConfig as ReactionConfig,
			executeDeps
		);
	} catch {
		// plugin error — do not abort the polling cycle
	}
}
