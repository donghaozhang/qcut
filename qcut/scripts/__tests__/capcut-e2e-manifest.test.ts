import { describe, expect, it } from "vitest";
import type { FontGlyphCoverageReport } from "../capcut-e2e/font-coverage-contract.js";
import {
	buildSourceFrameCalibrationReport,
	type CapCutE2eManifest,
	validateManifest,
	validateSourceAudioProbe,
	validateSourceVideoProbe,
} from "../capcut-e2e/manifest.js";
import { CAPCUT_E2E_FIXTURE_SPEC } from "../capcut-e2e/spec.js";

function fontReport({
	fontPath,
	text,
}: {
	fontPath: string;
	text: string;
}): FontGlyphCoverageReport {
	return {
		familyName: "QCut Test",
		fontPath,
		fullName: "QCut Test Regular",
		missing: [],
		postscriptName: "QCutTest-Regular",
		text,
	};
}

function sourceVideoProbe(): unknown {
	return {
		format: { duration: "6.000000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
		streams: [
			{
				avg_frame_rate: "30/1",
				codec_name: "h264",
				codec_type: "video",
				height: 720,
				nb_frames: "180",
				pix_fmt: "yuv420p",
				profile: "High",
				width: 1280,
			},
		],
	};
}

function sourceAudioProbe(): unknown {
	return {
		format: { duration: "6.000000", format_name: "wav" },
		streams: [
			{
				channels: 1,
				codec_name: "pcm_s16le",
				codec_type: "audio",
				sample_fmt: "s16",
				sample_rate: "48000",
			},
		],
	};
}

function manifest(): CapCutE2eManifest {
	const asciiFontPath = "/fonts/ascii.ttf";
	const cjkFontPath = "/fonts/cjk.ttf";
	const sha256 = "a".repeat(64);
	const artifacts = [
		{
			bytes: 10,
			fileName: "calibration-ordinal-n045.png",
			sha256: "d".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-ordinal-n046.png",
			sha256: "e".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-a-n045.png",
			sha256: "b".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-a-n046.png",
			sha256: "b".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-a-n000.png",
			sha256: "b".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-a-n083.png",
			sha256: "b".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-a-n089.png",
			sha256: "b".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-b-n135.png",
			sha256: "c".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-b-n090.png",
			sha256: "c".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-b-n097.png",
			sha256: "c".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-b-n179.png",
			sha256: "c".repeat(64),
		},
		{
			bytes: 10,
			fileName: "calibration-roi-b-n136.png",
			sha256: "c".repeat(64),
		},
		{ bytes: 10, fileName: "cjk-font-proof.png", sha256 },
		{ bytes: 10, fileName: "source-audio.wav", sha256 },
		{ bytes: 10, fileName: "source-frame-a.png", sha256 },
		{ bytes: 10, fileName: "source-frame-b.png", sha256 },
		{ bytes: 10, fileName: "source-video.mp4", sha256 },
	];
	return {
		artifacts,
		audioToneEvidence: {
			clipA: {
				durationSeconds: 3,
				expectedFrequencyHz: 440,
				measuredFrequencyHz: 440,
				method: "ffmpeg-astats-zero-crossings",
				startSeconds: 0,
				toleranceHz: 1,
				zeroCrossings: 2640,
			},
			clipB: {
				durationSeconds: 3,
				expectedFrequencyHz: 660,
				measuredFrequencyHz: 660,
				method: "ffmpeg-astats-zero-crossings",
				startSeconds: 3,
				toleranceHz: 1,
				zeroCrossings: 3960,
			},
		},
		createdAt: "2026-08-01T00:00:00.000Z",
		ffmpeg: {
			banner: "ffmpeg version 8.1.2",
			path: "/tools/ffmpeg",
			version: "8.1.2",
		},
		ffprobe: {
			banner: "ffprobe version 8.1.2",
			path: "/tools/ffprobe",
			sourceAudio: sourceAudioProbe(),
			sourceVideo: sourceVideoProbe(),
			version: "8.1.2",
		},
		fontFiles: {
			ascii: { bytes: 100, path: asciiFontPath, sha256 },
			cjk: { bytes: 200, path: cjkFontPath, sha256 },
		},
		fontReports: {
			ascii: fontReport({
				fontPath: asciiFontPath,
				text: "SOURCE VIDEO CLIP A CLIP B",
			}),
			cjk: fontReport({ fontPath: cjkFontPath, text: "剪映真实导入测试" }),
		},
		runId: "test-run",
		schemaVersion: 2,
		sourceFrameCalibration: buildSourceFrameCalibrationReport({ artifacts }),
		spec: CAPCUT_E2E_FIXTURE_SPEC,
		targetKey: "darwin-arm64",
	};
}

describe("CapCut E2E fixture manifest", () => {
	it("accepts split media profiles and records all required evidence", () => {
		const value = manifest();
		expect(() => validateManifest({ manifest: value })).not.toThrow();
		expect(value.fontReports.cjk.text).toBe("剪映真实导入测试");
		expect(value.fontFiles.cjk).toMatchObject({
			bytes: 200,
			path: "/fonts/cjk.ttf",
		});
		expect(value.ffmpeg.version).toBe("8.1.2");
		expect(value.ffprobe.sourceVideo).toEqual(sourceVideoProbe());
		expect(value.ffprobe.sourceAudio).toEqual(sourceAudioProbe());
		expect(value.sourceFrameCalibration.sourceFrameAIndex).toBe(45);
		expect(value.sourceFrameCalibration.sourceFrameBIndex).toBe(135);
		expect(value.artifacts.every(({ sha256 }) => sha256.length === 64)).toBe(
			true
		);
	});

	it("rejects changed frame calibration and frame count", () => {
		const changedCalibration = structuredClone(manifest()) as CapCutE2eManifest;
		const mutableCalibration =
			changedCalibration.sourceFrameCalibration as unknown as {
				sourceFrameAIndex: number;
			};
		mutableCalibration.sourceFrameAIndex = 44;
		expect(() => validateManifest({ manifest: changedCalibration })).toThrow(
			"source-frame calibration"
		);

		const changedFrameCount = manifest();
		const probe = changedFrameCount.ffprobe.sourceVideo as {
			streams: Array<Record<string, unknown>>;
		};
		probe.streams[0].nb_frames = "179";
		expect(() => validateManifest({ manifest: changedFrameCount })).toThrow(
			"H.264 High yuv420p geometry profile"
		);
	});

	it("rejects an audio track in the video fixture", () => {
		const probe = sourceVideoProbe() as {
			streams: Array<Record<string, unknown>>;
		};
		probe.streams.push({
			channels: 1,
			codec_name: "aac",
			codec_type: "audio",
			sample_rate: "48000",
		});
		expect(() =>
			validateSourceVideoProbe({ probe, spec: CAPCUT_E2E_FIXTURE_SPEC })
		).toThrow("no audio stream");
	});

	it("rejects audio without the required mono 48 kHz PCM profile", () => {
		const probe = sourceAudioProbe() as {
			streams: Array<Record<string, unknown>>;
		};
		probe.streams[0].sample_rate = "44100";
		expect(() =>
			validateSourceAudioProbe({ probe, spec: CAPCUT_E2E_FIXTURE_SPEC })
		).toThrow("mono 48 kHz PCM s16le");
	});

	it("rejects missing artifact, font hash, or glyph evidence", () => {
		const invalidHash = manifest();
		const sourceVideo = invalidHash.artifacts.find(
			({ fileName }) => fileName === "source-video.mp4"
		);
		if (!sourceVideo) throw new Error("Missing source-video test artifact.");
		sourceVideo.sha256 = "bad";
		expect(() => validateManifest({ manifest: invalidHash })).toThrow(
			"integrity evidence is invalid"
		);

		const invalidFontHash = manifest();
		invalidFontHash.fontFiles.cjk.sha256 = "bad";
		expect(() => validateManifest({ manifest: invalidFontHash })).toThrow(
			"CJK font integrity evidence is invalid"
		);

		const invalidTone = manifest();
		invalidTone.audioToneEvidence.clipB.measuredFrequencyHz = 440;
		expect(() => validateManifest({ manifest: invalidTone })).toThrow(
			"expected 660 ± 1 Hz"
		);

		const missingGlyph = manifest();
		missingGlyph.fontReports.cjk.missing.push({
			character: "试",
			codePoint: 0x8bd5,
			index: 7,
			unicode: "U+8BD5",
		});
		expect(() => validateManifest({ manifest: missingGlyph })).toThrow(
			"must not contain missing glyphs"
		);
	});

	it("rejects changing comparison pixels or a static ordinal strip", () => {
		const changingRoi = manifest().artifacts;
		const adjacentRoi = changingRoi.find(
			({ fileName }) => fileName === "calibration-roi-a-n046.png"
		);
		if (!adjacentRoi) throw new Error("Missing adjacent ROI test artifact.");
		adjacentRoi.sha256 = "f".repeat(64);
		expect(() =>
			buildSourceFrameCalibrationReport({ artifacts: changingRoi })
		).toThrow("Clip A comparison ROI is not invariant");

		const staticOrdinal = manifest().artifacts;
		const ordinalReference = staticOrdinal.find(
			({ fileName }) => fileName === "calibration-ordinal-n045.png"
		);
		const ordinalAdjacent = staticOrdinal.find(
			({ fileName }) => fileName === "calibration-ordinal-n046.png"
		);
		if (!(ordinalReference && ordinalAdjacent)) {
			throw new Error("Missing ordinal test artifacts.");
		}
		ordinalAdjacent.sha256 = ordinalReference.sha256;
		expect(() =>
			buildSourceFrameCalibrationReport({ artifacts: staticOrdinal })
		).toThrow("Ordinal strip must change");
	});

	it("rejects a manifest that changes the locked spec or traverses artifact paths", () => {
		const unsafeManifest = structuredClone(manifest()) as CapCutE2eManifest;
		const mutableSpec = unsafeManifest.spec as unknown as {
			fileNames: { sourceVideo: string };
		};
		mutableSpec.fileNames.sourceVideo = "../source-video.mp4";
		expect(() => validateManifest({ manifest: unsafeManifest })).toThrow(
			"locked CapCut E2E fixture spec"
		);
	});
});
