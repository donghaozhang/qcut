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
	generateGmiVeoLiteImageVideo,
	generateKlingV3GmiImageVideo,
	generateKlingOmniImageVideo,
	generateKlingMotionControlVideo,
	generateSeedance260128ImageVideo,
	generateSkyreelsV4ImageVideo,
} from "../gmi-image-to-video";

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

describe("generateGmiVeoLiteImageVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateGmiVeoLiteImageVideo({
			prompt: "a cat",
			imageUrl: "https://img.png",
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"veo-3.1-lite-generate-001",
			expect.objectContaining({ prompt: "a cat", image: "https://img.png" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Veo 3.1 Lite (image-to-video)",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateGmiVeoLiteImageVideo({
				prompt: "a cat",
				imageUrl: "https://img.png",
			})
		).rejects.toThrow("boom");
	});
});

describe("generateKlingV3GmiImageVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateKlingV3GmiImageVideo({
			prompt: "a dog",
			imageUrl: "https://img.png",
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"kling-v3-image-to-video",
			expect.objectContaining({ prompt: "a dog", image: "https://img.png" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Kling V3 I2V",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateKlingV3GmiImageVideo({
				prompt: "a dog",
				imageUrl: "https://img.png",
			})
		).rejects.toThrow("boom");
	});
});

describe("generateKlingOmniImageVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateKlingOmniImageVideo({
			prompt: "sunset",
			imageUrl: "https://img.png",
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"kling-v3-omni",
			expect.objectContaining({ prompt: "sunset" }),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Kling V3 Omni (image-to-video)",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateKlingOmniImageVideo({
				prompt: "sunset",
				imageUrl: "https://img.png",
			})
		).rejects.toThrow("boom");
	});
});

describe("generateKlingMotionControlVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateKlingMotionControlVideo({
			imageUrl: "https://img.png",
			videoUrl: "https://vid.mp4",
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"kling-3-motion-control",
			expect.objectContaining({
				image_url: "https://img.png",
				video_url: "https://vid.mp4",
			}),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI Kling 3 Motion Control",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateKlingMotionControlVideo({
				imageUrl: "https://img.png",
				videoUrl: "https://vid.mp4",
			})
		).rejects.toThrow("boom");
	});
});

describe("generateSeedance260128ImageVideo", () => {
	it("maps firstFrame/lastFrame to first_frame/last_frame", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		await generateSeedance260128ImageVideo({
			prompt: "bud to bloom",
			firstFrame: "https://example.com/bud.jpg",
			lastFrame: "https://example.com/bloom.jpg",
			duration: 6,
			resolution: "720p",
			ratio: "1:1",
			generateAudio: false,
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"seedance-2-0-260128",
			{
				prompt: "bud to bloom",
				first_frame: "https://example.com/bud.jpg",
				last_frame: "https://example.com/bloom.jpg",
				duration: 6,
				resolution: "720p",
				ratio: "1:1",
				generate_audio: false,
			},
			"gmi"
		);
	});

	it("throws when firstFrame is missing", async () => {
		await expect(
			generateSeedance260128ImageVideo({
				prompt: "p",
				firstFrame: "",
			})
		).rejects.toThrow(/first-frame/i);
		expect(mockedSubmit).not.toHaveBeenCalled();
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateSeedance260128ImageVideo({
				prompt: "p",
				firstFrame: "https://example.com/a.jpg",
			})
		).rejects.toThrow("boom");
	});
});

describe("generateSkyreelsV4ImageVideo", () => {
	it("returns completed result on success", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(successPollResult);

		const result = await generateSkyreelsV4ImageVideo({
			prompt: "ocean",
			imageUrl: "https://img.png",
		});

		expect(mockedSubmit).toHaveBeenCalledWith(
			"skyreels-v4-image-to-video",
			expect.objectContaining({
				prompt: "ocean",
				first_frame_image: "https://img.png",
			}),
			"gmi"
		);
		expect(mockedPoll).toHaveBeenCalledWith("req1", "gmi");
		expect(result).toEqual({
			job_id: "job_test_123",
			status: "completed",
			message: "Video generated with GMI SkyReels V4 (image-to-video)",
			estimated_time: 0,
			video_url: "https://video.mp4",
			video_data: successPollResult,
		});
	});

	it("throws on failed poll", async () => {
		mockedSubmit.mockResolvedValue(successSubmitResult);
		mockedPoll.mockResolvedValue(failedPollResult);

		await expect(
			generateSkyreelsV4ImageVideo({
				prompt: "ocean",
				imageUrl: "https://img.png",
			})
		).rejects.toThrow("boom");
	});
});
