import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelDefinition } from "../../infra/registry.js";

const callModelApiMock = vi.fn();

vi.mock("../../infra/api-caller.js", () => ({
	callModelApi: callModelApiMock,
	callElevenLabsSpeechToText: vi.fn(),
	downloadOutput: vi.fn(),
	uploadToFalStorage: vi.fn(),
}));

import { executeStep } from "../step-executors.js";

function makeModel(): ModelDefinition {
	return {
		key: "openrouter_gemini_3_5_flash_video",
		name: "OpenRouter Gemini 3.5 Flash Video",
		provider: "OpenRouter",
		providerBackend: "openrouter",
		endpoint: "chat/completions",
		categories: ["image_understanding"],
		description: "test",
		pricing: 0,
		durationOptions: [],
		aspectRatios: [],
		resolutions: [],
		providerKey: "openrouter_gemini_3_5_flash_video",
		defaults: { model: "google/gemini-3.5-flash" },
		features: [],
		maxDuration: 0,
		extendedParams: [],
		extendedFeatures: {},
		inputRequirements: { required: [], optional: [] },
		modelInfo: {},
		costEstimate: 0,
		processingTime: 0,
	};
}

describe("OpenRouter multi-image understanding", () => {
	beforeEach(() => {
		callModelApiMock.mockReset();
		callModelApiMock.mockResolvedValue({
			success: true,
			duration: 0.1,
			data: { choices: [{ message: { content: "[]" } }] },
		});
	});

	it("sends one text part plus ordered image_url parts", async () => {
		const result = await executeStep(
			makeModel(),
			{
				images: [
					"data:image/jpeg;base64,ref",
					"data:image/jpeg;base64,frame1",
					"data:image/jpeg;base64,frame2",
				],
			},
			{ prompt: "compare", max_tokens: 123 },
			{}
		);

		expect(result.success).toBe(true);
		const payload = callModelApiMock.mock.calls[0]?.[0].payload as {
			messages: Array<{ content: unknown[] }>;
			max_tokens: number;
		};
		expect(payload.max_tokens).toBe(123);
		expect(payload.messages[0]?.content).toEqual([
			{ type: "text", text: "compare" },
			{ type: "image_url", image_url: { url: "data:image/jpeg;base64,ref" } },
			{
				type: "image_url",
				image_url: { url: "data:image/jpeg;base64,frame1" },
			},
			{
				type: "image_url",
				image_url: { url: "data:image/jpeg;base64,frame2" },
			},
		]);
	});

	it("keeps single-media image understanding behavior", async () => {
		await executeStep(
			makeModel(),
			{ imageUrl: "data:image/jpeg;base64,one" },
			{ prompt: "describe" },
			{}
		);

		const payload = callModelApiMock.mock.calls[0]?.[0].payload as {
			messages: Array<{ content: unknown[] }>;
		};
		expect(payload.messages[0]?.content).toEqual([
			{ type: "text", text: "describe" },
			{ type: "image_url", image_url: { url: "data:image/jpeg;base64,one" } },
		]);
	});
});
