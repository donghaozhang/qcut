import { create } from "zustand";
import type { CliProvider } from "@/types/cli-provider";
import {
	CLI_PROVIDERS,
	getDefaultCodexModel,
	getDefaultClaudeModel,
} from "@/types/cli-provider";
import type {
	ConnectionStatus,
	SessionState,
	ConnectOptions,
	DisconnectOptions,
	AutoConnectOptions,
} from "./pty-session-types";

// Re-export types used by external consumers
export type { ActiveSkillContext } from "./pty-session-types";
export type { ConnectionStatus, SessionState } from "./pty-session-types";

// ============================================================================
// Constants
// ============================================================================

const AUTO_CONNECT_GLOBAL_KEY = "__global__";
const MAX_SESSIONS = 5;

// ============================================================================
// Module-level IPC callback registry
// ============================================================================

const _dataCallbacks = new Map<string, (data: string) => void>();
const _exitCallbacks = new Map<string, (exitCode: number) => void>();
let _ipcInitialized = false;

// ============================================================================
// Types
// ============================================================================

interface PtyTerminalState {
	// Multi-session state
	sessions: Map<string, SessionState>;
	sessionOrder: string[]; // Tab IDs in display order
	activeSessionId: string | null;

	// Global state (shared across sessions)
	cols: number;
	rows: number;
	projectId: string | null;
	workingDirectory: string;
	autoConnectOnLoad: boolean;
	hasUserDisconnected: boolean;
	autoConnectAttemptedProjectId: string | null;
	terminalMountedIn: "media-panel" | "preview-panel" | null;

	// Backward-compat flat fields (synced from active session)
	sessionId: string | null;
	status: ConnectionStatus;
	exitCode: number | null;
	error: string | null;
	cliProvider: CliProvider;
	selectedModel: string | null;
	selectedClaudeModel: string | null;
	isGeminiMode: boolean;
	activeSkill: import("./pty-session-types").ActiveSkillContext | null;
	skillPromptSent: boolean;
}

interface PtyTerminalActions {
	// Multi-session management
	createSession: (provider?: CliProvider) => string;
	closeSession: (tabId: string) => Promise<void>;
	switchSession: (tabId: string) => void;
	renameSession: (tabId: string, label: string) => void;

	// Session management (operates on active session)
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

	// CLI provider management (active session)
	setCliProvider: (provider: CliProvider) => void;
	setSelectedModel: (modelId: string | null) => void;
	setSelectedClaudeModel: (modelId: string | null) => void;

	// Legacy mode management
	setGeminiMode: (enabled: boolean) => void;
	setWorkingDirectory: (dir: string) => void;

	// Skill context management (active session)
	setActiveSkill: (
		skill: import("./pty-session-types").ActiveSkillContext | null,
	) => void;
	clearSkillContext: () => void;
	sendSkillPrompt: (targetTabId?: string) => void;

	// Internal state updates
	handleConnected: (sessionId: string) => void;
	handleDisconnected: (exitCode: number) => void;
	handleError: (error: string) => void;
	_handleSessionExit: (tabId: string, exitCode: number) => void;

	// Terminal mount tracking
	setTerminalMountedIn: (
		location: "media-panel" | "preview-panel" | null,
	) => void;

	// IPC callback registry
	registerDataCallback: (tabId: string, cb: (data: string) => void) => void;
	unregisterDataCallback: (tabId: string) => void;
	registerExitCallback: (
		tabId: string,
		cb: (exitCode: number) => void,
	) => void;
	unregisterExitCallback: (tabId: string) => void;

	// Reset
	reset: () => void;
}

type PtyTerminalStore = PtyTerminalState & PtyTerminalActions;

// ============================================================================
// Helpers
// ============================================================================

function generateTabId(): string {
	return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateSessionLabel(
	provider: CliProvider,
	sessions: Map<string, SessionState>,
): string {
	const providerName = CLI_PROVIDERS[provider].name;
	let n = 1;
	const existingLabels = new Set(
		Array.from(sessions.values()).map((s) => s.label),
	);
	while (existingLabels.has(`${providerName} ${n}`)) {
		n++;
	}
	return `${providerName} ${n}`;
}

function createDefaultSession(
	provider: CliProvider,
	label: string,
): SessionState {
	return {
		sessionId: null,
		status: "disconnected",
		exitCode: null,
		error: null,
		cliProvider: provider,
		selectedModel: getDefaultCodexModel(),
		selectedClaudeModel: getDefaultClaudeModel(),
		isGeminiMode: provider === "gemini",
		activeSkill: null,
		skillPromptSent: false,
		label,
		createdAt: Date.now(),
	};
}

/** Sync backward-compat flat fields from a session (or defaults if null) */
function flatFieldsFrom(
	session: SessionState | null | undefined,
): Pick<
	PtyTerminalState,
	| "sessionId"
	| "status"
	| "exitCode"
	| "error"
	| "cliProvider"
	| "selectedModel"
	| "selectedClaudeModel"
	| "isGeminiMode"
	| "activeSkill"
	| "skillPromptSent"
> {
	if (!session) {
		return {
			sessionId: null,
			status: "disconnected",
			exitCode: null,
			error: null,
			cliProvider: "claude",
			selectedModel: getDefaultCodexModel(),
			selectedClaudeModel: getDefaultClaudeModel(),
			isGeminiMode: false,
			activeSkill: null,
			skillPromptSent: false,
		};
	}
	return {
		sessionId: session.sessionId,
		status: session.status,
		exitCode: session.exitCode,
		error: session.error,
		cliProvider: session.cliProvider,
		selectedModel: session.selectedModel,
		selectedClaudeModel: session.selectedClaudeModel,
		isGeminiMode: session.isGeminiMode,
		activeSkill: session.activeSkill,
		skillPromptSent: session.skillPromptSent,
	};
}

function buildSkillPrompt(
	skill: import("./pty-session-types").ActiveSkillContext,
): string {
	return `I'm using the "${skill.name}" skill. Here are the instructions I need you to follow:

${skill.content}

Please acknowledge that you understand these instructions and are ready to help me with tasks using this skill.`;
}

function escapeStringForShell(
	content: string,
	escapeNewlines = false,
): string {
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
}: { cliProvider: CliProvider; message: string }): string {
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

function buildSkillFilePath(
	workingDirectory: string,
	skillFolderName: string,
): string {
	if (
		skillFolderName.includes("..") ||
		skillFolderName.includes("/") ||
		skillFolderName.includes("\\")
	) {
		throw new Error("Invalid skill folder name");
	}
	const separator = workingDirectory.includes("\\") ? "\\" : "/";
	return `${workingDirectory}${separator}skills${separator}${skillFolderName}${separator}Skill.md`;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: PtyTerminalState = {
	sessions: new Map(),
	sessionOrder: [],
	activeSessionId: null,
	cols: 80,
	rows: 24,
	projectId: null,
	workingDirectory: "",
	autoConnectOnLoad: true,
	hasUserDisconnected: false,
	autoConnectAttemptedProjectId: null,
	terminalMountedIn: null,
	// Backward-compat flat fields
	sessionId: null,
	status: "disconnected",
	exitCode: null,
	error: null,
	cliProvider: "claude",
	selectedModel: getDefaultCodexModel(),
	selectedClaudeModel: getDefaultClaudeModel(),
	isGeminiMode: false,
	activeSkill: null,
	skillPromptSent: false,
};

// ============================================================================
// Store
// ============================================================================

export const usePtyTerminalStore = create<PtyTerminalStore>((set, get) => {
	/**
	 * Update a session in the Map and sync backward-compat fields if it's active.
	 */
	const setSession = (
		tabId: string,
		updates: Partial<SessionState>,
	): void => {
		const state = get();
		const session = state.sessions.get(tabId);
		if (!session) return;

		const updated = { ...session, ...updates };
		const newSessions = new Map(state.sessions);
		newSessions.set(tabId, updated);

		const stateUpdate: Partial<PtyTerminalState> = { sessions: newSessions };
		if (tabId === state.activeSessionId) {
			Object.assign(stateUpdate, flatFieldsFrom(updated));
		}
		set(stateUpdate);
	};

	/**
	 * Update the active session. Convenience wrapper around setSession.
	 */
	const setActiveSession = (updates: Partial<SessionState>): void => {
		const { activeSessionId } = get();
		if (!activeSessionId) return;
		setSession(activeSessionId, updates);
	};

	return {
		...initialState,

		// ==================================================================
		// Multi-session management
		// ==================================================================

		createSession: (provider) => {
			const state = get();
			if (state.sessions.size >= MAX_SESSIONS) {
				return state.activeSessionId ?? "";
			}

			const resolvedProvider = provider ?? state.cliProvider;
			const tabId = generateTabId();
			const label = generateSessionLabel(resolvedProvider, state.sessions);
			const session = createDefaultSession(resolvedProvider, label);
			// Inherit current flat fields (user may have set provider/model before creating a session)
			session.selectedModel = state.selectedModel;
			session.selectedClaudeModel = state.selectedClaudeModel;
			session.activeSkill = state.activeSkill;
			session.skillPromptSent = state.skillPromptSent;

			const newSessions = new Map(state.sessions);
			newSessions.set(tabId, session);
			const newOrder = [...state.sessionOrder, tabId];

			const isFirst = state.activeSessionId === null;
			set({
				sessions: newSessions,
				sessionOrder: newOrder,
				...(isFirst
					? { activeSessionId: tabId, ...flatFieldsFrom(session) }
					: {}),
			});

			return tabId;
		},

		closeSession: async (tabId) => {
			const state = get();
			const session = state.sessions.get(tabId);
			if (!session) return;

			// Kill PTY if connected
			if (session.sessionId) {
				try {
					await window.electronAPI?.pty?.kill(session.sessionId);
				} catch {
					// Ignore kill errors on close
				}
			}

			// Clean up callbacks
			_dataCallbacks.delete(tabId);
			_exitCallbacks.delete(tabId);

			const newSessions = new Map(state.sessions);
			newSessions.delete(tabId);
			const newOrder = state.sessionOrder.filter((id) => id !== tabId);

			const stateUpdate: Partial<PtyTerminalState> = {
				sessions: newSessions,
				sessionOrder: newOrder,
			};

			// Switch active if we closed the active tab
			if (state.activeSessionId === tabId) {
				const idx = state.sessionOrder.indexOf(tabId);
				const nextId =
					newOrder[Math.min(idx, newOrder.length - 1)] ?? null;
				stateUpdate.activeSessionId = nextId;
				Object.assign(
					stateUpdate,
					flatFieldsFrom(nextId ? newSessions.get(nextId) : null),
				);
			}

			set(stateUpdate);
		},

		switchSession: (tabId) => {
			const state = get();
			if (tabId === state.activeSessionId) return;

			const session = state.sessions.get(tabId);
			if (!session) return;

			set({
				activeSessionId: tabId,
				...flatFieldsFrom(session),
			});
		},

		renameSession: (tabId, label) => {
			setSession(tabId, { label });
		},

		// ==================================================================
		// Session management (operates on active session)
		// ==================================================================

		connect: async (options = {}) => {
			const state = get();
			let tabId = state.activeSessionId;

			// Create first session if none exist
			if (!tabId) {
				tabId = get().createSession();
			}

			const session = get().sessions.get(tabId);
			if (!session) return;

			if (options.manual) {
				set({ hasUserDisconnected: false });
			}

			setSession(tabId, {
				status: "connecting",
				error: null,
				exitCode: null,
			});

			try {
				if (!window.electronAPI?.pty) {
					setSession(tabId, {
						status: "error",
						error: "PTY is only available in the desktop app.",
					});
					return;
				}

				const { projectId, workingDirectory, cols, rows } = get();
				const currentSession = get().sessions.get(tabId);
				if (!currentSession) return;

				const {
					cliProvider,
					selectedModel,
					activeSkill,
					selectedClaudeModel,
				} = currentSession;

				const providerConfig = CLI_PROVIDERS[cliProvider];
				let command: string | undefined;
				const env: Record<string, string> = {};
				const resolvedProjectId =
					options.projectId || projectId || undefined;
				const resolvedCwd =
					options.cwd || workingDirectory || undefined;

				// Build command based on provider
				if (cliProvider === "codex") {
					if (!window.electronAPI?.apiKeys) {
						setSession(tabId, {
							status: "error",
							error: "API key storage is unavailable in this environment.",
						});
						return;
					}
					let apiKeys;
					try {
						apiKeys = await window.electronAPI.apiKeys.get();
					} catch {
						setSession(tabId, {
							status: "error",
							error: "Failed to retrieve API keys. Please try again.",
						});
						return;
					}
					if (!apiKeys?.openRouterApiKey) {
						setSession(tabId, {
							status: "error",
							error: "OpenRouter API key not configured. Go to Settings > API Keys.",
						});
						return;
					}
					env.OPENROUTER_API_KEY = apiKeys.openRouterApiKey;
					command = "npx open-codex --provider openrouter";
					if (selectedModel) {
						command += ` --model ${selectedModel}`;
					}
					if (activeSkill?.folderName && resolvedCwd) {
						const skillFilePath = buildSkillFilePath(
							resolvedCwd,
							activeSkill.folderName,
						);
						const escapedPath =
							escapeStringForShell(skillFilePath);
						command += ` --project-doc "${escapedPath}"`;
					}
				} else if (cliProvider === "claude") {
					if (window.electronAPI?.apiKeys) {
						try {
							const apiKeys =
								await window.electronAPI.apiKeys.get();
							if (apiKeys?.anthropicApiKey) {
								env.ANTHROPIC_API_KEY =
									apiKeys.anthropicApiKey;
							}
						} catch {
							// Continue without API key
						}
					}
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
				} else if (cliProvider === "gemini") {
					command = providerConfig.command;
				}

				const spawnOptions = {
					cols,
					rows,
					cwd: resolvedCwd,
					command: options.command || command,
					env: Object.keys(env).length > 0 ? env : undefined,
				};

				// Initialize IPC routing before first spawn
				initIpcRouting();

				const result =
					await window.electronAPI.pty.spawn(spawnOptions);

				if (result?.success && result.sessionId) {
					setSession(tabId, {
						sessionId: result.sessionId,
						status: "connected",
					});
					set({
						hasUserDisconnected: false,
						projectId: resolvedProjectId ?? projectId,
						autoConnectAttemptedProjectId:
							resolvedProjectId ??
							projectId ??
							AUTO_CONNECT_GLOBAL_KEY,
					});

					// Gemini skill prompt injection
					const latest = get().sessions.get(tabId);
					if (
						latest?.activeSkill &&
						!latest.skillPromptSent &&
						cliProvider === "gemini"
					) {
						const capturedTabId = tabId;
						setTimeout(() => {
							get().sendSkillPrompt(capturedTabId);
						}, 2000);
					}
				} else {
					const rawError =
						result?.error ?? "Failed to spawn PTY session";
					setSession(tabId, {
						status: "error",
						error: getConnectErrorMessage({
							cliProvider,
							message: rawError,
						}),
					});
				}
			} catch (error: unknown) {
				const rawMessage =
					error instanceof Error
						? error.message
						: "Failed to spawn PTY session";
				setSession(tabId, {
					status: "error",
					error: getConnectErrorMessage({
						cliProvider: get().sessions.get(tabId)?.cliProvider ?? "claude",
						message: rawMessage,
					}),
				});
			}
		},

		disconnect: async (options = {}) => {
			const userInitiated = options.userInitiated === true;
			const { activeSessionId } = get();
			if (!activeSessionId) {
				// Even without a session, respect user-initiated flag for auto-connect guard
				if (userInitiated) {
					set({ hasUserDisconnected: true });
				}
				return;
			}

			const session = get().sessions.get(activeSessionId);

			try {
				if (session?.sessionId) {
					await window.electronAPI?.pty?.kill(session.sessionId);
				}
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to terminate PTY session";
				setSession(activeSessionId, { error: message });
			} finally {
				setSession(activeSessionId, {
					sessionId: null,
					status: "disconnected",
				});
				if (userInitiated) {
					set({ hasUserDisconnected: true });
				}
			}
		},

		ensureAutoConnected: async (options = {}) => {
			const {
				autoConnectOnLoad,
				hasUserDisconnected,
				projectId,
				autoConnectAttemptedProjectId,
				sessions,
				activeSessionId,
			} = get();

			if (!autoConnectOnLoad || hasUserDisconnected) return;

			// Check active session status
			const activeSession = activeSessionId
				? sessions.get(activeSessionId)
				: null;
			const activeStatus = activeSession?.status ?? "disconnected";
			if (activeStatus === "connected" || activeStatus === "connecting")
				return;

			const resolvedProjectId = options.projectId || projectId || null;
			const attemptKey = resolvedProjectId || AUTO_CONNECT_GLOBAL_KEY;
			if (autoConnectAttemptedProjectId === attemptKey) return;

			set({ autoConnectAttemptedProjectId: attemptKey });

			// Create first session if none exist
			if (sessions.size === 0) {
				get().createSession();
			}

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
				setActiveSession({ status: "error", error: message });
			}
		},

		setDimensions: (cols, rows) => {
			set({ cols, rows });
		},

		resize: async () => {
			const { activeSessionId, sessions, cols, rows } = get();
			const session = activeSessionId
				? sessions.get(activeSessionId)
				: null;
			if (session?.sessionId) {
				try {
					await window.electronAPI?.pty?.resize(
						session.sessionId,
						cols,
						rows,
					);
				} catch (error: unknown) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to resize PTY session";
					setActiveSession({ error: message });
				}
			}
		},

		// CLI provider management (active session, or flat fields if no session)
		setCliProvider: (provider) => {
			if (get().activeSessionId) {
				setActiveSession({
					cliProvider: provider,
					isGeminiMode: provider === "gemini",
				});
			} else {
				set({ cliProvider: provider, isGeminiMode: provider === "gemini" });
			}
		},

		setSelectedModel: (modelId) => {
			if (get().activeSessionId) {
				setActiveSession({ selectedModel: modelId });
			} else {
				set({ selectedModel: modelId });
			}
		},

		setSelectedClaudeModel: (modelId) => {
			if (get().activeSessionId) {
				setActiveSession({ selectedClaudeModel: modelId });
			} else {
				set({ selectedClaudeModel: modelId });
			}
		},

		setGeminiMode: (enabled) => {
			const updates = {
				cliProvider: (enabled ? "gemini" : "shell") as CliProvider,
				isGeminiMode: enabled,
			};
			if (get().activeSessionId) {
				setActiveSession(updates);
			} else {
				set(updates);
			}
		},

		setWorkingDirectory: (dir) => {
			set({ workingDirectory: dir });
		},

		setProjectContext: ({ projectId, workingDirectory }) => {
			set((state) => {
				const projectChanged = state.projectId !== projectId;
				return {
					projectId,
					workingDirectory:
						workingDirectory ?? state.workingDirectory,
					hasUserDisconnected: projectChanged
						? false
						: state.hasUserDisconnected,
					autoConnectAttemptedProjectId: projectChanged
						? null
						: state.autoConnectAttemptedProjectId,
				};
			});
		},

		setAutoConnectOnLoad: (enabled) => {
			set({ autoConnectOnLoad: enabled });
		},

		// Skill context management (active session, or flat fields if no session)
		setActiveSkill: (skill) => {
			if (get().activeSessionId) {
				setActiveSession({ activeSkill: skill, skillPromptSent: false });
			} else {
				set({ activeSkill: skill, skillPromptSent: false });
			}
		},

		clearSkillContext: () => {
			if (get().activeSessionId) {
				setActiveSession({ activeSkill: null, skillPromptSent: false });
			} else {
				set({ activeSkill: null, skillPromptSent: false });
			}
		},

		sendSkillPrompt: (targetTabId?: string) => {
			const { activeSessionId, sessions } = get();
			const tabId = targetTabId ?? activeSessionId;
			if (!tabId) return;
			const session = sessions.get(tabId);
			if (
				!session?.activeSkill ||
				session.skillPromptSent ||
				session.cliProvider !== "gemini" ||
				!session.sessionId
			)
				return;

			const prompt = buildSkillPrompt(session.activeSkill);
			try {
				const writeResult = window.electronAPI?.pty?.write(
					session.sessionId,
					`${prompt}\n`,
				);
				setActiveSession({ skillPromptSent: true });
				if (writeResult && typeof writeResult.catch === "function") {
					writeResult.catch((error: unknown) => {
						const message =
							error instanceof Error
								? error.message
								: "Failed to send skill prompt";
						setActiveSession({
							error: message,
							skillPromptSent: false,
						});
					});
				}
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to send skill prompt";
				setActiveSession({ error: message, skillPromptSent: false });
			}
		},

		// Internal state updates (active session, or flat fields if no session)
		handleConnected: (backendSessionId) => {
			if (get().activeSessionId) {
				setActiveSession({ sessionId: backendSessionId, status: "connected" });
			} else {
				set({ sessionId: backendSessionId, status: "connected" });
			}
		},

		handleDisconnected: (exitCode) => {
			if (get().activeSessionId) {
				setActiveSession({
					sessionId: null,
					status: "disconnected",
					exitCode,
					skillPromptSent: false,
				});
			} else {
				set({ sessionId: null, status: "disconnected", exitCode, skillPromptSent: false });
			}
		},

		handleError: (error) => {
			if (get().activeSessionId) {
				setActiveSession({ status: "error", error });
			} else {
				set({ status: "error", error });
			}
		},

		_handleSessionExit: (tabId, exitCode) => {
			setSession(tabId, {
				sessionId: null,
				status: "disconnected",
				exitCode,
				skillPromptSent: false,
			});
		},

		setTerminalMountedIn: (location) => {
			set({ terminalMountedIn: location });
		},

		// IPC callback registry
		registerDataCallback: (tabId, cb) => {
			_dataCallbacks.set(tabId, cb);
			initIpcRouting();
		},

		unregisterDataCallback: (tabId) => {
			_dataCallbacks.delete(tabId);
		},

		registerExitCallback: (tabId, cb) => {
			_exitCallbacks.set(tabId, cb);
		},

		unregisterExitCallback: (tabId) => {
			_exitCallbacks.delete(tabId);
		},

		reset: () => {
			// Clean up all callbacks
			_dataCallbacks.clear();
			_exitCallbacks.clear();
			set(initialState);
		},
	};
});

// ============================================================================
// IPC Routing (initialized lazily, runs once)
// ============================================================================

function initIpcRouting(): void {
	if (
		_ipcInitialized ||
		typeof window === "undefined" ||
		!window.electronAPI?.pty
	)
		return;
	_ipcInitialized = true;

	window.electronAPI.pty.onData(
		(event: { sessionId: string; data: string }) => {
			// Dispatch to ALL registered callbacks matching this backend sessionId.
			// Multiple TerminalEmulator instances (e.g. media panel + preview panel)
			// may share the same backend session under different tabIds.
			for (const [callbackTabId, cb] of _dataCallbacks) {
				if (_tabMatchesSession(callbackTabId, event.sessionId)) {
					try {
						cb(event.data);
					} catch {
						// Isolate callback failures so other tabs still receive data
					}
				}
			}
		},
	);

	window.electronAPI.pty.onExit(
		(event: { sessionId: string; exitCode: number }) => {
			const state = usePtyTerminalStore.getState();
			// Find the canonical session tab for state updates
			for (const [tabId, session] of state.sessions) {
				if (session.sessionId === event.sessionId) {
					state._handleSessionExit(tabId, event.exitCode);
					break;
				}
			}
			// Dispatch exit to all registered callbacks
			for (const [callbackTabId, cb] of _exitCallbacks) {
				if (_tabMatchesSession(callbackTabId, event.sessionId)) {
					try {
						cb(event.exitCode);
					} catch {
						// Isolate callback failures so other tabs still receive exit
					}
				}
			}
		},
	);
}

/** Check if a callback tabId is associated with a given backend sessionId. */
function _tabMatchesSession(
	callbackTabId: string,
	backendSessionId: string,
): boolean {
	const { sessions } = usePtyTerminalStore.getState();

	// Direct session tab match (e.g. "tab-1")
	const directSession = sessions.get(callbackTabId);
	if (directSession?.sessionId === backendSessionId) return true;

	// Preview panel tab match (e.g. "preview-tab-1" → look up "tab-1")
	if (callbackTabId.startsWith("preview-")) {
		const sourceTabId = callbackTabId.slice("preview-".length);
		const sourceSession = sessions.get(sourceTabId);
		if (sourceSession?.sessionId === backendSessionId) return true;
	}

	return false;
}
