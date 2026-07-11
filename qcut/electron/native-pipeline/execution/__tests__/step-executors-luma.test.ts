import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/api-caller.js", async () => {
	return {
		callModelApi: vi.fn(),
		downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
		uploadToFalStorage: vi.fn(),
	};
});

import { callModelApi } from "../../infra/api-caller.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerTextToImageModels } from "../../registry-data/text-to-image.js";
import { registerTextToVideoModels } from "../../registry-data/text-to-video.js";
import { registerVideoToVideoModels } from "../../registry-data/video-to-video.js";
import { executeStep } from "../step-executors.js";

type ApiCall = {
	provider?: string;
	endpoint?: string;
	payload: Record<string, unknown>;
};

const mockedCallModelApi = callModelApi as unknown as {
	mockResolvedValue: (value: unknown) => void;
	mock: { calls: Array<[ApiCall]> };
};

beforeEach(() => {
	if (!ModelRegistry.has("luma_ray_3_2")) {
		registerTextToVideoModels();
	}
	if (!ModelRegistry.has("luma_uni_1_image")) {
		registerTextToImageModels();
	}
	if (!ModelRegistry.has("luma_ray_3_2_edit")) {
		registerVideoToVideoModels();
	}
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://luma.example/out.mp4",
		duration: 1,
		data: {},
	});
});

describe("executeTextToImage — Luma Uni 1", () => {
	it("submits a Luma Agents image generation payload", async () => {
		const model = ModelRegistry.get("luma_uni_1_image");

		await executeStep(
			model,
			{ text: "A teddy bear in sunglasses playing electric guitar" },
			{ aspect_ratio: "16:9" },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("luma");
		expect(call.endpoint).toBe("generations");
		expect(call.payload).toMatchObject({
			prompt: "A teddy bear in sunglasses playing electric guitar",
			model: "uni-1",
			type: "image",
			aspect_ratio: "16:9",
		});
	});
});

describe("executeVideoToVideo — Luma Ray 3.2 edit", () => {
	it("submits a previous Luma generation id as the edit source", async () => {
		const model = ModelRegistry.get("luma_ray_3_2_edit");

		await executeStep(
			model,
			{ text: "Transform the scene into moonlit 35mm film footage" },
			{
				source_generation_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
				resolution: "720p",
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("luma");
		expect(call.endpoint).toBe("generations");
		expect(call.payload).toMatchObject({
			model: "ray-3.2",
			type: "video_edit",
			prompt: "Transform the scene into moonlit 35mm film footage",
			source: {
				generation_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
			},
			video: {
				resolution: "720p",
				edit: { auto_controls: true },
			},
		});
		expect(call.payload).not.toHaveProperty("source_generation_id");
		expect(call.payload).not.toHaveProperty("video_url");
	});

	it("submits a hosted video URL with media type as the edit source", async () => {
		const model = ModelRegistry.get("luma_ray_3_2_edit");

		await executeStep(
			model,
			{
				text: "Make the scene look like hand-painted animation",
				videoUrl: "https://example.com/source.webm",
			},
			{
				edit_strength: "flex_2",
				image_urls: ["https://example.com/frame.jpg"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload).toMatchObject({
			source: {
				url: "https://example.com/source.webm",
				media_type: "video/webm",
			},
			video: {
				start_frame: { url: "https://example.com/frame.jpg" },
				edit: { strength: "flex_2" },
			},
		});
	});

	it("encodes a local source video inline for Luma edits", async () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-luma-source-"));
		const videoPath = join(dir, "source.mp4");
		writeFileSync(videoPath, "fake-video");
		const model = ModelRegistry.get("luma_ray_3_2_edit");

		await executeStep(
			model,
			{ text: "Restyle the clip", videoUrl: videoPath },
			{},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.source).toMatchObject({
			data: "ZmFrZS12aWRlbw==",
			media_type: "video/mp4",
		});
	});

	it("rejects Luma edit loop before calling the API", async () => {
		const model = ModelRegistry.get("luma_ray_3_2_edit");

		const result = await executeStep(
			model,
			{
				text: "Restyle the clip",
				videoUrl: "https://example.com/source.mp4",
			},
			{ loop: true },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("does not support --loop");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});
});

describe("executeTextToVideo — Luma Ray 3.2", () => {
	it("nests flat CLI video options under the Luma video payload", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{
				text: "slow dolly through a misty greenhouse",
				imageUrl: "https://example.com/start.jpg",
			},
			{
				aspect_ratio: "16:9",
				duration: 5,
				resolution: "1080p",
				image_urls: ["https://example.com/end.jpg"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("luma");
		expect(call.endpoint).toBe("generations");
		expect(call.payload).toMatchObject({
			model: "ray-3.2",
			type: "video",
			prompt: "slow dolly through a misty greenhouse",
			aspect_ratio: "16:9",
			video: {
				duration: "5s",
				resolution: "1080p",
				start_frame: { url: "https://example.com/start.jpg" },
				end_frame: { url: "https://example.com/end.jpg" },
			},
		});
		expect(call.payload).not.toHaveProperty("duration");
		expect(call.payload).not.toHaveProperty("resolution");
		expect(call.payload).not.toHaveProperty("image_urls");
	});

	it("encodes local anchor images as inline Luma image refs", async () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-luma-anchor-"));
		const imagePath = join(dir, "frame.png");
		writeFileSync(imagePath, "fake-image");
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "animate the reference", imageUrl: imagePath },
			{ duration: "5s" },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			start_frame: {
				data: "ZmFrZS1pbWFnZQ==",
				media_type: "image/png",
			},
		});
	});

	it("submits Ray 3.2 multi-keyframes with auto-spaced indexes", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "follow three storyboard beats" },
			{
				duration: "5s",
				keyframe_images: [
					"https://example.com/beat-1.jpg",
					"https://example.com/beat-2.jpg",
					"https://example.com/beat-3.jpg",
				],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			duration: "5s",
			keyframes: [
				{ url: "https://example.com/beat-1.jpg" },
				{ url: "https://example.com/beat-2.jpg" },
				{ url: "https://example.com/beat-3.jpg" },
			],
			keyframe_indexes: [0, 60, 120],
		});
		expect(call.payload.video).not.toHaveProperty("start_frame");
		expect(call.payload.video).not.toHaveProperty("end_frame");
		expect(call.payload).not.toHaveProperty("keyframe_images");
		expect(call.payload).not.toHaveProperty("keyframe_indexes");
	});

	it("supports explicit Ray 3.2 keyframe indexes with 10s HDR", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "hold the first beat and land on the final beat" },
			{
				duration: "10s",
				hdr: true,
				keyframe_images: [
					"https://example.com/beat-1.jpg",
					"https://example.com/beat-2.jpg",
				],
				keyframe_indexes: ["0", "240"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			duration: "10s",
			hdr: true,
			keyframes: [
				{ url: "https://example.com/beat-1.jpg" },
				{ url: "https://example.com/beat-2.jpg" },
			],
			keyframe_indexes: [0, 240],
		});
	});

	it("encodes local Ray 3.2 keyframe images inline", async () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-luma-keyframes-"));
		const imagePath = join(dir, "beat.png");
		writeFileSync(imagePath, "fake-keyframe");
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "animate one precise beat" },
			{ keyframe_images: [imagePath] },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			keyframes: [
				{
					data: "ZmFrZS1rZXlmcmFtZQ==",
					media_type: "image/png",
				},
			],
			keyframe_indexes: [0],
		});
	});

	it("rejects Ray 3.2 keyframes mixed with legacy start/end references", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{
				text: "ambiguous frame controls",
				imageUrl: "https://example.com/start.jpg",
			},
			{
				keyframe_images: ["https://example.com/beat.jpg"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("mutually exclusive");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects Ray 3.2 keyframes mixed with loop", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{ text: "looping keyframe request" },
			{
				loop: true,
				keyframe_images: ["https://example.com/beat.jpg"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("mutually exclusive with --loop");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects mismatched Ray 3.2 keyframe indexes", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{ text: "bad indexes" },
			{
				keyframe_images: [
					"https://example.com/beat-1.jpg",
					"https://example.com/beat-2.jpg",
				],
				keyframe_indexes: ["0"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("must match keyframe image count");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects Ray 3.2 keyframe indexes outside the duration frame range", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{ text: "bad frame range" },
			{
				duration: "5s",
				keyframe_images: ["https://example.com/beat.jpg"],
				keyframe_indexes: ["121"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("exceeds the 120 frame limit");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects Ray 3.2 keyframe indexes that are not in ascending order", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{ text: "unsorted indexes" },
			{
				duration: "5s",
				keyframe_images: [
					"https://example.com/a.jpg",
					"https://example.com/b.jpg",
					"https://example.com/c.jpg",
				],
				keyframe_indexes: ["60", "0", "120"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("ascending order");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("maps a base64 data: URI keyframe to an inline Luma image ref", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "data uri keyframe" },
			{ keyframe_images: ["data:image/png;base64,ZmFrZS1rZXlmcmFtZQ=="] },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			keyframes: [{ data: "ZmFrZS1rZXlmcmFtZQ==", media_type: "image/png" }],
			keyframe_indexes: [0],
		});
	});

	it("nests HDR and EXR toggles under the Luma video payload", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		await executeStep(
			model,
			{ text: "cinematic energy field" },
			{ duration: "5s", hdr: true, exr_export: true },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.video).toMatchObject({
			duration: "5s",
			hdr: true,
			exr_export: true,
		});
	});

	it("rejects 10s generations with anchor frames before calling Luma", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{
				text: "animate the reference",
				imageUrl: "https://example.com/start.jpg",
			},
			{ duration: "10s" },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("does not support 10s duration");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects Luma loop when an end frame is provided", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{
				text: "animate between two frames",
				imageUrl: "https://example.com/start.jpg",
			},
			{
				duration: "5s",
				loop: true,
				image_urls: ["https://example.com/end.jpg"],
			},
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("loop with end_frame");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("rejects Luma EXR export without HDR", async () => {
		const model = ModelRegistry.get("luma_ray_3_2");

		const result = await executeStep(
			model,
			{ text: "render exr plates" },
			{ duration: "5s", exr_export: true },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("requires --hdr");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});
});
