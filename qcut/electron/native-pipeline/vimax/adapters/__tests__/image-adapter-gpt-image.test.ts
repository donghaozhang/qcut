import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../infra/api-caller.js", () => ({
	callModelApi: vi.fn(),
	downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
	uploadToFalStorage: vi.fn(),
}));

vi.mock("../../../infra/proxy-client.js", () => ({
	isProxyAvailable: vi.fn(async () => true),
}));

import { callModelApi, uploadToFalStorage } from "../../../infra/api-caller.js";
import { ImageGeneratorAdapter } from "../image-adapter.js";

type ApiCall = {
	endpoint: string;
	provider: string;
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
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://cdn.example.com/out.png",
		duration: 1,
		data: {},
	});
	mockedUploadToFalStorage.mockResolvedValue({
		success: true,
		url: "https://cdn.example.com/uploaded-ref.png",
	});
});

describe("ImageGeneratorAdapter — GPT Image 2", () => {
	it("advertises GPT Image 2 models for flow image generation", () => {
		expect(ImageGeneratorAdapter.getAvailableModels()).toContain(
			"gpt_image_2_ima"
		);
		expect(ImageGeneratorAdapter.getAvailableModels()).toContain(
			"gpt_image_2_gmi"
		);
		expect(ImageGeneratorAdapter.getAvailableModels()).toContain(
			"gpt_image_2_fal"
		);
		expect(ImageGeneratorAdapter.getAvailableReferenceModels()).toContain(
			"gpt_image_2_ima"
		);
		expect(ImageGeneratorAdapter.getAvailableReferenceModels()).toContain(
			"gpt_image_2_fal"
		);
		expect(
			ImageGeneratorAdapter.supportsReferenceImages("gpt_image_2_ima")
		).toBe(true);
		expect(
			ImageGeneratorAdapter.supportsReferenceImages("gpt_image_2_gmi")
		).toBe(true);
		expect(
			ImageGeneratorAdapter.supportsReferenceImages("gpt_image_2_fal")
		).toBe(true);
	});

	it("routes flow portrait/storyboard text generation through IMA Router GPT Image 2", async () => {
		const adapter = new ImageGeneratorAdapter({
			model: "gpt_image_2_ima",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generate("portrait of a brass space captain", {
			aspect_ratio: "9:16",
			output_path: "/tmp/qcut-vimax/gmi.png",
		});

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("imarouter");
		expect(call.endpoint).toBe("v1/images/generations");
		expect(call.payload).toEqual({
			model: "gpt-image-2",
			prompt: "portrait of a brass space captain",
			size: "1024x1536",
			quality: "medium",
			output_format: "png",
			n: 1,
		});
	});

	it("routes flow portrait/storyboard text generation through FAL GPT Image 2", async () => {
		const adapter = new ImageGeneratorAdapter({
			model: "gpt_image_2_fal",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generate("wide storyboard frame of a quiet train station", {
			aspect_ratio: "16:9",
			output_path: "/tmp/qcut-vimax/fal.png",
		});

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("fal");
		expect(call.endpoint).toBe("openai/gpt-image-2");
		expect(call.payload).toEqual({
			prompt: "wide storyboard frame of a quiet train station",
			image_size: "landscape_16_9",
			quality: "high",
			output_format: "png",
			num_images: 1,
		});
	});

	it("routes the legacy gpt_image_2_gmi alias through IMA Router", async () => {
		const adapter = new ImageGeneratorAdapter({
			model: "gpt_image_2_gmi",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generate("portrait of a brass space captain", {
			aspect_ratio: "1:1",
			output_path: "/tmp/qcut-vimax/legacy.png",
		});

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("imarouter");
		expect(call.endpoint).toBe("v1/images/generations");
		expect(call.payload.model).toBe("gpt-image-2");
	});

	it("rejects unknown text-to-image models instead of falling back", async () => {
		const adapter = new ImageGeneratorAdapter({
			model: "gpt_image_2_typo",
			output_dir: "/tmp/qcut-vimax",
		});

		await expect(adapter.generate("portrait")).rejects.toThrow(
			"Unknown image model 'gpt_image_2_typo'"
		);
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("routes IMA Router reference generation through the GPT Image 2 image endpoint", async () => {
		const adapter = new ImageGeneratorAdapter({
			reference_model: "gpt_image_2_ima",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generateWithReference(
			"keep identity, change outfit to a red jacket",
			"https://example.com/portrait.png",
			{
				model: "gpt_image_2_ima",
				aspect_ratio: "1:1",
				output_path: "/tmp/qcut-vimax/gmi-ref.png",
			}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("imarouter");
		expect(call.endpoint).toBe("v1/images/generations");
		expect(call.payload).toEqual({
			model: "gpt-image-2",
			prompt: "keep identity, change outfit to a red jacket",
			images: ["https://example.com/portrait.png"],
			size: "1024x1024",
			quality: "medium",
			output_format: "png",
			n: 1,
		});
	});

	it("routes FAL reference generation through the GPT Image 2 edit endpoint", async () => {
		const adapter = new ImageGeneratorAdapter({
			reference_model: "gpt_image_2_fal",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generateWithReference(
			"make this storyboard image rainy",
			"https://example.com/shot.png",
			{
				model: "gpt_image_2_fal",
				output_path: "/tmp/qcut-vimax/fal-ref.png",
			}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("fal");
		expect(call.endpoint).toBe("openai/gpt-image-2/edit");
		expect(call.payload).toEqual({
			prompt: "make this storyboard image rainy",
			image_urls: ["https://example.com/shot.png"],
			image_size: "auto",
			quality: "high",
			num_images: 1,
			output_format: "png",
		});
	});

	it("rejects unknown reference models instead of falling back", async () => {
		const adapter = new ImageGeneratorAdapter({
			reference_model: "gpt_image_2_typo",
			output_dir: "/tmp/qcut-vimax",
		});

		await expect(
			adapter.generateWithReference("portrait", "https://example.com/ref.png")
		).rejects.toThrow("Unknown reference image model 'gpt_image_2_typo'");
		expect(mockedCallModelApi.mock.calls).toHaveLength(0);
	});

	it("uploads local GPT Image 2 reference images before edit calls", async () => {
		const adapter = new ImageGeneratorAdapter({
			reference_model: "gpt_image_2_ima",
			output_dir: "/tmp/qcut-vimax",
		});

		await adapter.generateWithReference(
			"make a matching product still",
			"/tmp/local-portrait.png",
			{
				model: "gpt_image_2_ima",
				output_path: "/tmp/qcut-vimax/local-ref.png",
			}
		);

		expect(mockedUploadToFalStorage.mock.calls[0][0]).toBe(
			"/tmp/local-portrait.png"
		);
		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.images).toEqual([
			"https://cdn.example.com/uploaded-ref.png",
		]);
	});
});
