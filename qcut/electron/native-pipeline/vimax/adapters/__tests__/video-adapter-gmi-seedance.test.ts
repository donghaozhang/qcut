import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerImageToVideoModels } from "../../../registry-data/image-to-video.js";

vi.mock("../../../infra/api-caller.js", () => ({
	callModelApi: vi.fn(),
	downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
	envApiKeyProvider: vi.fn(async () => "test-ima-key"),
}));

vi.mock("../../../infra/imarouter-assets.js", () => ({
	channelFor: vi.fn(() => ({
		region: "overseas",
		uploadModel: "seedance-upload",
		groupIdKey: "groupIdOverseas",
	})),
	ensureGroup: vi.fn(async () => "asset-group-1"),
	uploadAsset: vi.fn(async () => "asset://storyboard-asset-1"),
}));

import { callModelApi } from "../../../infra/api-caller.js";
import { ensureGroup, uploadAsset } from "../../../infra/imarouter-assets.js";
import {
	VideoGeneratorAdapter,
	buildImageField,
	resolveVideoModelSpec,
} from "../video-adapter.js";

type ApiCall = {
	endpoint: string;
	modelKey: string;
	provider: string;
	payload: Record<string, unknown>;
};

const mockedCallModelApi = callModelApi as unknown as {
	mockResolvedValue: (value: unknown) => void;
	mock: { calls: Array<[ApiCall]> };
};
const mockedEnsureGroup = ensureGroup as unknown as {
	mock: { calls: unknown[] };
};
const mockedUploadAsset = uploadAsset as unknown as {
	mock: { calls: Array<[string, unknown, string, unknown]> };
};

const originalGmiApiKey = process.env.GMI_API_KEY;
const originalImaRouterApiKey = process.env.IMAROUTER_API_KEY;

registerImageToVideoModels();

beforeEach(() => {
	vi.clearAllMocks();
	process.env.GMI_API_KEY = "test-gmi-key";
	process.env.IMAROUTER_API_KEY = "test-ima-key";
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://cdn.example.com/video.mp4",
		duration: 1,
		data: {},
	});
});

afterEach(() => {
	process.env.GMI_API_KEY = originalGmiApiKey;
	process.env.IMAROUTER_API_KEY = originalImaRouterApiKey;
});

describe("VideoGeneratorAdapter — GMI Seedance I2V", () => {
	it("uses first_frame and numeric duration for fast Seedance I2V", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-video-"));
		const framePath = path.join(tmpDir, "frame.png");
		fs.writeFileSync(framePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const adapter = new VideoGeneratorAdapter({
			model: "gmi_seedance_2_0_fast_260128_i2v",
			output_dir: tmpDir,
		});

		await adapter.generate(framePath, "slow dolly in", {
			duration: 5,
			output_path: path.join(tmpDir, "out.mp4"),
		});

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.endpoint).toBe("seedance-2-0-fast-260128");
		expect(call.modelKey).toBe("gmi_seedance_2_0_fast_260128_i2v");
		expect(call.payload).toMatchObject({
			prompt: "slow dolly in",
			first_frame: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
			duration: 5,
		});
		expect(call.payload).not.toHaveProperty("image");
	});

	it("keeps the generic GMI image field for non-Seedance I2V models", () => {
		expect(
			buildImageField({
				imagePath: "https://cdn.example.com/frame.png",
				provider: "gmi",
				modelKey: "gmi_kling_v3_i2v",
			})
		).toEqual({ image: "https://cdn.example.com/frame.png" });
	});

	it("resolves IMA Router video models without falling back to FAL", () => {
		expect(
			resolveVideoModelSpec("imarouter_seedance_2_0_fast_i2v").providerBackend
		).toBe("imarouter");
	});

	it("uploads IMA Router storyboard URL before video generation", async () => {
		const adapter = new VideoGeneratorAdapter({
			model: "imarouter_seedance_2_0_fast_i2v",
			output_dir: "/tmp/qcut-video",
		});

		await adapter.generate(
			"https://cdn.example.com/storyboard.png",
			"pan left",
			{
				duration: 5,
				output_path: "/tmp/qcut-video/out.mp4",
			}
		);

		const call = mockedCallModelApi.mock.calls[0][0];
		expect(mockedEnsureGroup.mock.calls).toHaveLength(1);
		expect(mockedUploadAsset.mock.calls[0][0]).toBe(
			"https://cdn.example.com/storyboard.png"
		);
		expect(call.provider).toBe("imarouter");
		expect(call.endpoint).toBe("v1/videos");
		expect(call.modelKey).toBe("imarouter_seedance_2_0_fast_i2v");
		expect(call.payload).toMatchObject({
			model: "seedance-2.0-fast",
			prompt: "pan left",
			images: ["asset://storyboard-asset-1"],
			duration: "5",
			resolution: "720p",
			aspect_ratio: "16:9",
			role_mode: "frame",
		});
	});
});
