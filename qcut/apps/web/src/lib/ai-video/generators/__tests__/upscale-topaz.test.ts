import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../core/fal-request", () => ({
	getFalApiKey: vi.fn(() => "test-key"),
	getFalApiKeyAsync: vi.fn(async () => "test-key"),
	generateJobId: vi.fn(() => "job_topaz_test"),
	makeFalRequest: vi.fn(),
	handleFalResponse: vi.fn(async (response: Response, label: string) => {
		throw new Error(`${label} failed with status ${response.status}`);
	}),
}));

vi.mock("../base-generator", () => ({
	getModelConfig: vi.fn(() => ({
		id: "topaz_video_upscale",
		endpoints: { upscale_video: "topaz/video-upscale" },
	})),
	withErrorHandling: async <T>(
		_label: string,
		_ctx: unknown,
		fn: () => Promise<T>
	) => fn(),
}));

import {
	getFalApiKeyAsync,
	makeFalRequest,
	handleFalResponse,
} from "../../core/fal-request";
import { getModelConfig } from "../base-generator";
import { upscaleTopazVideo } from "../upscale";

const mockedMakeFalRequest = vi.mocked(makeFalRequest);
const mockedGetModelConfig = vi.mocked(getModelConfig);
const mockedGetFalApiKey = vi.mocked(getFalApiKeyAsync);
const mockedHandleFalResponse = vi.mocked(handleFalResponse);

function okResponse(json: unknown): Response {
	return new Response(JSON.stringify(json), { status: 200 });
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedGetFalApiKey.mockResolvedValue("test-key");
	mockedGetModelConfig.mockReturnValue({
		id: "topaz_video_upscale",
		endpoints: { upscale_video: "topaz/video-upscale" },
		// minimal cast — getModelConfig returns AIModel|undefined
	} as unknown as ReturnType<typeof getModelConfig>);
});

describe("upscaleTopazVideo", () => {
	it("builds the expected fal payload and returns the parsed video url", async () => {
		mockedMakeFalRequest.mockResolvedValue(
			okResponse({ video: { url: "https://fal.example/out.mp4" } })
		);

		const result = await upscaleTopazVideo({
			video_url: "https://source.example/in.mp4",
			upscale_factor: 4,
			target_fps: 60,
			h264_output: true,
		});

		expect(mockedMakeFalRequest).toHaveBeenCalledOnce();
		const [endpoint, payload] = mockedMakeFalRequest.mock.calls[0];
		expect(endpoint).toBe("topaz/video-upscale");
		expect(payload).toEqual({
			video_url: "https://source.example/in.mp4",
			upscale_factor: 4,
			target_fps: 60,
			H264_output: true,
		});

		expect(result).toEqual({
			job_id: "job_topaz_test",
			status: "completed",
			message: "Video upscaled with Topaz (4x)",
			estimated_time: 0,
			video_url: "https://fal.example/out.mp4",
			video_data: { video: { url: "https://fal.example/out.mp4" } },
		});
	});

	it("omits target_fps from the payload when not supplied", async () => {
		mockedMakeFalRequest.mockResolvedValue(
			okResponse({ video: { url: "https://fal.example/out.mp4" } })
		);

		await upscaleTopazVideo({
			video_url: "https://source.example/in.mp4",
			upscale_factor: 2,
			h264_output: false,
		});

		const payload = mockedMakeFalRequest.mock.calls[0][1] as Record<
			string,
			unknown
		>;
		expect("target_fps" in payload).toBe(false);
	});

	it("uses fal's capital-H `H264_output` field name exactly", async () => {
		mockedMakeFalRequest.mockResolvedValue(
			okResponse({ video: { url: "https://fal.example/out.mp4" } })
		);

		await upscaleTopazVideo({
			video_url: "https://source.example/in.mp4",
			h264_output: true,
		});

		const payload = mockedMakeFalRequest.mock.calls[0][1] as Record<
			string,
			unknown
		>;
		expect(payload.H264_output).toBe(true);
		expect("h264_output" in payload).toBe(false);
	});

	it("defaults upscale_factor to 2 when omitted", async () => {
		mockedMakeFalRequest.mockResolvedValue(
			okResponse({ video: { url: "https://fal.example/out.mp4" } })
		);

		await upscaleTopazVideo({ video_url: "https://source.example/in.mp4" });

		const payload = mockedMakeFalRequest.mock.calls[0][1] as Record<
			string,
			unknown
		>;
		expect(payload.upscale_factor).toBe(2);
	});

	it("throws when video_url is empty", async () => {
		await expect(upscaleTopazVideo({ video_url: "" })).rejects.toThrow(
			/Video URL is required/
		);
	});

	it("throws when upscale_factor is outside 2..8", async () => {
		await expect(
			upscaleTopazVideo({
				video_url: "https://source.example/in.mp4",
				upscale_factor: 10,
			})
		).rejects.toThrow(/between 2 and 8/);

		await expect(
			upscaleTopazVideo({
				video_url: "https://source.example/in.mp4",
				upscale_factor: 1,
			})
		).rejects.toThrow(/between 2 and 8/);
	});

	it("throws when the fal API key is not configured", async () => {
		mockedGetFalApiKey.mockResolvedValueOnce(undefined);

		await expect(
			upscaleTopazVideo({ video_url: "https://source.example/in.mp4" })
		).rejects.toThrow(/FAL API key not configured/);
	});

	it("propagates fal error responses via handleFalResponse", async () => {
		mockedMakeFalRequest.mockResolvedValue(
			new Response('{"error":"boom"}', { status: 401 })
		);

		await expect(
			upscaleTopazVideo({ video_url: "https://source.example/in.mp4" })
		).rejects.toThrow(/status 401/);
		expect(mockedHandleFalResponse).toHaveBeenCalledOnce();
	});
});
