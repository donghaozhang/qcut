import { describe, expect, it } from "vitest";
import type { VideoProbe } from "./sticker-lab-real-video-evidence";
import { verifyStratifiedMediaProbe } from "./sticker-lab-stratified-media-evidence";

function createProbe({
	audioChannels = 2,
	audioCodec = "aac",
	audioSampleRate = "48000",
	duration = "6.080000",
	frameRate = "30/1",
	height = 720,
	videoCodec = "h264",
	width = 1280,
}: {
	audioChannels?: number;
	audioCodec?: string;
	audioSampleRate?: string;
	duration?: string;
	frameRate?: string;
	height?: number;
	videoCodec?: string;
	width?: number;
} = {}): VideoProbe {
	return {
		format: { duration },
		streams: [
			{
				avg_frame_rate: frameRate,
				codec_name: videoCodec,
				codec_type: "video",
				height,
				width,
			},
			{
				channels: audioChannels,
				codec_name: audioCodec,
				codec_type: "audio",
				sample_rate: audioSampleRate,
			},
		],
	};
}

describe("stratified Sticker Lab media evidence", () => {
	it("accepts the expected H.264/AAC desktop export", () => {
		expect(
			verifyStratifiedMediaProbe({
				expected: {
					audioChannels: 2,
					audioCodec: "aac",
					audioSampleRate: 48_000,
					durationSeconds: 6,
					frameRate: 30,
					height: 720,
					videoCodec: "h264",
					width: 1280,
				},
				probe: createProbe(),
			})
		).toEqual({
			audioChannels: 2,
			audioCodec: "aac",
			audioSampleRate: 48_000,
			durationSeconds: 6.08,
			frameRate: 30,
			height: 720,
			videoCodec: "h264",
			width: 1280,
		});
	});

	it("accepts a higher-resolution HEVC/AAC source", () => {
		const source = createProbe({
			audioSampleRate: "44100",
			duration: "6.000000",
			height: 1440,
			videoCodec: "hevc",
			width: 2560,
		});
		expect(
			verifyStratifiedMediaProbe({
				expected: {
					audioChannels: 2,
					audioCodec: "aac",
					audioSampleRate: 44_100,
					durationSeconds: 6,
					frameRate: 30,
					videoCodec: "hevc",
				},
				probe: source,
			})
		).toMatchObject({
			audioChannels: 2,
			audioCodec: "aac",
			audioSampleRate: 44_100,
			height: 1440,
			videoCodec: "hevc",
			width: 2560,
		});
	});

	it.each([
		["wrong video codec", createProbe({ videoCodec: "hevc" })],
		["missing AAC audio", createProbe({ audioCodec: "opus" })],
		["wrong audio channels", createProbe({ audioChannels: 1 })],
		["wrong audio sample rate", createProbe({ audioSampleRate: "44100" })],
		["wrong dimensions", createProbe({ width: 1920 })],
		["wrong frame rate", createProbe({ frameRate: "24/1" })],
		["wrong duration", createProbe({ duration: "5.5" })],
	])("rejects %s", (_label, probe) => {
		expect(() =>
			verifyStratifiedMediaProbe({
				expected: {
					audioChannels: 2,
					audioCodec: "aac",
					audioSampleRate: 48_000,
					durationSeconds: 6,
					frameRate: 30,
					height: 720,
					videoCodec: "h264",
					width: 1280,
				},
				probe,
			})
		).toThrow();
	});
});
