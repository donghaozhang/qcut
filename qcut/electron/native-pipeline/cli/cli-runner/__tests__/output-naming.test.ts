/**
 * Tests for output filename + sidecar-JSON helpers in handler-generate.
 *
 * Covers `slugifyPrompt` (prompt → safe filename fragment) and
 * `buildOutputBasename` (model + slug + timestamp → basename).
 *
 * Sidecar JSON contents are exercised by the live-run tests; this file
 * pins the naming contract so future filename refactors don't silently
 * break replay/reproducibility tooling.
 */

import { describe, expect, it } from "vitest";
import {
	buildOutputBasename,
	slugifyPrompt,
} from "../handler-generate.js";

describe("slugifyPrompt", () => {
	it("lowercases and replaces whitespace with dashes", () => {
		expect(slugifyPrompt("A Calm Ocean Wave")).toBe("a-calm-ocean-wave");
	});

	it("strips punctuation and special characters", () => {
		expect(slugifyPrompt("Hello, world! @Image1: red coat?")).toBe(
			"hello-world-image1-red-coat"
		);
	});

	it("collapses repeated dashes and trims edges", () => {
		expect(slugifyPrompt("---a   b---")).toBe("a-b");
	});

	it("returns 'untitled' for empty input", () => {
		expect(slugifyPrompt("")).toBe("untitled");
		expect(slugifyPrompt("   ")).toBe("untitled");
		expect(slugifyPrompt("!!!")).toBe("untitled");
	});

	it("truncates on a word boundary near the cap", () => {
		const long =
			"a very long descriptive prompt about an ocean wave at sunset with seagulls and golden light";
		const out = slugifyPrompt(long, 40);
		expect(out.length).toBeLessThanOrEqual(40);
		expect(out.endsWith("-")).toBe(false);
		// Truncation should land on a word boundary (no half-words).
		expect(long.replace(/\s+/g, "-")).toContain(out);
	});

	it("hard-truncates when no word boundary near the cap exists", () => {
		const out = slugifyPrompt("abcdefghijklmnopqrstuvwxyz", 10);
		expect(out).toBe("abcdefghij");
	});
});

describe("buildOutputBasename", () => {
	it("composes <model>_<slug>_<timestamp>", () => {
		const out = buildOutputBasename(
			"happy_horse_t2v",
			"a calm ocean wave at sunset",
			1777581645705,
			-1
		);
		expect(out).toBe(
			"happy_horse_t2v_a-calm-ocean-wave-at-sunset_1777581645705"
		);
	});

	it("appends a job index when provided", () => {
		const out = buildOutputBasename(
			"happy_horse_t2v",
			"prompt",
			1700000000000,
			3
		);
		expect(out).toBe("happy_horse_t2v_prompt_1700000000000_3");
	});

	it("omits the slug when the prompt is unusable", () => {
		expect(buildOutputBasename("happy_horse_t2v", "", 100, -1)).toBe(
			"happy_horse_t2v_100"
		);
		expect(buildOutputBasename("happy_horse_t2v", "!!!", 100, -1)).toBe(
			"happy_horse_t2v_100"
		);
	});

	it("falls back to output_<timestamp> with no model", () => {
		expect(buildOutputBasename(undefined, "prompt", 100, -1)).toBe(
			"output_100"
		);
	});

	it("never produces shell-unsafe characters", () => {
		const out = buildOutputBasename(
			"happy_horse_video_edit",
			"make @Image1 wear a red coat / blue hat?",
			1777581645705,
			-1
		);
		expect(out).toMatch(/^[a-z0-9_-]+$/);
	});
});
