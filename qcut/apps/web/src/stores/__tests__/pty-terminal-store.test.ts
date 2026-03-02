import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { mockElectronAPI, setupElectronMock } from "@/test/mocks/electron";
import {
	getDefaultCodexModel,
	getDefaultClaudeModel,
} from "@/types/cli-provider";

describe("usePtyTerminalStore", () => {
	let cleanupElectron: () => void;

	beforeEach(() => {
		// Setup Electron mock
		cleanupElectron = setupElectronMock();

		// Reset store state
		usePtyTerminalStore.setState({
			sessions: new Map(),
			sessionOrder: [],
			activeSessionId: null,
			sessionId: null,
			status: "disconnected",
			exitCode: null,
			error: null,
			cols: 80,
			rows: 24,
			cliProvider: "claude",
			selectedModel: getDefaultCodexModel(),
			selectedClaudeModel: getDefaultClaudeModel(),
			isGeminiMode: false,
			projectId: null,
			workingDirectory: "",
			autoConnectOnLoad: true,
			hasUserDisconnected: false,
			autoConnectAttemptedProjectId: null,
			activeSkill: null,
			skillPromptSent: false,
			terminalMountedIn: null,
		});

		// Reset all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanupElectron();
	});

	describe("initial state", () => {
		it("should have correct default values", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			expect(result.current.sessionId).toBeNull();
			expect(result.current.status).toBe("disconnected");
			expect(result.current.exitCode).toBeNull();
			expect(result.current.error).toBeNull();
			expect(result.current.cols).toBe(80);
			expect(result.current.rows).toBe(24);
			expect(result.current.cliProvider).toBe("claude");
			expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4");
			expect(result.current.isGeminiMode).toBe(false);
			expect(result.current.projectId).toBeNull();
			expect(result.current.workingDirectory).toBe("");
			expect(result.current.autoConnectOnLoad).toBe(true);
			expect(result.current.hasUserDisconnected).toBe(false);
			expect(result.current.autoConnectAttemptedProjectId).toBeNull();
			expect(result.current.activeSkill).toBeNull();
			expect(result.current.skillPromptSent).toBe(false);
		});
	});

	describe("connect", () => {
		it("should connect successfully and update status", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Initially disconnected
			expect(result.current.status).toBe("disconnected");

			// Connect
			await act(async () => {
				await result.current.connect();
			});

			// Should be connected after completion
			expect(result.current.status).toBe("connected");
			expect(result.current.sessionId).toBe("test-pty-session");
		});

		it("should spawn with Gemini CLI command when cliProvider is gemini", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("gemini");
			});

			await act(async () => {
				await result.current.connect();
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: "npx @google/gemini-cli@latest",
				})
			);
		});

		it("should spawn without command when cliProvider is shell", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("shell");
			});

			await act(async () => {
				await result.current.connect();
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: undefined,
				})
			);
		});

		it("should spawn Codex with model when cliProvider is codex and API key is set", async () => {
			// Setup API key mock to return a valid key
			vi.mocked(mockElectronAPI.apiKeys.get).mockResolvedValueOnce({
				falApiKey: "",
				freesoundApiKey: "",
				geminiApiKey: "",
				openRouterApiKey: "sk-or-test-key",
				anthropicApiKey: "",
				elevenLabsApiKey: "",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("codex");
				result.current.setSelectedModel("anthropic/claude-sonnet-4");
			});

			await act(async () => {
				await result.current.connect();
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: expect.stringContaining(
						"npx open-codex --provider openrouter"
					),
					env: expect.objectContaining({
						OPENROUTER_API_KEY: "sk-or-test-key",
					}),
				})
			);
		});

		it("should include model in Codex command when selectedModel is set", async () => {
			// Setup API key mock
			vi.mocked(mockElectronAPI.apiKeys.get).mockResolvedValueOnce({
				falApiKey: "",
				freesoundApiKey: "",
				geminiApiKey: "",
				openRouterApiKey: "sk-or-test-key",
				anthropicApiKey: "",
				elevenLabsApiKey: "",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("codex");
				result.current.setSelectedModel("openai/gpt-4o");
			});

			await act(async () => {
				await result.current.connect();
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: expect.stringContaining("--model openai/gpt-4o"),
				})
			);
		});

		it("should fail with error when Codex is selected but API key is missing", async () => {
			// API key mock returns empty key
			vi.mocked(mockElectronAPI.apiKeys.get).mockResolvedValueOnce({
				falApiKey: "",
				freesoundApiKey: "",
				geminiApiKey: "",
				openRouterApiKey: "",
				anthropicApiKey: "",
				elevenLabsApiKey: "",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("codex");
			});

			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toContain(
				"OpenRouter API key not configured"
			);
			expect(mockElectronAPI.pty!.spawn).not.toHaveBeenCalled();
		});

		it("should handle spawn failure", async () => {
			vi.mocked(mockElectronAPI.pty!.spawn).mockResolvedValueOnce({
				success: false,
				error: "Spawn failed: permission denied",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toBe("Spawn failed: permission denied");
			expect(result.current.sessionId).toBeNull();
		});

		it("should show a helpful Claude install message when binary is missing", async () => {
			vi.mocked(mockElectronAPI.pty!.spawn).mockResolvedValueOnce({
				success: false,
				error: "spawn claude ENOENT",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toContain(
				"Claude Code CLI is not installed"
			);
		});

		it("should handle exception during spawn", async () => {
			vi.mocked(mockElectronAPI.pty!.spawn).mockRejectedValueOnce(
				new Error("Network error")
			);

			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toBe("Network error");
		});

		it("should use custom command when provided", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect({ command: "python --version" });
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: "python --version",
				})
			);
		});

		it("should use custom working directory when provided", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect({ cwd: "/home/user/projects" });
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					cwd: "/home/user/projects",
				})
			);
		});

		it("should show error when PTY API is not available", async () => {
			// Remove the PTY API temporarily
			cleanupElectron();
			window.electronAPI = undefined as any;

			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toBe(
				"PTY is only available in the desktop app."
			);
		});
	});

	describe("disconnect", () => {
		it("should kill session and reset state", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Connect first
			await act(async () => {
				await result.current.connect();
			});

			expect(result.current.sessionId).toBe("test-pty-session");

			// Disconnect
			await act(async () => {
				await result.current.disconnect();
			});

			expect(mockElectronAPI.pty!.kill).toHaveBeenCalledWith(
				"test-pty-session"
			);
			expect(result.current.sessionId).toBeNull();
			expect(result.current.status).toBe("disconnected");
		});

		it("should handle disconnect when no session exists", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.disconnect();
			});

			expect(mockElectronAPI.pty!.kill).not.toHaveBeenCalled();
			expect(result.current.status).toBe("disconnected");
		});
	});

	describe("setDimensions", () => {
		it("should update cols and rows", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setDimensions(120, 40);
			});

			expect(result.current.cols).toBe(120);
			expect(result.current.rows).toBe(40);
		});
	});

	describe("resize", () => {
		it("should call resize API with current dimensions", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Connect first
			await act(async () => {
				await result.current.connect();
			});

			// Update dimensions
			act(() => {
				result.current.setDimensions(100, 30);
			});

			// Resize
			await act(async () => {
				await result.current.resize();
			});

			expect(mockElectronAPI.pty!.resize).toHaveBeenCalledWith(
				"test-pty-session",
				100,
				30
			);
		});

		it("should not call resize when no session exists", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.resize();
			});

			expect(mockElectronAPI.pty!.resize).not.toHaveBeenCalled();
		});
	});

	describe("CLI provider management", () => {
		it("should switch between providers", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			expect(result.current.cliProvider).toBe("claude");
			expect(result.current.isGeminiMode).toBe(false);

			act(() => {
				result.current.setCliProvider("codex");
			});

			expect(result.current.cliProvider).toBe("codex");
			expect(result.current.isGeminiMode).toBe(false);

			act(() => {
				result.current.setCliProvider("shell");
			});

			expect(result.current.cliProvider).toBe("shell");
			expect(result.current.isGeminiMode).toBe(false);

			act(() => {
				result.current.setCliProvider("gemini");
			});

			expect(result.current.cliProvider).toBe("gemini");
			expect(result.current.isGeminiMode).toBe(true);
		});

		it("should update selected model", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setSelectedModel("openai/gpt-4o");
			});

			expect(result.current.selectedModel).toBe("openai/gpt-4o");
		});

		it("should clear selected model", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setSelectedModel("openai/gpt-4o");
			});

			act(() => {
				result.current.setSelectedModel(null);
			});

			expect(result.current.selectedModel).toBeNull();
		});
	});

	describe("legacy mode management", () => {
		it("should toggle Gemini mode via setGeminiMode (legacy)", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			expect(result.current.isGeminiMode).toBe(false);
			expect(result.current.cliProvider).toBe("claude");

			act(() => {
				result.current.setGeminiMode(false);
			});

			expect(result.current.isGeminiMode).toBe(false);
			expect(result.current.cliProvider).toBe("shell");

			act(() => {
				result.current.setGeminiMode(true);
			});

			expect(result.current.isGeminiMode).toBe(true);
			expect(result.current.cliProvider).toBe("gemini");
		});

		it("should set working directory", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setWorkingDirectory("/home/user/projects");
			});

			expect(result.current.workingDirectory).toBe("/home/user/projects");
		});
	});

	describe("skill context management", () => {
		it("should set active skill", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			const skill = {
				id: "test-skill",
				name: "Test Skill",
				content: "Test skill content",
			};

			act(() => {
				result.current.setActiveSkill(skill);
			});

			expect(result.current.activeSkill).toEqual(skill);
			expect(result.current.skillPromptSent).toBe(false);
		});

		it("should clear skill context", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			const skill = {
				id: "test-skill",
				name: "Test Skill",
				content: "Test skill content",
			};

			act(() => {
				result.current.setActiveSkill(skill);
			});

			act(() => {
				result.current.clearSkillContext();
			});

			expect(result.current.activeSkill).toBeNull();
			expect(result.current.skillPromptSent).toBe(false);
		});

		it("should send skill prompt only for Gemini provider", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("gemini");
			});

			const skill = {
				id: "test-skill",
				name: "Test Skill",
				content: "Test skill content",
			};

			// Connect first
			await act(async () => {
				await result.current.connect();
			});

			act(() => {
				result.current.setActiveSkill(skill);
			});

			act(() => {
				result.current.sendSkillPrompt();
			});

			expect(mockElectronAPI.pty!.write).toHaveBeenCalledWith(
				"test-pty-session",
				expect.stringContaining("Test Skill")
			);
			expect(result.current.skillPromptSent).toBe(true);
		});

		it("should not send skill prompt for Codex provider", async () => {
			// Setup API key mock
			vi.mocked(mockElectronAPI.apiKeys.get).mockResolvedValue({
				falApiKey: "",
				freesoundApiKey: "",
				geminiApiKey: "",
				openRouterApiKey: "sk-or-test-key",
				anthropicApiKey: "",
				elevenLabsApiKey: "",
			});

			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.setCliProvider("codex");
			});

			// Connect
			await act(async () => {
				await result.current.connect();
			});

			const skill = {
				id: "test-skill",
				name: "Test Skill",
				content: "Test skill content",
			};

			act(() => {
				result.current.setActiveSkill(skill);
			});

			// Clear previous write calls from connection
			vi.mocked(mockElectronAPI.pty!.write).mockClear();

			act(() => {
				result.current.sendSkillPrompt();
			});

			// Should not send prompt for Codex (uses --full-context flag instead)
			expect(mockElectronAPI.pty!.write).not.toHaveBeenCalled();
			expect(result.current.skillPromptSent).toBe(false);
		});
	});

	describe("internal state handlers", () => {
		it("should handle connected event", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.handleConnected("session-from-ipc");
			});

			expect(result.current.sessionId).toBe("session-from-ipc");
			expect(result.current.status).toBe("connected");
		});

		it("should handle disconnected event", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Set up connected state first
			act(() => {
				result.current.handleConnected("test-session");
			});

			// Handle disconnection
			act(() => {
				result.current.handleDisconnected(0);
			});

			expect(result.current.sessionId).toBeNull();
			expect(result.current.status).toBe("disconnected");
			expect(result.current.exitCode).toBe(0);
			expect(result.current.skillPromptSent).toBe(false);
		});

		it("should handle error event", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				result.current.handleError("Connection lost");
			});

			expect(result.current.status).toBe("error");
			expect(result.current.error).toBe("Connection lost");
		});
	});

	describe("auto-connect", () => {
		it("skips auto-connect after an explicit user disconnect", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.disconnect({ userInitiated: true });
			});

			vi.mocked(mockElectronAPI.pty!.spawn).mockClear();

			await act(async () => {
				await result.current.ensureAutoConnected({
					projectId: "project-1",
					cwd: "/tmp/project-1",
				});
			});

			expect(mockElectronAPI.pty!.spawn).not.toHaveBeenCalled();
		});

		it("auto-connects once per project context", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			await act(async () => {
				await result.current.ensureAutoConnected({
					projectId: "project-1",
					cwd: "/tmp/project-1",
				});
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledTimes(1);

			await act(async () => {
				usePtyTerminalStore.setState({
					sessionId: null,
					status: "disconnected",
				});
			});

			await act(async () => {
				await result.current.ensureAutoConnected({
					projectId: "project-1",
					cwd: "/tmp/project-1",
				});
			});

			expect(mockElectronAPI.pty!.spawn).toHaveBeenCalledTimes(1);
		});
	});

	describe("reset", () => {
		it("should reset all state to initial values", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Modify state
			await act(async () => {
				await result.current.connect();
			});
			act(() => {
				result.current.setDimensions(100, 50);
				result.current.setCliProvider("codex");
				result.current.setSelectedModel("openai/gpt-4o");
				result.current.setWorkingDirectory("/test");
				result.current.setActiveSkill({
					id: "skill",
					name: "Skill",
					content: "Content",
				});
			});

			// Reset
			act(() => {
				result.current.reset();
			});

			expect(result.current.sessionId).toBeNull();
			expect(result.current.status).toBe("disconnected");
			expect(result.current.cols).toBe(80);
			expect(result.current.rows).toBe(24);
			expect(result.current.cliProvider).toBe("claude");
			expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4");
			expect(result.current.isGeminiMode).toBe(false);
			expect(result.current.projectId).toBeNull();
			expect(result.current.workingDirectory).toBe("");
			expect(result.current.autoConnectOnLoad).toBe(true);
			expect(result.current.hasUserDisconnected).toBe(false);
			expect(result.current.activeSkill).toBeNull();
			expect(result.current.sessions.size).toBe(0);
			expect(result.current.sessionOrder).toEqual([]);
			expect(result.current.activeSessionId).toBeNull();
		});
	});

	describe("multi-session management", () => {
		it("should create a session and set it as active", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tabId: string;
			act(() => {
				tabId = result.current.createSession();
			});

			expect(result.current.sessions.size).toBe(1);
			expect(result.current.sessionOrder).toHaveLength(1);
			expect(result.current.activeSessionId).toBe(tabId!);

			const session = result.current.sessions.get(tabId!);
			expect(session).toBeDefined();
			expect(session!.status).toBe("disconnected");
			expect(session!.cliProvider).toBe("claude");
			expect(session!.label).toContain("Claude Code");
		});

		it("should create multiple sessions", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tab1: string;
			let tab2: string;
			act(() => {
				tab1 = result.current.createSession();
				tab2 = result.current.createSession("shell");
			});

			expect(result.current.sessions.size).toBe(2);
			expect(result.current.sessionOrder).toEqual([tab1!, tab2!]);
			// First session is active
			expect(result.current.activeSessionId).toBe(tab1!);

			const shellSession = result.current.sessions.get(tab2!);
			expect(shellSession!.cliProvider).toBe("shell");
			expect(shellSession!.label).toContain("Shell");
		});

		it("should enforce max sessions limit", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			act(() => {
				for (let i = 0; i < 7; i++) {
					result.current.createSession();
				}
			});

			expect(result.current.sessions.size).toBe(5);
		});

		it("should switch between sessions", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tab1: string;
			let tab2: string;
			act(() => {
				tab1 = result.current.createSession();
				tab2 = result.current.createSession("shell");
			});

			expect(result.current.activeSessionId).toBe(tab1!);
			expect(result.current.cliProvider).toBe("claude");

			act(() => {
				result.current.switchSession(tab2!);
			});

			expect(result.current.activeSessionId).toBe(tab2!);
			expect(result.current.cliProvider).toBe("shell");
		});

		it("should close a session and switch to next", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tab1: string;
			let tab2: string;
			act(() => {
				tab1 = result.current.createSession();
				tab2 = result.current.createSession("shell");
			});

			// Close the active session (tab1)
			await act(async () => {
				await result.current.closeSession(tab1!);
			});

			expect(result.current.sessions.size).toBe(1);
			expect(result.current.activeSessionId).toBe(tab2!);
			expect(result.current.cliProvider).toBe("shell");
		});

		it("should close last session and reset to null", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tabId: string;
			act(() => {
				tabId = result.current.createSession();
			});

			await act(async () => {
				await result.current.closeSession(tabId!);
			});

			expect(result.current.sessions.size).toBe(0);
			expect(result.current.activeSessionId).toBeNull();
			expect(result.current.status).toBe("disconnected");
		});

		it("should rename a session", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			let tabId: string;
			act(() => {
				tabId = result.current.createSession();
			});

			act(() => {
				result.current.renameSession(tabId!, "My Agent");
			});

			expect(result.current.sessions.get(tabId!)!.label).toBe("My Agent");
		});

		it("should inherit flat field provider when creating a session", () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			// Set provider before any session exists
			act(() => {
				result.current.setCliProvider("gemini");
			});

			let tabId: string;
			act(() => {
				tabId = result.current.createSession();
			});

			const session = result.current.sessions.get(tabId!);
			expect(session!.cliProvider).toBe("gemini");
		});

		it("should connect creates session if none exist", async () => {
			const { result } = renderHook(() => usePtyTerminalStore());

			expect(result.current.sessions.size).toBe(0);

			await act(async () => {
				await result.current.connect({ manual: true });
			});

			expect(result.current.sessions.size).toBe(1);
			expect(result.current.status).toBe("connected");
		});
	});
});
