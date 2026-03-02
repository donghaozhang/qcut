import type { CliProvider } from "@/types/cli-provider";

// ============================================================================
// Shared PTY Session Types
// ============================================================================

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

/**
 * Active skill context for CLI agents
 */
export interface ActiveSkillContext {
	id: string;
	name: string;
	content: string;
	folderName?: string; // Skill folder name for --project-doc flag
}

/**
 * Per-session state. Each terminal tab holds one of these.
 */
export interface SessionState {
	/** Backend PTY session ID (null when not yet connected) */
	sessionId: string | null;
	status: ConnectionStatus;
	exitCode: number | null;
	error: string | null;

	/** CLI provider for this session */
	cliProvider: CliProvider;
	selectedModel: string | null;
	selectedClaudeModel: string | null;
	isGeminiMode: boolean;

	/** Skill context for this session */
	activeSkill: ActiveSkillContext | null;
	skillPromptSent: boolean;

	/** Display label in the tab bar (e.g. "Claude 1", "Shell 2") */
	label: string;
	/** Timestamp when session tab was created */
	createdAt: number;
}

export interface ConnectOptions {
	command?: string;
	cwd?: string;
	projectId?: string;
	manual?: boolean;
}

export interface DisconnectOptions {
	userInitiated?: boolean;
}

export interface AutoConnectOptions {
	cwd?: string;
	projectId?: string;
}
