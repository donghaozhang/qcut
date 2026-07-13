import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({
		apiKeys: {
			get: vi.fn().mockResolvedValue({ falApiKey: "test-fal-key" }),
		},
	})),
}));

vi.mock("../../debug/error-handler", () => ({
	handleAIServiceError: vi.fn(),
}));

vi.mock("../../debug/debug-logger", () => ({
	debugLogger: { log: vi.fn(), error: vi.fn() },
}));

import { sam3Client } from "../sam3-client";

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	globalThis.fetch = mockFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("sam3Client video segmentation", () => {
	it("uses the current FAL video prompt schema", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				video: { url: "https://cdn.example.com/segmented.mp4" },
			}),
		});

		await sam3Client.segmentVideo({
			video_url: "https://cdn.example.com/source.mp4",
			prompt: "person",
			point_prompts: [{ x: 0.5, y: 0.25, label: 1, frame_index: 0 }],
			detection_threshold: 0.6,
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, request] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://fal.run/fal-ai/sam-3/video");
		expect(request.method).toBe("POST");
		expect(request.headers).toMatchObject({
			Authorization: "Key test-fal-key",
			"X-Fal-Queue": "true",
		});

		const body = JSON.parse(String(request.body));
		expect(body).toMatchObject({
			video_url: "https://cdn.example.com/source.mp4",
			prompt: "person",
			point_prompts: [{ x: 0.5, y: 0.25, label: 1, frame_index: 0 }],
			detection_threshold: 0.6,
		});
		expect(body).not.toHaveProperty("text_prompt");
		expect(body).not.toHaveProperty("prompts");
	});

	it("fails immediately when the queued video job reports FAILED", async () => {
		const progress = vi.fn();
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ request_id: "request-failed" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					status: "FAILED",
					error: "Tracking quota exhausted",
				}),
			});

		await expect(
			sam3Client.segmentVideo(
				{
					video_url: "https://cdn.example.com/source.mp4",
					prompt: "person",
				},
				progress
			)
		).rejects.toThrow("Tracking quota exhausted");
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(progress).toHaveBeenCalledWith(
			expect.objectContaining({ requestId: "request-failed" })
		);
	});

	it("resumes polling an existing request without submitting another job", async () => {
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ status: "COMPLETED" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					video: { url: "https://cdn.example.com/resumed.webm" },
				}),
			});
		const progress = vi.fn();

		const result = await sam3Client.resumeVideo({
			requestId: "request-resume",
			onProgress: progress,
		});

		expect(result.video.url).toContain("resumed.webm");
		expect(mockFetch.mock.calls[0]?.[0]).toContain(
			"/queue/requests/request-resume/status"
		);
		expect(mockFetch.mock.calls[0]?.[1]).not.toMatchObject({ method: "POST" });
		expect(progress).toHaveBeenCalledWith(
			expect.objectContaining({ requestId: "request-resume" })
		);
	});

	it("aborts queued polling without waiting for the next retry", async () => {
		const controller = new AbortController();
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ request_id: "request-queued" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ status: "IN_QUEUE", queue_position: 2 }),
			});

		const operation = sam3Client.segmentVideo(
			{
				video_url: "https://cdn.example.com/source.mp4",
				prompt: "person",
			},
			(status) => {
				if (status.message?.startsWith("Queued (position")) {
					controller.abort();
				}
			},
			controller.signal
		);

		await expect(operation).rejects.toMatchObject({ name: "AbortError" });
		const submitRequest = mockFetch.mock.calls[0]?.[1] as RequestInit;
		const statusRequest = mockFetch.mock.calls[1]?.[1] as RequestInit;
		expect(submitRequest.signal).toBe(controller.signal);
		expect(statusRequest.signal).toBe(controller.signal);
	});
});
