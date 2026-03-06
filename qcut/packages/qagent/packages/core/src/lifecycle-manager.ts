/**
 * Lifecycle Manager — state machine + polling loop + reaction engine.
 *
 * Periodically polls all sessions and:
 * 1. Detects state transitions (spawning → working → pr_open → etc.)
 * 2. Emits events on transitions
 * 3. Triggers reactions (auto-handle CI failures, review comments, etc.)
 * 4. Escalates to human notification when auto-handling fails
 *
 * Reference: scripts/claude-session-status, scripts/claude-review-check
 */

import {
	SESSION_STATUS,
	PR_STATE,
	CI_STATUS,
	type LifecycleManager,
	type SessionManager,
	type SessionId,
	type SessionStatus,
	type OrchestratorEvent,
	type OrchestratorConfig,
	type ReactionConfig,
	type PluginRegistry,
	type Runtime,
	type Agent,
	type SCM,
	type EventPriority,
	type Session,
} from "./types.js";
import { updateMetadata } from "./metadata.js";
import { getSessionsDir } from "./paths.js";
import {
	createEvent,
	statusToEventType,
	eventToReactionKey,
	inferPriority,
} from "./lifecycle-events.js";
import {
	evaluateSessionPolicyGate,
	shouldBlockMergeTransition,
	getBlockedPolicyViolations,
	resolveViolationPriority,
	summarizePolicyGate,
	type SessionPolicyEvaluation,
} from "./lifecycle-policy.js";
import {
	syncIssueStateRouting,
	syncSessionWorkpad,
} from "./lifecycle-tracker.js";
import {
	notifyHuman as notifyHumanImpl,
	executeReaction,
	type ReactionTracker,
	type ExecuteReactionDeps,
} from "./lifecycle-reactions.js";
import {
	checkBotComments,
	type BotCommentState,
	type CheckBotCommentsDeps,
} from "./lifecycle-bot-comments.js";
import {
	ReconciliationLoop,
	type ReconciliationDeps,
} from "./reconciliation-loop.js";

export interface LifecycleManagerDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
}

/** Create a LifecycleManager instance. */
export function createLifecycleManager(
	deps: LifecycleManagerDeps
): LifecycleManager {
	const { config, registry, sessionManager } = deps;

	const states = new Map<SessionId, SessionStatus>();
	const reactionTrackers = new Map<string, ReactionTracker>();
	const botCommentStates = new Map<SessionId, BotCommentState>();
	const policyEvaluationBySession = new Map<SessionId, SessionPolicyEvaluation>();
	/** Tracks how many consecutive polls a session has remained in the same non-terminal status. */
	const stalenessCounts = new Map<SessionId, number>();
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let reconciliationTimer: ReturnType<typeof setInterval> | null = null;
	let polling = false;
	let reconciling = false;
	let allCompleteEmitted = false;
	const reconciliationLoop = new ReconciliationLoop();

	/** Poll counts before a session is considered drifted by status. */
	const STALENESS_THRESHOLDS: Partial<Record<SessionStatus, number>> = {
		working: 20,        // ~10 min at 30s poll
		stuck: 5,           // ~2.5 min — needs faster attention
		needs_input: 5,
		ci_failed: 10,      // ~5 min
		changes_requested: 20,
		pr_open: 20,
		review_pending: 40, // ~20 min — normal to wait for human review
		approved: 10,       // policy gate blocking — escalate sooner
	};

	/** Emit a reconciliation notification when a session has drifted. */
	async function emitDriftEvent(session: Session, status: SessionStatus, count: number): Promise<void> {
		const event = createEvent("reaction.escalated", {
			sessionId: session.id,
			projectId: session.projectId,
			message: `Session \`${session.id}\` has been in \`${status}\` for ${count} consecutive polls without change — possible drift or stuck state.`,
			data: { status, pollCount: count },
		});
		const priority = status === "stuck" || status === "needs_input" ? "urgent" : "warning";
		await notifyHuman(event, priority);
	}

	function notifyHuman(
		event: OrchestratorEvent,
		priority: EventPriority
	): Promise<void> {
		return notifyHumanImpl(event, priority, config, registry);
	}

	function makeReactionDeps(): ExecuteReactionDeps {
		return { config, registry, sessionManager, reactionTrackers, notifyHuman };
	}

	/** Determine current status for a session by polling plugins. */
	async function determineStatus(session: Session): Promise<SessionStatus> {
		const project = config.projects[session.projectId];
		if (!project) return session.status;

		const agentName =
			session.metadata.agent ?? project.agent ?? config.defaults.agent;
		const agent = registry.get<Agent>("agent", agentName);
		const scm = project.scm
			? registry.get<SCM>("scm", project.scm.plugin)
			: null;

		// 1. Check if runtime is alive
		if (session.runtimeHandle) {
			const runtime = registry.get<Runtime>(
				"runtime",
				project.runtime ?? config.defaults.runtime
			);
			if (runtime) {
				const alive = await runtime
					.isAlive(session.runtimeHandle)
					.catch(() => true);
				if (!alive) return "killed";
			}
		}

		// 2. Check agent activity via terminal output + process liveness
		if (agent && session.runtimeHandle) {
			try {
				const runtime = registry.get<Runtime>(
					"runtime",
					project.runtime ?? config.defaults.runtime
				);
				const terminalOutput = runtime
					? await runtime.getOutput(session.runtimeHandle, 10)
					: "";
				// Only trust detectActivity when we actually have terminal output;
				// empty output means the runtime probe failed, not that the agent exited.
				if (terminalOutput) {
					const activity = agent.detectActivity(terminalOutput);
					if (activity === "waiting_input") return "needs_input";

					// Check whether the agent process is still alive. Some agents
					// (codex, aider, opencode) return "active" for any non-empty
					// terminal output, including the shell prompt visible after exit.
					const processAlive = await agent.isProcessRunning(
						session.runtimeHandle
					);
					if (!processAlive) return "killed";
				}
			} catch {
				// On probe failure, preserve current stuck/needs_input state rather
				// than letting the fallback at the bottom coerce them to "working"
				if (
					session.status === SESSION_STATUS.STUCK ||
					session.status === SESSION_STATUS.NEEDS_INPUT
				) {
					return session.status;
				}
			}
		}

		// 3. Auto-detect PR by branch if metadata.pr is missing.
		//    Critical for agents without auto-hook systems (Codex, Aider, OpenCode).
		if (!session.pr && scm && session.branch) {
			try {
				const detectedPR = await scm.detectPR(session, project);
				if (detectedPR) {
					session.pr = detectedPR;
					const sessionsDir = getSessionsDir(config.configPath, project.path);
					updateMetadata(sessionsDir, session.id, { pr: detectedPR.url });
				}
			} catch {
				// SCM detection failed — will retry next poll
			}
		}

		// 4. Check PR state if PR exists
		if (session.pr && scm) {
			try {
				const prState = await scm.getPRState(session.pr);
				if (prState === PR_STATE.MERGED) return "merged";
				if (prState === PR_STATE.CLOSED) return "killed";
			} catch {
				return session.status;
			}

			let ciStatus: string | null = null;
			try {
				ciStatus = await scm.getCISummary(session.pr);
			} catch {
				ciStatus = null;
			}
			if (ciStatus === CI_STATUS.FAILING) return "ci_failed";

			let reviewDecision: string;
			try {
				reviewDecision = await scm.getReviewDecision(session.pr);
			} catch {
				return session.status;
			}

			if (reviewDecision === "changes_requested") {
				policyEvaluationBySession.delete(session.id);
				return "changes_requested";
			}
			if (reviewDecision === "approved") {
				try {
					const mergeReady = await scm.getMergeability(session.pr);
					if (mergeReady.mergeable) {
						const policyEvaluation = await evaluateSessionPolicyGate({
							session,
							project,
							scm,
							config,
							policyEvaluationBySession,
						});
						if (
							policyEvaluation &&
							shouldBlockMergeTransition({ evaluation: policyEvaluation })
						) {
							return "approved";
						}
						return "mergeable";
					}
				} catch {
					return "approved";
				}
				policyEvaluationBySession.delete(session.id);
				return "approved";
			}
			if (reviewDecision === "pending") {
				policyEvaluationBySession.delete(session.id);
				return "review_pending";
			}

			policyEvaluationBySession.delete(session.id);
			return "pr_open";
		}
		policyEvaluationBySession.delete(session.id);

		// 5. Default: if agent is active, it's working
		if (
			session.status === "spawning" ||
			session.status === SESSION_STATUS.STUCK ||
			session.status === SESSION_STATUS.NEEDS_INPUT
		) {
			return "working";
		}
		return session.status;
	}

	/** Poll a single session and handle state transitions. */
	async function checkSession(session: Session): Promise<void> {
		const tracked = states.get(session.id);
		const oldStatus =
			tracked ??
			((session.metadata?.status as SessionStatus | undefined) ||
				session.status);
		const newStatus = await determineStatus(session);
		const project = config.projects[session.projectId];

		if (newStatus !== oldStatus) {
			states.set(session.id, newStatus);
			stalenessCounts.delete(session.id); // reset drift counter on any status change

			if (project) {
				const sessionsDir = getSessionsDir(config.configPath, project.path);
				updateMetadata(sessionsDir, session.id, { status: newStatus });
			}

			// Reset allCompleteEmitted when any session becomes active again
			if (newStatus !== "merged" && newStatus !== "killed") {
				allCompleteEmitted = false;
			}

			// Clear reaction trackers for the old status so retries reset on state changes
			const oldEventType = statusToEventType(undefined, oldStatus);
			if (oldEventType) {
				const oldReactionKey = eventToReactionKey(oldEventType);
				if (oldReactionKey) {
					reactionTrackers.delete(`${session.id}:${oldReactionKey}`);
				}
			}

			if (project) {
				await syncIssueStateRouting({
					session,
					project,
					oldStatus,
					newStatus,
					config,
					registry,
					notifyHuman,
				});
				await syncSessionWorkpad({
					session,
					project,
					status: newStatus,
					config,
					registry,
					policyEvaluationBySession,
					notifyHuman,
				});
			}

			const eventType = statusToEventType(oldStatus, newStatus);
			if (eventType) {
				let reactionHandledNotify = false;
				const reactionKey = eventToReactionKey(eventType);

				if (reactionKey) {
					const globalReaction = config.reactions[reactionKey];
					const projectReaction = project?.reactions?.[reactionKey];
					const reactionConfig = projectReaction
						? { ...globalReaction, ...projectReaction }
						: globalReaction;

					if (reactionConfig && reactionConfig.action) {
						if (
							reactionConfig.auto !== false ||
							reactionConfig.action === "notify"
						) {
							await executeReaction(
								session.id,
								session.projectId,
								reactionKey,
								reactionConfig as ReactionConfig,
								makeReactionDeps()
							);
							reactionHandledNotify = true;
						}
					}
				}

				if (!reactionHandledNotify) {
					const priority = inferPriority(eventType);
					if (priority !== "info") {
						const event = createEvent(eventType, {
							sessionId: session.id,
							projectId: session.projectId,
							message: `${session.id}: ${oldStatus} → ${newStatus}`,
							data: { oldStatus, newStatus },
						});
						await notifyHuman(event, priority);
					}
				}
			}

			const policyEvaluation = policyEvaluationBySession.get(session.id);
			const policyGate = policyEvaluation?.gate;
			if (policyEvaluation && policyGate && !policyGate.passed) {
				const blockedViolations = getBlockedPolicyViolations({ evaluation: policyEvaluation });
				const hasBlockedViolations = blockedViolations.length > 0;
				const enforcedBlockedMerge =
					shouldBlockMergeTransition({ evaluation: policyEvaluation }) &&
					oldStatus !== "approved" &&
					newStatus === "approved";
				const advisoryViolation =
					policyGate.mode === "advisory" && newStatus === "mergeable";
				const notifyBlockedViolations =
					hasBlockedViolations &&
					policyEvaluation.effectivePolicy.policy.blockedPolicy.escalation === "notify";

				if (enforcedBlockedMerge || advisoryViolation || notifyBlockedViolations) {
					const violationsForEvent = hasBlockedViolations
						? blockedViolations
						: policyGate.violations;
					const priority = resolveViolationPriority({
						violations: violationsForEvent,
					});
					const event = createEvent("review.comments_unresolved", {
						sessionId: session.id,
						projectId: session.projectId,
						message: `${session.id}: workflow policy gate failed (${policyGate.mode}) — ${summarizePolicyGate({ policyGate })}`,
						data: {
							mode: policyGate.mode,
							oldStatus,
							newStatus,
							blockedPolicy: policyEvaluation.effectivePolicy.policy.blockedPolicy,
							violations: violationsForEvent,
						},
					});
					await notifyHuman(event, priority);
				}
			}
		} else {
			states.set(session.id, newStatus);

			// Drift detection: track consecutive same-status polls for non-terminal sessions
			const threshold = STALENESS_THRESHOLDS[newStatus];
			if (threshold !== undefined) {
				const prev = stalenessCounts.get(session.id) ?? 0;
				const next = prev + 1;
				stalenessCounts.set(session.id, next);
				// Fire once when threshold is exactly crossed to avoid spam
				if (next === threshold) {
					await emitDriftEvent(session, newStatus, next).catch(() => undefined);
				}
			}
		}
	}

	/** Run one polling cycle across all sessions. */
	async function pollAll(): Promise<void> {
		if (polling) return;
		polling = true;

		try {
			const sessions = await sessionManager.list();

			const sessionsToCheck = sessions.filter((s) => {
				if (s.status !== "merged" && s.status !== "killed") return true;
				const tracked = states.get(s.id);
				return tracked !== undefined && tracked !== s.status;
			});

			await Promise.allSettled(sessionsToCheck.map((s) => checkSession(s)));

			// Parallel check: detect settled bot review comments on open PRs
			const sessionsWithPRs = sessionsToCheck.filter((s) => s.pr != null);
			const botDeps: CheckBotCommentsDeps = {
				config,
				registry,
				sessionManager,
				states,
				botCommentStates,
				policyEvaluationBySession,
				reactionTrackers,
				notifyHuman,
				executeReaction,
			};
			await Promise.allSettled(
				sessionsWithPRs.map((s) => checkBotComments(s, botDeps))
			);

			// Prune stale entries for sessions no longer in the list
			const currentSessionIds = new Set(sessions.map((s) => s.id));
			for (const trackedId of states.keys()) {
				if (!currentSessionIds.has(trackedId)) states.delete(trackedId);
			}
			for (const trackerKey of reactionTrackers.keys()) {
				const sessionId = trackerKey.split(":")[0];
				if (sessionId && !currentSessionIds.has(sessionId)) {
					reactionTrackers.delete(trackerKey);
				}
			}
			for (const trackedId of botCommentStates.keys()) {
				if (!currentSessionIds.has(trackedId)) botCommentStates.delete(trackedId);
			}
			for (const trackedId of policyEvaluationBySession.keys()) {
				if (!currentSessionIds.has(trackedId)) policyEvaluationBySession.delete(trackedId);
			}
			for (const trackedId of stalenessCounts.keys()) {
				if (!currentSessionIds.has(trackedId)) stalenessCounts.delete(trackedId);
			}

			// Check if all sessions are complete (trigger reaction only once)
			const activeSessions = sessions.filter(
				(s) => s.status !== "merged" && s.status !== "killed"
			);
			if (
				sessions.length > 0 &&
				activeSessions.length === 0 &&
				!allCompleteEmitted
			) {
				allCompleteEmitted = true;

				const reactionKey = eventToReactionKey("summary.all_complete");
				if (reactionKey) {
					const reactionConfig = config.reactions[reactionKey];
					if (reactionConfig && reactionConfig.action) {
						if (
							reactionConfig.auto !== false ||
							reactionConfig.action === "notify"
						) {
							await executeReaction(
								"system",
								"all",
								reactionKey,
								reactionConfig as ReactionConfig,
								makeReactionDeps()
							);
						}
					}
				}
			}
		} catch {
			// Poll cycle failed — will retry next interval
		} finally {
			polling = false;
		}
	}

	/** Run the reconciliation pass across all active sessions. */
	async function runReconciliation(): Promise<void> {
		if (polling || reconciling) return;
		reconciling = true;
		try {
			const sessions = await sessionManager.list();
			const reconciliationDeps: ReconciliationDeps = {
				config,
				registry,
				sessionManager,
				applyStatus: async (session, newStatus) => {
					// Directly apply the reconciled status without re-running the poll cycle.
					// Calling checkSession here would re-determine status and emit events
					// based on the calculated (possibly different) status before overwriting.
					states.set(session.id, newStatus);
					stalenessCounts.delete(session.id);
					const project = config.projects[session.projectId];
					if (project) {
						const sessionsDir = getSessionsDir(config.configPath, project.path);
						updateMetadata(sessionsDir, session.id, { status: newStatus });
					}
				},
				notifyHuman,
			};
			await reconciliationLoop.run(sessions, reconciliationDeps);
		} catch {
			// Reconciliation errors are non-fatal — the next pass will retry
		} finally {
			reconciling = false;
		}
	}

	return {
		start(intervalMs = 30_000): void {
			if (pollTimer) return;
			pollTimer = setInterval(() => void pollAll(), intervalMs);
			void pollAll();

			// Start reconciliation at 5× the main poll interval (configurable)
			const reconInterval =
				config.reconciliationIntervalMs ?? intervalMs * 5;
			if (reconInterval > 0) {
				reconciliationTimer = setInterval(
					() => void runReconciliation(),
					reconInterval
				);
			}
		},

		stop(): void {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			if (reconciliationTimer) {
				clearInterval(reconciliationTimer);
				reconciliationTimer = null;
			}
		},

		getStates(): Map<SessionId, SessionStatus> {
			return new Map(states);
		},

		async check(sessionId: SessionId): Promise<void> {
			const session = await sessionManager.get(sessionId);
			if (!session) throw new Error(`Session ${sessionId} not found`);
			await checkSession(session);
		},
	};
}
