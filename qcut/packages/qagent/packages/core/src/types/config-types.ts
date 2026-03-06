/**
 * Configuration types — OrchestratorConfig, ProjectConfig, events, reactions.
 */

import type { SessionId } from "./session-types.js";

/** Workflow policy mode for delivery gates */
export type PolicyMode = "advisory" | "enforced";

// =============================================================================
// EVENTS
// =============================================================================

/** Priority levels for events — determines notification routing */
export type EventPriority = "urgent" | "action" | "warning" | "info";

/** All orchestrator event types */
export type EventType =
  // Session lifecycle
  | "session.spawned"
  | "session.working"
  | "session.exited"
  | "session.killed"
  | "session.stuck"
  | "session.needs_input"
  | "session.errored"
  // PR lifecycle
  | "pr.created"
  | "pr.updated"
  | "pr.merged"
  | "pr.closed"
  // CI
  | "ci.passing"
  | "ci.failing"
  | "ci.fix_sent"
  | "ci.fix_failed"
  // Reviews
  | "review.pending"
  | "review.approved"
  | "review.changes_requested"
  | "review.comments_sent"
  | "review.comments_unresolved"
  // Automated reviews
  | "automated_review.found"
  | "automated_review.fix_sent"
  // Merge
  | "merge.ready"
  | "merge.conflicts"
  | "merge.completed"
  // Reactions
  | "reaction.triggered"
  | "reaction.escalated"
  // Reconciliation drift
  | "drift.detected"
  | "drift.corrected"
  | "drift.escalated"
  // Summary
  | "summary.all_complete";

/** An event emitted by the orchestrator */
export interface OrchestratorEvent {
  id: string;
  type: EventType;
  priority: EventPriority;
  sessionId: SessionId;
  projectId: string;
  timestamp: Date;
  message: string;
  data: Record<string, unknown>;
}

// =============================================================================
// REACTIONS
// =============================================================================

/** A configured automatic reaction to an event */
export interface ReactionConfig {
  /** Whether this reaction is enabled */
  auto: boolean;

  /** What to do: send message to agent, notify human, auto-merge */
  action: "send-to-agent" | "notify" | "auto-merge" | "send-structured-review";

  /** Message to send (for send-to-agent) */
  message?: string;

  /** Priority for notifications */
  priority?: EventPriority;

  /** How many times to retry send-to-agent before escalating */
  retries?: number;

  /** Escalate to human notification after this many failures or this duration */
  escalateAfter?: number | string;

  /** Threshold duration for time-based triggers (e.g. "10m" for stuck detection) */
  threshold?: string;

  /** Whether to include a summary in the notification */
  includeSummary?: boolean;
}

export interface ReactionResult {
  reactionType: string;
  success: boolean;
  action: string;
  message?: string;
  escalated: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Top-level orchestrator configuration (from qagent.yaml) */
export interface OrchestratorConfig {
  /**
   * Path to the config file (set automatically during load).
   * Used for hash-based directory structure.
   * All paths are auto-derived from this location.
   */
  configPath: string;

  /** Web dashboard port (defaults to 3000) */
  port?: number;

  /** Terminal WebSocket server port (defaults to 3001) */
  terminalPort?: number;

  /** Direct terminal WebSocket server port (defaults to 3003) */
  directTerminalPort?: number;

  /** Milliseconds before a "ready" session becomes "idle" (default: 300000 = 5 min) */
  readyThresholdMs: number;

  /** Optional global workflow contract path (resolved relative to each project path) */
  workflowContractPath?: string;

  /**
   * How often the reconciliation loop runs (ms). Defaults to 5× the main poll interval.
   * Set to 0 to disable reconciliation.
   */
  reconciliationIntervalMs?: number;

  /** Optional global policy mode (project/contract may override) */
  policyMode?: PolicyMode;

  /** Default plugin selections */
  defaults: DefaultPlugins;

  /** Project configurations */
  projects: Record<string, ProjectConfig>;

  /** Notification channel configs */
  notifiers: Record<string, NotifierConfig>;

  /** Notification routing by priority */
  notificationRouting: Record<EventPriority, string[]>;

  /** Default reaction configs */
  reactions: Record<string, ReactionConfig>;
}

export interface DefaultPlugins {
  runtime: string;
  agent: string;
  workspace: string;
  notifiers: string[];
}

export interface ProjectConfig {
  /** Display name */
  name: string;

  /** GitHub repo in "owner/repo" format */
  repo: string;

  /** Local path to the repo */
  path: string;

  /** Default branch (main, master, next, develop, etc.) */
  defaultBranch: string;

  /** Session name prefix (e.g. "app" → "app-1", "app-2") */
  sessionPrefix: string;

  /** Override default runtime */
  runtime?: string;

  /** Override default agent */
  agent?: string;

  /** Override default workspace */
  workspace?: string;

  /** Issue tracker configuration */
  tracker?: TrackerConfig;

  /** SCM configuration (usually inferred from repo) */
  scm?: SCMConfig;

  /** Files/dirs to symlink into workspaces */
  symlinks?: string[];

  /** Commands to run after workspace creation */
  postCreate?: string[];

  /** Agent-specific configuration */
  agentConfig?: AgentSpecificConfig;

  /** Per-project reaction overrides */
  reactions?: Record<string, Partial<ReactionConfig>>;

  /** Inline rules/instructions passed to every agent prompt */
  agentRules?: string;

  /** Path to a file containing agent rules (relative to project path) */
  agentRulesFile?: string;

  /** Rules for the orchestrator agent (stored, reserved for future use) */
  orchestratorRules?: string;

  /** Optional workflow contract path for this project (relative to project.path if not absolute) */
  workflowContractPath?: string;

  /** Optional policy mode override for this project */
  policyMode?: PolicyMode;

  /**
   * Escalation templates for per-project notification playbooks.
   * When a reaction escalates, these templates are checked first before
   * falling back to the built-in escalation messages.
   * May also be parsed from WORKFLOW.md front matter `blocked_policy.templates`.
   */
  escalationTemplates?: import("../escalation-template.js").EscalationTemplate[];
}

export interface TrackerConfig {
  plugin: string;
  /** Plugin-specific config (e.g. teamId for Linear) */
  [key: string]: unknown;
}

export interface SCMConfig {
  plugin: string;
  [key: string]: unknown;
}

export interface NotifierConfig {
  plugin: string;
  [key: string]: unknown;
}

export interface AgentSpecificConfig {
  permissions?: "skip" | "default";
  model?: string;
  [key: string]: unknown;
}
