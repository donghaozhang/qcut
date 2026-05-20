import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerImageToVideoModels } from "../../../registry-data/image-to-video.js";

vi.mock("../../../infra/api-caller.js", () => ({
	callModelApi: vi.fn(),
	downloadOutput: vi.fn(async (_url: string, dest: string) => dest),
}));

import { callModelApi } from "../../../infra/api-caller.js";
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

const originalGmiApiKey = process.env.GMI_API_KEY;

registerImageToVideoModels();

beforeEach(() => {
	vi.clearAllMocks();
	process.env.GMI_API_KEY = "test-gmi-key";
	mockedCallModelApi.mockResolvedValue({
		success: true,
		outputUrl: "https://cdn.example.com/video.mp4",
		duration: 1,
		data: {},
	});
});

afterEach(() => {
	process.env.GMI_API_KEY = originalGmiApiKey;
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
});
