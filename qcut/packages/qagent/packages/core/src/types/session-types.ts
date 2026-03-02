/**
 * Session types — identifiers, lifecycle states, activity detection, metadata.
 */

import type { PRInfo, RuntimeHandle, AgentSessionInfo } from "./plugin-types.js";

// =============================================================================
// SESSION
// =============================================================================

/** Unique session identifier, e.g. "my-app-1", "backend-12" */
export type SessionId = string;

/** Session lifecycle states */
export type SessionStatus =
	| "spawning"
	| "working"
	| "pr_open"
	| "ci_failed"
	| "review_pending"
	| "changes_requested"
	| "approved"
	| "mergeable"
	| "merged"
	| "cleanup"
	| "needs_input"
	| "stuck"
	| "errored"
	| "killed"
	| "done"
	| "terminated";

/** Activity state as detected by the agent plugin */
export type ActivityState =
	| "active" // agent is processing (thinking, writing code)
	| "ready" // agent finished its turn, alive and waiting for input
	| "idle" // agent has been inactive for a while (stale)
	| "waiting_input" // agent is asking a question / permission prompt
	| "blocked" // agent hit an error or is stuck
	| "exited"; // agent process is no longer running

/** Activity state constants */
export const ACTIVITY_STATE = {
	ACTIVE: "active" as const,
	READY: "ready" as const,
	IDLE: "idle" as const,
	WAITING_INPUT: "waiting_input" as const,
	BLOCKED: "blocked" as const,
	EXITED: "exited" as const,
} satisfies Record<string, ActivityState>;

/** Result of activity detection, carrying both the state and an optional timestamp. */
export interface ActivityDetection {
	state: ActivityState;
	/** When activity was last observed (e.g., agent log file mtime) */
	timestamp?: Date;
}

/** Default threshold (ms) before a "ready" session becomes "idle". */
export const DEFAULT_READY_THRESHOLD_MS = 300_000; // 5 minutes

/** Session status constants */
export const SESSION_STATUS = {
	SPAWNING: "spawning" as const,
	WORKING: "working" as const,
	PR_OPEN: "pr_open" as const,
	CI_FAILED: "ci_failed" as const,
	REVIEW_PENDING: "review_pending" as const,
	CHANGES_REQUESTED: "changes_requested" as const,
	APPROVED: "approved" as const,
	MERGEABLE: "mergeable" as const,
	MERGED: "merged" as const,
	CLEANUP: "cleanup" as const,
	NEEDS_INPUT: "needs_input" as const,
	STUCK: "stuck" as const,
	ERRORED: "errored" as const,
	KILLED: "killed" as const,
	DONE: "done" as const,
	TERMINATED: "terminated" as const,
} satisfies Record<string, SessionStatus>;

/** Statuses that indicate the session is in a terminal (dead) state. */
export const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set([
	"killed",
	"terminated",
	"done",
	"cleanup",
	"errored",
	"merged",
]);

/** Activity states that indicate the session is no longer running. */
export const TERMINAL_ACTIVITIES: ReadonlySet<ActivityState> = new Set([
	"exited",
]);

/** Statuses that must never be restored (e.g. already merged). */
export const NON_RESTORABLE_STATUSES: ReadonlySet<SessionStatus> = new Set([
	"merged",
]);

/** Check if a session is in a terminal (dead) state. */
export function isTerminalSession(session: {
	status: SessionStatus;
	activity: ActivityState | null;
}): boolean {
	return (
		TERMINAL_STATUSES.has(session.status) ||
		(session.activity !== null && TERMINAL_ACTIVITIES.has(session.activity))
	);
}

/** Check if a session can be restored. */
export function isRestorable(session: {
	status: SessionStatus;
	activity: ActivityState | null;
}): boolean {
	return (
		isTerminalSession(session) && !NON_RESTORABLE_STATUSES.has(session.status)
	);
}

/** A running agent session */
export interface Session {
	/** Unique session ID, e.g. "my-app-3" */
	id: SessionId;

	/** Which project this session belongs to */
	projectId: string;

	/** Current lifecycle status */
	status: SessionStatus;

	/** Activity state from agent plugin (null = not yet determined) */
	activity: ActivityState | null;

	/** Git branch name */
	branch: string | null;

	/** Issue identifier (if working on an issue) */
	issueId: string | null;

	/** PR info (once PR is created) */
	pr: PRInfo | null;

	/** Workspace path on disk */
	workspacePath: string | null;

	/** Runtime handle for communicating with the session */
	runtimeHandle: RuntimeHandle | null;

	/** Agent session info (summary, cost, etc.) */
	agentInfo: AgentSessionInfo | null;

	/** When the session was created */
	createdAt: Date;

	/** Last activity timestamp */
	lastActivityAt: Date;

	/** When this session was last restored (undefined if never restored) */
	restoredAt?: Date;

	/** Metadata key-value pairs */
	metadata: Record<string, string>;
}

/** Config for creating a new session */
export interface SessionSpawnConfig {
	projectId: string;
	issueId?: string;
	branch?: string;
	prompt?: string;
	/** Override the agent plugin for this session (e.g. "codex", "claude-code") */
	agent?: string;
}

/** Config for creating an orchestrator session */
export interface OrchestratorSpawnConfig {
	projectId: string;
	systemPrompt?: string;
}

// =============================================================================
// SESSION METADATA (flat file format)
// =============================================================================

/**
 * Session metadata stored as flat key=value files.
 * Matches the existing bash script format for backwards compatibility.
 *
 * Note: In the new architecture, session files are named with user-facing names
 * (e.g., "int-1") and contain a tmuxName field for the globally unique tmux name
 * (e.g., "a3b4c5d6e7f8-int-1").
 */
export interface SessionMetadata {
	worktree: string;
	branch: string;
	status: string;
	tmuxName?: string; // Globally unique tmux session name (includes hash)
	issue?: string;
	pr?: string;
	summary?: string;
	project?: string;
	agent?: string; // Agent plugin name (e.g. "codex", "claude-code") — persisted for lifecycle
	createdAt?: string;
	runtimeHandle?: string;
	restoredAt?: string;
	dashboardPort?: number;
	terminalWsPort?: number;
	directTerminalWsPort?: number;
}
