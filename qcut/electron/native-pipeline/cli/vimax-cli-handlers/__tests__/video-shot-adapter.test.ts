import { describe, expect, it } from "vitest";

import {
	adaptShotForSeedance,
	clampDuration,
	resolveSeedanceFamily,
	sanitizeShotPrompt,
} from "../video-shot-adapter.js";

describe("clampDuration", () => {
	it("clamps short durations up to 4", () => {
		expect(clampDuration(1)).toBe(4);
		expect(clampDuration(3.9)).toBe(4);
	});

	it("clamps long durations down to 15", () => {
		expect(clampDuration(20)).toBe(15);
		expect(clampDuration(99)).toBe(15);
	});

	it("rounds to integer", () => {
		expect(clampDuration(5.6)).toBe(6);
		expect(clampDuration(5.4)).toBe(5);
	});

	it("defaults to 5 when undefined", () => {
		expect(clampDuration(undefined)).toBe(5);
	});
});

describe("sanitizeShotPrompt", () => {
	it("strips leading △ markers but keeps the text after", () => {
		expect(sanitizeShotPrompt("△ A luxurious banquet hall")).toBe(
			"A luxurious banquet hall"
		);
	});

	it("strips speaker tags of the form Name:", () => {
		expect(sanitizeShotPrompt("司仪: hello world")).toBe("hello world");
		expect(sanitizeShotPrompt("Alice: good morning")).toBe("good morning");
	});

	it("strips speaker tags with parentheticals", () => {
		expect(sanitizeShotPrompt("沈念安（含情脉脉）：承泽，我好像在做梦")).toBe(
			"承泽，我好像在做梦"
		);
	});

	it("keeps dialogue content but drops the speaker", () => {
		const input = "△ inside the hall\n司仪：welcome everyone";
		expect(sanitizeShotPrompt(input)).toBe("inside the hall welcome everyone");
	});

	it("collapses duplicate whitespace", () => {
		expect(sanitizeShotPrompt("a    b   c")).toBe("a b c");
	});

	it("truncates at 500 chars on a word boundary", () => {
		const long = "word ".repeat(200); // 1000 chars of 'word '
		const out = sanitizeShotPrompt(long);
		expect(out.length).toBeLessThanOrEqual(500);
		expect(out.endsWith("word")).toBe(true);
	});

	it("returns empty string for blank input", () => {
		expect(sanitizeShotPrompt("")).toBe("");
		expect(sanitizeShotPrompt("   \n  ")).toBe("");
	});
});

describe("adaptShotForSeedance", () => {
	it("picks t2v when no characters and no first frame", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-1",
				description: "A generic wide shot",
				characters: [],
				durationSeconds: 5,
			},
			{}
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_t2v");
		expect(adapted.referenceUrls).toEqual([]);
		expect(adapted.payload.reference_images).toBeUndefined();
		expect(adapted.payload.first_frame).toBeUndefined();
		expect(adapted.reason).toContain("t2v");
	});

	it("picks ref2v when at least one character has a portrait", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-2",
				description: "两人对视",
				characters: ["沈念安", "顾承泽"],
				durationSeconds: 7,
			},
			{
				沈念安: "https://cdn.example/p1.png",
				顾承泽: "https://cdn.example/p2.png",
			}
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_ref2v");
		expect(adapted.referenceUrls).toEqual([
			"https://cdn.example/p1.png",
			"https://cdn.example/p2.png",
		]);
		expect(adapted.payload.reference_images).toEqual(adapted.referenceUrls);
		expect(adapted.skippedCharacters).toEqual([]);
		expect(adapted.reason).toContain("ref2v");
	});

	it("picks i2v when firstFrameUrl is set, ignoring characters", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-3",
				description: "opening on frame",
				characters: ["沈念安"],
				firstFrameUrl: "https://cdn.example/frame.png",
			},
			{ 沈念安: "https://cdn.example/p1.png" }
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_i2v");
		expect(adapted.payload.first_frame).toBe("https://cdn.example/frame.png");
		expect(adapted.payload.reference_images).toBeUndefined();
		expect(adapted.referenceUrls).toEqual([]);
		expect(adapted.reason).toContain("i2v");
	});

	it("logs uncatalogued names in skippedCharacters for mixed shots", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-4",
				description: "party scene",
				characters: ["沈念安", "宾客甲", "服务员"],
			},
			{ 沈念安: "https://cdn.example/p1.png" }
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_ref2v");
		expect(adapted.referenceUrls).toEqual(["https://cdn.example/p1.png"]);
		expect(adapted.skippedCharacters).toEqual(["宾客甲", "服务员"]);
	});

	it("t2v reason calls out degradation when names are uncatalogued", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-5",
				description: "crowd",
				characters: ["宾客甲", "宾客乙"],
			},
			{}
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_t2v");
		expect(adapted.reason).toContain("not catalogued");
	});

	it("limits reference_images to 4 when more characters have portraits", () => {
		const portraits: Record<string, string> = {};
		const characters: string[] = [];
		for (let i = 0; i < 6; i++) {
			const name = `c${i}`;
			portraits[name] = `https://cdn.example/${i}.png`;
			characters.push(name);
		}
		const adapted = adaptShotForSeedance(
			{ shotId: "x", description: "large ensemble", characters },
			portraits
		);
		expect(adapted.referenceUrls).toHaveLength(4);
		expect((adapted.payload.reference_images as string[]).length).toBe(4);
	});

	it("deduplicates portrait URLs when a character appears twice", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "dup",
				description: "solo",
				characters: ["沈念安", "沈念安"],
			},
			{ 沈念安: "https://cdn.example/p1.png" }
		);
		expect(adapted.referenceUrls).toEqual(["https://cdn.example/p1.png"]);
	});

	it("forwards resolution and aspectRatio only when provided", () => {
		const withOverrides = adaptShotForSeedance(
			{
				shotId: "a",
				description: "x",
				characters: [],
				resolution: "1080p",
				aspectRatio: "9:16",
			},
			{}
		);
		expect(withOverrides.payload.resolution).toBe("1080p");
		expect(withOverrides.payload.ratio).toBe("9:16");

		const withoutOverrides = adaptShotForSeedance(
			{ shotId: "b", description: "x", characters: [] },
			{}
		);
		expect(withoutOverrides.payload.resolution).toBeUndefined();
		expect(withoutOverrides.payload.ratio).toBeUndefined();
	});

	it("forwards generateAudio and seed only when provided", () => {
		const on = adaptShotForSeedance(
			{
				shotId: "a",
				description: "x",
				characters: [],
				generateAudio: true,
				seed: 42,
			},
			{}
		);
		expect(on.payload.generate_audio).toBe(true);
		expect(on.payload.seed).toBe(42);

		const off = adaptShotForSeedance(
			{ shotId: "b", description: "x", characters: [] },
			{}
		);
		expect(off.payload.generate_audio).toBeUndefined();
		expect(off.payload.seed).toBeUndefined();
	});

	it("clamps duration in the final payload", () => {
		const adapted = adaptShotForSeedance(
			{ shotId: "a", description: "x", characters: [], durationSeconds: 2 },
			{}
		);
		expect(adapted.payload.duration).toBe(4);
	});

	it("sanitizes the prompt before embedding in the payload", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "a",
				description: "△ hall\n司仪：hello",
				characters: [],
			},
			{}
		);
		expect(adapted.payload.prompt).toBe("hall hello");
	});

	it("defaults to GMI family when none specified", () => {
		const adapted = adaptShotForSeedance(
			{ shotId: "a", description: "x", characters: [] },
			{}
		);
		expect(adapted.provider).toBe("gmi");
		expect(adapted.endpoint).toBe("seedance-2-0-260128");
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_t2v");
	});
});

describe("adaptShotForSeedance — FAL family", () => {
	it("ref2v uses FAL endpoint, image_urls field, and string duration", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-2",
				description: "two characters meet",
				characters: ["Alice", "Bob"],
				durationSeconds: 6,
				resolution: "720p",
				aspectRatio: "16:9",
			},
			{
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
			},
			"fal"
		);
		expect(adapted.variant).toBe("seedance_2_0_ref2v");
		expect(adapted.endpoint).toBe("bytedance/seedance-2.0/reference-to-video");
		expect(adapted.provider).toBe("fal");
		expect(adapted.payload.image_urls).toEqual([
			"https://cdn/a.png",
			"https://cdn/b.png",
		]);
		// FAL field name is aspect_ratio, not ratio (GMI's name).
		expect(adapted.payload.aspect_ratio).toBe("16:9");
		expect(adapted.payload.ratio).toBeUndefined();
		// FAL schema requires duration as a string literal.
		expect(adapted.payload.duration).toBe("6");
		expect(adapted.payload.reference_images).toBeUndefined();
		expect(adapted.payload.first_frame).toBeUndefined();
	});

	it("i2v uses FAL i2v endpoint and image_url field", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-3",
				description: "anchored shot",
				characters: ["Alice"],
				firstFrameUrl: "https://cdn/anchor.png",
			},
			{ Alice: "https://cdn/a.png" },
			"fal"
		);
		expect(adapted.variant).toBe("seedance_2_0_i2v");
		expect(adapted.endpoint).toBe("bytedance/seedance-2.0/image-to-video");
		expect(adapted.provider).toBe("fal");
		expect(adapted.payload.image_url).toBe("https://cdn/anchor.png");
		expect(adapted.payload.image_urls).toBeUndefined();
		expect(adapted.payload.first_frame).toBeUndefined();
	});

	it("t2v uses FAL t2v endpoint with no image fields", () => {
		const adapted = adaptShotForSeedance(
			{ shotId: "x", description: "wide shot", characters: [] },
			{},
			"fal"
		);
		expect(adapted.variant).toBe("seedance_2_0");
		expect(adapted.endpoint).toBe("bytedance/seedance-2.0/text-to-video");
		expect(adapted.provider).toBe("fal");
		expect(adapted.payload.image_url).toBeUndefined();
		expect(adapted.payload.image_urls).toBeUndefined();
		expect(adapted.payload.first_frame).toBeUndefined();
	});

	it("variant naming stays distinct between families", () => {
		const gmi = adaptShotForSeedance(
			{ shotId: "g", description: "x", characters: ["A"] },
			{ A: "https://cdn/a.png" },
			"gmi"
		);
		const fal = adaptShotForSeedance(
			{ shotId: "f", description: "x", characters: ["A"] },
			{ A: "https://cdn/a.png" },
			"fal"
		);
		expect(gmi.variant).toBe("gmi_seedance_2_0_260128_ref2v");
		expect(fal.variant).toBe("seedance_2_0_ref2v");
	});
});

describe("resolveSeedanceFamily", () => {
	it("defaults to gmi when no model passed", () => {
		expect(resolveSeedanceFamily(undefined)).toBe("gmi");
	});

	it("maps the GMI 260128 family", () => {
		expect(resolveSeedanceFamily("gmi_seedance_2_0_260128")).toBe("gmi");
		expect(resolveSeedanceFamily("gmi_seedance_2_0_260128_ref2v")).toBe("gmi");
	});

	it("maps the FAL Seedance 2.0 family", () => {
		expect(resolveSeedanceFamily("seedance_2_0")).toBe("fal");
		expect(resolveSeedanceFamily("seedance_2_0_ref2v")).toBe("fal");
		expect(resolveSeedanceFamily("seedance_2_0_i2v")).toBe("fal");
	});

	it("throws on unknown model keys", () => {
		expect(() => resolveSeedanceFamily("kling_v3_pro")).toThrow(
			/Unknown video model/i
		);
	});
});
