/**
 * Service interfaces — SessionManager, LifecycleManager, PluginRegistry.
 * Plus error detection helpers and custom error classes.
 */

import type {
  SessionId,
  SessionStatus,
  Session,
  SessionSpawnConfig,
  OrchestratorSpawnConfig,
} from "./session-types.js";
import type { OrchestratorConfig } from "./config-types.js";
import type {
  PluginSlot,
  PluginManifest,
  PluginModule,
} from "./plugin-types.js";
import type { IssueDiscoveryResult } from "../issue-discovery.js";

// =============================================================================
// SERVICE INTERFACES (core, not pluggable)
// =============================================================================

/** Session manager — CRUD for sessions */
export interface SessionManager {
  spawn(config: SessionSpawnConfig): Promise<Session>;
  spawnOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>;
  restore(sessionId: SessionId): Promise<Session>;
  list(projectId?: string): Promise<Session[]>;
  get(sessionId: SessionId): Promise<Session | null>;
  kill(sessionId: SessionId): Promise<void>;
  cleanup(
    projectId?: string,
    options?: { dryRun?: boolean },
  ): Promise<CleanupResult>;
  send(sessionId: SessionId, message: string): Promise<void>;
  /** Send message to agent, re-launching if agent process has exited */
  sendOrRestart(sessionId: SessionId, message: string): Promise<{ restarted: boolean }>;
}

export interface CleanupResult {
  killed: string[];
  skipped: string[];
  errors: Array<{ sessionId: string; error: string }>;
}

/** Lifecycle manager — state machine + reaction engine */
export interface LifecycleManager {
  /** Start the lifecycle polling loop */
  start(intervalMs?: number): void;

  /** Stop the lifecycle polling loop */
  stop(): void;

  /** Get current state for all sessions */
  getStates(): Map<SessionId, SessionStatus>;

  /** Force-check a specific session now */
  check(sessionId: SessionId): Promise<void>;

  /** Run one issue discovery cycle across all enabled projects */
  runDiscovery(): Promise<IssueDiscoveryResult[]>;
}

/** Plugin registry — discovery + loading */
export interface PluginRegistry {
  /** Register a plugin, optionally with config to pass to create() */
  register(plugin: PluginModule, config?: Record<string, unknown>): void;

  /** Get a plugin by slot and name */
  get<T>(slot: PluginSlot, name: string): T | null;

  /** List plugins for a slot */
  list(slot: PluginSlot): PluginManifest[];

  /** Load built-in plugins, optionally with orchestrator config for plugin settings */
  loadBuiltins(
    config?: OrchestratorConfig,
    importFn?: (pkg: string) => Promise<unknown>,
  ): Promise<void>;

  /** Load plugins from config (npm packages, local paths) */
  loadFromConfig(
    config: OrchestratorConfig,
    importFn?: (pkg: string) => Promise<unknown>,
  ): Promise<void>;
}

// =============================================================================
// ERROR DETECTION HELPERS
// =============================================================================

/**
 * Detect if an error indicates that an issue was not found in the tracker.
 * Used by spawn validation to distinguish "not found" from other errors (auth, network, etc).
 *
 * Uses specific patterns to avoid matching infrastructure errors like "API key not found",
 * "Team not found", "Configuration not found", etc.
 */
export function isIssueNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const raw = (err as Record<string, unknown>).message;
  if (typeof raw !== "string") return false;
  const message = raw.toLowerCase();

  // Match issue-specific not-found patterns
  return (
    (message.includes("issue") &&
      (message.includes("not found") || message.includes("does not exist"))) ||
    message.includes("no issue found") ||
    message.includes("could not find issue") ||
    // GitHub: "no issue found" or "could not resolve to an Issue"
    message.includes("could not resolve to an issue") ||
    // Linear: "Issue <id> not found" or "No issue with identifier"
    message.includes("no issue with identifier")
  );
}

// =============================================================================
// RECONCILIATION TYPES
// =============================================================================

export type DriftKind =
  | "pr_merged_externally"
  | "pr_closed_externally"
  | "issue_closed_externally"
  | "policy_gate_changed";

export interface DriftEvent {
  sessionId: SessionId;
  projectId: string;
  kind: DriftKind;
  /** Human-readable description of what drifted */
  description: string;
  /** Whether the reconciliation loop corrected it automatically */
  corrected: boolean;
  /** New status applied (if corrected) */
  newStatus?: SessionStatus;
  timestamp: Date;
}

export interface ReconciliationResult {
  sessionId: SessionId;
  drifts: DriftEvent[];
}

// =============================================================================
// ERRORS
// =============================================================================

/** Thrown when a session cannot be restored (e.g. merged, still working). */
export class SessionNotRestorableError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly reason: string,
  ) {
    super(`Session ${sessionId} cannot be restored: ${reason}`);
    this.name = "SessionNotRestorableError";
  }
}

/** Thrown when a workspace is missing and cannot be recreated. */
export class WorkspaceMissingError extends Error {
  constructor(
    public readonly path: string,
    public readonly detail?: string,
  ) {
    super(`Workspace missing at ${path}${detail ? `: ${detail}` : ""}`);
    this.name = "WorkspaceMissingError";
  }
}
