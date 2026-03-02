import { create } from "zustand";
import type { CliProvider } from "@/types/cli-provider";
import {
	CLI_PROVIDERS,
	getDefaultCodexModel,
	getDefaultClaudeModel,
} from "@/types/cli-provider";

// ============================================================================
// Types
// ============================================================================

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
const AUTO_CONNECT_GLOBAL_KEY = "__global__";

/**
 * Active skill context for CLI agents
 */
export interface ActiveSkillContext {
	id: string;
	name: string;
	content: string;
	folderName?: string; // Skill folder name for --project-doc flag
}

interface PtyTerminalState {
	// Session state
	sessionId: string | null;
	status: ConnectionStatus;
	exitCode: number | null;
	error: string | null;

	// Terminal dimensions
	cols: number;
	rows: number;

	// CLI provider state
	cliProvider: CliProvider;
	selectedModel: string | null; // For Codex/OpenRouter model selection
	selectedClaudeModel: string | null; // For Claude Code model selection

	// Legacy compatibility
	isGeminiMode: boolean; // Derived from cliProvider for backward compatibility

	projectId: string | null;
	workingDirectory: string;
	autoConnectOnLoad: boolean;
	hasUserDisconnected: boolean;
	autoConnectAttemptedProjectId: string | null;

	// Skill context (for running skills with CLI agents)
	activeSkill: ActiveSkillContext | null;
	skillPromptSent: boolean; // Track if initial skill prompt was sent

	// Terminal mount tracking — only one xterm.js instance can bind at a time
	terminalMountedIn: "media-panel" | "preview-panel" | null;
}

interface ConnectOptions {
	command?: string;
	cwd?: string;
	projectId?: string;
	manual?: boolean;
}

interface DisconnectOptions {
	userInitiated?: boolean;
}

interface AutoConnectOptions {
	cwd?: string;
	projectId?: string;
}

interface PtyTerminalActions {
	// Session management
	connect: (options?: ConnectOptions) => Promise<void>;
	disconnect: (options?: DisconnectOptions) => Promise<void>;
	ensureAutoConnected: (options?: AutoConnectOptions) => Promise<void>;
	setProjectContext: (options: {
		projectId: string;
		workingDirectory?: string;
	}) => void;
	setAutoConnectOnLoad: (enabled: boolean) => void;

	// Dimension management
	setDimensions: (cols: number, rows: number) => void;
	resize: () => Promise<void>;

	// CLI provider management
	setCliProvider: (provider: CliProvider) => void;
	setSelectedModel: (modelId: string | null) => void;
	setSelectedClaudeModel: (modelId: string | null) => void;

	// Legacy mode management (backward compatibility)
	setGeminiMode: (enabled: boolean) => void;
	setWorkingDirectory: (dir: string) => void;

	// Skill context management
	setActiveSkill: (skill: ActiveSkillContext | null) => void;
	clearSkillContext: () => void;
	sendSkillPrompt: () => void;

	// Internal state updates (called by IPC listeners)
	handleConnected: (sessionId: string) => void;
	handleDisconnected: (exitCode: number) => void;
	handleError: (error: string) => void;

	// Terminal mount tracking
	setTerminalMountedIn: (location: "media-panel" | "preview-panel" | null) => void;

	// Reset
	reset: () => void;
}

type PtyTerminalStore = PtyTerminalState & PtyTerminalActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: PtyTerminalState = {
	sessionId: null,
	status: "disconnected",
	exitCode: null,
	error: null,
	cols: 80,
	rows: 24,
	cliProvider: "claude", // Default to Claude Code
	selectedModel: getDefaultCodexModel(), // Default Codex model
	selectedClaudeModel: getDefaultClaudeModel(), // Default Claude model
	isGeminiMode: false, // Derived from cliProvider
	projectId: null,
	workingDirectory: "",
	autoConnectOnLoad: true,
	hasUserDisconnected: false,
	autoConnectAttemptedProjectId: null,
	activeSkill: null,
	skillPromptSent: false,
	terminalMountedIn: null,
};

/**
 * Build the skill prompt to send to Gemini CLI
 * Note: Codex uses --full-context flag instead of prompt injection
 */
function buildSkillPrompt(skill: ActiveSkillContext): string {
	return `I'm using the "${skill.name}" skill. Here are the instructions I need you to follow:

${skill.content}

Please acknowledge that you understand these instructions and are ready to help me with tasks using this skill.`;
}

/**
 * Escape a string for safe use in shell command arguments
 * Handles backslashes, quotes, dollar signs, backticks, and optionally newlines
 */
function escapeStringForShell(content: string, escapeNewlines = false): string {
	let escaped = content
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`");
	if (escapeNewlines) {
		escaped = escaped.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
	}
	return escaped;
}

function getConnectErrorMessage({
	cliProvider,
	message,
}: {
	cliProvider: CliProvider;
	message: string;
}): string {
	const normalizedMessage = message.toLowerCase();
	const isBinaryMissing =
		normalizedMessage.includes("enoent") ||
		normalizedMessage.includes("not found") ||
		normalizedMessage.includes("not recognized");

	if (cliProvider === "claude" && isBinaryMissing) {
		return "Claude Code CLI is not installed. Install `claude` and try again.";
	}

	return message;
}

/**
 * Build skill file path for --project-doc flag
 * open-codex supports passing a markdown file as context via --project-doc
 * workingDirectory is the project folder, so we need to add "skills" to the path
 */
function buildSkillFilePath(
	workingDirectory: string,
	skillFolderName: string
): string {
	// Validate skillFolderName to prevent path traversal
	if (
		skillFolderName.includes("..") ||
		skillFolderName.includes("/") ||
		skillFolderName.includes("\\")
	) {
		throw new Error("Invalid skill folder name");
	}
	// Handle both Windows and Unix paths
	const separator = workingDirectory.includes("\\") ? "\\" : "/";
	// Build path: projectFolder/skills/skillFolderName/Skill.md
	const skillPath = `${workingDirectory}${separator}skills${separator}${skillFolderName}${separator}Skill.md`;
	return skillPath;
}

// ============================================================================
// Store
// ============================================================================

export const usePtyTerminalStore = create<PtyTerminalStore>((set, get) => ({
	...initialState,

	connect: async (options = {}) => {
		const {
			cliProvider,
			selectedModel,
			projectId,
			workingDirectory,
			cols,
			rows,
			activeSkill,
		} = get();

		if (options.manual) {
			set({ hasUserDisconnected: false });
		}

		set({ status: "connecting", error: null, exitCode: null });

		try {
			// Check for API availability (PTY is only available in desktop app)
			if (!window.electronAPI?.pty) {
				set({
					status: "error",
					error: "PTY is only available in the desktop app.",
				});
				return;
			}

			const providerConfig = CLI_PROVIDERS[cliProvider];
			let command: string | undefined;
			const env: Record<string, string> = {};
			const resolvedProjectId = options.projectId || projectId || undefined;
			const resolvedCwd = options.cwd || workingDirectory || undefined;

			// Build command based on provider
			if (cliProvider === "codex") {
				// Get OpenRouter API key for Codex
				if (!window.electronAPI?.apiKeys) {
					set({
						status: "error",
						error: "API key storage is unavailable in this environment.",
					});
					return;
				}
				let apiKeys;
				try {
					apiKeys = await window.electronAPI.apiKeys.get();
				} catch {
					set({
						status: "error",
						error: "Failed to retrieve API keys. Please try again.",
					});
					return;
				}

				if (!apiKeys?.openRouterApiKey) {
					set({
						status: "error",
						error:
							"OpenRouter API key not configured. Go to Settings > API Keys.",
					});
					return;
				}

				env.OPENROUTER_API_KEY = apiKeys.openRouterApiKey;

				// Build Codex command with provider and model
				command = "npx open-codex --provider openrouter";
				if (selectedModel) {
					command += ` --model ${selectedModel}`;
				}

				// Inject skill via --project-doc flag if active and folder name is known
				// open-codex supports passing a markdown file as context
				if (activeSkill?.folderName && workingDirectory) {
					const skillFilePath = buildSkillFilePath(
						workingDirectory,
						activeSkill.folderName
					);
					const escapedSkillFilePath = escapeStringForShell(skillFilePath);
					command += ` --project-doc "${escapedSkillFilePath}"`;
				}
			} else if (cliProvider === "claude") {
				// Claude Code CLI uses login by default (Claude Pro/Max subscription)
				// API key is optional - only set if user has configured one
				if (window.electronAPI?.apiKeys) {
					let apiKeys;
					try {
						apiKeys = await window.electronAPI.apiKeys.get();
						if (apiKeys?.anthropicApiKey) {
							env.ANTHROPIC_API_KEY = apiKeys.anthropicApiKey;
						}
					} catch {
						// Continue without API key - Claude will use login authentication
					}
				}

				// Get Claude model from state
				const { selectedClaudeModel } = get();

				// Build Claude command with --dangerously-skip-permissions to avoid permission prompts
				command = "claude --dangerously-skip-permissions";
				if (selectedClaudeModel) {
					command += ` --model ${selectedClaudeModel}`;
				}

				if (resolvedProjectId) {
					env.QCUT_PROJECT_ID = resolvedProjectId;
				}
				if (resolvedCwd) {
					env.QCUT_PROJECT_ROOT = resolvedCwd;
				}
				env.QCUT_API_BASE_URL = "http://127.0.0.1:8765";

				// Note: Skills are not auto-injected for Claude - user starts them manually
				// Claude has access to read skill files from the project directory
			} else if (cliProvider === "gemini") {
				command = providerConfig.command;
			}
			// shell provider uses undefined command (default shell)

			const spawnOptions = {
				cols,
				rows,
				cwd: resolvedCwd,
				command: options.command || command,
				env: Object.keys(env).length > 0 ? env : undefined,
			};

			const result = await window.electronAPI.pty.spawn(spawnOptions);

			if (result?.success && result.sessionId) {
				set({
					sessionId: result.sessionId,
					status: "connected",
					hasUserDisconnected: false,
					projectId: resolvedProjectId ?? projectId,
					autoConnectAttemptedProjectId:
						resolvedProjectId ?? projectId ?? AUTO_CONNECT_GLOBAL_KEY,
				});
			} else {
				const rawError = result?.error ?? "Failed to spawn PTY session";
				const parsedError = getConnectErrorMessage({
					cliProvider,
					message: rawError,
				});
				set({
					status: "error",
					error: parsedError,
				});
			}
		} catch (error: unknown) {
			const rawMessage =
				error instanceof Error ? error.message : "Failed to spawn PTY session";
			const message = getConnectErrorMessage({
				cliProvider,
				message: rawMessage,
			});
			set({ status: "error", error: message });
		}
	},

	disconnect: async (options = {}) => {
		const { sessionId } = get();
		const userInitiated = options.userInitiated === true;
		try {
			if (sessionId) {
				await window.electronAPI?.pty?.kill(sessionId);
			}
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to terminate PTY session";
			set({ error: message });
		} finally {
			set({
				sessionId: null,
				status: "disconnected",
				hasUserDisconnected: userInitiated ? true : get().hasUserDisconnected,
			});
		}
	},

	ensureAutoConnected: async (options = {}) => {
		const {
			autoConnectOnLoad,
			hasUserDisconnected,
			status,
			projectId,
			autoConnectAttemptedProjectId,
		} = get();

		if (!autoConnectOnLoad || hasUserDisconnected) {
			return;
		}

		if (status === "connected" || status === "connecting") {
			return;
		}

		const resolvedProjectId = options.projectId || projectId || null;
		const attemptKey = resolvedProjectId || AUTO_CONNECT_GLOBAL_KEY;

		if (autoConnectAttemptedProjectId === attemptKey) {
			return;
		}

		set({ autoConnectAttemptedProjectId: attemptKey });

		try {
			await get().connect({
				cwd: options.cwd,
				projectId: resolvedProjectId || undefined,
			});
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to auto-connect terminal session";
			set({ status: "error", error: message });
		}
	},

	setDimensions: (cols, rows) => {
		set({ cols, rows });
	},

	resize: async () => {
		const { sessionId, cols, rows } = get();
		if (sessionId) {
			try {
				await window.electronAPI?.pty?.resize(sessionId, cols, rows);
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to resize PTY session";
				set({ error: message });
			}
		}
	},

	// CLI provider management
	setCliProvider: (provider) => {
		set({
			cliProvider: provider,
			isGeminiMode: provider === "gemini",
		});
	},

	setSelectedModel: (modelId) => {
		set({ selectedModel: modelId });
	},

	setSelectedClaudeModel: (modelId) => {
		set({ selectedClaudeModel: modelId });
	},

	// Legacy compatibility - maps to setCliProvider
	setGeminiMode: (enabled) => {
		set({
			cliProvider: enabled ? "gemini" : "shell",
			isGeminiMode: enabled,
		});
	},

	setWorkingDirectory: (dir) => {
		set({ workingDirectory: dir });
	},

	setProjectContext: ({ projectId, workingDirectory }) => {
		set((state) => {
			const projectChanged = state.projectId !== projectId;
			return {
				projectId,
				workingDirectory: workingDirectory ?? state.workingDirectory,
				hasUserDisconnected: projectChanged ? false : state.hasUserDisconnected,
				autoConnectAttemptedProjectId: projectChanged
					? null
					: state.autoConnectAttemptedProjectId,
			};
		});
	},

	setAutoConnectOnLoad: (enabled) => {
		set({ autoConnectOnLoad: enabled });
	},

	// Skill context management
	setActiveSkill: (skill) => {
		set({ activeSkill: skill, skillPromptSent: false });
	},

	clearSkillContext: () => {
		set({ activeSkill: null, skillPromptSent: false });
	},

	sendSkillPrompt: () => {
		const { sessionId, activeSkill, skillPromptSent, cliProvider } = get();

		// Only send prompt injection for Gemini (Codex uses --full-context flag at spawn time)
		if (
			!activeSkill ||
			skillPromptSent ||
			cliProvider !== "gemini" ||
			!sessionId
		) {
			return;
		}

		const prompt = buildSkillPrompt(activeSkill);

		try {
			const writeResult = window.electronAPI?.pty?.write(
				sessionId,
				prompt + "\n"
			);
			set({ skillPromptSent: true });
			if (writeResult && typeof writeResult.catch === "function") {
				writeResult.catch((error: unknown) => {
					const message =
						error instanceof Error
							? error.message
							: "Failed to send skill prompt";
					set({ error: message, skillPromptSent: false });
				});
				return;
			}
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Failed to send skill prompt";
			set({ error: message, skillPromptSent: false });
		}
	},

	handleConnected: (sessionId) => {
		const { activeSkill, skillPromptSent, cliProvider } = get();
		set({ sessionId, status: "connected" });

		// If skill is active and prompt not sent, send it after a delay
		// (only for Gemini CLI - Codex uses flag injection at spawn time)
		if (activeSkill && !skillPromptSent && cliProvider === "gemini") {
			setTimeout(() => {
				get().sendSkillPrompt();
			}, 2000); // 2 second delay for Gemini CLI to be ready
		}
	},

	handleDisconnected: (exitCode) => {
		set({
			sessionId: null,
			status: "disconnected",
			exitCode,
			skillPromptSent: false, // Reset so prompt can be sent again on reconnect
		});
	},

	handleError: (error) => {
		set({ status: "error", error });
	},

	setTerminalMountedIn: (location) => {
		set({ terminalMountedIn: location });
	},

	reset: () => {
		set(initialState);
	},
}));
