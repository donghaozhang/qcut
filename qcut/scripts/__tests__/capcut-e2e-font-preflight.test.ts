import { describe, expect, it } from "vitest";
import type { FontGlyphCoverageReport } from "../capcut-e2e/font-coverage-contract.js";
import {
	buildCjkProofArgs,
	buildFrameExtractionArgs,
	buildSourceAudioArgs,
	buildSourceVideoArgs,
} from "../capcut-e2e/ffmpeg-args.js";
import {
	generateDrawtextArtifacts,
	resolveFixtureFontPaths,
} from "../capcut-e2e/generate.js";

function report({
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

describe("CapCut E2E font preflight", () => {
	it("finishes both cmap checks before starting either drawtext command", async () => {
		const events: string[] = [];
		await generateDrawtextArtifacts({
			assertCoverage: async ({ fontPath, text }) => {
				events.push(`coverage:${fontPath}`);
				return report({ fontPath, text });
			},
			ffmpegPath: "/tools/ffmpeg",
			fontPaths: { ascii: "/fonts/ascii.ttf", cjk: "/fonts/cjk.ttf" },
			hashFile: async () => "stable-font-hash",
			outputPaths: {
				cjkProof: "/output/cjk-font-proof.png",
				sourceVideo: "/output/source-video.mp4",
			},
			run: async ({ args }) => {
				events.push(`ffmpeg:${args.at(-1)}`);
			},
		});

		expect(events).toEqual([
			"coverage:/fonts/ascii.ttf",
			"coverage:/fonts/cjk.ttf",
			"ffmpeg:/output/source-video.mp4",
			"ffmpeg:/output/cjk-font-proof.png",
		]);
	});

	it("fails closed when a covered font mutates during drawtext", async () => {
		let asciiHashCalls = 0;
		let drawtextRuns = 0;
		await expect(
			generateDrawtextArtifacts({
				assertCoverage: async ({ fontPath, text }) =>
					report({ fontPath, text }),
				ffmpegPath: "/tools/ffmpeg",
				fontPaths: { ascii: "/fonts/ascii.ttf", cjk: "/fonts/cjk.ttf" },
				hashFile: async ({ filePath }) => {
					if (filePath === "/fonts/ascii.ttf") {
						asciiHashCalls += 1;
						return asciiHashCalls >= 3 ? "mutated" : "stable-ascii";
					}
					return "stable-cjk";
				},
				outputPaths: {
					cjkProof: "/output/cjk-font-proof.png",
					sourceVideo: "/output/source-video.mp4",
				},
				run: async () => {
					drawtextRuns += 1;
				},
			})
		).rejects.toThrow("ASCII font changed while drawtext was rendering");
		expect(drawtextRuns).toBe(1);
	});

	it("uses separate explicit fonts for ASCII source pixels and CJK proof", () => {
		const source = buildSourceVideoArgs({
			asciiFontPath: "/fonts/ascii.ttf",
			outputPath: "/output/source-video.mp4",
		}).join(" ");
		const proof = buildCjkProofArgs({
			cjkFontPath: "/fonts/cjk.ttf",
			outputPath: "/output/cjk-font-proof.png",
		}).join(" ");

		expect(source).toContain("/fonts/ascii.ttf");
		expect(source).toContain("drawtext=fontfile=");
		expect(source).not.toContain("drawtext:fontfile=");
		expect(source).not.toContain("/fonts/cjk.ttf");
		expect(source).not.toContain("剪映");
		expect(source).toContain("testsrc2=size=");
		expect(source).toContain("smptebars=size=");
		expect(source).toContain("trim=end_frame=1");
		expect(source).toContain("loop=loop=89:size=1:start=0");
		expect(source).toContain("GLOBAL FRAME %{eif\\:n+0\\:d\\:3}");
		expect(source).toContain("GLOBAL FRAME %{eif\\:n+90\\:d\\:3}");
		expect(source).toContain("drawbox=x=0:y=0:w=iw:h=96");
		expect(source).toContain("-crf 0");
		expect(source).toContain("-an");
		expect(proof).toContain("/fonts/cjk.ttf");
		expect(proof).toContain("剪映真实导入测试");
	});

	it("builds a separate mono PCM WAV with locked A/B tones", () => {
		const audio = buildSourceAudioArgs({
			outputPath: "/output/source-audio.wav",
		}).join(" ");

		expect(audio).toContain("sine=frequency=440");
		expect(audio).toContain("sine=frequency=660");
		expect(audio).toContain("pcm_s16le");
		expect(audio).toContain("sample_rates=48000");
		expect(audio).toContain("channel_layouts=mono");
		expect(audio).toContain("/output/source-audio.wav");
	});

	it("extracts calibration pixels with a locked crop after frame selection", () => {
		const args = buildFrameExtractionArgs({
			cropRegion: { height: 624, width: 1280, x: 0, y: 96 },
			frameIndex: 45,
			inputPath: "/run/source-video.mp4",
			outputPath: "/run/calibration-roi-a-n045.png",
		});
		expect(args).toContain("select=eq(n\\,45),crop=1280:624:0:96");
	});

	it("uses CapCut zh-hans.ttf by default on macOS and accepts an absolute override", () => {
		expect(
			resolveFixtureFontPaths({ environment: {}, platform: "darwin" }).cjk
		).toBe(
			"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/zh-hans.ttf"
		);
		expect(
			resolveFixtureFontPaths({
				environment: { QCUT_CAPCUT_E2E_CJK_FONT: "/fonts/noto-cjk.ttf" },
				platform: "linux",
			}).cjk
		).toBe("/fonts/noto-cjk.ttf");
		expect(() =>
			resolveFixtureFontPaths({
				environment: { QCUT_CAPCUT_E2E_CJK_FONT: "relative.ttf" },
				platform: "linux",
			})
		).toThrow("absolute path");
	});
});
