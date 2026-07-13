import { afterEach, describe, expect, it, vi } from "vitest";

const {
	uploadVideoToFal,
	getFalApiKeyAsync,
	segmentVideo,
	resumeVideo,
	extractVideoAlphaTracking,
	createObjectURL,
} = vi.hoisted(() => ({
	uploadVideoToFal: vi.fn(),
	getFalApiKeyAsync: vi.fn(),
	segmentVideo: vi.fn(),
	resumeVideo: vi.fn(),
	extractVideoAlphaTracking: vi.fn(),
	createObjectURL: vi.fn(() => "blob:tracked-mask"),
}));

vi.mock("@/lib/ai-video/core/fal-upload", () => ({ uploadVideoToFal }));
vi.mock("@/lib/ai-video/core/fal-request", () => ({ getFalApiKeyAsync }));
vi.mock("@/lib/ai-clients/sam3-client", () => ({
	resumeVideo,
	segmentVideo,
}));
vi.mock("@/lib/segmentation/video-alpha-tracking", () => ({
	extractVideoAlphaTracking,
}));
vi.mock("@/lib/media/blob-manager", () => ({ createObjectURL }));
vi.mock("@/lib/debug/debug-config", () => ({ debugLog: vi.fn() }));

import { generateSam3VideoMask } from "../sam3-video-mask";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.clearAllMocks();
});

describe("generateSam3VideoMask", () => {
	it("reports every remote and local processing stage", async () => {
		const controller = new AbortController();
		const sourceFile = new File(["video"], "source.mp4", {
			type: "video/mp4",
		});
		getFalApiKeyAsync.mockResolvedValue("fal-key");
		uploadVideoToFal.mockResolvedValue("https://cdn.example.com/source.mp4");
		segmentVideo.mockImplementation(
			async (_input, onProgress: (status: object) => void) => {
				onProgress({
					status: "queued",
					progress: 20,
					message: "Queued (position: 1)",
				});
				onProgress({
					status: "processing",
					progress: 70,
					message: "Processing video frames...",
				});
				return { video: { url: "https://cdn.example.com/mask.webm" } };
			}
		);
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			blob: async () => new Blob(["mask"], { type: "video/webm" }),
		});
		extractVideoAlphaTracking.mockResolvedValue({
			hasAlpha: true,
			samples: [{ frame: 0, centerX: 0.5, centerY: 0.5 }],
		});
		const progress: string[] = [];

		const result = await generateSam3VideoMask({
			sourceFile,
			prompt: "person",
			signal: controller.signal,
			onProgress: (update) => progress.push(update.stage),
		});

		expect(uploadVideoToFal).toHaveBeenCalledWith(
			sourceFile,
			"fal-key",
			controller.signal
		);
		expect(segmentVideo.mock.calls[0]?.[2]).toBe(controller.signal);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://cdn.example.com/mask.webm",
			{ signal: controller.signal }
		);
		expect(progress).toEqual([
			"uploading",
			"queued",
			"processing",
			"downloading",
			"analyzing",
			"completed",
		]);
		expect(result).toMatchObject({
			url: "blob:tracked-mask",
			hasAlpha: true,
		});
	});

	it("stops before upload when already canceled", async () => {
		const controller = new AbortController();
		controller.abort();
		getFalApiKeyAsync.mockResolvedValue("fal-key");

		await expect(
			generateSam3VideoMask({
				sourceFile: new File(["video"], "source.mp4"),
				prompt: "person",
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(uploadVideoToFal).not.toHaveBeenCalled();
	});

	it("resumes a queued request without uploading or submitting again", async () => {
		resumeVideo.mockImplementation(
			async ({ onProgress }: { onProgress: (status: object) => void }) => {
				onProgress({
					status: "processing",
					requestId: "request-resume",
					progress: 80,
					message: "Processing video frames...",
				});
				return { video: { url: "https://cdn.example.com/resumed.webm" } };
			}
		);
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			blob: async () => new Blob(["mask"], { type: "video/webm" }),
		});
		extractVideoAlphaTracking.mockResolvedValue({
			hasAlpha: true,
			samples: [],
		});
		const updates: Array<{ stage: string; requestId?: string }> = [];

		await generateSam3VideoMask({
			sourceFile: new File(["video"], "source.mp4"),
			resumeRequestId: "request-resume",
			onProgress: (update) => updates.push(update),
		});

		expect(resumeVideo).toHaveBeenCalledWith(
			expect.objectContaining({ requestId: "request-resume" })
		);
		expect(getFalApiKeyAsync).not.toHaveBeenCalled();
		expect(uploadVideoToFal).not.toHaveBeenCalled();
		expect(segmentVideo).not.toHaveBeenCalled();
		expect(updates).toContainEqual(
			expect.objectContaining({
				stage: "processing",
				requestId: "request-resume",
			})
		);
	});
});
