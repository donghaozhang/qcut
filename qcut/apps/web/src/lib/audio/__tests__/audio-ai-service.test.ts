import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	convertClipVoice,
	enhanceSpeechAudio,
	separateAudioStems,
} from "../audio-ai-service";
import {
	handleFalResponse,
	makeFalRequestQueued,
} from "@/lib/ai-video/core/fal-request";
import { convertSpeech } from "@/lib/ai-video/generators/speech";

vi.mock("@/lib/ai-video/core/fal-request", () => ({
	makeFalRequestQueued: vi.fn(),
	handleFalResponse: vi.fn(),
}));

vi.mock("@/lib/ai-video/generators/speech", () => ({
	convertSpeech: vi.fn(),
}));

function response(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("audio AI service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(handleFalResponse).mockResolvedValue();
	});

	it("uses DeepFilterNet with a lossless output", async () => {
		vi.mocked(makeFalRequestQueued).mockResolvedValue(
			response({
				audio_file: {
					url: "https://fal.media/clean.wav",
					content_type: "audio/wav",
					duration: 4,
				},
			})
		);

		await expect(
			enhanceSpeechAudio({ audioUrl: "https://fal.media/input.wav" })
		).resolves.toMatchObject({
			url: "https://fal.media/clean.wav",
			contentType: "audio/wav",
			duration: 4,
		});
		expect(makeFalRequestQueued).toHaveBeenCalledWith(
			"fal-ai/deepfilternet3",
			{
				audio_url: "https://fal.media/input.wav",
				audio_format: "wav",
				bitrate: "192k",
			},
			expect.objectContaining({ proxyFirst: true })
		);
	});

	it("requests and parses all Demucs stems", async () => {
		vi.mocked(makeFalRequestQueued).mockResolvedValue(
			response({
				vocals: { url: "https://fal.media/vocals.wav" },
				drums: { url: "https://fal.media/drums.wav" },
				bass: { url: "https://fal.media/bass.wav" },
				other: { url: "https://fal.media/other.wav" },
				guitar: { url: "https://fal.media/guitar.wav" },
				piano: { url: "https://fal.media/piano.wav" },
			})
		);

		const result = await separateAudioStems({
			audioUrl: "https://fal.media/song.wav",
		});
		expect(Object.keys(result)).toEqual([
			"vocals",
			"drums",
			"bass",
			"other",
			"guitar",
			"piano",
		]);
		expect(makeFalRequestQueued).toHaveBeenCalledWith(
			"fal-ai/demucs",
			expect.objectContaining({ model: "htdemucs_6s", output_format: "wav" }),
			expect.objectContaining({ proxyFirst: true })
		);
	});

	it("converts the current source with an optional target voice", async () => {
		vi.mocked(convertSpeech).mockResolvedValue({
			jobId: "job",
			audioUrl: "https://fal.media/converted.wav",
			contentType: "audio/wav",
			fileName: "converted.wav",
		});

		await expect(
			convertClipVoice({
				sourceAudioUrl: "https://fal.media/source.wav",
				targetVoiceAudioUrl: "https://fal.media/voice.wav",
			})
		).resolves.toMatchObject({ url: "https://fal.media/converted.wav" });
		expect(convertSpeech).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceAudioUrl: "https://fal.media/source.wav",
				targetVoiceAudioUrl: "https://fal.media/voice.wav",
			})
		);
	});
});
