/**
 * Agent plugin: generic ACP-compatible agent.
 *
 * Works with any agent that implements the Agent Client Protocol:
 * Gemini CLI, OpenCode, Goose, Kiro CLI, and ~25 others.
 *
 * The agent binary is configured via agentConfig.command in qagent.yaml.
 * When paired with runtime-acp, communication happens via structured
 * JSON-RPC instead of terminal scraping.
 *
 * Example config:
 *   defaults:
 *     runtime: acp
 *     agent: acp
 *   projects:
 *     my-app:
 *       agentConfig:
 *         command: "gemini"    # or "opencode", "goose", etc.
 *         permissions: skip
 */

import {
	shellEscape,
	DEFAULT_READY_THRESHOLD_MS,
	type Agent,
	type AgentSessionInfo,
	type AgentLaunchConfig,
	type ActivityState,
	type ActivityDetection,
	type PluginModule,
	type RuntimeHandle,
	type Session,
} from "@composio/ao-core";

export const manifest = {
	name: "acp",
	slot: "agent" as const,
	description: "Agent plugin: generic ACP-compatible agent",
	version: "0.1.0",
};

// =============================================================================
// ACP State Interface (convention shared with runtime-acp)
// =============================================================================

/**
 * Mutable state stored in RuntimeHandle.data.acpState by runtime-acp.
 * Read here for activity detection. No cross-plugin import needed.
 */
interface AcpState {
	lastUpdateType: string | null;
	lastUpdateAt: number;
	promptInProgress: boolean;
}

function getAcpState(handle: RuntimeHandle): AcpState | null {
	if (handle.runtimeName !== "acp") return null;
	const state = handle.data.acpState;
	if (
		typeof state === "object" &&
		state !== null &&
		"lastUpdateAt" in state
	) {
		return state as AcpState;
	}
	return null;
}

// =============================================================================
// Agent Implementation
// =============================================================================

function createAcpAgent(): Agent {
	return {
		name: "acp",
		processName: "acp-agent",

		getLaunchCommand(config: AgentLaunchConfig): string {
			// The agent binary comes from agentConfig.command
			const agentCommand =
				(config.projectConfig.agentConfig?.command as string) ?? "gemini";
			const parts: string[] = [agentCommand];

			if (config.model) {
				parts.push("--model", shellEscape(config.model));
			}

			// ACP agents receive prompts via session/prompt JSON-RPC, not CLI args.
			// The prompt is sent after the ACP handshake by runtime-acp.sendMessage().
			// However, if a promptFile is set, we add it as a CLI arg for agents
			// that support initial prompt files.
			if (config.promptFile) {
				parts.push("--prompt-file", shellEscape(config.promptFile));
			}

			return parts.join(" ");
		},

		getEnvironment(config: AgentLaunchConfig): Record<string, string> {
			const env: Record<string, string> = {};

			env.QAGENT_SESSION_ID = config.sessionId;

			if (config.issueId) {
				env.QAGENT_ISSUE_ID = config.issueId;
			}

			// Tell runtime-acp to auto-approve permissions when skip mode is set
			if (config.permissions === "skip") {
				env.QAGENT_ACP_AUTO_APPROVE = "true";
			}

			return env;
		},

		detectActivity(terminalOutput: string): ActivityState {
			if (!terminalOutput.trim()) return "idle";

			const lines = terminalOutput.trim().split("\n");
			const lastLine = lines[lines.length - 1]?.trim() ?? "";

			// Parse structured markers from runtime-acp's output buffer
			if (lastLine.startsWith("[prompt complete]")) return "idle";
			if (lastLine.startsWith("[prompt error]")) return "idle";
			if (lastLine.startsWith("[process exited")) return "idle";
			if (lastLine.startsWith("[tool]")) return "active";
			if (lastLine.startsWith("[tool_update]")) return "active";
			if (lastLine.startsWith("[prompt]")) return "active";

			// Default: if there's output, the agent is doing something
			return "active";
		},

		async getActivityState(
			session: Session,
			readyThresholdMs?: number
		): Promise<ActivityDetection | null> {
			const threshold = readyThresholdMs ?? DEFAULT_READY_THRESHOLD_MS;

			if (!session.runtimeHandle) {
				return { state: "exited", timestamp: new Date() };
			}

			// Check process liveness via PID
			const running = await this.isProcessRunning(session.runtimeHandle);
			if (!running) {
				return { state: "exited", timestamp: new Date() };
			}

			// Read ACP state from runtime handle (set by runtime-acp)
			const acpState = getAcpState(session.runtimeHandle);
			if (!acpState) {
				// Not using runtime-acp — cannot determine ACP state
				return null;
			}

			const ageMs = Date.now() - acpState.lastUpdateAt;
			const timestamp = new Date(acpState.lastUpdateAt);

			// If a prompt is currently in progress, the agent is active
			if (acpState.promptInProgress) {
				switch (acpState.lastUpdateType) {
					case "tool_call":
					case "tool_call_update":
					case "message":
					case "plan":
						return { state: "active", timestamp };
					default:
						return {
							state: ageMs > threshold ? "idle" : "active",
							timestamp,
						};
				}
			}

			// No prompt in progress — agent is ready or idle
			return {
				state: ageMs > threshold ? "idle" : "ready",
				timestamp,
			};
		},

		async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
			const rawPid = handle.data.pid;
			const pid = typeof rawPid === "number" ? rawPid : Number(rawPid);
			if (!Number.isFinite(pid) || pid <= 0) return false;

			try {
				process.kill(pid, 0);
				return true;
			} catch (err: unknown) {
				if (
					err instanceof Error &&
					"code" in err &&
					err.code === "EPERM"
				) {
					return true;
				}
				return false;
			}
		},

		async getSessionInfo(
			session: Session
		): Promise<AgentSessionInfo | null> {
			if (!session.runtimeHandle) return null;

			const acpSessionId =
				(session.runtimeHandle.data.acpSessionId as string) ?? null;

			return {
				summary: null,
				agentSessionId: acpSessionId,
			};
		},
	};
}

// =============================================================================
// Plugin Export
// =============================================================================

export function create(): Agent {
	return createAcpAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
