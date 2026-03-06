/**
 * Pure utility functions for the lifecycle manager.
 * No shared state — safe to import from any module.
 */

import { randomUUID } from "node:crypto";
import type {
	EventType,
	EventPriority,
	OrchestratorEvent,
	SessionId,
	SessionStatus,
} from "./types.js";

/** Parse a duration string like "10m", "30s", "1h" to milliseconds. */
export function parseDuration(str: string): number {
	const match = str.match(/^(\d+)(s|m|h)$/);
	if (!match) return 0;
	const value = parseInt(match[1], 10);
	switch (match[2]) {
		case "s":
			return value * 1000;
		case "m":
			return value * 60_000;
		case "h":
			return value * 3_600_000;
		default:
			return 0;
	}
}

/** Infer a reasonable priority from event type. */
export function inferPriority(type: EventType): EventPriority {
	if (
		type.includes("stuck") ||
		type.includes("needs_input") ||
		type.includes("errored")
	) {
		return "urgent";
	}
	if (type.startsWith("summary.")) {
		return "info";
	}
	if (
		type.includes("approved") ||
		type.includes("ready") ||
		type.includes("merged") ||
		type.includes("completed")
	) {
		return "action";
	}
	if (
		type.includes("fail") ||
		type.includes("changes_requested") ||
		type.includes("conflicts")
	) {
		return "warning";
	}
	return "info";
}

/** Create an OrchestratorEvent with defaults filled in. */
export function createEvent(
	type: EventType,
	opts: {
		sessionId: SessionId;
		projectId: string;
		message: string;
		priority?: EventPriority;
		data?: Record<string, unknown>;
	}
): OrchestratorEvent {
	return {
		id: randomUUID(),
		type,
		priority: opts.priority ?? inferPriority(type),
		sessionId: opts.sessionId,
		projectId: opts.projectId,
		timestamp: new Date(),
		message: opts.message,
		data: opts.data ?? {},
	};
}

/** Determine which event type corresponds to a status transition. */
export function statusToEventType(
	_from: SessionStatus | undefined,
	to: SessionStatus
): EventType | null {
	switch (to) {
		case "working":
			return "session.working";
		case "pr_open":
			return "pr.created";
		case "ci_failed":
			return "ci.failing";
		case "review_pending":
			return "review.pending";
		case "changes_requested":
			return "review.changes_requested";
		case "approved":
			return "review.approved";
		case "mergeable":
			return "merge.ready";
		case "merged":
			return "merge.completed";
		case "needs_input":
			return "session.needs_input";
		case "stuck":
			return "session.stuck";
		case "errored":
			return "session.errored";
		case "killed":
			return "session.killed";
		default:
			return null;
	}
}

/** Map event type to reaction config key. */
export function eventToReactionKey(eventType: EventType): string | null {
	switch (eventType) {
		case "ci.failing":
			return "ci-failed";
		case "review.changes_requested":
			return "changes-requested";
		case "automated_review.found":
			return "bugbot-comments";
		case "merge.conflicts":
			return "merge-conflicts";
		case "merge.ready":
			return "approved-and-green";
		case "session.stuck":
			return "agent-stuck";
		case "session.needs_input":
			return "agent-needs-input";
		case "session.killed":
			return "agent-exited";
		case "summary.all_complete":
			return "all-complete";
		default:
			return null;
	}
}
