import { describe, expect, it } from "vitest";
import {
	validateTranslateVideoUrl,
	validateTranslateLanguage,
	validateTranslateSpeakerNum,
	validateTranslateInputs,
	HEYGEN_TRANSLATE_LANGUAGES,
} from "../../validation/validators/translate-validators";

// ============================================
// Video URL Validation
// ============================================

describe("validateTranslateVideoUrl", () => {
	it("accepts valid HTTP URLs", () => {
		expect(() =>
			validateTranslateVideoUrl("https://example.com/video.mp4")
		).not.toThrow();
		expect(() =>
			validateTranslateVideoUrl("http://example.com/video.mp4")
		).not.toThrow();
	});

	it("rejects empty URLs", () => {
		expect(() => validateTranslateVideoUrl("")).toThrow(
			"Video URL is required"
		);
		expect(() => validateTranslateVideoUrl("   ")).toThrow(
			"Video URL is required"
		);
	});

	it("rejects non-HTTP URLs", () => {
		expect(() => validateTranslateVideoUrl("blob:http://localhost")).toThrow(
			"valid HTTP or HTTPS URL"
		);
		expect(() =>
			validateTranslateVideoUrl("data:video/mp4;base64,abc")
		).toThrow("valid HTTP or HTTPS URL");
		expect(() => validateTranslateVideoUrl("/local/path/video.mp4")).toThrow(
			"valid HTTP or HTTPS URL"
		);
	});
});

// ============================================
// Language Validation
// ============================================

describe("validateTranslateLanguage", () => {
	it("accepts all supported languages", () => {
		for (const lang of HEYGEN_TRANSLATE_LANGUAGES) {
			expect(() => validateTranslateLanguage(lang)).not.toThrow();
		}
	});

	it("rejects empty language", () => {
		expect(() => validateTranslateLanguage("")).toThrow(
			"Target language is required"
		);
		expect(() => validateTranslateLanguage("   ")).toThrow(
			"Target language is required"
		);
	});

	it("rejects unsupported languages", () => {
		expect(() => validateTranslateLanguage("Klingon")).toThrow(
			'Unsupported language: "Klingon"'
		);
		expect(() => validateTranslateLanguage("Elvish")).toThrow(
			"Unsupported language"
		);
	});
});

// ============================================
// Speaker Number Validation
// ============================================

describe("validateTranslateSpeakerNum", () => {
	it("accepts undefined (optional)", () => {
		expect(() => validateTranslateSpeakerNum(undefined)).not.toThrow();
	});

	it("accepts positive integers", () => {
		expect(() => validateTranslateSpeakerNum(1)).not.toThrow();
		expect(() => validateTranslateSpeakerNum(5)).not.toThrow();
	});

	it("rejects zero", () => {
		expect(() => validateTranslateSpeakerNum(0)).toThrow(
			"positive integer"
		);
	});

	it("rejects negative numbers", () => {
		expect(() => validateTranslateSpeakerNum(-1)).toThrow(
			"positive integer"
		);
	});

	it("rejects non-integers", () => {
		expect(() => validateTranslateSpeakerNum(1.5)).toThrow(
			"positive integer"
		);
	});
});

// ============================================
// Composite Validation
// ============================================

describe("validateTranslateInputs", () => {
	it("passes with valid inputs", () => {
		expect(() =>
			validateTranslateInputs({
				video_url: "https://example.com/video.mp4",
				output_language: "Spanish",
			})
		).not.toThrow();
	});

	it("passes with optional speaker_num", () => {
		expect(() =>
			validateTranslateInputs({
				video_url: "https://example.com/video.mp4",
				output_language: "French",
				speaker_num: 2,
			})
		).not.toThrow();
	});

	it("fails on invalid video URL", () => {
		expect(() =>
			validateTranslateInputs({
				video_url: "",
				output_language: "Spanish",
			})
		).toThrow("Video URL is required");
	});

	it("fails on invalid language", () => {
		expect(() =>
			validateTranslateInputs({
				video_url: "https://example.com/video.mp4",
				output_language: "Klingon",
			})
		).toThrow("Unsupported language");
	});

	it("fails on invalid speaker count", () => {
		expect(() =>
			validateTranslateInputs({
				video_url: "https://example.com/video.mp4",
				output_language: "Spanish",
				speaker_num: 0,
			})
		).toThrow("positive integer");
	});
});

// ============================================
// Constants
// ============================================

describe("HEYGEN_TRANSLATE_LANGUAGES", () => {
	it("contains expected languages", () => {
		expect(HEYGEN_TRANSLATE_LANGUAGES).toContain("English");
		expect(HEYGEN_TRANSLATE_LANGUAGES).toContain("Spanish");
		expect(HEYGEN_TRANSLATE_LANGUAGES).toContain("Japanese");
		expect(HEYGEN_TRANSLATE_LANGUAGES).toContain("Russian");
	});

	it("has 30 languages", () => {
		expect(HEYGEN_TRANSLATE_LANGUAGES.length).toBe(30);
	});
});
