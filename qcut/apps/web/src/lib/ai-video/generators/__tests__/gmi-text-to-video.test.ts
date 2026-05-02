import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../core/fal-request", () => ({
	generateJobId: vi.fn(() => "job_test_123"),
}));

vi.mock("../../core/provider-router", () => ({
	providerRouter: {
		submit: vi.fn(),
		poll: vi.fn(),
	},
}));

import { providerRouter } from "../../core/provider-router";
import {
	generateGmiVeoLiteVideo,
	generateKlingV3GmiTextVideo,
	generateKlingOmniTextVideo,
	generateSeedance260128TextVideo,
	generateSeedanceFast260128TextVideo,
	generateSkyreelsV4TextVideo,
	generateHappyHorseGmiTextVideo,
} from "../gmi-text-to-video";

const mockedSubmit = vi.mocked(providerRouter.submit);
const mockedPoll = vi.mocked(providerRouter.poll);

const successSubmitResult = { requestId: "req1", provider: "gmi" as const };
const successPollResult = {
	status: "completed" as const,
	videoUrl: "https://video.mp4",
};
const failedPollResult = {
	status: "failed" as const,
	error: "boom",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("generateGmiVeoLiteVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateGmiVeoLiteVideo({ prompt: "a cat" });

		expect(mockedSubmit).toHaveBeenCalledWith(
			"veo-3.1-lite-generate-001",
			expect.objectContaining({ prompt: "a cat" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Veo 3.1 Lite",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(generateGmiVeoLiteVideo({ prompt: "a cat" })).rejects.toThrow(
			"boom"
		);
	});
});

describe("generateKlingV3GmiTextVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateKlingV3GmiTextVideo({ prompt: "a dog" });

		expect(mockedSubmit).toHaveBeenCalledWith(
			"kling-v3-text-to-video",
			expect.objectContaining({ prompt: "a dog" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Kling V3 T2V",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateKlingV3GmiTextVideo({ prompt: "a dog" })
		).rejects.toThrow("boom");
	});
});

describe("generateKlingOmniTextVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateKlingOmniTextVideo({ prompt: "sunset" });

		expect(mockedSubmit).toHaveBeenCalledWith(
			"kling-v3-omni",
			expect.objectContaining({ prompt: "sunset" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Kling V3 Omni",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateKlingOmniTextVideo({ prompt: "sunset" })
		).rejects.toThrow("boom");
	});
});

describe("generateSeedance260128TextVideo", () => {
	it("sends the documented payload shape (ratio, not aspect_ratio)", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateSeedance260128TextVideo({
			prompt: "An astronaut on Mars",
			duration: 8,
			resolution: "720p",
			ratio: "16:9",
			generateAudio: true,
			seed: 42,
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"seedance-2-0-260128",
			{
				prompt: "An astronaut on Mars",
				duration: 8,
				resolution: "720p",
				ratio: "16:9",
				generate_audio: true,
				seed: 42,
			},
			"gmi"
		);
	});

	it("omits undefined optional fields (no stray seed / watermark / reference_* keys)", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateSeedance260128TextVideo({ prompt: "solo prompt" });

		const payload = mockedSubmit.mock.calls[0][1];
		expect(payload).toEqual({ prompt: "solo prompt" });
		expect(payload).not.toHaveProperty("seed");
		expect(payload).not.toHaveProperty("watermark");
		expect(payload).not.toHaveProperty("reference_images");
		expect(payload).not.toHaveProperty("reference_videos");
		expect(payload).not.toHaveProperty("reference_audios");
		expect(payload).not.toHaveProperty("reference_asset_ids");
		expect(payload).not.toHaveProperty("aspect_ratio");
	});

	it("forwards reference arrays only when non-empty", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateSeedance260128TextVideo({
			prompt: "p",
			referenceImages: ["https://example.com/a.jpg"],
			referenceAssetIds: [],
		});

		const payload = mockedSubmit.mock.calls[0][1];
		expect(payload.reference_images).toEqual(["https://example.com/a.jpg"]);
		expect(payload).not.toHaveProperty("reference_asset_ids");
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateSeedance260128TextVideo({ prompt: "x" })
		).rejects.toThrow("boom");
	});
});

describe("generateSeedanceFast260128TextVideo", () => {
	it("submits to the `-fast-` endpoint with identical payload shape", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateSeedanceFast260128TextVideo({
			prompt: "Draft idea",
			duration: 4,
			resolution: "720p",
			ratio: "16:9",
			generateAudio: true,
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"seedance-2-0-fast-260128",
			{
				prompt: "Draft idea",
				duration: 4,
				resolution: "720p",
				ratio: "16:9",
				generate_audio: true,
			},
			"gmi"
		);
	});

	it("surfaces errors with the fast-tier label", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateSeedanceFast260128TextVideo({ prompt: "x" })
		).rejects.toThrow("boom");
	});
});

describe("generateHappyHorseGmiTextVideo", () => {
	it("submits to happyhorse1.0-t2v with uppercase resolution and `ratio` field", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateHappyHorseGmiTextVideo({
			prompt: "drone over a misty forest",
			duration: 10,
			resolution: "1080p",
			ratio: "16:9",
			negative_prompt: "blurry, low quality",
			seed: 12345,
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"happyhorse1.0-t2v",
			{
				prompt: "drone over a misty forest",
				duration: 10,
				resolution: "1080P",
				ratio: "16:9",
				audio_url: null,
				prompt_extend: true,
				watermark: false,
				negative_prompt: "blurry, low quality",
				seed: 12345,
			},
			"gmi"
		);
	});

	it("defaults audio_url to null when not supplied (matches GMI spec)", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateHappyHorseGmiTextVideo({ prompt: "p" });

		const payload = mockedSubmit.mock.calls[0][1];
		expect(payload.audio_url).toBeNull();
		expect(payload.duration).toBe(5); // registry default
		expect(payload.resolution).toBe("1080P");
		expect(payload.ratio).toBe("16:9");
	});

	it("forwards a user-supplied audio_url unchanged", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateHappyHorseGmiTextVideo({
			prompt: "p",
			audio_url: "https://example.com/voice.mp3",
		});

		const payload = mockedSubmit.mock.calls[0][1];
		expect(payload.audio_url).toBe("https://example.com/voice.mp3");
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateHappyHorseGmiTextVideo({ prompt: "p" })
		).rejects.toThrow("boom");
	});
});

describe("generateSkyreelsV4TextVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateSkyreelsV4TextVideo({ prompt: "ocean" });

		expect(mockedSubmit).toHaveBeenCalledWith(
			"skyreels-v4-text-to-video",
			expect.objectContaining({ prompt: "ocean" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI SkyReels V4",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateSkyreelsV4TextVideo({ prompt: "ocean" })
		).rejects.toThrow("boom");
	});
});
