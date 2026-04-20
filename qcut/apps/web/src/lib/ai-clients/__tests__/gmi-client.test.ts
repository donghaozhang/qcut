import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock platform before importing
vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({
		apiKeys: { get: vi.fn().mockResolvedValue(null) },
	})),
}));

// Mock license-relay so we can assert relay calls explicitly without
// reaching into platform().license in every test.
vi.mock("../../ai-video/core/license-relay", () => ({
	getSessionToken: vi.fn().mockResolvedValue(""),
	proxySubmit: vi.fn(),
	proxyStatus: vi.fn(),
	refundCredits: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
}));

// Mock license-store so fire-and-forget checkLicense/openBuyCreditsPage
// calls from the gmi-client don't crash the test environment.
const mockCheckLicense = vi.fn().mockResolvedValue(undefined);
vi.mock("@/stores/license-store", () => ({
	useLicenseStore: {
		getState: () => ({
			checkLicense: mockCheckLicense,
			openBuyCreditsPage: vi.fn(),
		}),
	},
}));

import { platform } from "@qcut/platform-core";
import {
	getSessionToken,
	proxySubmit,
	proxyStatus,
	refundCredits,
} from "../../ai-video/core/license-relay";
import {
	gmiClient,
	clearGmiApiKeyCache,
	clearGmiPendingDeductions,
} from "../gmi-client";
import { InsufficientCreditsError } from "../../ai-video/core/relay-errors";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
	vi.clearAllMocks();
	clearGmiApiKeyCache();
	clearGmiPendingDeductions();
	globalThis.fetch = mockFetch;
	delete (import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY;
	// Reset platform mock to return no key by default
	vi.mocked(platform).mockReturnValue({
		apiKeys: { get: vi.fn().mockResolvedValue(null) },
	} as unknown as ReturnType<typeof platform>);
	// Default: no session token available
	vi.mocked(getSessionToken).mockResolvedValue("");
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

		it("returns true when a license-server session token is present", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-abc");
			expect(await gmiClient.isAvailable()).toBe(true);
		});
	});

	describe("submit", () => {
		it("throws actionable error when no key and no session token", async () => {
			await expect(
				gmiClient.submit("test-model", { prompt: "hello" })
			).rejects.toThrow(/Sign in to your QCut account/);
		});

		it("posts to GMI API directly when a local key is set", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ request_id: "req-123" }),
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
			expect(proxySubmit).not.toHaveBeenCalled();
		});

		it("routes through license-server relay when no local key but session token present", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({ request_id: "relay-req-1" }),
			} as unknown as Response);

			const result = await gmiClient.submit("seedance-2-0-260128", {
				prompt: "a dog",
			});

			expect(result).toEqual({ requestId: "relay-req-1", provider: "gmi" });
			expect(proxySubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "gmi",
					endpoint:
						"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests",
					method: "POST",
					body: { model: "seedance-2-0-260128", payload: { prompt: "a dog" } },
					sessionToken: "session-xyz",
				})
			);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("attaches credits when routing through relay with a known model + duration", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({ request_id: "relay-req-credits" }),
			} as unknown as Response);

			await gmiClient.submit("gmi_seedance_2_0_260128_t2v", {
				prompt: "hello",
				duration: 4,
			});

			expect(proxySubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					credits: expect.objectContaining({
						modelKey: "gmi_seedance_2_0_260128_t2v",
					}),
				})
			);
			const call = vi.mocked(proxySubmit).mock.calls[0][0];
			expect(call.credits?.amount).toBeCloseTo(0.52 * 4, 6);
			expect(call.credits?.description).toMatch(/Seedance|seedance|GMI/);
		});

		it("throws InsufficientCreditsError with balance on 402", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 402,
				ok: false,
				json: async () => ({
					error: "Insufficient credits",
					credits: {
						planCredits: 1,
						topUpCredits: 0,
						totalCredits: 1,
						planCreditsResetAt: "2026-05-01T00:00:00.000Z",
					},
				}),
			} as unknown as Response);

			await expect(
				gmiClient.submit("gmi_seedance_2_0_260128_t2v", {
					prompt: "x",
					duration: 4,
				})
			).rejects.toBeInstanceOf(InsufficientCreditsError);
		});

		it("does not add to pending deductions when submit fails with no request id", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({}),
			} as unknown as Response);

			await expect(
				gmiClient.submit("gmi_seedance_2_0_260128_t2v", {
					prompt: "x",
					duration: 4,
				})
			).rejects.toThrow(/no request ID/);
			// Refund should still fire so the server-side deduction is reversed
			expect(refundCredits).toHaveBeenCalledTimes(1);
		});

		it("accepts legacy `id` field on the submit response", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: "legacy-req-9" }),
			});

			const result = await gmiClient.submit("kling-v3", { prompt: "x" });
			expect(result.requestId).toBe("legacy-req-9");
		});

		it("throws when GMI returns neither `request_id` nor `id`", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			});

			await expect(
				gmiClient.submit("kling-v3", { prompt: "x" })
			).rejects.toThrow(/no request ID/);
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

		it("surfaces relay HTTP errors with the same shape as direct errors", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				json: async () => ({
					error: "API key not configured for provider: gmi",
				}),
			} as unknown as Response);

			await expect(
				gmiClient.submit("kling-v3", { prompt: "test" })
			).rejects.toThrow(/GMI API error \(503\)/);
		});
	});

	describe("poll", () => {
		it("throws actionable error when no key and no session token", async () => {
			await expect(gmiClient.poll("req-123")).rejects.toThrow(
				/Sign in to your QCut account/
			);
		});

		it("polls GMI directly when a local key is set", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";

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
			expect(proxyStatus).not.toHaveBeenCalled();
		});

		it("polls via license-server relay when no local key but session token present", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxyStatus).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: "req-456",
					status: "success",
					outcome: { video_url: "https://example.com/relayed.mp4" },
				}),
			} as unknown as Response);

			const result = await gmiClient.poll("req-456", {
				maxAttempts: 1,
				pollIntervalMs: 0,
			});

			expect(result.status).toBe("completed");
			expect(result.videoUrl).toBe("https://example.com/relayed.mp4");
			expect(proxyStatus).toHaveBeenCalledWith({
				provider: "gmi",
				requestId: "req-456",
				signal: undefined,
				sessionToken: "session-xyz",
			});
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("refunds credits when a relay-submitted job polls as failed", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			// Seed a pending deduction by running a relay submit first.
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({ request_id: "req-failed-1" }),
			} as unknown as Response);
			await gmiClient.submit("gmi_seedance_2_0_260128_t2v", {
				prompt: "x",
				duration: 4,
			});

			// Now poll and have the provider fail.
			vi.mocked(proxyStatus).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					request_id: "req-failed-1",
					status: "failed",
					error: "upstream safety filter",
				}),
			} as unknown as Response);

			const result = await gmiClient.poll("req-failed-1", {
				maxAttempts: 1,
				pollIntervalMs: 0,
			});

			expect(result.status).toBe("failed");
			expect(refundCredits).toHaveBeenCalledTimes(1);
			const refundArgs = vi.mocked(refundCredits).mock.calls[0][0];
			expect(refundArgs.modelKey).toBe("gmi_seedance_2_0_260128_t2v");
			expect(refundArgs.amount).toBeCloseTo(0.52 * 4, 6);
			expect(refundArgs.description).toMatch(/refund/);
		});

		it("does NOT refund when the job completes successfully", async () => {
			vi.mocked(getSessionToken).mockResolvedValue("session-xyz");
			vi.mocked(proxySubmit).mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({ request_id: "req-ok-1" }),
			} as unknown as Response);
			await gmiClient.submit("gmi_seedance_2_0_260128_t2v", {
				prompt: "x",
				duration: 4,
			});

			vi.mocked(proxyStatus).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					request_id: "req-ok-1",
					status: "success",
					outcome: { video_url: "https://example.com/ok.mp4" },
				}),
			} as unknown as Response);

			const result = await gmiClient.poll("req-ok-1", {
				maxAttempts: 1,
				pollIntervalMs: 0,
			});

			expect(result.status).toBe("completed");
			expect(refundCredits).not.toHaveBeenCalled();
		});

		it("maps cancelled status to failed", async () => {
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
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
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
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
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
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
			(import.meta.env as Record<string, unknown>).VITE_GMI_API_KEY =
				"test-key";
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
