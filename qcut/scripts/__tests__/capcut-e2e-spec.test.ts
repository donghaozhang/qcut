import { describe, expect, it } from "vitest";
import {
	assertAsciiOnly,
	CAPCUT_E2E_FIXTURE_SPEC,
	getAsciiFixtureText,
	validateFixtureSpec,
} from "../capcut-e2e/spec.js";

describe("CapCut E2E fixture spec", () => {
	it("locks two distinct three-second patterns and their audio tones", () => {
		expect(() => validateFixtureSpec()).not.toThrow();
		expect(CAPCUT_E2E_FIXTURE_SPEC.schemaVersion).toBe(2);
		expect(CAPCUT_E2E_FIXTURE_SPEC.clipDurationSeconds).toBe(3);
		expect(CAPCUT_E2E_FIXTURE_SPEC.plateMode).toBe("frozen-first-frame");
		expect(CAPCUT_E2E_FIXTURE_SPEC.patterns).toEqual({
			clipA: "testsrc2",
			clipB: "smptebars",
		});
		expect(CAPCUT_E2E_FIXTURE_SPEC.audio).toMatchObject({
			channels: 1,
			clipAFrequencyHz: 440,
			clipBFrequencyHz: 660,
			sampleRateHz: 48_000,
		});
		expect(CAPCUT_E2E_FIXTURE_SPEC.fileNames.sourceAudio).toBe(
			"source-audio.wav"
		);
	});

	it("locks source ordinals and excludes their strip from pixel comparison", () => {
		expect(CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration).toEqual({
			comparisonRoi: { height: 624, width: 1280, x: 0, y: 96 },
			invarianceSamples: {
				clipAFrameIndices: [0, 45, 46, 83, 89],
				clipBFrameIndices: [90, 97, 135, 136, 179],
				method: "ffmpeg-crop-png-sha256",
				ordinalFrameIndices: [45, 46],
			},
			method: "ffmpeg-select-zero-based-frame-index",
			ordinalStrip: { height: 96, width: 1280, x: 0, y: 0 },
			sourceFrameAIndex: 45,
			sourceFrameATimestampMicroseconds: 1_500_000,
			sourceFrameBIndex: 135,
			sourceFrameBTimestampMicroseconds: 4_500_000,
		});
		expect(CAPCUT_E2E_FIXTURE_SPEC.fileNames).toMatchObject({
			calibrationOrdinalAdjacent: "calibration-ordinal-n046.png",
			calibrationOrdinalReference: "calibration-ordinal-n045.png",
			calibrationRoiAAdjacent: "calibration-roi-a-n046.png",
			calibrationRoiAEnd: "calibration-roi-a-n089.png",
			calibrationRoiAReference: "calibration-roi-a-n045.png",
			calibrationRoiASeam: "calibration-roi-a-n083.png",
			calibrationRoiAStart: "calibration-roi-a-n000.png",
			calibrationRoiBAdjacent: "calibration-roi-b-n136.png",
			calibrationRoiBEnd: "calibration-roi-b-n179.png",
			calibrationRoiBReference: "calibration-roi-b-n135.png",
			calibrationRoiBSeam: "calibration-roi-b-n097.png",
			calibrationRoiBStart: "calibration-roi-b-n090.png",
		});
	});

	it("keeps every source-video label printable ASCII", () => {
		const sourceText = getAsciiFixtureText();
		expect(sourceText).toContain("SOURCE VIDEO");
		expect(sourceText).toContain("CLIP A");
		expect(sourceText).toContain("CLIP B");
		expect(sourceText).toContain("GLOBAL FRAME");
		expect(sourceText).toContain("SOURCE PIXELS ARE ASCII ONLY");
		expect(() =>
			assertAsciiOnly({ label: "source", value: sourceText })
		).not.toThrow();
		expect(() =>
			assertAsciiOnly({ label: "source", value: "SOURCE 剪映" })
		).toThrow("printable ASCII only");
	});

	it("isolates the exact Chinese regression phrase in the proof image", () => {
		expect(CAPCUT_E2E_FIXTURE_SPEC.cjkProofText).toBe("剪映真实导入测试");
		expect(getAsciiFixtureText()).not.toContain("剪映");
	});
});
