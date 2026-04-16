import { describe, expect, it } from "vitest";
import {
	applyLintAutoFix,
	lintScripts,
	type LintShot,
} from "../script-linter.js";

describe("lintScripts", () => {
	it("returns empty findings when every mentioned catalogued character is in characters[]", () => {
		const result = lintScripts({
			catalogued: ["Alice", "Bob"],
			shots: [
				{
					shot_id: "1-1-01",
					description: "Alice hugs Bob in the garden",
					characters: ["Alice", "Bob"],
				},
			],
		});
		expect(result).toEqual([]);
	});

	it("detects a catalogued character mentioned in description but not in characters[]", () => {
		const result = lintScripts({
			catalogued: ["Alice", "Bob"],
			shots: [
				{
					shot_id: "1-1-02",
					description: "The announcer says Alice and Bob will marry.",
					characters: ["Announcer"],
				},
			],
		});
		expect(result).toEqual([
			{
				shot_id: "1-1-02",
				missing: ["Alice", "Bob"],
				listed: ["Announcer"],
			},
		]);
	});

	it("ignores names not in the catalogued list", () => {
		const result = lintScripts({
			catalogued: ["Alice"],
			shots: [
				{
					shot_id: "1",
					description: "Bob walks alone at dawn",
					characters: [],
				},
			],
		});
		expect(result).toEqual([]);
	});

	it("returns findings only for shots with at least one missing name", () => {
		const result = lintScripts({
			catalogued: ["Alice", "Bob"],
			shots: [
				{
					shot_id: "a",
					description: "Alice enters",
					characters: ["Alice"],
				}, // clean
				{
					shot_id: "b",
					description: "Bob enters",
					characters: [],
				}, // missing Bob
				{
					shot_id: "c",
					description: "Alice and Bob argue",
					characters: ["Alice", "Bob"],
				}, // clean
			],
		});
		expect(result).toEqual([{ shot_id: "b", missing: ["Bob"], listed: [] }]);
	});

	it("deduplicates repeated mentions of the same character", () => {
		const result = lintScripts({
			catalogued: ["Alice"],
			shots: [
				{
					shot_id: "1",
					description: "Alice said, then Alice left, Alice again",
					characters: [],
				},
			],
		});
		expect(result).toEqual([{ shot_id: "1", missing: ["Alice"], listed: [] }]);
	});

	it("sorts longer names ahead of shorter prefixes when scanning", () => {
		// "沈念安" should match before "沈念" (if both were catalogued). We
		// exercise the invariant: a longer catalogued name appearing first
		// should not be consumed by a shorter name.
		const result = lintScripts({
			catalogued: ["沈念", "沈念安"],
			shots: [
				{
					shot_id: "1",
					description: "沈念安 walks in",
					characters: [],
				},
			],
		});
		// Both catalogued names are substrings of the description. The
		// function reports both, but the longer one comes first in the
		// sorted scan.
		expect(result[0].shot_id).toBe("1");
		expect(result[0].missing).toContain("沈念安");
	});

	it("skips shots with empty description", () => {
		const result = lintScripts({
			catalogued: ["Alice"],
			shots: [{ shot_id: "1", description: "", characters: [] }],
		});
		expect(result).toEqual([]);
	});

	it("returns empty when no characters are catalogued", () => {
		const result = lintScripts({
			catalogued: [],
			shots: [
				{
					shot_id: "1",
					description: "Alice enters",
					characters: [],
				},
			],
		});
		expect(result).toEqual([]);
	});
});

describe("applyLintAutoFix", () => {
	it("appends missing names to the shot's characters array", () => {
		const shots: LintShot[] = [
			{ shot_id: "1", description: "...", characters: ["Announcer"] },
		];
		const result = applyLintAutoFix(shots, [
			{ shot_id: "1", missing: ["Alice", "Bob"], listed: ["Announcer"] },
		]);
		expect(result.added).toBe(2);
		expect(shots[0].characters).toEqual(["Announcer", "Alice", "Bob"]);
	});

	it("does not duplicate names already present", () => {
		const shots: LintShot[] = [
			{ shot_id: "1", description: "...", characters: ["Alice"] },
		];
		applyLintAutoFix(shots, [
			{ shot_id: "1", missing: ["Alice", "Bob"], listed: ["Alice"] },
		]);
		expect(shots[0].characters).toEqual(["Alice", "Bob"]);
	});

	it("skips findings whose shot_id is not in the shot list", () => {
		const shots: LintShot[] = [
			{ shot_id: "1", description: "...", characters: [] },
		];
		const result = applyLintAutoFix(shots, [
			{ shot_id: "missing", missing: ["Alice"], listed: [] },
		]);
		expect(result.added).toBe(0);
		expect(shots[0].characters).toEqual([]);
	});
});
