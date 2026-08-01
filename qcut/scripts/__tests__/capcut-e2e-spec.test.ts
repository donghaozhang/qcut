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
		expect(CAPCUT_E2E_FIXTURE_SPEC.clipDurationSeconds).toBe(3);
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

	it("keeps every source-video label printable ASCII", () => {
		const sourceText = getAsciiFixtureText();
		expect(sourceText).toContain("SOURCE VIDEO");
		expect(sourceText).toContain("CLIP A");
		expect(sourceText).toContain("CLIP B");
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
