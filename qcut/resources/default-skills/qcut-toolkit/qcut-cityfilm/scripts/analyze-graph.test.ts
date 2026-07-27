import { describe, expect, test } from "vitest";
import {
	buildContactSheetArgs,
	buildProbeArgs,
	buildSceneDetectArgs,
	buildTileTimestamps,
	extractAudioArgs,
	parsePacing,
	parseProbeJson,
	tileTimestamp,
} from "./analyze-graph";

describe("qcut-cityfilm contact sheets", () => {
	test("samples the whole film into evenly tiled sheets", () => {
		expect(
			buildContactSheetArgs({
				input: "/films/melbourne.mp4",
				durationSeconds: 154.2,
				frames: 40,
				columns: 5,
				rows: 4,
				outputPattern: "/out/sheet_%02d.jpg",
			})
		).toEqual([
			"-y",
			"-i",
			"/films/melbourne.mp4",
			"-vf",
			"fps=40/154.2,scale=384:-2,tile=5x4",
			"-q:v",
			"2",
			"/out/sheet_%02d.jpg",
		]);
	});

	test("never burns in timestamps, because the staged build lacks drawtext", () => {
		const args = buildContactSheetArgs({
			input: "in.mp4",
			durationSeconds: 60,
			frames: 4,
			columns: 2,
			rows: 2,
			outputPattern: "sheet_%02d.jpg",
		});
		expect(args.join(" ")).not.toContain("drawtext");
	});

	test("rejects layouts that would pad the trailing sheet", () => {
		expect(() =>
			buildContactSheetArgs({
				input: "in.mp4",
				durationSeconds: 60,
				frames: 30,
				columns: 5,
				rows: 4,
				outputPattern: "sheet_%02d.jpg",
			})
		).toThrow("must be a multiple of columns x rows");
		expect(() =>
			buildContactSheetArgs({
				input: "in.mp4",
				durationSeconds: 0,
				frames: 4,
				columns: 2,
				rows: 2,
				outputPattern: "sheet_%02d.jpg",
			})
		).toThrow("durationSeconds must be a positive number");
	});
});

describe("qcut-cityfilm tile timestamps", () => {
	test("maps tile index onto the fps sampling grid", () => {
		expect(tileTimestamp({ index: 0, frames: 40, durationSeconds: 200 })).toBe(
			0
		);
		expect(tileTimestamp({ index: 1, frames: 40, durationSeconds: 200 })).toBe(
			5
		);
		expect(tileTimestamp({ index: 39, frames: 40, durationSeconds: 200 })).toBe(
			195
		);
	});

	test("lists every tile in reading order", () => {
		expect(buildTileTimestamps({ frames: 4, durationSeconds: 120 })).toEqual([
			0, 30, 60, 90,
		]);
	});

	test("rejects indexes outside the sheet", () => {
		expect(() =>
			tileTimestamp({ index: -1, frames: 4, durationSeconds: 120 })
		).toThrow("non-negative integer");
		expect(() =>
			tileTimestamp({ index: 4, frames: 4, durationSeconds: 120 })
		).toThrow("must be below frames");
	});
});

describe("qcut-cityfilm scene detection", () => {
	test("quotes the select expression and the metadata path", () => {
		expect(
			buildSceneDetectArgs({
				input: "/films/melbourne.mp4",
				threshold: 0.4,
				metadataFile: "/out/scenes.txt",
			})
		).toEqual([
			"-i",
			"/films/melbourne.mp4",
			"-vf",
			"scale=480:-2,select='gt(scene,0.4)',metadata=print:file='/out/scenes.txt'",
			"-an",
			"-f",
			"null",
			"-",
		]);
	});

	test("escapes drive letters and backslashes in the metadata path", () => {
		const args = buildSceneDetectArgs({
			input: "in.mp4",
			threshold: 0.3,
			metadataFile: "C:\\out\\scenes.txt",
		});
		expect(args[3]).toContain("file='C:\\\\out\\\\scenes.txt'");
	});

	test("rejects thresholds outside the scene-score range", () => {
		expect(() =>
			buildSceneDetectArgs({
				input: "in.mp4",
				threshold: 0,
				metadataFile: "scenes.txt",
			})
		).toThrow("threshold must be between 0 and 1");
		expect(() =>
			buildSceneDetectArgs({
				input: "in.mp4",
				threshold: 1,
				metadataFile: "scenes.txt",
			})
		).toThrow("threshold must be between 0 and 1");
	});
});

describe("qcut-cityfilm pacing", () => {
	const metadataText = [
		"frame:0    pts:0       pts_time:5",
		"lavfi.scene_score=0.512000",
		"frame:1    pts:720000  pts_time:30.5",
		"lavfi.scene_score=0.641000",
		"frame:2    pts:1560000 pts_time:65.25",
		"lavfi.scene_score=0.470100",
		"frame:3    pts:3000000 pts_time:125",
		"lavfi.scene_score=0.882000",
	].join("\n");

	test("buckets cuts per minute and averages shot length", () => {
		expect(parsePacing({ metadataText, durationSeconds: 130 })).toEqual({
			durationSeconds: 130,
			cutCount: 4,
			cutsPerMinute: [2, 1, 1],
			averageShotSeconds: 32.5,
		});
	});

	test("treats an empty or garbage metadata file as zero cuts", () => {
		expect(parsePacing({ metadataText: "", durationSeconds: 90 })).toEqual({
			durationSeconds: 90,
			cutCount: 0,
			cutsPerMinute: [0, 0],
			averageShotSeconds: 90,
		});
		expect(
			parsePacing({
				metadataText: "\u0000\u0001 not metadata\nlavfi.scene_score=0.9\n",
				durationSeconds: 45,
			})
		).toEqual({
			durationSeconds: 45,
			cutCount: 0,
			cutsPerMinute: [0],
			averageShotSeconds: 45,
		});
	});

	test("widens the histogram when cuts land past the reported duration", () => {
		const profile = parsePacing({
			metadataText: "pts_time:130.5",
			durationSeconds: 60,
		});
		expect(profile.cutsPerMinute).toEqual([0, 0, 1]);
		expect(profile.cutCount).toBe(1);
	});
});

describe("qcut-cityfilm audio extraction", () => {
	test("strips video because speech-to-text rejects video containers", () => {
		expect(
			extractAudioArgs({
				input: "/films/melbourne.mp4",
				output: "/out/melbourne-audio.mp3",
			})
		).toEqual([
			"-y",
			"-i",
			"/films/melbourne.mp4",
			"-vn",
			"-acodec",
			"libmp3lame",
			"-q:a",
			"4",
			"/out/melbourne-audio.mp3",
		]);
	});
});

describe("qcut-cityfilm probe arguments", () => {
	test("asks ffprobe only for the fields the profile needs", () => {
		expect(buildProbeArgs({ input: "/films/melbourne.mp4" })).toEqual([
			"-v",
			"error",
			"-of",
			"json",
			"-show_entries",
			"format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate",
			"/films/melbourne.mp4",
		]);
	});
});

describe("qcut-cityfilm probe parsing", () => {
	test("reads shape, rate and audio presence from ffprobe JSON", () => {
		const stdout = JSON.stringify({
			streams: [
				{
					codec_type: "video",
					width: 3840,
					height: 2160,
					avg_frame_rate: "30000/1001",
					r_frame_rate: "30000/1001",
				},
				{ codec_type: "audio" },
			],
			format: { duration: "154.234000" },
		});
		const probe = parseProbeJson({ stdout });
		expect(probe.width).toBe(3840);
		expect(probe.height).toBe(2160);
		expect(probe.hasAudio).toBe(true);
		expect(probe.durationSeconds).toBeCloseTo(154.234, 3);
		expect(probe.fps).toBeCloseTo(29.97, 2);
	});

	test("falls back to r_frame_rate and reports silent sources", () => {
		const probe = parseProbeJson({
			stdout: JSON.stringify({
				streams: [
					{
						codec_type: "video",
						width: 1920,
						height: 1080,
						avg_frame_rate: "0/0",
						r_frame_rate: "25/1",
					},
				],
				format: { duration: "10" },
			}),
		});
		expect(probe.fps).toBe(25);
		expect(probe.hasAudio).toBe(false);
	});

	test("fails loudly on unusable ffprobe output", () => {
		expect(() => parseProbeJson({ stdout: "not json" })).toThrow(
			"did not return JSON"
		);
		expect(() =>
			parseProbeJson({ stdout: JSON.stringify({ streams: [] }) })
		).toThrow("No video stream found");
		expect(() =>
			parseProbeJson({
				stdout: JSON.stringify({
					streams: [{ codec_type: "video" }],
					format: { duration: "N/A" },
				}),
			})
		).toThrow("Could not determine duration");
	});
});
