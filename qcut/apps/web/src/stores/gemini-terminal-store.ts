import { create } from "zustand";
import { generateUUID } from "@/lib/utils";
import { platform } from "@qcut/platform-core";

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	attachments?: AttachedFile[];
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
			});
		},

		// Streaming handlers
		handleStreamChunk: (chunk: string) => {
			set((state) => ({
				currentStreamingContent: state.currentStreamingContent + chunk,
			}));
		},

		handleStreamComplete: () => {
			const { currentStreamingContent, messages } = get();

			if (currentStreamingContent) {
				const assistantMessage: ChatMessage = {
					id: generateUUID(),
					role: "assistant",
					content: currentStreamingContent,
					timestamp: Date.now(),
				};

				set({
					messages: [...messages, assistantMessage],
					isStreaming: false,
					currentStreamingContent: "",
				});
			} else {
				set({
					isStreaming: false,
					currentStreamingContent: "",
				});
			}

			// Cleanup listeners
			platform().geminiChat?.removeListeners();
		},

		handleStreamError: (errorMessage: string) => {
			set({
				isStreaming: false,
				error: errorMessage,
				currentStreamingContent: "",
			});

			// Cleanup listeners
			platform().geminiChat?.removeListeners();
		},

		// Send message to Gemini
		sendMessage: async (content: string) => {
			const { messages, pendingAttachments } = get();

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
			});

			// Check if Gemini Chat API is available
			if (!platform().geminiChat) {
				set({
					isStreaming: false,
					error:
						"Gemini Chat is only available in the desktop app. Please run QCut in Electron.",
				});
				return;
			}

			// Set up stream listeners
			const { handleStreamChunk, handleStreamComplete, handleStreamError } =
				get();

			platform().geminiChat!.onStreamChunk(({ text }) => {
				handleStreamChunk(text);
			});

			platform().geminiChat!.onStreamComplete(() => {
				handleStreamComplete();
			});

			platform().geminiChat!.onStreamError(({ message }) => {
				handleStreamError(message);
			});

			// Format attachments for IPC
			const attachmentsForIPC = pendingAttachments.map((att) => ({
				path: att.path,
				mimeType: att.mimeType,
				name: att.name,
			}));

			// Format all messages for API (including the new user message)
			const allMessages = [...messages, userMessage];
			const messagesForAPI = allMessages.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			// Send to Gemini
			try {
				await platform().geminiChat!.send({
					messages: messagesForAPI,
					attachments:
						attachmentsForIPC.length > 0 ? attachmentsForIPC : undefined,
				});
			} catch (error: any) {
				handleStreamError(error.message || "Failed to send message");
			}
		},
	})
);
