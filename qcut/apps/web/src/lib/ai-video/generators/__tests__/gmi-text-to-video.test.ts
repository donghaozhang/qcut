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
	generateSkyreelsV4TextVideo,
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
