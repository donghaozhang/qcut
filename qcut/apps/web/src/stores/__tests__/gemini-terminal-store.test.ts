import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { initPlatform, type PlatformAPI } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";
import {
	useGeminiTerminalStore,
	type AttachedFile,
} from "@/stores/gemini-terminal-store";
import { mockElectronAPI, setupElectronMock } from "@/test/mocks/electron";

describe("useGeminiTerminalStore", () => {
	let cleanupElectron: () => void;

	beforeEach(() => {
		// Setup Electron mock
		cleanupElectron = setupElectronMock();
		initPlatform(createDesktopAdapter());

		// Reset store state
		useGeminiTerminalStore.setState({
			messages: [],
			isStreaming: false,
			currentStreamingContent: "",
			error: null,
			pendingAttachments: [],
			inputValue: "",
		});

		// Reset all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanupElectron();
	});

	describe("initial state", () => {
		it("should have correct default values", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			expect(result.current.messages).toEqual([]);
			expect(result.current.isStreaming).toBe(false);
			expect(result.current.currentStreamingContent).toBe("");
			expect(result.current.pendingAttachments).toEqual([]);
			expect(result.current.inputValue).toBe("");
			expect(result.current.error).toBeNull();
		});
	});

	describe("input management", () => {
		it("should update input value", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.setInputValue("Hello Gemini");
			});

			expect(result.current.inputValue).toBe("Hello Gemini");
		});

		it("should clear input on send", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.setInputValue("Test message");
			});

			await act(async () => {
				await result.current.sendMessage("Test message");
			});

			expect(result.current.inputValue).toBe("");
		});
	});

	describe("attachment management", () => {
		it("should add attachment", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			const attachment: AttachedFile = {
				id: "att-1",
				mediaId: "media-1",
				path: "/path/to/image.jpg",
				name: "image.jpg",
				type: "image",
				thumbnailUrl: "thumb.jpg",
				mimeType: "image/jpeg",
			};

			act(() => {
				result.current.addAttachment(attachment);
			});

			expect(result.current.pendingAttachments).toHaveLength(1);
			expect(result.current.pendingAttachments[0]).toEqual(attachment);
		});

		it("should remove attachment by id", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			const attachment1: AttachedFile = {
				id: "att-1",
				mediaId: "media-1",
				path: "/path/to/image1.jpg",
				name: "image1.jpg",
				type: "image",
				thumbnailUrl: "thumb1.jpg",
				mimeType: "image/jpeg",
			};

			const attachment2: AttachedFile = {
				id: "att-2",
				mediaId: "media-2",
				path: "/path/to/image2.jpg",
				name: "image2.jpg",
				type: "image",
				thumbnailUrl: "thumb2.jpg",
				mimeType: "image/jpeg",
			};

			act(() => {
				result.current.addAttachment(attachment1);
				result.current.addAttachment(attachment2);
			});

			expect(result.current.pendingAttachments).toHaveLength(2);

			act(() => {
				result.current.removeAttachment("att-1");
			});

			expect(result.current.pendingAttachments).toHaveLength(1);
			expect(result.current.pendingAttachments[0].id).toBe("att-2");
		});

		it("should clear all attachments", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.addAttachment({
					id: "att-1",
					path: "/path/1",
					name: "file1",
					type: "image",
					mimeType: "image/jpeg",
				});
				result.current.addAttachment({
					id: "att-2",
					path: "/path/2",
					name: "file2",
					type: "image",
					mimeType: "image/jpeg",
				});
			});

			expect(result.current.pendingAttachments).toHaveLength(2);

			act(() => {
				result.current.clearAttachments();
			});

			expect(result.current.pendingAttachments).toEqual([]);
		});

		it("should clear attachments after sending message", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			const attachment: AttachedFile = {
				id: "att-1",
				mediaId: "media-1",
				path: "/path/to/image.jpg",
				name: "image.jpg",
				type: "image",
				thumbnailUrl: "thumb.jpg",
				mimeType: "image/jpeg",
			};

			act(() => {
				result.current.addAttachment(attachment);
			});

			await act(async () => {
				await result.current.sendMessage("Analyze this image");
			});

			expect(result.current.pendingAttachments).toEqual([]);
		});
	});

	describe("sendMessage", () => {
		it("should add user message to history", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("Hello");
			});

			expect(result.current.messages).toHaveLength(1);
			expect(result.current.messages[0].role).toBe("user");
			expect(result.current.messages[0].content).toBe("Hello");
		});

		it("should set isStreaming to true during send", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("Hello");
			});

			// After sendMessage, isStreaming should be true (waiting for response)
			expect(result.current.isStreaming).toBe(true);
		});

		it("should clear error state before sending", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			// Set error state
			act(() => {
				result.current.handleStreamError("Previous error");
			});
			expect(result.current.error).toBe("Previous error");

			// Send message
			await act(async () => {
				await result.current.sendMessage("Hello");
			});

			expect(result.current.error).toBeNull();
		});

		it("should not send empty messages", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("");
			});

			expect(mockElectronAPI.geminiChat!.send).not.toHaveBeenCalled();
			expect(result.current.messages).toHaveLength(0);
		});

		it("should not send whitespace-only messages", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("   ");
			});

			expect(mockElectronAPI.geminiChat!.send).not.toHaveBeenCalled();
			expect(result.current.messages).toHaveLength(0);
		});

		it("should setup stream listeners before sending", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("Hello");
			});

			expect(mockElectronAPI.geminiChat!.onStreamChunk).toHaveBeenCalled();
			expect(mockElectronAPI.geminiChat!.onStreamComplete).toHaveBeenCalled();
			expect(mockElectronAPI.geminiChat!.onStreamError).toHaveBeenCalled();
		});

		it("should include attachments in API call", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			const attachment: AttachedFile = {
				id: "att-1",
				mediaId: "media-1",
				path: "/path/to/video.mp4",
				name: "video.mp4",
				type: "video",
				thumbnailUrl: "thumb.jpg",
				mimeType: "video/mp4",
			};

			act(() => {
				result.current.addAttachment(attachment);
			});

			await act(async () => {
				await result.current.sendMessage("Analyze this video");
			});

			expect(mockElectronAPI.geminiChat!.send).toHaveBeenCalledWith(
				expect.objectContaining({
					attachments: [
						expect.objectContaining({
							path: "/path/to/video.mp4",
							mimeType: "video/mp4",
							name: "video.mp4",
						}),
					],
				})
			);
		});

		it("should handle send exception", async () => {
			vi.mocked(mockElectronAPI.geminiChat!.send).mockRejectedValueOnce(
				new Error("Network error")
			);

			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("Hello");
			});

			expect(result.current.error).toBe("Network error");
			expect(result.current.isStreaming).toBe(false);
		});
	});

	describe("streaming handlers", () => {
		it("should accumulate streaming content", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.handleStreamChunk("Hello");
			});

			expect(result.current.currentStreamingContent).toBe("Hello");

			act(() => {
				result.current.handleStreamChunk(" world");
			});

			expect(result.current.currentStreamingContent).toBe("Hello world");
		});

		it("should create assistant message on stream complete", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			// Simulate streaming
			act(() => {
				useGeminiTerminalStore.setState({
					isStreaming: true,
					currentStreamingContent: "This is the response",
				});
			});

			act(() => {
				result.current.handleStreamComplete();
			});

			expect(result.current.messages).toHaveLength(1);
			expect(result.current.messages[0].role).toBe("assistant");
			expect(result.current.messages[0].content).toBe("This is the response");
			expect(result.current.isStreaming).toBe(false);
			expect(result.current.currentStreamingContent).toBe("");
		});

		it("should handle empty streaming content on complete", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				useGeminiTerminalStore.setState({
					isStreaming: true,
					currentStreamingContent: "",
				});
			});

			act(() => {
				result.current.handleStreamComplete();
			});

			// Should not add empty message
			expect(result.current.messages).toHaveLength(0);
			expect(result.current.isStreaming).toBe(false);
		});

		it("should set error on stream error", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.handleStreamError("API rate limit exceeded");
			});

			expect(result.current.error).toBe("API rate limit exceeded");
			expect(result.current.isStreaming).toBe(false);
			expect(result.current.currentStreamingContent).toBe("");
		});
	});

	describe("clearHistory", () => {
		it("should clear all messages", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			// Add some messages
			act(() => {
				useGeminiTerminalStore.setState({
					messages: [
						{ id: "1", role: "user", content: "Hello", timestamp: Date.now() },
						{
							id: "2",
							role: "assistant",
							content: "Hi there",
							timestamp: Date.now(),
						},
					],
				});
			});

			expect(result.current.messages.length).toBe(2);

			act(() => {
				result.current.clearHistory();
			});

			expect(result.current.messages).toEqual([]);
		});

		it("should clear error state", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				result.current.handleStreamError("Some error");
			});

			expect(result.current.error).toBe("Some error");

			act(() => {
				result.current.clearHistory();
			});

			expect(result.current.error).toBeNull();
		});

		it("should clear streaming content", () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			act(() => {
				useGeminiTerminalStore.setState({
					currentStreamingContent: "Partial content",
				});
			});

			act(() => {
				result.current.clearHistory();
			});

			expect(result.current.currentStreamingContent).toBe("");
		});
	});

	describe("message structure", () => {
		it("should create messages with correct structure", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			await act(async () => {
				await result.current.sendMessage("Test message");
			});

			const message = result.current.messages[0];
			expect(message).toHaveProperty("id");
			expect(message).toHaveProperty("role", "user");
			expect(message).toHaveProperty("content", "Test message");
			expect(message).toHaveProperty("timestamp");
			expect(typeof message.id).toBe("string");
			expect(typeof message.timestamp).toBe("number");
		});

		it("should include attachments in user message", async () => {
			const { result } = renderHook(() => useGeminiTerminalStore());

			const attachment: AttachedFile = {
				id: "att-1",
				path: "/path/to/file.jpg",
				name: "file.jpg",
				type: "image",
				mimeType: "image/jpeg",
			};

			act(() => {
				result.current.addAttachment(attachment);
			});

			await act(async () => {
				await result.current.sendMessage("Check this");
			});

			const message = result.current.messages[0];
			expect(message.attachments).toHaveLength(1);
			expect(message.attachments![0].path).toBe("/path/to/file.jpg");
		});
	});
});

describe("useGeminiTerminalStore - API unavailable", () => {
	beforeEach(() => {
		// Create a web adapter with geminiChat explicitly set to undefined
		const webAdapter = createWebAdapter();
		const adapterWithoutGemini: PlatformAPI = {
			...webAdapter,
			geminiChat: undefined as any,
		};
		initPlatform(adapterWithoutGemini);

		// Reset store
		useGeminiTerminalStore.setState({
			messages: [],
			isStreaming: false,
			currentStreamingContent: "",
			error: null,
			pendingAttachments: [],
			inputValue: "",
		});

		vi.clearAllMocks();
	});

	it("should handle missing Gemini API gracefully", async () => {
		const { result } = renderHook(() => useGeminiTerminalStore());

		await act(async () => {
			await result.current.sendMessage("Hello");
		});

		// Should set error state when API is unavailable
		expect(result.current.error).toContain("only available in the desktop app");
		expect(result.current.isStreaming).toBe(false);
	});
});
