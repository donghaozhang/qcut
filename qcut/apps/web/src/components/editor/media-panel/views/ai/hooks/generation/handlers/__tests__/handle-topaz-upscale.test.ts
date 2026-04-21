import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-clients/fal-ai-client", () => ({
	falAIClient: {
		uploadVideoToFal: vi.fn(),
	},
}));

vi.mock("@/lib/ai-video", () => ({
	upscaleByteDanceVideo: vi.fn(),
	upscaleFlashVSRVideo: vi.fn(),
	upscaleTopazVideo: vi.fn(),
}));

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import { upscaleTopazVideo } from "@/lib/ai-video";
import { handleTopazUpscale } from "../upscale-handlers";
import type {
	ModelHandlerContext,
	UpscaleSettings,
} from "../../model-handler-types";

const mockedUpload = vi.mocked(falAIClient.uploadVideoToFal);
const mockedUpscaleTopaz = vi.mocked(upscaleTopazVideo);

function makeCtx(): ModelHandlerContext & {
	progressCalls: Array<{ progress?: number; message?: string }>;
} {
	const progressCalls: Array<{ progress?: number; message?: string }> = [];
	return {
		prompt: "",
		modelId: "topaz_video_upscale",
		modelName: "Topaz Video AI",
		progressCallback: (status) => {
			progressCalls.push({
				progress: status.progress,
				message: status.message,
			});
		},
		progressCalls,
	};
}

function makeSettings(
	overrides: Partial<UpscaleSettings> = {}
): UpscaleSettings {
	return {
		sourceVideoFile: null,
		sourceVideoUrl: null,
		bytedanceTargetResolution: "1080p",
		bytedanceTargetFPS: "30fps",
		flashvsrUpscaleFactor: null,
		flashvsrAcceleration: "regular",
		flashvsrQuality: 70,
		flashvsrColorFix: true,
		flashvsrPreserveAudio: false,
		flashvsrOutputFormat: "X264",
		flashvsrOutputQuality: "high",
		flashvsrOutputWriteMode: "balanced",
		flashvsrSeed: null,
		topazUpscaleFactor: 2,
		topazTargetFPS: "original",
		topazH264Output: false,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("handleTopazUpscale", () => {
	it("skips when no video source is provided", async () => {
		const ctx = makeCtx();
		const result = await handleTopazUpscale(ctx, makeSettings());

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/Video source required/);
		expect(mockedUpscaleTopaz).not.toHaveBeenCalled();
	});

	it("uploads the source file and passes the uploaded URL to the generator", async () => {
		mockedUpload.mockResolvedValue("https://fal.storage/uploaded.mp4");
		mockedUpscaleTopaz.mockResolvedValue({
			job_id: "j1",
			status: "completed",
			message: "ok",
			estimated_time: 0,
			video_url: "https://fal.example/out.mp4",
			video_data: {},
		});

		const ctx = makeCtx();
		const file = new File(["test"], "in.mp4", { type: "video/mp4" });
		const result = await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoFile: file,
				topazUpscaleFactor: 4,
				topazH264Output: true,
			})
		);

		expect(mockedUpload).toHaveBeenCalledWith(file);
		expect(mockedUpscaleTopaz).toHaveBeenCalledWith({
			video_url: "https://fal.storage/uploaded.mp4",
			upscale_factor: 4,
			target_fps: undefined,
			h264_output: true,
		});
		expect(result.shouldSkip).toBeFalsy();
		expect(result.response?.video_url).toBe("https://fal.example/out.mp4");
	});

	it("uses sourceVideoUrl directly when provided (no upload)", async () => {
		mockedUpscaleTopaz.mockResolvedValue({
			job_id: "j1",
			status: "completed",
			message: "ok",
			estimated_time: 0,
			video_url: "https://fal.example/out.mp4",
			video_data: {},
		});

		const ctx = makeCtx();
		await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoUrl: "https://user.example/source.mp4",
			})
		);

		expect(mockedUpload).not.toHaveBeenCalled();
		expect(mockedUpscaleTopaz).toHaveBeenCalledWith(
			expect.objectContaining({ video_url: "https://user.example/source.mp4" })
		);
	});

	it("maps 'interpolated' to numeric target_fps (60) and 'original' to undefined", async () => {
		mockedUpscaleTopaz.mockResolvedValue({
			job_id: "j1",
			status: "completed",
			message: "ok",
			estimated_time: 0,
			video_url: "https://fal.example/out.mp4",
			video_data: {},
		});

		const ctx = makeCtx();
		await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoUrl: "https://user.example/source.mp4",
				topazTargetFPS: "interpolated",
			})
		);
		expect(mockedUpscaleTopaz.mock.calls[0][0].target_fps).toBe(60);

		mockedUpscaleTopaz.mockClear();

		await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoUrl: "https://user.example/source.mp4",
				topazTargetFPS: "original",
			})
		);
		expect(mockedUpscaleTopaz.mock.calls[0][0].target_fps).toBeUndefined();
	});

	it("fires progress callbacks at 10 (upload), 30 (upscale), 100 (done)", async () => {
		mockedUpload.mockResolvedValue("https://fal.storage/uploaded.mp4");
		mockedUpscaleTopaz.mockResolvedValue({
			job_id: "j1",
			status: "completed",
			message: "ok",
			estimated_time: 0,
			video_url: "https://fal.example/out.mp4",
			video_data: {},
		});

		const ctx = makeCtx();
		await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoFile: new File(["test"], "in.mp4", { type: "video/mp4" }),
			})
		);

		const progressValues = ctx.progressCalls.map((c) => c.progress);
		expect(progressValues).toEqual([10, 30, 100]);
	});

	it("captures generator throws as a shouldSkip — never bubbles", async () => {
		mockedUpscaleTopaz.mockRejectedValue(new Error("fal went boom"));

		const ctx = makeCtx();
		const result = await handleTopazUpscale(
			ctx,
			makeSettings({ sourceVideoUrl: "https://user.example/source.mp4" })
		);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/Topaz upscale failed: fal went boom/);
	});

	it("captures upload errors as a shouldSkip with a descriptive reason", async () => {
		mockedUpload.mockRejectedValue(new Error("upload timeout"));

		const ctx = makeCtx();
		const result = await handleTopazUpscale(
			ctx,
			makeSettings({
				sourceVideoFile: new File(["x"], "in.mp4", { type: "video/mp4" }),
			})
		);

		expect(result.shouldSkip).toBe(true);
		expect(result.skipReason).toMatch(/Failed to upload video: upload timeout/);
		expect(mockedUpscaleTopaz).not.toHaveBeenCalled();
	});
});
