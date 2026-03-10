import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
} from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import {
	validateViduQ3Prompt,
	validateViduQ3Duration,
	validateViduQ3Resolution,
	validateViduQ3AspectRatio,
	isViduQ3Model,
	VIDU_Q3_RESOLUTIONS,
	VIDU_Q3_ASPECT_RATIOS,
	VIDU_Q3_MAX_PROMPT_LENGTH,
	VIDU_Q3_MIN_DURATION,
	VIDU_Q3_MAX_DURATION,
	VIDU_Q3_DEFAULT_DURATION,
} from "@/lib/ai-video";

beforeAll(() => {
	const adapter = createWebAdapter();
	// Override fal stub to return undefined methods instead of throwing,
	// so polling code falls back to direct fetch (which tests mock).
	(adapter as any).fal = { queueFetch: undefined };
	// Override apiKeys to return empty (no BYOK key)
	(adapter as any).apiKeys = {
		get: async () => ({}),
		set: async () => true,
		clear: async () => true,
		status: async () => ({}),
	};
	initPlatform(adapter);
});

const originalFetch = globalThis.fetch;
const originalFalApiKey = (import.meta.env as Record<string, unknown>)
	.VITE_FAL_API_KEY;

describe("Vidu Q3 Validators", () => {
	describe("validateViduQ3Prompt", () => {
		it("should accept prompts within the 2000 character limit", () => {
			const validPrompt = "A".repeat(2000);
			expect(() => validateViduQ3Prompt(validPrompt)).not.toThrow();
		});

		it("should accept short prompts", () => {
			expect(() =>
				validateViduQ3Prompt("A serene mountain landscape")
			).not.toThrow();
		});

		it("should reject prompts exceeding 2000 characters", () => {
			const longPrompt = "A".repeat(2001);
			expect(() => validateViduQ3Prompt(longPrompt)).toThrow(
				/Prompt too long for Vidu Q3/
			);
		});

		it("should include character count in error message", () => {
			const longPrompt = "A".repeat(2500);
			expect(() => validateViduQ3Prompt(longPrompt)).toThrow(/current: 2500/);
		});

		it("should accept empty prompts (validation only checks length)", () => {
			expect(() => validateViduQ3Prompt("")).not.toThrow();
		});
	});

	describe("validateViduQ3Duration", () => {
		it("should accept durations within the 1-16 second range", () => {
			expect(() => validateViduQ3Duration(1)).not.toThrow();
			expect(() => validateViduQ3Duration(5)).not.toThrow();
			expect(() => validateViduQ3Duration(8)).not.toThrow();
			expect(() => validateViduQ3Duration(12)).not.toThrow();
			expect(() => validateViduQ3Duration(16)).not.toThrow();
		});

		it("should reject durations below minimum (1 second)", () => {
			expect(() => validateViduQ3Duration(0)).toThrow(
				/Invalid duration for Vidu Q3/
			);
			expect(() => validateViduQ3Duration(-1)).toThrow(
				/Invalid duration for Vidu Q3/
			);
		});

		it("should reject durations above maximum (16 seconds)", () => {
			expect(() => validateViduQ3Duration(17)).toThrow(
				/Invalid duration for Vidu Q3/
			);
			expect(() => validateViduQ3Duration(30)).toThrow(
				/Invalid duration for Vidu Q3/
			);
		});

		it("should include the provided duration in error message", () => {
			expect(() => validateViduQ3Duration(20)).toThrow(/got: 20/);
		});
	});

	describe("validateViduQ3Resolution", () => {
		it("should accept all valid resolutions", () => {
			for (const resolution of VIDU_Q3_RESOLUTIONS) {
				expect(() => validateViduQ3Resolution(resolution)).not.toThrow();
			}
		});

		it("should accept 360p resolution", () => {
			expect(() => validateViduQ3Resolution("360p")).not.toThrow();
		});

		it("should accept 540p resolution", () => {
			expect(() => validateViduQ3Resolution("540p")).not.toThrow();
		});

		it("should accept 720p resolution", () => {
			expect(() => validateViduQ3Resolution("720p")).not.toThrow();
		});

		it("should accept 1080p resolution", () => {
			expect(() => validateViduQ3Resolution("1080p")).not.toThrow();
		});

		it("should reject invalid resolutions", () => {
			expect(() => validateViduQ3Resolution("480p")).toThrow(
				/Invalid resolution for Vidu Q3/
			);
			expect(() => validateViduQ3Resolution("2160p")).toThrow(
				/Invalid resolution for Vidu Q3/
			);
			expect(() => validateViduQ3Resolution("4k")).toThrow(
				/Invalid resolution for Vidu Q3/
			);
		});

		it("should list supported resolutions in error message", () => {
			expect(() => validateViduQ3Resolution("invalid")).toThrow(
				/Supported: 360p, 540p, 720p, 1080p/
			);
		});
	});

	describe("validateViduQ3AspectRatio", () => {
		it("should accept all valid aspect ratios", () => {
			for (const ratio of VIDU_Q3_ASPECT_RATIOS) {
				expect(() => validateViduQ3AspectRatio(ratio)).not.toThrow();
			}
		});

		it("should accept 16:9 aspect ratio", () => {
			expect(() => validateViduQ3AspectRatio("16:9")).not.toThrow();
		});

		it("should accept 9:16 aspect ratio", () => {
			expect(() => validateViduQ3AspectRatio("9:16")).not.toThrow();
		});

		it("should accept 4:3 aspect ratio", () => {
			expect(() => validateViduQ3AspectRatio("4:3")).not.toThrow();
		});

		it("should accept 3:4 aspect ratio", () => {
			expect(() => validateViduQ3AspectRatio("3:4")).not.toThrow();
		});

		it("should accept 1:1 aspect ratio", () => {
			expect(() => validateViduQ3AspectRatio("1:1")).not.toThrow();
		});

		it("should reject invalid aspect ratios", () => {
			expect(() => validateViduQ3AspectRatio("21:9")).toThrow(
				/Invalid aspect ratio for Vidu Q3/
			);
			expect(() => validateViduQ3AspectRatio("2.35:1")).toThrow(
				/Invalid aspect ratio for Vidu Q3/
			);
		});

		it("should list supported aspect ratios in error message", () => {
			expect(() => validateViduQ3AspectRatio("invalid")).toThrow(
				/Supported: 16:9, 9:16, 4:3, 3:4, 1:1/
			);
		});
	});

	describe("isViduQ3Model", () => {
		it("should return true for vidu_q3_t2v", () => {
			expect(isViduQ3Model("vidu_q3_t2v")).toBe(true);
		});

		it("should return true for vidu_q3_i2v", () => {
			expect(isViduQ3Model("vidu_q3_i2v")).toBe(true);
		});

		it("should return false for non-Vidu Q3 models", () => {
			expect(isViduQ3Model("vidu_q2_turbo_i2v")).toBe(false);
			expect(isViduQ3Model("kling_v26_pro_i2v")).toBe(false);
			expect(isViduQ3Model("hailuo23_standard_t2v")).toBe(false);
		});
	});

	describe("Constants", () => {
		it("should export correct resolution values", () => {
			expect(VIDU_Q3_RESOLUTIONS).toEqual(["360p", "540p", "720p", "1080p"]);
		});

		it("should export correct aspect ratio values", () => {
			expect(VIDU_Q3_ASPECT_RATIOS).toEqual([
				"16:9",
				"9:16",
				"4:3",
				"3:4",
				"1:1",
			]);
		});

		it("should export correct max prompt length", () => {
			expect(VIDU_Q3_MAX_PROMPT_LENGTH).toBe(2000);
		});

		it("should export correct duration constraints", () => {
			expect(VIDU_Q3_MIN_DURATION).toBe(1);
			expect(VIDU_Q3_MAX_DURATION).toBe(16);
			expect(VIDU_Q3_DEFAULT_DURATION).toBe(5);
		});
	});
});

describe("Vidu Q3 Text-to-Video Generator", () => {
	let generateViduQ3TextVideo: typeof import("@/lib/ai-video")["generateViduQ3TextVideo"];

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		(import.meta.env as Record<string, unknown>).VITE_FAL_API_KEY =
			"test-api-key";

		const aiVideo = await import("@/lib/ai-video");
		generateViduQ3TextVideo = aiVideo.generateViduQ3TextVideo;

		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		(import.meta.env as Record<string, unknown>).VITE_FAL_API_KEY =
			originalFalApiKey;
		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	describe("Prompt Validation", () => {
		it("should reject prompts exceeding 2000 characters", async () => {
			const longPrompt = "A".repeat(2001);

			await expect(
				generateViduQ3TextVideo({
					model: "vidu_q3_t2v",
					prompt: longPrompt,
				})
			).rejects.toThrow(/Prompt too long for Vidu Q3/);
		});

		it("should accept prompts within limit", async () => {
			const validPrompt = "A".repeat(2000);

			// Mock the queue response flow
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			const result = await generateViduQ3TextVideo({
				model: "vidu_q3_t2v",
				prompt: validPrompt,
			});

			expect(result.status).toBe("completed");
			expect(result.video_url).toBeTruthy();
		});
	});

	describe("Request Parameters", () => {
		it("should include resolution in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3TextVideo({
				model: "vidu_q3_t2v",
				prompt: "A beautiful sunset",
				resolution: "1080p",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.resolution).toBe("1080p");
		});

		it("should include aspect_ratio in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3TextVideo({
				model: "vidu_q3_t2v",
				prompt: "A beautiful sunset",
				aspect_ratio: "9:16",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.aspect_ratio).toBe("9:16");
		});

		it("should include audio flag in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3TextVideo({
				model: "vidu_q3_t2v",
				prompt: "A beautiful sunset",
				audio: true,
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.audio).toBe(true);
		});

		it("should use correct endpoint", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3TextVideo({
				model: "vidu_q3_t2v",
				prompt: "A beautiful sunset",
			});

			const [callUrl] = fetchMock.mock.calls[0];
			expect(callUrl).toContain("fal-ai/vidu/q3/text-to-video");
		});
	});
});

describe("Vidu Q3 Image-to-Video Generator", () => {
	let generateViduQ3ImageVideo: typeof import("@/lib/ai-video")["generateViduQ3ImageVideo"];

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();

		(import.meta.env as Record<string, unknown>).VITE_FAL_API_KEY =
			"test-api-key";

		const aiVideo = await import("@/lib/ai-video");
		generateViduQ3ImageVideo = aiVideo.generateViduQ3ImageVideo;

		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		(import.meta.env as Record<string, unknown>).VITE_FAL_API_KEY =
			originalFalApiKey;
		globalThis.fetch = originalFetch as typeof globalThis.fetch;
	});

	describe("Prompt Validation", () => {
		it("should reject prompts exceeding 2000 characters", async () => {
			const longPrompt = "A".repeat(2001);

			await expect(
				generateViduQ3ImageVideo({
					model: "vidu_q3_i2v",
					prompt: longPrompt,
					image_url: "https://example.com/image.jpg",
				})
			).rejects.toThrow(/Prompt too long for Vidu Q3/);
		});
	});

	describe("Request Parameters", () => {
		it("should include image_url in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3ImageVideo({
				model: "vidu_q3_i2v",
				prompt: "A sunset animation",
				image_url: "https://example.com/test-image.jpg",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.image_url).toBe("https://example.com/test-image.jpg");
		});

		it("should include resolution in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3ImageVideo({
				model: "vidu_q3_i2v",
				prompt: "A sunset animation",
				image_url: "https://example.com/test-image.jpg",
				resolution: "720p",
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.resolution).toBe("720p");
		});

		it("should include audio flag in request payload", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3ImageVideo({
				model: "vidu_q3_i2v",
				prompt: "A sunset animation",
				image_url: "https://example.com/test-image.jpg",
				audio: false,
			});

			const [, options] = fetchMock.mock.calls[0];
			const callPayload = JSON.parse(
				(options as Record<string, unknown>).body as string
			);
			expect(callPayload.audio).toBe(false);
		});

		it("should use correct endpoint", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						request_id: "test-request-123",
						status: "IN_QUEUE",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						status: "COMPLETED",
						response_url: "https://example.com/result",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						video: { url: "https://example.com/video.mp4" },
					}),
				});
			globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

			await generateViduQ3ImageVideo({
				model: "vidu_q3_i2v",
				prompt: "A sunset animation",
				image_url: "https://example.com/test-image.jpg",
			});

			const [callUrl] = fetchMock.mock.calls[0];
			expect(callUrl).toContain("fal-ai/vidu/q3/image-to-video");
		});
	});
});
