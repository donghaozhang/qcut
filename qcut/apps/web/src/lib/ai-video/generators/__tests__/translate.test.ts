import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies before importing the generator
vi.mock("../../core/fal-request", () => ({
	getFalApiKeyAsync: vi.fn(),
	makeFalRequest: vi.fn(),
	generateJobId: vi.fn(() => "job_test_123"),
}));

vi.mock("../../core/polling", () => ({
	pollQueueStatus: vi.fn(),
}));

import { generateHeyGenTranslate } from "../translate";
import { getFalApiKeyAsync, makeFalRequest } from "../../core/fal-request";
import { pollQueueStatus } from "../../core/polling";
import type { HeyGenTranslateRequest } from "@/components/editor/media-panel/views/ai/types/ai-types/request-types";

const mockedGetFalApiKey = vi.mocked(getFalApiKeyAsync);
const mockedMakeFalRequest = vi.mocked(makeFalRequest);
const mockedPollQueueStatus = vi.mocked(pollQueueStatus);

const validRequest: HeyGenTranslateRequest = {
	video_url: "https://example.com/video.mp4",
	output_language: "Spanish",
};

describe("generateHeyGenTranslate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedGetFalApiKey.mockResolvedValue("test-api-key");
	});

	it("throws when FAL API key is missing", async () => {
		mockedGetFalApiKey.mockResolvedValue(undefined);

		await expect(generateHeyGenTranslate(validRequest)).rejects.toThrow(
			"FAL API key not configured"
		);
	});

	it("throws on empty video URL", async () => {
		await expect(
			generateHeyGenTranslate({ ...validRequest, video_url: "" })
		).rejects.toThrow("Video URL is required");
	});

	it("throws on invalid language", async () => {
		await expect(
			generateHeyGenTranslate({
				...validRequest,
				output_language: "Klingon",
			})
		).rejects.toThrow("Unsupported language");
	});

	it("submits queue request with correct payload", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({
				request_id: "req_abc",
				status_url: "https://queue.fal.run/status/req_abc",
				response_url: "https://queue.fal.run/response/req_abc",
			}),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);
		mockedPollQueueStatus.mockResolvedValue({
			job_id: "job_test_123",
			status: "completed",
			message: "Done",
			video_url: "https://fal.run/output/translated.mp4",
		});

		await generateHeyGenTranslate(validRequest);

		expect(mockedMakeFalRequest).toHaveBeenCalledWith(
			"fal-ai/heygen/v2/translate/speed",
			expect.objectContaining({
				video_url: "https://example.com/video.mp4",
				output_language: "Spanish",
				enable_dynamic_duration: true,
			}),
			{ queueMode: true }
		);
	});

	it("passes translate_audio_only flag correctly", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({
				request_id: "req_abc",
			}),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);
		mockedPollQueueStatus.mockResolvedValue({
			job_id: "job_test_123",
			status: "completed",
			message: "Done",
			video_url: "https://fal.run/output/translated.mp4",
		});

		await generateHeyGenTranslate({
			...validRequest,
			translate_audio_only: true,
		});

		expect(mockedMakeFalRequest).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				translate_audio_only: true,
			}),
			expect.any(Object)
		);
	});

	it("passes speaker_num when provided", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({
				request_id: "req_abc",
			}),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);
		mockedPollQueueStatus.mockResolvedValue({
			job_id: "job_test_123",
			status: "completed",
			message: "Done",
			video_url: "https://fal.run/output/translated.mp4",
		});

		await generateHeyGenTranslate({
			...validRequest,
			speaker_num: 3,
		});

		expect(mockedMakeFalRequest).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				speaker_num: 3,
			}),
			expect.any(Object)
		);
	});

	it("polls queue after submission", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({
				request_id: "req_abc",
				status_url: "https://queue.fal.run/status/req_abc",
				response_url: "https://queue.fal.run/response/req_abc",
			}),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);
		mockedPollQueueStatus.mockResolvedValue({
			job_id: "job_test_123",
			status: "completed",
			message: "Done",
			video_url: "https://fal.run/output/translated.mp4",
		});

		const result = await generateHeyGenTranslate(validRequest);

		expect(mockedPollQueueStatus).toHaveBeenCalledWith(
			"req_abc",
			expect.objectContaining({
				endpoint: "fal-ai/heygen/v2/translate/speed",
				modelName: "heygen_translate_speed",
				statusUrl: "https://queue.fal.run/status/req_abc",
				responseUrl: "https://queue.fal.run/response/req_abc",
			})
		);

		expect(result.status).toBe("completed");
		expect(result.video_url).toBe("https://fal.run/output/translated.mp4");
	});

	it("forwards progress callback", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({ request_id: "req_abc" }),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);
		mockedPollQueueStatus.mockResolvedValue({
			job_id: "job_test_123",
			status: "completed",
			message: "Done",
		});

		const onProgress = vi.fn();
		await generateHeyGenTranslate(validRequest, onProgress);

		expect(mockedPollQueueStatus).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				onProgress,
			})
		);
	});

	it("throws when queue submission returns no request_id", async () => {
		const mockResponse = {
			json: vi.fn().mockResolvedValue({}),
		};
		mockedMakeFalRequest.mockResolvedValue(mockResponse as unknown as Response);

		await expect(generateHeyGenTranslate(validRequest)).rejects.toThrow(
			"Failed to submit translation job"
		);
	});
});
