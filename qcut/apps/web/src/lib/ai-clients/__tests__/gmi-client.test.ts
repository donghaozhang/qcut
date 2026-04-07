import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock platform before importing
vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({
		apiKeys: { get: vi.fn().mockResolvedValue(null) },
	})),
}));

import { platform } from "@qcut/platform-core";
import { gmiClient, clearGmiApiKeyCache } from "../gmi-client";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
	vi.clearAllMocks();
	clearGmiApiKeyCache();
	globalThis.fetch = mockFetch;
	delete (import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY;
	// Reset platform mock to return no key by default
	vi.mocked(platform).mockReturnValue({
		apiKeys: { get: vi.fn().mockResolvedValue(null) },
	} as unknown as ReturnType<typeof platform>);
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("gmiClient", () => {
	describe("isAvailable", () => {
		it("returns true when env key is set", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
			expect(await gmiClient.isAvailable()).toBe(true);
		});

		it("returns false when no key is available", async () => {
			expect(await gmiClient.isAvailable()).toBe(false);
		});

		it("returns true when platform provides a key", async () => {
			vi.mocked(platform).mockReturnValue({
				apiKeys: {
					get: vi.fn().mockResolvedValue({ gmiApiKey: "platform-key" }),
				},
			} as unknown as ReturnType<typeof platform>);

			expect(await gmiClient.isAvailable()).toBe(true);
		});
	});

	describe("submit", () => {
		it("throws when no API key is configured", async () => {
			await expect(
				gmiClient.submit("test-model", { prompt: "hello" })
			).rejects.toThrow("GMI API key not configured");
		});

		it("posts to GMI API and returns requestId", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: "req-123" }),
			});

			const result = await gmiClient.submit("kling-v3", {
				prompt: "a cat",
			});

			expect(result).toEqual({ requestId: "req-123", provider: "gmi" });
			expect(mockFetch).toHaveBeenCalledWith(
				"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests",
				expect.objectContaining({
					method: "POST",
					headers: {
						Authorization: "Bearer test-key",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: "kling-v3",
						payload: { prompt: "a cat" },
					}),
				})
			);
		});

		it("throws on API error response", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({ detail: "Invalid model" }),
			});

			await expect(
				gmiClient.submit("bad-model", { prompt: "test" })
			).rejects.toThrow("GMI API error (400): Invalid model");
		});

		it("throws with statusText when error body is not JSON", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => {
					throw new Error("not json");
				},
			});

			await expect(
				gmiClient.submit("model", { prompt: "test" })
			).rejects.toThrow("GMI API error (500): Internal Server Error");
		});
	});

	describe("poll", () => {
		beforeEach(() => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
		});

		it("throws when no API key is available", async () => {
			delete (import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY;
			clearGmiApiKeyCache();

			await expect(gmiClient.poll("req-123")).rejects.toThrow(
				"GMI API key not available"
			);
		});

		it("returns completed status with videoUrl on success", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: "req-123",
					status: "success",
					outcome: {
						video_url: "https://example.com/video.mp4",
						thumbnail_image_url: "https://example.com/thumb.jpg",
					},
				}),
			});

			const result = await gmiClient.poll("req-123", {
				maxAttempts: 1,
				pollIntervalMs: 0,
			});

			expect(result.status).toBe("completed");
			expect(result.progress).toBe(100);
			expect(result.videoUrl).toBe("https://example.com/video.mp4");
			expect(result.thumbnailUrl).toBe("https://example.com/thumb.jpg");
		});

		it("maps cancelled status to failed", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: "req-123",
					status: "cancelled",
					error: "User cancelled",
				}),
			});

			const result = await gmiClient.poll("req-123", {
				maxAttempts: 1,
				pollIntervalMs: 0,
			});

			expect(result.status).toBe("failed");
			expect(result.error).toBe("User cancelled");
		});

		it("reports processing progress and times out", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					id: "req-123",
					status: "processing",
				}),
			});

			const progressUpdates: unknown[] = [];
			const result = await gmiClient.poll("req-123", {
				maxAttempts: 2,
				pollIntervalMs: 0,
				onProgress: (update) => progressUpdates.push(update),
			});

			expect(result.status).toBe("failed");
			expect(result.error).toContain("timed out");
			expect(progressUpdates.length).toBe(2);
			expect(progressUpdates[0]).toMatchObject({
				status: "processing",
				progress: 0,
			});
		});

		it("throws on poll HTTP error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			await expect(
				gmiClient.poll("req-123", {
					maxAttempts: 1,
					pollIntervalMs: 0,
				})
			).rejects.toThrow("GMI poll failed (404): Not Found");
		});

		it("calls onProgress for completed result", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: "req-123",
					status: "success",
					outcome: { video_url: "https://example.com/v.mp4" },
				}),
			});

			const onProgress = vi.fn();
			await gmiClient.poll("req-123", {
				maxAttempts: 1,
				pollIntervalMs: 0,
				onProgress,
			});

			expect(onProgress).toHaveBeenCalledWith(
				expect.objectContaining({ status: "completed", progress: 100 })
			);
		});
	});

	describe("clearGmiApiKeyCache", () => {
		it("clears cached platform key so it re-fetches", async () => {
			// First call: platform returns a key
			vi.mocked(platform).mockReturnValue({
				apiKeys: {
					get: vi.fn().mockResolvedValue({ gmiApiKey: "cached-key" }),
				},
			} as unknown as ReturnType<typeof platform>);

			expect(await gmiClient.isAvailable()).toBe(true);

			// Now platform returns no key
			vi.mocked(platform).mockReturnValue({
				apiKeys: { get: vi.fn().mockResolvedValue(null) },
			} as unknown as ReturnType<typeof platform>);

			// Still available because of cache
			expect(await gmiClient.isAvailable()).toBe(true);

			// Clear cache — should re-fetch and find no key
			clearGmiApiKeyCache();
			expect(await gmiClient.isAvailable()).toBe(false);
		});
	});
});
