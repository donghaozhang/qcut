/**
 * @composio/ao-core
 *
 * Core library for the Agent Orchestrator.
 * Exports all types, config loader, and service implementations.
 */

// Types — everything plugins and consumers need
export * from "./types.js";

// Config — YAML loader + validation
export {
	loadConfig,
	loadConfigWithPath,
	validateConfig,
	getDefaultConfig,
	findConfig,
	findConfigFile,
} from "./config.js";

// Plugin registry
export { createPluginRegistry } from "./plugin-registry.js";

// Metadata — flat-file session metadata read/write
export {
	readMetadata,
	readMetadataRaw,
	writeMetadata,
	updateMetadata,
	deleteMetadata,
	listMetadata,
} from "./metadata.js";

// tmux — command wrappers
export {
	isTmuxAvailable,
	listSessions as listTmuxSessions,
	hasSession as hasTmuxSession,
	newSession as newTmuxSession,
	sendKeys as tmuxSendKeys,
	capturePane as tmuxCapturePane,
	killSession as killTmuxSession,
	getPaneTTY as getTmuxPaneTTY,
} from "./tmux.js";
export type { TmuxSessionInfo } from "./tmux.js";

// Session manager — session CRUD
export { createSessionManager } from "./session-manager.js";
export type { SessionManagerDeps } from "./session-manager.js";

// Lifecycle manager — state machine + reaction engine
export { createLifecycleManager } from "./lifecycle-manager.js";
export type { LifecycleManagerDeps } from "./lifecycle-manager.js";

// Team manager — filesystem inbox queue for teammate communication
export {
	createTeamManager,
	parseTeamProtocolMessage,
	TEAM_PROTOCOL_TYPE,
} from "./team-manager.js";
export type {
	TeamManager,
	TeamManagerConfig,
	TeamDefinition,
	TeamMessage,
	TeamProtocolPayload,
	TeamReadInboxInput,
	TeamSendMessageInput,
	TeamSendProtocolInput,
} from "./team-manager.js";

// Prompt builder — layered prompt composition
export { buildPrompt, BASE_AGENT_PROMPT } from "./prompt-builder.js";
export type { PromptBuildConfig } from "./prompt-builder.js";

// Workflow contract + policy gates
export {
	DEFAULT_WORKFLOW_POLICY,
	POLICY_BLOCKER_CLASS,
	loadWorkflowContract,
	parseWorkflowContract,
	resolveEffectiveWorkflowPolicy,
	resolveWorkflowContractPath,
} from "./workflow-contract.js";
export type {
	PolicyBlockerClass,
	WorkflowPolicy,
	WorkflowReviewGate,
	WorkflowMergeGate,
	WorkflowBlockedPolicy,
	WorkflowContract,
	WorkflowContractPathResult,
	EffectiveWorkflowPolicy,
} from "./workflow-contract.js";
export { collectPRFeedbackSweep } from "./review-sweep.js";
export type {
	PRFeedbackActionItem,
	PRFeedbackSweepResult,
} from "./review-sweep.js";
export { evaluatePolicyGate } from "./policy-gate.js";
export type {
	PolicyGateViolation,
	RequiredCheckStatus,
	PolicyGateResult,
} from "./policy-gate.js";

// Orchestrator prompt — generates orchestrator context for `ao start`
export { generateOrchestratorPrompt } from "./orchestrator-prompt.js";
export type { OrchestratorPromptConfig } from "./orchestrator-prompt.js";

// Reconciliation loop — drift detection and auto-correction
export { ReconciliationLoop } from "./reconciliation-loop.js";
export type { ReconciliationDeps } from "./reconciliation-loop.js";

// Workpad schema — canonical WorkpadSnapshot type and rendering helpers
export {
	buildWorkpadSnapshot,
	renderWorkpadBody,
	parseWorkpadSnapshot,
} from "./workpad-schema.js";
export type {
	WorkpadSnapshot,
	WorkpadPolicyGate,
	WorkpadBlockerBrief,
	WorkpadRef,
} from "./workpad-schema.js";

// Escalation templates — per-project/per-severity notification playbooks
export {
	resolveEscalationTemplate,
	renderEscalationMessage,
	parseEscalationTemplates,
} from "./escalation-template.js";
export type {
	EscalationTemplate,
	EscalationSeverity,
	EscalationAutoAction,
	EscalationContext,
} from "./escalation-template.js";

// Shared utilities
export {
	shellEscape,
	escapeAppleScript,
	validateUrl,
	readLastJsonlEntry,
} from "./utils.js";

// Path utilities — hash-based directory structure
export {
	generateConfigHash,
	generateProjectId,
	generateInstanceId,
	generateSessionPrefix,
	getProjectBaseDir,
	getSessionsDir,
	getWorktreesDir,
	getArchiveDir,
	getOriginFilePath,
	generateSessionName,
	generateTmuxName,
	parseTmuxName,
	expandHome,
	validateAndStoreOrigin,
} from "./paths.js";
