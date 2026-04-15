/**
 * Step-executor payload-shape tests for image-to-video models with
 * provider-specific reference-image field names.
 *
 * Locks down each model's payload contract so future refactors of
 * `executeImageToVideo` can't silently regress to the wrong field
 * (e.g. `image_url` for Vidu Q3 mix would be silently ignored, and
 * the model would degrade to a generic generation without using the
 * reference image at all — exactly the failure mode we hit with the
 * staged Stage 4 pipeline before it was wired correctly).
 *
 * Three field-name conventions exist today; this file pins all three.
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
import { executeStep } from "../step-executors.js";

const mockedCallModelApi = vi.mocked(callModelApi);

beforeEach(() => {
	if (!ModelRegistry.has("vidu_q3_ref2v_mix")) {
		registerImageToVideoModels();
	}
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://video.fal.media/out.mp4",
		duration: 1,
		data: {},
	});
});

describe("executeImageToVideo — vidu_q3_ref2v_mix", () => {
	it("maps imageUrl to reference_image_urls (array, length 1)", async () => {
		const model = ModelRegistry.get("vidu_q3_ref2v_mix");
		await executeStep(
			model,
			{
				text: "Anime woman walks into frame",
				imageUrl: "https://example.com/ref.png",
			},
			{ duration: 4 },
			{}
		);

		expect(mockedCallModelApi).toHaveBeenCalledTimes(1);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("fal-ai/vidu/q3/reference-to-video/mix");
		expect(call.provider).toBe("fal");
		expect(call.payload.reference_image_urls).toEqual([
			"https://example.com/ref.png",
		]);
		// Payload must NOT contain any of the other ref/image field names —
		// they would silently change the model's behavior.
		expect(call.payload).not.toHaveProperty("image_url");
		expect(call.payload).not.toHaveProperty("image_urls");
		expect(call.payload).not.toHaveProperty("reference_images");
		expect(call.payload).not.toHaveProperty("reference_image_url");
		expect(call.payload).not.toHaveProperty("first_frame");
	});

	it("keeps duration as a number (Vidu accepts integer; do NOT stringify)", async () => {
		const model = ModelRegistry.get("vidu_q3_ref2v_mix");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{ duration: 5 },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(typeof payload.duration).toBe("number");
		expect(payload.duration).toBe(5);
	});

	it("forwards the audio default from registry (audio: true, NOT generate_audio)", async () => {
		const model = ModelRegistry.get("vidu_q3_ref2v_mix");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		// The registry default for vidu mix is `audio: true`. The Vidu Q3 i2v
		// model uses `generate_audio` — make sure we don't paste that field
		// in here by accident.
		expect(payload.audio).toBe(true);
		expect(payload).not.toHaveProperty("generate_audio");
	});

	it("forwards the prompt verbatim", async () => {
		const model = ModelRegistry.get("vidu_q3_ref2v_mix");
		await executeStep(
			model,
			{
				text: "Soft cinematic light, anime film style",
				imageUrl: "https://example.com/ref.png",
			},
			{},
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.prompt).toBe("Soft cinematic light, anime film style");
	});
});

describe("executeImageToVideo — Seedance regression guards", () => {
	// These tests exist to catch a refactor that accidentally unifies the
	// per-model branches and routes everything through the wrong field.
	// If any of these fail, double-check the if/else ladder in
	// `executeImageToVideo` — order matters and silent regressions
	// (image_url vs reference_*) won't surface as schema errors on every
	// provider.

	it("gmi_seedance_2_0_260128_ref2v still uses reference_images", async () => {
		const model = ModelRegistry.get("gmi_seedance_2_0_260128_ref2v");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{ duration: 4 },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.reference_images).toEqual(["https://example.com/ref.png"]);
		expect(payload).not.toHaveProperty("reference_image_urls");
		expect(payload).not.toHaveProperty("image_urls");
	});

	it("seedance_2_0_ref2v still uses image_urls + stringified duration", async () => {
		const model = ModelRegistry.get("seedance_2_0_ref2v");
		await executeStep(
			model,
			{ text: "p", imageUrl: "https://example.com/ref.png" },
			{ duration: 4 },
			{}
		);
		const payload = mockedCallModelApi.mock.calls[0][0].payload;
		expect(payload.image_urls).toEqual(["https://example.com/ref.png"]);
		expect(payload).not.toHaveProperty("reference_image_urls");
		expect(payload).not.toHaveProperty("reference_images");
		expect(payload.duration).toBe("4");
	});
});
