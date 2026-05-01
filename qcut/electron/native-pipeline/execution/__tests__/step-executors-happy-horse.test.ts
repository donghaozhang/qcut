/**
 * Step-executor payload-shape tests for the three Alibaba Happy Horse
 * endpoints. Pins:
 *  - happy_horse_t2v        → integer-enum duration (3–15), no image_*, no video_*
 *  - happy_horse_ref2v      → image_urls (array), prompt, integer-enum duration
 *  - happy_horse_video_edit → video_url + reference_image_urls (≤5),
 *                             audio_setting, no per-model duration knob
 *
 * Matches the contract documented in
 * docs/task/fal_model/happy-horse-integration.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/api-caller.js", async () => {
	const actual = await vi.importActual<
		typeof import("../../infra/api-caller.js")
	>("../../infra/api-caller.js");
	return {
		...actual,
		callModelApi: vi.fn(),
		downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
		uploadToFalStorage: vi.fn(),
	};
});

import { callModelApi } from "../../infra/api-caller.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerImageToVideoModels } from "../../registry-data/image-to-video.js";
import { registerTextToVideoModels } from "../../registry-data/text-to-video.js";
import { registerVideoToVideoModels } from "../../registry-data/video-to-video.js";
import { executeStep } from "../step-executors.js";

const mockedCallModelApi = vi.mocked(callModelApi);

beforeEach(() => {
	if (!ModelRegistry.has("happy_horse_t2v")) registerTextToVideoModels();
	if (!ModelRegistry.has("happy_horse_ref2v")) registerImageToVideoModels();
	if (!ModelRegistry.has("happy_horse_video_edit"))
		registerVideoToVideoModels();
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://video.fal.media/out.mp4",
		duration: 1,
		data: {},
	});
});

describe("executeTextToVideo — happy_horse_t2v", () => {
	it("posts to alibaba/happy-horse/text-to-video with integer duration", async () => {
		const model = ModelRegistry.get("happy_horse_t2v");
		await executeStep(
			model,
			{ text: "neon city at dusk" },
			{ duration: 5, resolution: "1080p", aspect_ratio: "16:9" },
			{}
		);
		expect(mockedCallModelApi).toHaveBeenCalledTimes(1);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("alibaba/happy-horse/text-to-video");
		expect(call.payload.prompt).toBe("neon city at dusk");
		// FAL's schema expects the integer-literal form (verified live —
		// the string form returns literal_error).
		expect(call.payload.duration).toBe(5);
		expect(typeof call.payload.duration).toBe("number");
		expect(call.payload.resolution).toBe("1080p");
		expect(call.payload.aspect_ratio).toBe("16:9");
		// Must not leak image/video fields onto a T2V request
		expect(call.payload).not.toHaveProperty("image_url");
		expect(call.payload).not.toHaveProperty("image_urls");
		expect(call.payload).not.toHaveProperty("video_url");
	});

	it("coerces a string-form integer duration to a number (defends against registry-default drift)", async () => {
		const model = ModelRegistry.get("happy_horse_t2v");
		await executeStep(
			model,
			{ text: "p" },
			{ duration: "7" }, // simulates an old string default leaking through
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.duration).toBe(7);
		expect(typeof payload.duration).toBe("number");
	});
});

describe("executeImageToVideo — happy_horse_ref2v", () => {
	it("wraps a single imageUrl into image_urls and keeps duration as integer", async () => {
		const model = ModelRegistry.get("happy_horse_ref2v");
		await executeStep(
			model,
			{
				text: "character1 hands character2 a coffee cup",
				imageUrl: "https://example.com/alice.png",
			},
			{ duration: 5 },
			{}
		);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("alibaba/happy-horse/reference-to-video");
		expect(call.payload.image_urls).toEqual(["https://example.com/alice.png"]);
		expect(call.payload.duration).toBe(5);
		expect(typeof call.payload.duration).toBe("number");
		// Field-name regression guards — Happy Horse uses image_urls,
		// distinct from Vidu (reference_image_urls) and GMI Seedance
		// (reference_images). The wrong one silently degrades to a generic
		// generation that ignores the reference.
		expect(call.payload).not.toHaveProperty("image_url");
		expect(call.payload).not.toHaveProperty("reference_image_urls");
		expect(call.payload).not.toHaveProperty("reference_images");
	});

	it("merges --reference-images into image_urls (params.image_urls + imageUrl prepended)", async () => {
		const model = ModelRegistry.get("happy_horse_ref2v");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/lead.png" },
			{
				duration: 5,
				image_urls: [
					"https://example.com/extra1.png",
					"https://example.com/extra2.png",
				],
			},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.image_urls).toEqual([
			"https://example.com/lead.png",
			"https://example.com/extra1.png",
			"https://example.com/extra2.png",
		]);
	});

	it("uploads local paths in image_urls to FAL storage before submit", async () => {
		const { uploadToFalStorage } = await import("../../infra/api-caller.js");
		const mockedUpload = vi.mocked(uploadToFalStorage);
		mockedUpload.mockResolvedValue({
			success: true,
			url: "https://v3.fal.media/uploaded.png",
			duration: 0,
		});
		const model = ModelRegistry.get("happy_horse_ref2v");
		await executeStep(
			model,
			{ text: "p" },
			{
				duration: 5,
				image_urls: [
					"/local/path/alice.png",
					"https://example.com/already-https.png",
				],
			},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		// Local path was uploaded; HTTPS entry passed through verbatim.
		expect(mockedUpload).toHaveBeenCalledWith("/local/path/alice.png");
		expect(payload.image_urls).toEqual([
			"https://v3.fal.media/uploaded.png",
			"https://example.com/already-https.png",
		]);
	});

	it("caps image_urls at 9 entries", async () => {
		const model = ModelRegistry.get("happy_horse_ref2v");
		const ten = Array.from(
			{ length: 10 },
			(_, i) => `https://example.com/${i}.png`
		);
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/lead.png" },
			{ image_urls: ten },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect((payload.image_urls as string[]).length).toBe(9);
		expect((payload.image_urls as string[])[0]).toBe(
			"https://example.com/lead.png"
		);
	});
});

describe("executeVideoToVideo — happy_horse_video_edit", () => {
	it("forwards video_url, prompt, audio_setting, and reference_image_urls", async () => {
		const model = ModelRegistry.get("happy_horse_video_edit");
		await executeStep(
			model,
			{
				text: "make @Image1 wear a red coat",
				videoUrl: "https://example.com/source.mp4",
			},
			{
				resolution: "1080p",
				audio_setting: "origin",
				reference_image_urls: ["https://example.com/coat.png"],
			},
			{}
		);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("alibaba/happy-horse/video-edit");
		expect(call.payload.video_url).toBe("https://example.com/source.mp4");
		expect(call.payload.prompt).toBe("make @Image1 wear a red coat");
		expect(call.payload.audio_setting).toBe("origin");
		expect(call.payload.reference_image_urls).toEqual([
			"https://example.com/coat.png",
		]);
	});

	it("caps reference_image_urls at 5 entries", async () => {
		const model = ModelRegistry.get("happy_horse_video_edit");
		const six = Array.from(
			{ length: 6 },
			(_, i) => `https://example.com/r${i}.png`
		);
		await executeStep(
			model,
			{ text: "p", videoUrl: "https://example.com/source.mp4" },
			{ reference_image_urls: six },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect((payload.reference_image_urls as string[]).length).toBe(5);
	});

	it("does not stringify duration on video-edit (no duration knob)", async () => {
		const model = ModelRegistry.get("happy_horse_video_edit");
		await executeStep(
			model,
			{ text: "p", videoUrl: "https://example.com/source.mp4" },
			{},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload).not.toHaveProperty("duration");
	});
});

describe("executeTextToVideo — gmi_happy_horse_t2v", () => {
	beforeEach(() => {
		if (!ModelRegistry.has("gmi_happy_horse_t2v")) {
			registerTextToVideoModels();
		}
	});

	it("renames aspect_ratio to ratio and uppercases resolution", async () => {
		const model = ModelRegistry.get("gmi_happy_horse_t2v");
		await executeStep(
			model,
			{ text: "drone over a misty forest" },
			{ duration: 10, resolution: "1080p", aspect_ratio: "16:9" },
			{}
		);
		expect(mockedCallModelApi).toHaveBeenCalledTimes(1);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("happyhorse1.0-t2v");
		expect(call.payload.prompt).toBe("drone over a misty forest");
		// GMI field-name regression guards
		expect(call.payload.ratio).toBe("16:9");
		expect(call.payload).not.toHaveProperty("aspect_ratio");
		// GMI accepts uppercase resolution casing
		expect(call.payload.resolution).toBe("1080P");
		// Duration must remain numeric
		expect(call.payload.duration).toBe(10);
		expect(typeof call.payload.duration).toBe("number");
	});

	it("defaults audio_url to null when not supplied", async () => {
		const model = ModelRegistry.get("gmi_happy_horse_t2v");
		await executeStep(model, { text: "p" }, {}, {});
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		// Explicit null is the canonical "no audio-driven generation" signal
		expect(payload.audio_url).toBeNull();
	});

	it("preserves user-supplied audio_url and negative_prompt without renaming", async () => {
		const model = ModelRegistry.get("gmi_happy_horse_t2v");
		await executeStep(
			model,
			{ text: "p" },
			{
				audio_url: "https://example.com/voice.mp3",
				negative_prompt: "blurry, low quality",
			},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.audio_url).toBe("https://example.com/voice.mp3");
		expect(payload.negative_prompt).toBe("blurry, low quality");
	});

	it("coerces stringified integer duration back to a number", async () => {
		const model = ModelRegistry.get("gmi_happy_horse_t2v");
		await executeStep(model, { text: "p" }, { duration: "7" }, {});
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.duration).toBe(7);
		expect(typeof payload.duration).toBe("number");
	});

	it("does NOT touch FAL happy_horse_t2v aspect_ratio (regression guard)", async () => {
		const model = ModelRegistry.get("happy_horse_t2v");
		await executeStep(
			model,
			{ text: "p" },
			{ aspect_ratio: "9:16", resolution: "720p" },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		// FAL twin keeps canonical names — ensure the GMI branch didn't
		// accidentally widen its match condition.
		expect(payload.aspect_ratio).toBe("9:16");
		expect(payload).not.toHaveProperty("ratio");
		expect(payload.resolution).toBe("720p"); // lowercase preserved
	});
});

describe("executeImageToVideo — Vidu / Seedance regression guards", () => {
	// Reaffirm that adding the happy_horse_ref2v branch did not perturb
	// neighboring ref2v branches. Mirrors the guards in
	// step-executors-vidu.test.ts.

	it("vidu_q3_ref2v_mix still uses reference_image_urls", async () => {
		const model = ModelRegistry.get("vidu_q3_ref2v_mix");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{ duration: 4 },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.reference_image_urls).toEqual([
			"https://example.com/ref.png",
		]);
		expect(payload).not.toHaveProperty("image_urls");
	});

	it("seedance_2_0_ref2v still uses image_urls (length 1) + stringified duration", async () => {
		const model = ModelRegistry.get("seedance_2_0_ref2v");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{ duration: 4 },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.image_urls).toEqual(["https://example.com/ref.png"]);
		expect(payload.duration).toBe("4");
	});
});
