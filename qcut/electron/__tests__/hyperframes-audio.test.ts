import { describe, expect, it } from "vitest";
import {
	buildHyperframesBrowserEncodeArgs,
	buildHyperframesEncodeArgs,
	parseRuntimeVolumeValues,
	type HyperframesPreparedAudioTrack,
} from "../hyperframes/audio";

function audioTrack(
	overrides: Partial<HyperframesPreparedAudioTrack> = {}
): HyperframesPreparedAudioTrack {
	return {
		id: "music-0",
		src: "assets/music.wav",
		inputPath: "/project/assets/music.wav",
		start: 1.25,
		duration: 3,
		mediaStart: 0.5,
		volume: 0.8,
		playbackRate: 1,
		loop: false,
		type: "audio",
		volumeSamples: [],
		...overrides,
	};
}

describe("HyperFrames audio encoding", () => {
	it("mixes timed audio into the alpha-preserving MOV", () => {
		const args = buildHyperframesEncodeArgs({
			framesPattern: "/tmp/frame-%08d.png",
			outputPath: "/tmp/composition.mov",
			fps: 30,
			duration: 5,
			audioTracks: [audioTrack()],
		});
		const filter = args[args.indexOf("-filter_complex") + 1];

		expect(args).not.toContain("-an");
		expect(args).toContain("pcm_s16le");
		expect(args).toContain("[haout]");
		expect(filter).toContain("atrim=start=0.5");
		expect(filter).toContain("atrim=duration=3");
		expect(filter).toContain("adelay=1250:all=1");
		expect(filter).toContain("volume=0.8");
		expect(args.at(-1)).toBe("/tmp/composition.mov");
	});

	it("supports looping, playback rate, and animated volume", () => {
		const args = buildHyperframesEncodeArgs({
			framesPattern: "/tmp/frame-%08d.png",
			outputPath: "/tmp/composition.mov",
			fps: 24,
			duration: 4,
			audioTracks: [
				audioTrack({
					start: 0,
					duration: 4,
					loop: true,
					playbackRate: 4,
					volume: 1,
					volumeSamples: [
						{ time: 0, volume: 1 },
						{ time: 2, volume: 0.5 },
						{ time: 4, volume: 0 },
					],
				}),
			],
		});
		const filter = args[args.indexOf("-filter_complex") + 1];

		expect(args).toContain("-stream_loop");
		expect(filter.match(/atempo=2/g)).toHaveLength(2);
		expect(filter).toContain("volume=if");
		expect(filter).toContain(":eval=frame");
	});

	it("builds a browser-decodable alpha WebM from the same audio graph", () => {
		const args = buildHyperframesBrowserEncodeArgs({
			framesPattern: "/tmp/frame-%08d.png",
			outputPath: "/tmp/composition.webm",
			fps: 30,
			duration: 5,
			audioTracks: [audioTrack()],
		});

		expect(args).toContain("libvpx-vp9");
		expect(args).toContain("yuva420p");
		expect(args).toContain("libopus");
		expect(args).toContain("[haout]");
		expect(args.at(-1)).toBe("/tmp/composition.webm");
	});

	it("rejects malformed runtime volume values", () => {
		expect(
			parseRuntimeVolumeValues([
				{ id: "music-0", volume: 0.5 },
				{ id: "bad", volume: "loud" },
				null,
			])
		).toEqual([{ id: "music-0", volume: 0.5 }]);
	});
});
