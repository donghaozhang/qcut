import { describe, expect, it } from "vitest";
import {
	isLTX23Model,
	isLTX23FastModel,
	isLTX23ProModel,
	validateLTX23Resolution,
	validateLTX23Duration,
	validateLTX23FastExtendedConstraints,
	validateLTX23A2VDuration,
} from "../../validation/validators/ltx23-validators";

// ============================================
// Model Detection
// ============================================

describe("isLTX23Model", () => {
	it("returns true for all LTX 2.3 model IDs", () => {
		expect(isLTX23Model("ltx23_pro_t2v")).toBe(true);
		expect(isLTX23Model("ltx23_fast_t2v")).toBe(true);
		expect(isLTX23Model("ltx23_fast_i2v")).toBe(true);
	});

	it("returns false for non-LTX 2.3 models", () => {
		expect(isLTX23Model("ltxv2_pro_t2v")).toBe(false);
		expect(isLTX23Model("veo31_text_to_video")).toBe(false);
		expect(isLTX23Model("")).toBe(false);
	});
});

describe("isLTX23FastModel", () => {
	it("returns true for fast models only", () => {
		expect(isLTX23FastModel("ltx23_fast_t2v")).toBe(true);
		expect(isLTX23FastModel("ltx23_fast_i2v")).toBe(true);
	});

	it("returns false for pro model", () => {
		expect(isLTX23FastModel("ltx23_pro_t2v")).toBe(false);
	});
});

describe("isLTX23ProModel", () => {
	it("returns true for pro model only", () => {
		expect(isLTX23ProModel("ltx23_pro_t2v")).toBe(true);
	});

	it("returns false for fast models", () => {
		expect(isLTX23ProModel("ltx23_fast_t2v")).toBe(false);
		expect(isLTX23ProModel("ltx23_fast_i2v")).toBe(false);
	});
});

// ============================================
// Resolution Validation
// ============================================

describe("validateLTX23Resolution", () => {
	it("accepts valid resolutions", () => {
		expect(() => validateLTX23Resolution("1080p")).not.toThrow();
		expect(() => validateLTX23Resolution("1440p")).not.toThrow();
		expect(() => validateLTX23Resolution("2160p")).not.toThrow();
	});

	it("rejects invalid resolutions", () => {
		expect(() => validateLTX23Resolution("720p")).toThrow(
			"Resolution must be 1080p, 1440p, or 2160p"
		);
		expect(() => validateLTX23Resolution("4k")).toThrow();
	});
});

// ============================================
// Duration Validation
// ============================================

describe("validateLTX23Duration", () => {
	it("accepts valid Pro durations (6, 8, 10)", () => {
		expect(() => validateLTX23Duration(6, "ltx23_pro_t2v")).not.toThrow();
		expect(() => validateLTX23Duration(8, "ltx23_pro_t2v")).not.toThrow();
		expect(() => validateLTX23Duration(10, "ltx23_pro_t2v")).not.toThrow();
	});

	it("rejects invalid Pro durations", () => {
		expect(() => validateLTX23Duration(12, "ltx23_pro_t2v")).toThrow(
			"Duration must be 6, 8, or 10 seconds for LTX Video 2.3 Pro"
		);
		expect(() => validateLTX23Duration(20, "ltx23_pro_t2v")).toThrow();
	});

	it("accepts valid Fast durations (6-20 even)", () => {
		for (const d of [6, 8, 10, 12, 14, 16, 18, 20]) {
			expect(() => validateLTX23Duration(d, "ltx23_fast_t2v")).not.toThrow();
		}
	});

	it("rejects invalid Fast durations", () => {
		expect(() => validateLTX23Duration(5, "ltx23_fast_t2v")).toThrow(
			"LTX Video 2.3 Fast"
		);
		expect(() => validateLTX23Duration(22, "ltx23_fast_t2v")).toThrow();
	});
});

// ============================================
// Extended Duration Constraints
// ============================================

describe("validateLTX23FastExtendedConstraints", () => {
	it("allows any resolution/fps for durations <= 10s", () => {
		expect(() =>
			validateLTX23FastExtendedConstraints(10, "2160p", 50)
		).not.toThrow();
		expect(() =>
			validateLTX23FastExtendedConstraints(6, "1440p", 48)
		).not.toThrow();
	});

	it("allows 1080p + 25fps for durations > 10s", () => {
		expect(() =>
			validateLTX23FastExtendedConstraints(12, "1080p", 25)
		).not.toThrow();
		expect(() =>
			validateLTX23FastExtendedConstraints(20, "1080p", 25)
		).not.toThrow();
	});

	it("rejects high resolution for durations > 10s", () => {
		expect(() => validateLTX23FastExtendedConstraints(12, "2160p", 25)).toThrow(
			"Videos longer than 10 seconds require 1080p resolution"
		);
	});

	it("rejects high fps for durations > 10s", () => {
		expect(() => validateLTX23FastExtendedConstraints(14, "1080p", 50)).toThrow(
			"Videos longer than 10 seconds require 1080p resolution"
		);
	});
});

// ============================================
// Audio-to-Video Duration Validation
// ============================================

describe("validateLTX23A2VDuration", () => {
	it("accepts valid A2V durations (6, 8, 10)", () => {
		expect(() => validateLTX23A2VDuration(6)).not.toThrow();
		expect(() => validateLTX23A2VDuration(8)).not.toThrow();
		expect(() => validateLTX23A2VDuration(10)).not.toThrow();
	});

	it("rejects invalid A2V durations", () => {
		expect(() => validateLTX23A2VDuration(12)).toThrow(
			"Duration must be 6, 8, or 10 seconds for LTX Video 2.3 audio-to-video"
		);
		expect(() => validateLTX23A2VDuration(4)).toThrow();
	});
});
