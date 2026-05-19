import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/api-caller.js", async () => {
	return {
		callModelApi: vi.fn(),
		downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
		uploadToFalStorage: vi.fn(),
	};
});

import { callModelApi, uploadToFalStorage } from "../../infra/api-caller.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerTextToImageModels } from "../../registry-data/text-to-image.js";
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
const mockedUploadToFalStorage = uploadToFalStorage as unknown as {
	mockResolvedValue: (value: unknown) => void;
	mock: { calls: Array<[string]> };
};

beforeEach(() => {
	if (!ModelRegistry.has("gpt_image_2_gmi")) {
		registerTextToImageModels();
	}
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://gmi.cloud/image/out.png",
		duration: 1,
		data: {},
	});
	mockedUploadToFalStorage.mockResolvedValue({
		success: true,
		url: "https://fal.media/uploaded/local-ref.png",
	});
});

describe("executeTextToImage — GPT Image 2", () => {
	it("uses the GMI generate model id and maps aspect ratio to OpenAI size", async () => {
		const model = ModelRegistry.get("gpt_image_2_gmi");

		await executeStep(
			model,
			{ text: "a red apple on a white plate" },
			{ aspect_ratio: "3:2" },
			{}
		);

		expect(mockedCallModelApi).toHaveBeenCalledTimes(1);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.endpoint).toBe("gpt-image-2-generate");
		expect(call.payload.prompt).toBe("a red apple on a white plate");
		expect(call.payload.size).toBe("1536x1024");
		expect(call.payload).not.toHaveProperty("image_size");
		expect(call.payload).not.toHaveProperty("aspect_ratio");
	});

	it("uses the GMI edit model id when reference images are provided", async () => {
		const model = ModelRegistry.get("gpt_image_2_gmi");

		await executeStep(
			model,
			{
				text: "make the same astronaut bronze",
				imageUrl: "https://example.com/astronaut.png",
			},
			{
				aspect_ratio: "1:1",
				image_urls: ["https://example.com/helmet.png"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.endpoint).toBe("gpt-image-2-edit");
		expect(call.payload.prompt).toBe("make the same astronaut bronze");
		expect(call.payload.image).toEqual([
			"https://example.com/astronaut.png",
			"https://example.com/helmet.png",
		]);
		expect(call.payload.size).toBe("1024x1024");
		expect(call.payload).not.toHaveProperty("image_urls");
		expect(call.payload).not.toHaveProperty("aspect_ratio");
	});

	it("uploads local GMI reference images before calling the edit model", async () => {
		const model = ModelRegistry.get("gpt_image_2_gmi");

		await executeStep(
			model,
			{ text: "turn this into a clean icon", imageUrl: "/tmp/local-ref.png" },
			{},
			{}
		);

		expect(mockedUploadToFalStorage.mock.calls[0][0]).toBe(
			"/tmp/local-ref.png"
		);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("gpt-image-2-edit");
		expect(call.payload.image).toEqual([
			"https://fal.media/uploaded/local-ref.png",
		]);
	});

	it("keeps FAL GPT Image 2 on image_size presets", async () => {
		const model = ModelRegistry.get("gpt_image_2_fal");

		await executeStep(
			model,
			{ text: "a blue cup on a white table" },
			{ aspect_ratio: "16:9" },
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("fal");
		expect(call.endpoint).toBe("openai/gpt-image-2");
		expect(call.payload.image_size).toBe("1536x1024");
		expect(call.payload).not.toHaveProperty("size");
		expect(call.payload).not.toHaveProperty("aspect_ratio");
	});
});
