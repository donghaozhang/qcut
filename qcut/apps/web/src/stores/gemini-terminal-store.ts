import { create } from "zustand";
import { generateUUID } from "@/lib/utils";
import { platform } from "@qcut/platform-core";

// ============================================================================
// Types
// ============================================================================

export type ChatProvider = "gemini" | "pi-agent";

export type PiProviderType = "anthropic" | "openai" | "google" | "openrouter";

export interface ToolCallInfo {
	toolCallId: string;
	toolName: string;
	params: Record<string, unknown>;
	result?: unknown;
	isError?: boolean;
	startTime: number;
	duration?: number;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	attachments?: AttachedFile[];
	toolCalls?: ToolCallInfo[];
	timestamp: number;
}

export interface AttachedFile {
	id: string;
	mediaId?: string; // Reference to MediaItem if from media panel
	path: string; // File path (for Electron IPC)
	name: string;
	type: "image" | "video" | "audio";
	thumbnailUrl?: string;
	mimeType: string;
}

interface GeminiTerminalStore {
	// Chat state
	messages: ChatMessage[];
	isStreaming: boolean;
	currentStreamingContent: string;
	error: string | null;

	// Provider selection
	activeProvider: ChatProvider;
	setActiveProvider: (provider: ChatProvider) => void;

	// Pi Agent model switching
	selectedPiProvider: PiProviderType;
	selectedPiModel: string;
	setPiModel: (provider: PiProviderType, model: string) => Promise<void>;

	// Tool call tracking (pi-agent only)
	activeToolCalls: ToolCallInfo[];
	handleToolCall: (
		toolCallId: string,
		toolName: string,
		params: Record<string, unknown>
	) => void;
	handleToolResult: (
		toolCallId: string,
		toolName: string,
		result: unknown,
		isError: boolean
	) => void;

	// Attachments (files dragged into terminal)
	pendingAttachments: AttachedFile[];

	// UI state
	inputValue: string;
	setInputValue: (value: string) => void;

	// Actions
	sendMessage: (content: string) => Promise<void>;
	addAttachment: (file: AttachedFile) => void;
	removeAttachment: (id: string) => void;
	clearAttachments: () => void;
	clearHistory: () => void;
	resetPiConversation: () => Promise<void>;

	// Streaming handlers (called by IPC listeners)
	handleStreamChunk: (chunk: string) => void;
	handleStreamComplete: () => void;
	handleStreamError: (error: string) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useGeminiTerminalStore = create<GeminiTerminalStore>(
	(set, get) => ({
		// Initial state
		messages: [],
		isStreaming: false,
		currentStreamingContent: "",
		error: null,
		pendingAttachments: [],
		inputValue: "",

		// Provider selection
		activeProvider: "gemini",
		setActiveProvider: (provider: ChatProvider) => {
			set({
				activeProvider: provider,
				messages: [],
				currentStreamingContent: "",
				error: null,
				activeToolCalls: [],
			});
		},

		// Pi Agent model switching
		selectedPiProvider: "anthropic",
		selectedPiModel: "claude-sonnet-4-20250514",
		setPiModel: async (provider: PiProviderType, model: string) => {
			set({
				selectedPiProvider: provider,
				selectedPiModel: model,
				messages: [],
				currentStreamingContent: "",
				error: null,
				activeToolCalls: [],
			});
			if (platform().piAgent) {
				await platform().piAgent!.setModel({ provider, model });
			}
		},

		// Tool call tracking
		activeToolCalls: [],
		handleToolCall: (
			toolCallId: string,
			toolName: string,
			params: Record<string, unknown>
		) => {
			const toolCall: ToolCallInfo = {
				toolCallId,
				toolName,
				params,
				startTime: Date.now(),
			};
			set((state) => ({
				activeToolCalls: [...state.activeToolCalls, toolCall],
			}));
		},
		handleToolResult: (
			toolCallId: string,
			_toolName: string,
			result: unknown,
			isError: boolean
		) => {
			set((state) => ({
				activeToolCalls: state.activeToolCalls.map((tc) =>
					tc.toolCallId === toolCallId
						? {
								...tc,
								result,
								isError,
								duration: Date.now() - tc.startTime,
							}
						: tc
				),
			}));
		},

		// UI state setters
		setInputValue: (value: string) => set({ inputValue: value }),

		// Add attachment (from drag-drop or context menu)
		addAttachment: (file: AttachedFile) => {
			set((state) => ({
				pendingAttachments: [...state.pendingAttachments, file],
			}));
		},

		// Remove attachment by ID
		removeAttachment: (id: string) => {
			set((state) => ({
				pendingAttachments: state.pendingAttachments.filter(
					(att) => att.id !== id
				),
			}));
		},

		// Clear all pending attachments
		clearAttachments: () => {
			set({ pendingAttachments: [] });
		},

		// Clear chat history
		clearHistory: () => {
			set({
				messages: [],
				currentStreamingContent: "",
				error: null,
				activeToolCalls: [],
			});
		},

		// Reset pi-agent conversation
		resetPiConversation: async () => {
			if (platform().piAgent) {
				await platform().piAgent!.reset();
			}
			set({
				messages: [],
				currentStreamingContent: "",
				error: null,
				activeToolCalls: [],
			});
		},

		// Streaming handlers
		handleStreamChunk: (chunk: string) => {
			set((state) => ({
				currentStreamingContent: state.currentStreamingContent + chunk,
			}));
		},

		handleStreamComplete: () => {
			const {
				currentStreamingContent,
				messages,
				activeProvider,
				activeToolCalls,
			} = get();

			if (currentStreamingContent || activeToolCalls.length > 0) {
				const assistantMessage: ChatMessage = {
					id: generateUUID(),
					role: "assistant",
					content: currentStreamingContent,
					toolCalls:
						activeToolCalls.length > 0 ? [...activeToolCalls] : undefined,
					timestamp: Date.now(),
				};

				set({
					messages: [...messages, assistantMessage],
					isStreaming: false,
					currentStreamingContent: "",
					activeToolCalls: [],
				});
			} else {
				set({
					isStreaming: false,
					currentStreamingContent: "",
					activeToolCalls: [],
				});
			}

			// Cleanup listeners
			if (activeProvider === "gemini") {
				platform().geminiChat?.removeListeners();
			} else {
				platform().piAgent?.removeListeners();
			}
		},

		handleStreamError: (errorMessage: string) => {
			const { activeProvider } = get();
			set({
				isStreaming: false,
				error: errorMessage,
				currentStreamingContent: "",
				activeToolCalls: [],
			});

			// Cleanup listeners
			if (activeProvider === "gemini") {
				platform().geminiChat?.removeListeners();
			} else {
				platform().piAgent?.removeListeners();
			}
		},

		// Send message
		sendMessage: async (content: string) => {
			const { messages, pendingAttachments, activeProvider } = get();

			// Don't send empty messages without attachments
			if (!content.trim() && pendingAttachments.length === 0) {
				return;
			}

			// Create user message
			const userMessage: ChatMessage = {
				id: generateUUID(),
				role: "user",
				content: content.trim(),
				attachments:
					pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
				timestamp: Date.now(),
			};

			// Update state: add user message, start streaming, clear attachments
			set({
				messages: [...messages, userMessage],
				isStreaming: true,
				currentStreamingContent: "",
				pendingAttachments: [],
				inputValue: "",
				error: null,
				activeToolCalls: [],
			});

			if (activeProvider === "gemini") {
				await sendGeminiMessage(get, messages, userMessage, pendingAttachments);
			} else {
				await sendPiAgentMessage(get, content.trim());
			}
		},
	})
);

// ============================================================================
// Provider-specific send helpers
// ============================================================================

async function sendGeminiMessage(
	get: () => GeminiTerminalStore,
	previousMessages: ChatMessage[],
	userMessage: ChatMessage,
	attachments: AttachedFile[]
) {
	if (!platform().geminiChat) {
		get().handleStreamError(
			"Gemini Chat is only available in the desktop app. Please run QCut in Electron."
		);
		return;
	}

	const { handleStreamChunk, handleStreamComplete, handleStreamError } = get();

	platform().geminiChat!.onStreamChunk(({ text }) => {
		handleStreamChunk(text);
	});
	platform().geminiChat!.onStreamComplete(() => {
		handleStreamComplete();
	});
	platform().geminiChat!.onStreamError(({ message }) => {
		handleStreamError(message);
	});

	const attachmentsForIPC = attachments.map((att) => ({
		path: att.path,
		mimeType: att.mimeType,
		name: att.name,
	}));

	const allMessages = [...previousMessages, userMessage];
	const messagesForAPI = allMessages.map((m) => ({
		role: m.role,
		content: m.content,
	}));

	try {
		await platform().geminiChat!.send({
			messages: messagesForAPI,
			attachments: attachmentsForIPC.length > 0 ? attachmentsForIPC : undefined,
		});
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Failed to send message";
		handleStreamError(message);
	}
}

async function sendPiAgentMessage(
	get: () => GeminiTerminalStore,
	content: string
) {
	if (!platform().piAgent) {
		get().handleStreamError(
			"Pi Agent is only available in the desktop app. Please run QCut in Electron."
		);
		return;
	}

	const {
		handleStreamChunk,
		handleStreamComplete,
		handleStreamError,
		handleToolCall,
		handleToolResult,
		selectedPiProvider,
		selectedPiModel,
	} = get();

	platform().piAgent!.onStreamChunk(({ text }) => {
		handleStreamChunk(text);
	});
	platform().piAgent!.onToolCall(({ toolCallId, toolName, params }) => {
		handleToolCall(toolCallId, toolName, params);
	});
	platform().piAgent!.onToolResult(
		({ toolCallId, toolName, result, isError }) => {
			handleToolResult(toolCallId, toolName, result, isError);
		}
	);
	platform().piAgent!.onStreamComplete(() => {
		handleStreamComplete();
	});
	platform().piAgent!.onStreamError(({ message }) => {
		handleStreamError(message);
	});

	try {
		await platform().piAgent!.send({
			message: content,
			settings: {
				provider: selectedPiProvider,
				model: selectedPiModel,
			},
		});
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Failed to send message";
		handleStreamError(message);
	}
}
