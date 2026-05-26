import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/api-caller.js", async () => {
	const actual = await vi.importActual<
		typeof import("../../infra/api-caller.js")
	>("../../infra/api-caller.js");
	return {
		...actual,
		callModelApi: vi.fn(),
		downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
		envApiKeyProvider: vi.fn(async () => "ima-key"),
		uploadToFalStorage: vi.fn(),
	};
});

vi.mock("../../infra/imarouter-assets.js", () => ({
	channelFor: vi.fn((modelKey: string) =>
		modelKey.includes("_cn")
			? {
					region: "cn",
					uploadModel: "ima-pro-upload-cn",
					groupIdKey: "groupIdCn",
				}
			: {
					region: "overseas",
					uploadModel: "seedance-upload",
					groupIdKey: "groupIdOverseas",
				}
	),
	ensureGroup: vi.fn(async () => "group-1"),
	uploadAsset: vi.fn(async (url: string) => {
		if (url.includes("fal.storage/local-a.png")) return "asset://local-a";
		if (url.includes("remote.png")) return "asset://remote";
		if (url.includes("lead.png")) return "asset://lead";
		return "asset://unknown";
	}),
}));

import {
	callModelApi,
	envApiKeyProvider,
	uploadToFalStorage,
} from "../../infra/api-caller.js";
import {
	channelFor,
	ensureGroup,
	uploadAsset,
} from "../../infra/imarouter-assets.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerImageToVideoModels } from "../../registry-data/image-to-video.js";
import { executeStep } from "../step-executors.js";

const mockedCallModelApi = vi.mocked(callModelApi);
const mockedEnvApiKeyProvider = vi.mocked(envApiKeyProvider);
const mockedUploadToFalStorage = vi.mocked(uploadToFalStorage);
const mockedChannelFor = vi.mocked(channelFor);
const mockedEnsureGroup = vi.mocked(ensureGroup);
const mockedUploadAsset = vi.mocked(uploadAsset);

beforeEach(() => {
	if (!ModelRegistry.has("imarouter_seedance_2_0_ref2v")) {
		registerImageToVideoModels();
	}
	vi.clearAllMocks();
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://video.imarouter.example/out.mp4",
		duration: 1,
		data: {},
	});
	mockedEnvApiKeyProvider.mockResolvedValue("ima-key");
	mockedUploadToFalStorage.mockResolvedValue({
		success: true,
		url: "https://fal.storage/local-a.png",
		duration: 0,
	});
});

describe("executeImageToVideo — IMA Router Ref2V references", () => {
	it("uploads CLI reference-images and submits them as top-level images", async () => {
		const model = ModelRegistry.get("imarouter_seedance_2_0_ref2v");

		await executeStep(
			model,
			{ text: "make a short product video" },
			{
				duration: 5,
				aspect_ratio: "16:9",
				resolution: "720p",
				image_urls: [
					"/tmp/local-a.png",
					"https://example.com/remote.png",
					"asset://already-approved",
				],
			},
			{}
		);

		expect(mockedUploadToFalStorage).toHaveBeenCalledWith("/tmp/local-a.png");
		expect(mockedUploadAsset).toHaveBeenCalledTimes(2);
		expect(mockedUploadAsset.mock.calls[0][0]).toBe(
			"https://fal.storage/local-a.png"
		);
		expect(mockedUploadAsset.mock.calls[1][0]).toBe(
			"https://example.com/remote.png"
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("imarouter");
		expect(call.endpoint).toBe("v1/videos");
		expect(call.payload.images).toEqual([
			"asset://local-a",
			"asset://remote",
			"asset://already-approved",
		]);
		expect(call.payload).not.toHaveProperty("image_urls");
		expect(call.payload.metadata).toMatchObject({
			audio: false,
			aspect_ratio: "16:9",
			resolution: "720p",
			role_mode: "reference",
		});
	});

	it("merges --image-url with --reference-images for IMA Router Ref2V", async () => {
		const model = ModelRegistry.get("imarouter_seedance_2_0_ref2v");

		await executeStep(
			model,
			{
				text: "use all supplied material",
				imageUrl: "https://example.com/lead.png",
			},
			{
				image_urls: ["asset://already-approved"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.images).toEqual([
			"asset://lead",
			"asset://already-approved",
		]);
		expect(call.payload).not.toHaveProperty("image_url");
		expect(call.payload).not.toHaveProperty("image_urls");
	});

	it("passes asset references through without requiring an API key", async () => {
		mockedEnvApiKeyProvider.mockResolvedValue(undefined);
		const model = ModelRegistry.get("imarouter_seedance_2_0_cn_ref2v");

		await executeStep(
			model,
			{ text: "use approved assets" },
			{
				image_urls: ["asset://cn-a", "asset://cn-b"],
			},
			{}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.payload.images).toEqual(["asset://cn-a", "asset://cn-b"]);
		expect(mockedEnsureGroup).not.toHaveBeenCalled();
		expect(mockedUploadAsset).not.toHaveBeenCalled();
	});

	it("uses the CN upload channel for CN Ref2V references", async () => {
		const model = ModelRegistry.get("imarouter_seedance_2_0_cn_ref2v");

		await executeStep(
			model,
			{ text: "use cn material" },
			{
				image_urls: ["https://example.com/remote.png"],
			},
			{}
		);

		expect(mockedChannelFor).toHaveBeenCalledWith(
			"imarouter_seedance_2_0_cn_ref2v"
		);
		expect(mockedEnsureGroup.mock.calls[0][0]).toMatchObject({
			region: "cn",
			uploadModel: "ima-pro-upload-cn",
		});
	});
});
