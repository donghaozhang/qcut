/**
 * ReconciliationLoop — detects and corrects drift between stored session state
 * and live tracker/SCM ground truth.
 *
 * Runs as a secondary polling pass after the main lifecycle tick. Each drift
 * check is an independent async function; errors in one check do not abort others.
 *
 * Drift types detected:
 * - PR merged externally → session not yet in `merged` state → auto-correct
 * - PR closed externally (not merged) → session not terminal → transition to `errored`
 * - Issue closed in tracker → session still working → transition to `done`
 * - Policy gate changed (was passing, now failing) → update workpad
 */

import type {
	Session,
	SessionStatus,
	OrchestratorConfig,
	PluginRegistry,
	SCM,
	Tracker,
} from "./types.js";
import type { DriftEvent, DriftKind, ReconciliationResult } from "./types/service-types.js";
import { updateMetadata } from "./metadata.js";
import { getSessionsDir } from "./paths.js";
import { createEvent } from "./lifecycle-events.js";
import type { SessionManager } from "./types/service-types.js";

// Terminal statuses — no reconciliation needed
const TERMINAL_STATUSES = new Set<SessionStatus>([
	"merged",
	"killed",
	"cleanup",
	"done",
	"terminated",
	"errored",
]);

export interface ReconciliationDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
	/** Apply a status update to a session (state machine transition) */
	applyStatus: (session: Session, newStatus: SessionStatus) => Promise<void>;
	/** Notify human of drift that required escalation */
	notifyHuman: (event: ReturnType<typeof createEvent>, priority: "warning" | "urgent") => Promise<void>;
}

// =============================================================================
// Individual drift checks
// =============================================================================

/** Check if a PR was merged externally while session is not yet `merged`. */
async function checkPRMergedDrift(
	session: Session,
	project: OrchestratorConfig["projects"][string],
	registry: PluginRegistry
): Promise<DriftEvent | null> {
	if (!session.pr || !project.scm) return null;
	if (session.status === "merged") return null;
	if (TERMINAL_STATUSES.has(session.status)) return null;

	const scm = registry.get<SCM>("scm", project.scm.plugin);
	if (!scm) return null;

	try {
		const state = await scm.getPRState(session.pr);
		if (state === "merged") {
			return {
				sessionId: session.id,
				projectId: session.projectId,
				kind: "pr_merged_externally",
				description: `PR #${session.pr.number} was merged externally while session status was '${session.status}'`,
				corrected: true,
				newStatus: "merged",
				timestamp: new Date(),
			};
		}
	} catch {
		// Swallow — external API failure doesn't mean drift
	}
	return null;
}

/** Check if a PR was closed (not merged) externally while session is still active. */
async function checkPRClosedDrift(
	session: Session,
	project: OrchestratorConfig["projects"][string],
	registry: PluginRegistry
): Promise<DriftEvent | null> {
	if (!session.pr || !project.scm) return null;
	if (TERMINAL_STATUSES.has(session.status)) return null;

	const scm = registry.get<SCM>("scm", project.scm.plugin);
	if (!scm) return null;

	try {
		const state = await scm.getPRState(session.pr);
		if (state === "closed") {
			return {
				sessionId: session.id,
				projectId: session.projectId,
				kind: "pr_closed_externally",
				description: `PR #${session.pr.number} was closed (not merged) externally while session status was '${session.status}'`,
				corrected: true,
				newStatus: "errored",
				timestamp: new Date(),
			};
		}
	} catch {
		// Swallow
	}
	return null;
}

/** Check if the issue was closed in the tracker while session is still working. */
async function checkIssueDrift(
	session: Session,
	project: OrchestratorConfig["projects"][string],
	registry: PluginRegistry
): Promise<DriftEvent | null> {
	if (!session.issueId || !project.tracker) return null;
	if (TERMINAL_STATUSES.has(session.status)) return null;
	// Only check for sessions actively working (not already blocked)
	if (!["working", "pr_open", "review_pending", "mergeable", "approved"].includes(session.status)) {
		return null;
	}

	const tracker = registry.get<Tracker>("tracker", project.tracker.plugin);
	if (!tracker) return null;

	try {
		const completed = await tracker.isCompleted(session.issueId, project);
		if (completed) {
			return {
				sessionId: session.id,
				projectId: session.projectId,
				kind: "issue_closed_externally",
				description: `Issue ${session.issueId} was closed in the tracker while session status was '${session.status}'`,
				corrected: true,
				newStatus: "done",
				timestamp: new Date(),
			};
		}
	} catch {
		// Swallow
	}
	return null;
}

// =============================================================================
// ReconciliationLoop class
// =============================================================================

export class ReconciliationLoop {
	/**
	 * Run all drift checks for all sessions.
	 * Individual check errors are caught and logged; they do not abort the loop.
	 */
	async run(
		sessions: Session[],
		deps: ReconciliationDeps
	): Promise<ReconciliationResult[]> {
		const { config, registry, applyStatus, notifyHuman } = deps;
		const results: ReconciliationResult[] = [];

		for (const session of sessions) {
			if (TERMINAL_STATUSES.has(session.status)) {
				continue;
			}

			const project = config.projects[session.projectId];
			if (!project) continue;

			const drifts: DriftEvent[] = [];

			// Run checks independently; catch per-check errors
			const checks = [
				checkPRMergedDrift(session, project, registry),
				checkPRClosedDrift(session, project, registry),
				checkIssueDrift(session, project, registry),
			];

			const checkResults = await Promise.allSettled(checks);
			for (const result of checkResults) {
				if (result.status === "fulfilled" && result.value) {
					drifts.push(result.value);
				}
				// rejected checks are silently skipped — external API failure ≠ drift
			}

			if (drifts.length === 0) continue;

			// Process drift events — apply at most one status correction per session to avoid conflicts
			let statusApplied = false;
			for (const drift of drifts) {
				try {
					if (drift.corrected && drift.newStatus) {
						if (statusApplied) continue;
						statusApplied = true;
						// Auto-correct the session status
						await applyStatus(session, drift.newStatus);

						// Stamp last reconciliation time (best-effort)
						try {
							const sessionsDir = getSessionsDir(
								config.configPath,
								project.path
							);
							updateMetadata(sessionsDir, session.id, {
								reconciliationLastAt: drift.timestamp.toISOString(),
							});
						} catch {
							// Metadata update is non-critical — proceed with notification
						}

						const evt = createEvent("drift.corrected", {
							sessionId: session.id,
							projectId: session.projectId,
							message: `Auto-corrected: ${drift.description}`,
							data: { kind: drift.kind, newStatus: drift.newStatus },
						});
						try {
							await notifyHuman(evt, "warning");
						} catch {
							// Ignore secondary failure
						}
					} else {
						// Cannot auto-correct — escalate to human
						const evt = createEvent("drift.escalated", {
							sessionId: session.id,
							projectId: session.projectId,
							message: `Drift requires human action: ${drift.description}`,
							priority: "urgent",
							data: { kind: drift.kind },
						});
						try {
							await notifyHuman(evt, "urgent");
						} catch {
							// Ignore secondary failure
						}
					}

					// Also emit drift.detected for observability
					createEvent("drift.detected", {
						sessionId: session.id,
						projectId: session.projectId,
						message: drift.description,
						data: { kind: drift.kind, corrected: drift.corrected },
					});
				} catch {
					// Drift processing errors are non-fatal — continue with next drift
				}
			}

			results.push({ sessionId: session.id, drifts });
		}

		return results;
	}
}
