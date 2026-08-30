import { describe, expect, it } from "vitest";
import {
	buildComposeFinishingArgs,
	buildComposeNormalizeArgs,
	buildComposeTimelineArgs,
} from "../compose-ffmpeg";

describe("compose FFmpeg compiler", () => {
	it("normalizes a silent clip with a generated stereo track", () => {
		const args = buildComposeNormalizeArgs({
			input: "/tmp/a.mp4",
			output: "/tmp/a-normalized.mp4",
			trimIn: 0.25,
			duration: 2,
			width: 640,
			height: 360,
			fps: 24,
			hasAudio: false,
		});
		const command = args.join(" ");

		expect(command).toContain("anullsrc=channel_layout=stereo");
		expect(command).toContain("trim=start=0.25:duration=2");
		expect(command).toContain("scale=640:360");
		expect(command).toContain("fps=24");
	});

	it("compiles crossfade and hard-cut boundaries into one timeline graph", () => {
		const result = buildComposeTimelineArgs({
			clips: [
				{ path: "a.mp4", duration: 2 },
				{ path: "b.mp4", duration: 3 },
				{ path: "c.mp4", duration: 1 },
			],
			transitionsByCut: [
				{ between: ["a", "b"], preset: "crossfade", duration: 0.5 },
				undefined,
			],
			videoOutput: "timeline-video.mp4",
			audioOutput: "timeline-audio.m4a",
			output: "joined.mp4",
		});
		const videoCommand = result.videoArgs.join(" ");
		const audioCommand = result.audioArgs.join(" ");
		const muxCommand = result.muxArgs.join(" ");

		expect(result.duration).toBe(5.5);
		expect(videoCommand).toContain(
			"xfade=transition=fade:duration=0.5:offset=1.5"
		);
		expect(videoCommand).toContain("concat=n=2:v=1:a=0");
		expect(videoCommand).not.toContain("acrossfade");
		expect(audioCommand).toContain("acrossfade=d=0.5");
		expect(audioCommand).not.toContain("xfade");
		expect(muxCommand).toContain("-c copy");
	});

	it("mixes independent stickers and sound effects in the finishing pass", () => {
		const args = buildComposeFinishingArgs({
			input: "timeline.mp4",
			output: "final.mp4",
			duration: 4,
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			overlays: [
				{
					path: "badge.png",
					overlay: {
						type: "sticker",
						source: "badge.png",
						start: 0.5,
						duration: 1,
						transform: { x: 0.1, y: 0.2, scale: 0.25, rotation: 0 },
						opacity: 1,
						fadeIn: 0,
						fadeOut: 0,
					},
				},
			],
			audio: [
				{
					sourcePath: "pop.wav",
					duration: 0.8,
					identity: { sha256: "a".repeat(64), bytes: 10 },
					media: {
						duration: 1,
						width: 0,
						height: 0,
						frameRate: 0,
						hasVideo: false,
						hasAudio: true,
					},
					audio: {
						type: "sound-effect",
						source: "pop.wav",
						start: 1,
						trim: { in: 0, out: 0.8 },
						volume: 0.5,
						fadeIn: 0,
						fadeOut: 0.1,
					},
				},
			],
		});
		const command = args.join(" ");

		expect(command).toContain("overlay=x=64:y=72");
		expect(command).toContain("adelay=1000:all=1");
		expect(command).toContain("amix=inputs=2");
	});
});
