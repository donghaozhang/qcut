import { describe, expect, it } from "vitest";
import type { FontGlyphCoverageReport } from "../capcut-e2e/font-coverage-contract.js";
import {
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
				pix_fmt: "yuv420p",
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
	return {
		artifacts: [
			{ bytes: 10, fileName: "cjk-font-proof.png", sha256 },
			{ bytes: 10, fileName: "source-audio.wav", sha256 },
			{ bytes: 10, fileName: "source-frame-a.png", sha256 },
			{ bytes: 10, fileName: "source-frame-b.png", sha256 },
			{ bytes: 10, fileName: "source-video.mp4", sha256 },
		],
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
		schemaVersion: 1,
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
		expect(value.artifacts.every(({ sha256 }) => sha256.length === 64)).toBe(
			true
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
		invalidHash.artifacts[0].sha256 = "bad";
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
