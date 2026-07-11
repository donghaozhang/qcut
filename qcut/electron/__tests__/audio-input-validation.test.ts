import { describe, expect, it } from "vitest";
import { validateAudioInputStreams } from "../ffmpeg/audio-input-validation";
import { formatFFmpegFailure } from "../ffmpeg/process-error";
import type { AudioFile } from "../ffmpeg/types";

function audioFile({ path }: { path: string }): AudioFile {
	return { path, startTime: 0, duration: 1 };
}

describe("FFmpeg audio input validation", () => {
	it("removes media files that have no audio stream", async () => {
		const withAudio = audioFile({ path: "/tmp/with-audio.mp4" });
		const videoOnly = audioFile({ path: "/tmp/video-only.mp4" });
		const result = await validateAudioInputStreams({
			audioFiles: [withAudio, videoOnly],
			probe: async ({ mediaPath }) => mediaPath === withAudio.path,
		});

		expect(result.audioFiles).toEqual([withAudio]);
		expect(result.skippedPaths).toEqual([videoOnly.path]);
		expect(result.unverifiedPaths).toEqual([]);
	});

	it("retains an input when probing is unavailable", async () => {
		const input = audioFile({ path: "/tmp/unverified.wav" });
		const result = await validateAudioInputStreams({
			audioFiles: [input],
			probe: async () => {
				throw new Error("ffprobe unavailable");
			},
		});

		expect(result.audioFiles).toEqual([input]);
		expect(result.unverifiedPaths).toEqual([input.path]);
	});

	it("includes the useful FFmpeg stderr tail in IPC errors", () => {
		const message = formatFFmpegFailure({
			code: 234,
			stderr: [
				"irrelevant header",
				"Stream specifier ':a' matches no streams.",
				"Error initializing complex filters: Invalid argument",
			].join("\n"),
		});

		expect(message).toContain("FFmpeg exited with code 234");
		expect(message).toContain("matches no streams");
		expect(message).toContain("Invalid argument");
	});
});
