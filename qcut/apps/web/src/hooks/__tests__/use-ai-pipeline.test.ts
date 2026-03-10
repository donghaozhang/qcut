/**
 * Tests for useAIPipeline hook
 *
 * @module hooks/__tests__/use-ai-pipeline.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { initPlatform, type PlatformAPI } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";
import { useAIPipeline } from "../use-ai-pipeline";
import type {
	AIPipelineProgress,
	AIPipelineResult,
	AIPipelineStatus,
} from "@/types/electron";

// ============================================================================
// Mock Setup
// ============================================================================

const createMockElectronAPI = () => ({
	aiPipeline: {
		check: vi.fn().mockResolvedValue({ available: true }),
		status: vi.fn().mockResolvedValue({
			available: true,
			version: "1.0.0",
			source: "bundled" as const,
			compatible: true,
			features: {
				textToVideo: true,
				imageToVideo: true,
				avatarGeneration: true,
			},
		}),
		generate: vi.fn().mockResolvedValue({
			success: true,
			outputPath: "/path/to/output.mp4",
			duration: 5.2,
		}),
		listModels: vi.fn().mockResolvedValue({
			success: true,
			models: ["sora-2", "kling-v1"],
		}),
		estimateCost: vi.fn().mockResolvedValue({
			success: true,
			cost: 0.15,
		}),
		cancel: vi.fn().mockResolvedValue({ success: true }),
		refresh: vi.fn().mockResolvedValue({
			available: true,
			version: "1.0.0",
			source: "bundled" as const,
			compatible: true,
			features: {},
		}),
		onProgress: vi.fn((_cb: (p: AIPipelineProgress) => void) => vi.fn()),
	},
});

describe("useAIPipeline", () => {
	let mockElectronAPI: ReturnType<typeof createMockElectronAPI>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockElectronAPI = createMockElectronAPI();
		(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI =
			mockElectronAPI;
		initPlatform(createDesktopAdapter());
	});

	afterEach(() => {
		Reflect.deleteProperty(window, "electronAPI");
	});

	// ==========================================================================
	// Availability Tests
	// ==========================================================================

	describe("availability check", () => {
		it("should check availability on mount", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(result.current.isChecked).toBe(true);
			});

			expect(result.current.isAvailable).toBe(true);
			expect(mockElectronAPI.aiPipeline.check).toHaveBeenCalledOnce();
		});

		it("should set error when not available", async () => {
			mockElectronAPI.aiPipeline.check.mockResolvedValue({
				available: false,
				error: "Binary not found",
			});

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(result.current.isChecked).toBe(true);
			});

			expect(result.current.isAvailable).toBe(false);
			expect(result.current.error).toBe("Binary not found");
		});

		it("should fetch detailed status on mount", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(result.current.status).not.toBeNull();
			});

			expect(result.current.status?.version).toBe("1.0.0");
			expect(result.current.status?.source).toBe("bundled");
			expect(mockElectronAPI.aiPipeline.status).toHaveBeenCalledOnce();
		});

		it("should handle missing electronAPI gracefully", async () => {
			// Use web adapter with aiPipeline nullified so optional chaining skips it
			const web = createWebAdapter();
			const adapter: PlatformAPI = { ...web, aiPipeline: undefined as any };
			initPlatform(adapter);

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(result.current.isChecked).toBe(true);
			});

			// When aiPipeline is missing, isAvailable should be false
			expect(result.current.isAvailable).toBe(false);
		});
	});

	// ==========================================================================
	// Generate Tests
	// ==========================================================================

	describe("generate", () => {
		it("should generate content successfully", async () => {
			const mockResult: AIPipelineResult = {
				success: true,
				outputPath: "/path/to/output.mp4",
				duration: 5.2,
			};
			mockElectronAPI.aiPipeline.generate.mockResolvedValue(mockResult);

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			let generateResult: AIPipelineResult | undefined;
			await act(async () => {
				generateResult = await result.current.generate({
					command: "create-video",
					args: { prompt: "A sunset", model: "sora-2" },
				});
			});

			expect(generateResult).toEqual(mockResult);
			expect(result.current.result).toEqual(mockResult);
			expect(result.current.isGenerating).toBe(false);
		});

		it("should handle generation errors", async () => {
			const onError = vi.fn();
			mockElectronAPI.aiPipeline.generate.mockResolvedValue({
				success: false,
				error: "API key invalid",
			});

			const { result } = renderHook(() => useAIPipeline({ onError }));

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			await act(async () => {
				await result.current.generate({
					command: "generate-image",
					args: { prompt: "test" },
				});
			});

			expect(onError).toHaveBeenCalledWith("API key invalid");
			expect(result.current.error).toBe("API key invalid");
		});

		it("should return error when pipeline not available", async () => {
			mockElectronAPI.aiPipeline.check.mockResolvedValue({ available: false });

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(false));

			let generateResult: AIPipelineResult | undefined;
			await act(async () => {
				generateResult = await result.current.generate({
					command: "create-video",
					args: {},
				});
			});

			expect(generateResult?.success).toBe(false);
			expect(generateResult?.error).toContain("not available");
		});

		it("should call onComplete callback on success", async () => {
			const onComplete = vi.fn();
			const mockResult: AIPipelineResult = {
				success: true,
				outputPath: "/path/to/video.mp4",
			};
			mockElectronAPI.aiPipeline.generate.mockResolvedValue(mockResult);

			const { result } = renderHook(() => useAIPipeline({ onComplete }));

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			await act(async () => {
				await result.current.generate({
					command: "create-video",
					args: { prompt: "test" },
				});
			});

			expect(onComplete).toHaveBeenCalledWith(mockResult);
		});

		it("should include sessionId in generate call", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			await act(async () => {
				await result.current.generate({
					command: "create-video",
					args: { prompt: "test" },
				});
			});

			expect(mockElectronAPI.aiPipeline.generate).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: expect.stringMatching(/^ai-\d+-[a-z0-9]+$/),
				})
			);
		});
	});

	// ==========================================================================
	// Cancel Tests
	// ==========================================================================

	describe("cancel", () => {
		it("should cancel ongoing generation", async () => {
			// Simulate a long-running generation
			mockElectronAPI.aiPipeline.generate.mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(() => resolve({ success: true }), 10_000)
					)
			);

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			// Start generation (don't await)
			act(() => {
				result.current.generate({ command: "create-video", args: {} });
			});

			// Wait for isGenerating to be true
			await waitFor(() => expect(result.current.isGenerating).toBe(true));

			// Cancel immediately
			await act(async () => {
				await result.current.cancel();
			});

			expect(mockElectronAPI.aiPipeline.cancel).toHaveBeenCalled();
			expect(result.current.isGenerating).toBe(false);
		});

		it("should not call cancel if no session active", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			await act(async () => {
				await result.current.cancel();
			});

			expect(mockElectronAPI.aiPipeline.cancel).not.toHaveBeenCalled();
		});
	});

	// ==========================================================================
	// Progress Tests
	// ==========================================================================

	describe("progress updates", () => {
		it("should set up progress listener on mount", async () => {
			renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(mockElectronAPI.aiPipeline.onProgress).toHaveBeenCalled();
			});
		});

		it("should call onProgress callback with progress data", async () => {
			const onProgress = vi.fn();
			let progressCallback: ((p: AIPipelineProgress) => void) | undefined;

			mockElectronAPI.aiPipeline.onProgress.mockImplementation(
				(cb: (p: AIPipelineProgress) => void) => {
					progressCallback = cb;
					return vi.fn();
				}
			);

			const { result } = renderHook(() => useAIPipeline({ onProgress }));

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			// Simulate progress update
			const progressData: AIPipelineProgress = {
				stage: "generating",
				percent: 50,
				message: "Half done",
			};

			act(() => {
				progressCallback?.(progressData);
			});

			expect(onProgress).toHaveBeenCalledWith(progressData);
			expect(result.current.progress).toEqual(progressData);
		});

		it("should clean up progress listener on unmount", async () => {
			const cleanup = vi.fn();
			mockElectronAPI.aiPipeline.onProgress.mockReturnValue(cleanup);

			const { unmount } = renderHook(() => useAIPipeline());

			await waitFor(() => {
				expect(mockElectronAPI.aiPipeline.onProgress).toHaveBeenCalled();
			});

			unmount();

			expect(cleanup).toHaveBeenCalled();
		});
	});

	// ==========================================================================
	// List Models Tests
	// ==========================================================================

	describe("listModels", () => {
		it("should list models successfully", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			let modelsResult: AIPipelineResult | undefined;
			await act(async () => {
				modelsResult = await result.current.listModels();
			});

			expect(modelsResult?.success).toBe(true);
			expect(modelsResult?.models).toEqual(["sora-2", "kling-v1"]);
		});

		it("should return error when not available", async () => {
			mockElectronAPI.aiPipeline.check.mockResolvedValue({ available: false });

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(false));

			let modelsResult: AIPipelineResult | undefined;
			await act(async () => {
				modelsResult = await result.current.listModels();
			});

			expect(modelsResult?.success).toBe(false);
			expect(modelsResult?.error).toContain("not available");
		});
	});

	// ==========================================================================
	// Estimate Cost Tests
	// ==========================================================================

	describe("estimateCost", () => {
		it("should estimate cost successfully", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			let costResult: AIPipelineResult | undefined;
			await act(async () => {
				costResult = await result.current.estimateCost("sora-2", 10, "1080p");
			});

			expect(costResult?.success).toBe(true);
			expect(costResult?.cost).toBe(0.15);
			expect(mockElectronAPI.aiPipeline.estimateCost).toHaveBeenCalledWith({
				model: "sora-2",
				duration: 10,
				resolution: "1080p",
			});
		});
	});

	// ==========================================================================
	// Refresh Environment Tests
	// ==========================================================================

	describe("refreshEnvironment", () => {
		it("should refresh environment detection", async () => {
			const newStatus: AIPipelineStatus = {
				available: true,
				version: "1.1.0",
				source: "system",
				compatible: true,
				features: { textToVideo: true },
			};
			mockElectronAPI.aiPipeline.refresh.mockResolvedValue(newStatus);

			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isAvailable).toBe(true));

			let refreshedStatus: AIPipelineStatus | null = null;
			await act(async () => {
				refreshedStatus = await result.current.refreshEnvironment();
			});

			expect(refreshedStatus).toEqual(newStatus);
			expect(result.current.status).toEqual(newStatus);
		});
	});

	// ==========================================================================
	// Check Availability Tests
	// ==========================================================================

	describe("checkAvailability", () => {
		it("should allow manual availability check", async () => {
			const { result } = renderHook(() => useAIPipeline());

			await waitFor(() => expect(result.current.isChecked).toBe(true));

			// Reset mock
			mockElectronAPI.aiPipeline.check.mockClear();

			let available: boolean | undefined;
			await act(async () => {
				available = await result.current.checkAvailability();
			});

			expect(available).toBe(true);
			expect(mockElectronAPI.aiPipeline.check).toHaveBeenCalledOnce();
		});
	});
});
