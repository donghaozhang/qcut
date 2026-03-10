import { describe, it, expect } from "vitest";
import {
	canElementGoOnTrack,
	validateElementTrackCompatibility,
} from "../timeline/validation.js";

describe("canElementGoOnTrack", () => {
	it("text goes on text tracks only", () => {
		expect(canElementGoOnTrack("text", "text")).toBe(true);
		expect(canElementGoOnTrack("text", "media")).toBe(false);
		expect(canElementGoOnTrack("text", "audio")).toBe(false);
	});

	it("media goes on media and audio tracks", () => {
		expect(canElementGoOnTrack("media", "media")).toBe(true);
		expect(canElementGoOnTrack("media", "audio")).toBe(true);
		expect(canElementGoOnTrack("media", "text")).toBe(false);
	});

	it("sticker goes on sticker tracks only", () => {
		expect(canElementGoOnTrack("sticker", "sticker")).toBe(true);
		expect(canElementGoOnTrack("sticker", "media")).toBe(false);
	});

	it("captions goes on captions tracks only", () => {
		expect(canElementGoOnTrack("captions", "captions")).toBe(true);
		expect(canElementGoOnTrack("captions", "text")).toBe(false);
	});

	it("remotion goes on remotion tracks only", () => {
		expect(canElementGoOnTrack("remotion", "remotion")).toBe(true);
		expect(canElementGoOnTrack("remotion", "media")).toBe(false);
	});

	it("markdown goes on markdown tracks only", () => {
		expect(canElementGoOnTrack("markdown", "markdown")).toBe(true);
		expect(canElementGoOnTrack("markdown", "text")).toBe(false);
	});
});

describe("validateElementTrackCompatibility", () => {
	it("returns valid for compatible pairs", () => {
		const result = validateElementTrackCompatibility(
			{ type: "media" },
			{ type: "media" }
		);
		expect(result.isValid).toBe(true);
		expect(result.errorMessage).toBeUndefined();
	});

	it("returns error message for incompatible pairs", () => {
		const result = validateElementTrackCompatibility(
			{ type: "text" },
			{ type: "media" }
		);
		expect(result.isValid).toBe(false);
		expect(result.errorMessage).toContain("text tracks");
	});
});
