import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { CLIRunOptions } from "../cli-runner/types.js";

const mocks = vi.hoisted(() => ({
	callModelApi: vi.fn(),
}));

vi.mock("../../infra/api-caller.js", () => ({
	callModelApi: mocks.callModelApi,
}));

import { registerMusicModels } from "../../registry-data/music.js";
import { handleGenerateMusic } from "../cli-handlers-music.js";

const outputDir = join(import.meta.dirname, "__music_test_output__");

describe("music generation handler", () => {
	beforeAll(async () => {
		registerMusicModels();
		await mkdir(outputDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(outputDir, { recursive: true, force: true });
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
			})
		);
		mocks.callModelApi.mockResolvedValue({
			success: true,
			data: {
				audio: {
					url: "https://cdn.example.test/generated.mp3",
					file_name: "generated.mp3",
					content_type: "audio/mpeg",
				},
			},
		});
	});

	it("submits instrumental and quality settings to MiniMax Music v2.6", async () => {
		const progress = vi.fn();
		const result = await handleGenerateMusic(
			{
				command: "generate-music",
				text: "Warm cinematic travel score, 96 BPM",
				model: "minimax_music_v2_6",
				instrumental: true,
				sampleRate: 44_100,
				bitrate: 256_000,
				audioFormat: "mp3",
				outputDir,
			} as CLIRunOptions,
			progress,
			new AbortController().signal
		);

		expect(mocks.callModelApi).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: "fal-ai/minimax-music/v2.6",
				provider: "fal",
				modelKey: "minimax_music_v2_6",
				payload: {
					prompt: "Warm cinematic travel score, 96 BPM",
					is_instrumental: true,
					audio_setting: {
						sample_rate: 44_100,
						bitrate: 256_000,
						format: "mp3",
					},
				},
			})
		);
		expect(result).toMatchObject({
			success: true,
			outputPath: join(outputDir, "generated.mp3"),
			data: {
				model: "minimax_music_v2_6",
				instrumental: true,
			},
		});
		expect(progress).toHaveBeenLastCalledWith(
			expect.objectContaining({ stage: "complete", percent: 100 })
		);
	});

	it("rejects lyrics when instrumental mode is enabled", async () => {
		const result = await handleGenerateMusic(
			{
				command: "generate-music",
				text: "Warm cinematic travel score, 96 BPM",
				instrumental: true,
				lyrics: "[verse] This should not be silently discarded",
			} as CLIRunOptions,
			vi.fn(),
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--lyrics is not allowed");
		expect(mocks.callModelApi).not.toHaveBeenCalled();
	});
});
