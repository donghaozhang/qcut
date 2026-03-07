/**
 * Agent plugin: Claude Code CLI
 *
 * Knows how to launch Claude Code, detect its activity state,
 * extract session info from JSONL files, and manage workspace hooks.
 */

import {
	shellEscape,
	readLastJsonlEntry,
	DEFAULT_READY_THRESHOLD_MS,
	type Agent,
	type AgentSessionInfo,
	type AgentLaunchConfig,
	type ActivityDetection,
	type CostEstimate,
	type PluginModule,
	type ProjectConfig,
	type RuntimeHandle,
	type Session,
	type WorkspaceHooksConfig,
} from "@composio/ao-core";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	toClaudeProjectPath,
	findLatestSessionFile,
	sessionIdFromFile,
	parseJsonlFileTail,
	extractSummary,
	extractCost,
} from "./jsonl.js";
import { findClaudeProcess } from "./process.js";
import { classifyTerminalOutput } from "./activity.js";
import { setupHookInWorkspace } from "./hooks.js";

// Re-export for consumers that import directly from this module
export { toClaudeProjectPath } from "./jsonl.js";

// =============================================================================
// Plugin Manifest
// =============================================================================

export const manifest = {
	name: "claude-code",
	slot: "agent" as const,
	description: "Agent plugin: Claude Code CLI",
	version: "0.1.0",
};

// =============================================================================
// Agent Implementation
// =============================================================================

function createClaudeCodeAgent(): Agent {
	return {
		name: "claude-code",
		processName: "claude",

		getLaunchCommand(config: AgentLaunchConfig): string {
			// Note: CLAUDECODE is unset via getEnvironment() (set to ""), not here.
			// This command must be safe for both shell and execFile contexts.
			const parts: string[] = ["claude"];

			if (config.permissions === "skip") {
				parts.push("--dangerously-skip-permissions");
			}

			if (config.model) {
				parts.push("--model", shellEscape(config.model));
			}

			if (config.systemPromptFile) {
				// Tell agent to read the system prompt file itself.
				// Avoids $(cat) expansion flooding tmux/process args.
				parts.push(
					"--append-system-prompt",
					shellEscape(
						`Read and follow ALL instructions in ${config.systemPromptFile}`
					)
				);
			} else if (config.systemPrompt) {
				parts.push("--append-system-prompt", shellEscape(config.systemPrompt));
			}

			if (config.promptFile) {
				// Tell the agent to read the prompt file itself.
				// This keeps the shell command tiny — no $(cat) expansion flooding
				// tmux scrollback or process args with 10KB+ of prompt text.
				parts.push(
					"-p",
					shellEscape(
						`Read and follow ALL instructions in ${config.promptFile}`
					)
				);
			} else if (config.prompt) {
				parts.push("-p", shellEscape(config.prompt));
			}

			return parts.join(" ");
		},

		getEnvironment(config: AgentLaunchConfig): Record<string, string> {
			const env: Record<string, string> = {};

			// Unset CLAUDECODE to avoid nested agent conflicts
			env.CLAUDECODE = "";

			// Set session info for introspection
			env.QAGENT_SESSION_ID = config.sessionId;

			// NOTE: QAGENT_PROJECT_ID is NOT set here - it's the caller's responsibility
			// to set it based on their metadata path scheme:
			// - spawn.ts sets it to projectId for project-specific directories
			// - start.ts omits it for orchestrator (flat directories)
			// - session manager omits it (flat directories)

			if (config.issueId) {
				env.QAGENT_ISSUE_ID = config.issueId;
			}

			return env;
		},

		detectActivity(terminalOutput: string) {
			return classifyTerminalOutput(terminalOutput);
		},

		async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
			const pid = await findClaudeProcess(handle);
			return pid !== null;
		},

		async getActivityState(
			session: Session,
			readyThresholdMs?: number
		): Promise<ActivityDetection | null> {
			const threshold = readyThresholdMs ?? DEFAULT_READY_THRESHOLD_MS;

			// Check if process is running first
			const exitedAt = new Date();
			if (!session.runtimeHandle)
				return { state: "exited", timestamp: exitedAt };
			const running = await this.isProcessRunning(session.runtimeHandle);
			if (!running) return { state: "exited", timestamp: exitedAt };

			// Process is running - check JSONL session file for activity
			if (!session.workspacePath) {
				// No workspace path — cannot determine activity without it
				return null;
			}

			const projectPath = toClaudeProjectPath(session.workspacePath);
			const projectDir = join(homedir(), ".claude", "projects", projectPath);

			const sessionFile = await findLatestSessionFile(projectDir);
			if (!sessionFile) {
				// No session file found — cannot determine activity
				return null;
			}

			const entry = await readLastJsonlEntry(sessionFile);
			if (!entry) {
				// Empty file or read error — cannot determine activity
				return null;
			}

			const ageMs = Date.now() - entry.modifiedAt.getTime();
			const timestamp = entry.modifiedAt;

			switch (entry.lastType) {
				case "user":
				case "tool_use":
				case "progress":
					return { state: ageMs > threshold ? "idle" : "active", timestamp };

				case "assistant":
				case "system":
				case "summary":
				case "result":
					return { state: ageMs > threshold ? "idle" : "ready", timestamp };

				case "permission_request":
					return { state: "waiting_input", timestamp };

				case "error":
					return { state: "blocked", timestamp };

				default:
					return { state: ageMs > threshold ? "idle" : "active", timestamp };
			}
		},

		async getSessionInfo(session: Session): Promise<AgentSessionInfo | null> {
			if (!session.workspacePath) return null;

			// Build the Claude project directory path
			const projectPath = toClaudeProjectPath(session.workspacePath);
			const projectDir = join(homedir(), ".claude", "projects", projectPath);

			// Find the latest session JSONL file
			const sessionFile = await findLatestSessionFile(projectDir);
			if (!sessionFile) return null;

			// Parse only the tail — summaries are always near the end, files can be 100MB+
			const lines = await parseJsonlFileTail(sessionFile);
			if (lines.length === 0) return null;

			// Extract session ID from filename
			const agentSessionId = sessionIdFromFile(sessionFile);

			const summaryResult = extractSummary(lines);
			return {
				summary: summaryResult?.summary ?? null,
				summaryIsFallback: summaryResult?.isFallback,
				agentSessionId,
				cost: extractCost(lines),
			};
		},

		async getRestoreCommand(
			session: Session,
			project: ProjectConfig
		): Promise<string | null> {
			if (!session.workspacePath) return null;

			// Find Claude's project directory for this workspace
			const projectPath = toClaudeProjectPath(session.workspacePath);
			const projectDir = join(homedir(), ".claude", "projects", projectPath);

			// Find the latest session JSONL file
			const sessionFile = await findLatestSessionFile(projectDir);
			if (!sessionFile) return null;

			// Extract session UUID from filename
			const sessionUuid = sessionIdFromFile(sessionFile);
			if (!sessionUuid) return null;

			// Build resume command
			const parts: string[] = ["claude", "--resume", shellEscape(sessionUuid)];

			if (project.agentConfig?.permissions === "skip") {
				parts.push("--dangerously-skip-permissions");
			}

			if (project.agentConfig?.model) {
				parts.push("--model", shellEscape(project.agentConfig.model as string));
			}

			return parts.join(" ");
		},

		async setupWorkspaceHooks(
			workspacePath: string,
			_config: WorkspaceHooksConfig
		): Promise<void> {
			// Use absolute path for hook command (specific to this workspace)
			const hookScriptPath = join(
				workspacePath,
				".claude",
				"metadata-updater.sh"
			);
			await setupHookInWorkspace(workspacePath, hookScriptPath);
		},

		async postLaunchSetup(session: Session): Promise<void> {
			if (!session.workspacePath) return;

			// Use absolute path for hook command (specific to this workspace)
			const hookScriptPath = join(
				session.workspacePath,
				".claude",
				"metadata-updater.sh"
			);
			await setupHookInWorkspace(session.workspacePath, hookScriptPath);
		},
	};
}

// =============================================================================
// Plugin Export
// =============================================================================

export function create(): Agent {
	return createClaudeCodeAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
