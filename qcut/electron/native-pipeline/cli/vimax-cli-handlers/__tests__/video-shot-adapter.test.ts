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

	it("maps the Vidu Q3 ref2v mix family", () => {
		expect(resolveSeedanceFamily("vidu_q3_ref2v_mix")).toBe("vidu");
	});

	it("maps the Kling V3 Omni family", () => {
		expect(resolveSeedanceFamily("gmi_kling_v3_omni")).toBe("kling-omni");
		expect(resolveSeedanceFamily("gmi_kling_v3_omni_element")).toBe(
			"kling-omni"
		);
	});

	it("throws on unknown model keys", () => {
		expect(() => resolveSeedanceFamily("runway_gen_x")).toThrow(
			/Unknown video model/i
		);
	});
});

describe("adaptShotForSeedance — Vidu family", () => {
	it("ref2v uses Vidu endpoint, reference_image_urls field, and integer duration", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-1",
				description: "Anime woman walks into frame",
				characters: ["Alice"],
				durationSeconds: 5,
				resolution: "720p",
				aspectRatio: "16:9",
				generateAudio: true,
			},
			{ Alice: "https://cdn/a.png" },
			"vidu"
		);
		expect(adapted.variant).toBe("vidu_q3_ref2v_mix");
		expect(adapted.endpoint).toBe("fal-ai/vidu/q3/reference-to-video/mix");
		expect(adapted.provider).toBe("fal");
		// Vidu-specific field names — NOT `reference_images` (GMI) or
		// `image_urls` (FAL Seedance).
		expect(adapted.payload.reference_image_urls).toEqual(["https://cdn/a.png"]);
		expect(adapted.payload).not.toHaveProperty("reference_images");
		expect(adapted.payload).not.toHaveProperty("image_urls");
		expect(adapted.payload).not.toHaveProperty("image_url");
		expect(adapted.payload).not.toHaveProperty("first_frame");
		// Duration stays a number — Vidu accepts integer (unlike FAL Seedance).
		expect(typeof adapted.payload.duration).toBe("number");
		expect(adapted.payload.duration).toBe(5);
		// Audio toggle is `audio`, not `generate_audio` (that's Vidu Q3 i2v).
		expect(adapted.payload.audio).toBe(true);
		expect(adapted.payload).not.toHaveProperty("generate_audio");
		// Aspect ratio uses the FAL convention (Vidu endpoint is on FAL).
		expect(adapted.payload.aspect_ratio).toBe("16:9");
		expect(adapted.payload).not.toHaveProperty("ratio");
	});

	it("allows up to 4 reference images for Vidu", () => {
		const portraits: Record<string, string> = {};
		const characters: string[] = [];
		for (let i = 0; i < 9; i++) {
			const name = `c${i}`;
			portraits[name] = `https://cdn/${i}.png`;
			characters.push(name);
		}
		const adapted = adaptShotForSeedance(
			{ shotId: "x", description: "ensemble", characters },
			portraits,
			"vidu"
		);
		expect(adapted.variant).toBe("vidu_q3_ref2v_mix");
		expect((adapted.payload.reference_image_urls as string[]).length).toBe(4);
	});

	it("degrades to FAL Seedance t2v when no characters are catalogued", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-2",
				description: "crowd shot",
				characters: ["Ghost"], // uncatalogued
			},
			{},
			"vidu"
		);
		// Vidu has no t2v endpoint — degrade cross-family.
		expect(adapted.variant).toBe("seedance_2_0");
		expect(adapted.endpoint).toBe("bytedance/seedance-2.0/text-to-video");
		expect(adapted.provider).toBe("fal");
		expect(adapted.reason).toMatch(/FAL Seedance 2.0 t2v/);
		expect(adapted.reason).toMatch(/Vidu has no t2v endpoint/);
		// Payload should match the FAL Seedance shape (string duration).
		expect(adapted.payload.duration).toBe("5");
	});

	it("degrades to FAL Seedance i2v when firstFrameUrl is set", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-3",
				description: "anchored shot",
				characters: ["Alice"],
				firstFrameUrl: "https://cdn/anchor.png",
			},
			{ Alice: "https://cdn/a.png" },
			"vidu"
		);
		// firstFrameUrl takes precedence over characters; Vidu has no i2v.
		expect(adapted.variant).toBe("seedance_2_0_i2v");
		expect(adapted.endpoint).toBe("bytedance/seedance-2.0/image-to-video");
		expect(adapted.provider).toBe("fal");
		expect(adapted.payload.image_url).toBe("https://cdn/anchor.png");
		expect(adapted.payload).not.toHaveProperty("reference_image_urls");
		expect(adapted.reason).toMatch(/Vidu has no i2v endpoint/);
	});

	it("forwards seed only when provided", () => {
		const withSeed = adaptShotForSeedance(
			{
				shotId: "a",
				description: "x",
				characters: ["Alice"],
				seed: 1337,
			},
			{ Alice: "https://cdn/a.png" },
			"vidu"
		);
		expect(withSeed.payload.seed).toBe(1337);

		const withoutSeed = adaptShotForSeedance(
			{ shotId: "b", description: "x", characters: ["Alice"] },
			{ Alice: "https://cdn/a.png" },
			"vidu"
		);
		expect(withoutSeed.payload.seed).toBeUndefined();
	});

	it("clamps duration per global Seedance rules (4-15) even for Vidu", () => {
		// Vidu registry allows 1-16, but the adapter enforces the Seedance-
		// wide 4-15 clamp to keep behavior predictable across families.
		const adapted = adaptShotForSeedance(
			{
				shotId: "a",
				description: "x",
				characters: ["Alice"],
				durationSeconds: 2,
			},
			{ Alice: "https://cdn/a.png" },
			"vidu"
		);
		expect(adapted.payload.duration).toBe(4);
	});
});

describe("adaptShotForSeedance — Kling Omni family", () => {
	it("element variant uses kling-v3-omni endpoint, element_list, string duration, and substitutes tokens", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1-1-2",
				description: "Alice hugs Bob in the garden",
				characters: ["Alice", "Bob"],
				durationSeconds: 8,
				aspectRatio: "16:9",
				generateAudio: true,
			},
			// Kling Omni "portraits" map is name → element_id, NOT a URL.
			{ Alice: "307795693621", Bob: "307795708543" },
			"kling-omni"
		);
		expect(adapted.variant).toBe("gmi_kling_v3_omni_element");
		expect(adapted.endpoint).toBe("kling-v3-omni");
		expect(adapted.provider).toBe("gmi");
		expect(adapted.payload.duration).toBe("8"); // Kling uses string duration
		expect(adapted.payload.mode).toBe("pro");
		expect(adapted.payload.sound).toBe("on");
		expect(adapted.payload.aspect_ratio).toBe("16:9");
		expect(adapted.payload.element_list).toEqual([
			{ element_id: "307795693621" },
			{ element_id: "307795708543" },
		]);
		// In-place token substitution
		expect(adapted.payload.prompt).toBe(
			"<<<element_1>>> hugs <<<element_2>>> in the garden"
		);
		expect(adapted.reason).toMatch(/kling-omni element: 2 catalogued/);
	});

	it("prepends tokens when character names don't appear in the prompt", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "They sit together quietly", // no name mentioned
				characters: ["Alice"],
				durationSeconds: 5,
			},
			{ Alice: "123" },
			"kling-omni"
		);
		expect(adapted.payload.prompt).toBe(
			"<<<element_1>>>: They sit together quietly"
		);
	});

	it("sound=off when generateAudio is explicitly false", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice walks",
				characters: ["Alice"],
				durationSeconds: 5,
				generateAudio: false,
			},
			{ Alice: "123" },
			"kling-omni"
		);
		expect(adapted.payload.sound).toBe("off");
	});

	it("caps element_list at 4 and reports the cap via referenceUrls", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "five people meet",
				characters: ["A", "B", "C", "D", "E"],
				durationSeconds: 5,
			},
			{ A: "1", B: "2", C: "3", D: "4", E: "5" },
			"kling-omni"
		);
		expect(adapted.payload.element_list).toEqual([
			{ element_id: "1" },
			{ element_id: "2" },
			{ element_id: "3" },
			{ element_id: "4" },
		]);
		expect(adapted.referenceUrls).toHaveLength(4);
	});

	it("firstFrameUrl routes to Kling I2V (image_list first_frame)", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "pan across the room",
				characters: [],
				firstFrameUrl: "https://cdn/x.jpg",
				durationSeconds: 6,
			},
			{},
			"kling-omni"
		);
		expect(adapted.variant).toBe("gmi_kling_v3_omni_i2v");
		expect(adapted.payload.image_list).toEqual([
			{ image_url: "https://cdn/x.jpg", type: "first_frame" },
		]);
		expect(adapted.payload.element_list).toBeUndefined();
	});

	it("falls back to Kling T2V when no characters and no first frame", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "a quiet street at dawn",
				characters: [],
				durationSeconds: 5,
			},
			{},
			"kling-omni"
		);
		expect(adapted.variant).toBe("gmi_kling_v3_omni_t2v");
		expect(adapted.payload.element_list).toBeUndefined();
		expect(adapted.payload.image_list).toBeUndefined();
	});

	it("degrades to T2V when characters are uncatalogued and records skips", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Ghosts gather in the hall",
				characters: ["GhostA", "GhostB"],
				durationSeconds: 5,
			},
			{},
			"kling-omni"
		);
		expect(adapted.variant).toBe("gmi_kling_v3_omni_t2v");
		expect(adapted.skippedCharacters).toEqual(["GhostA", "GhostB"]);
	});
});

describe("adaptShotForSeedance — styleAnchor fallback", () => {
	it("GMI: uncatalogued shot + anchor → ref2v with anchor as single ref", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Announcer at podium",
				characters: ["Announcer"], // not in portraits
				durationSeconds: 5,
				styleAnchor: {
					name: "Alice",
					value: "https://cdn/alice.png",
				},
			},
			{}, // empty portraits
			"gmi"
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_ref2v");
		expect(adapted.referenceUrls).toEqual(["https://cdn/alice.png"]);
		expect(adapted.reason).toMatch(/style-anchor fallback.*Alice/);
	});

	it("FAL: uncatalogued shot + anchor → ref2v", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Party scene",
				characters: [],
				durationSeconds: 5,
				styleAnchor: { name: "Bob", value: "https://cdn/bob.png" },
			},
			{},
			"fal"
		);
		expect(adapted.variant).toBe("seedance_2_0_ref2v");
		expect(adapted.payload.image_urls).toEqual(["https://cdn/bob.png"]);
		expect(adapted.reason).toMatch(/style-anchor fallback.*Bob/);
	});

	it("Kling Omni: uncatalogued shot + anchor → element variant with anchor", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Crowd shot",
				characters: ["Extras"],
				durationSeconds: 5,
				styleAnchor: { name: "Alice", value: "elm-alice-123" },
			},
			{},
			"kling-omni"
		);
		expect(adapted.variant).toBe("gmi_kling_v3_omni_element");
		expect(adapted.payload.element_list).toEqual([
			{ element_id: "elm-alice-123" },
		]);
		expect(adapted.reason).toMatch(/style-anchor fallback.*Alice/);
	});

	it("anchor is ignored when the shot already has catalogued characters", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice enters",
				characters: ["Alice"],
				durationSeconds: 5,
				styleAnchor: { name: "Bob", value: "https://cdn/bob.png" },
			},
			{ Alice: "https://cdn/alice.png" },
			"gmi"
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_ref2v");
		// Only Alice's URL — the anchor (Bob) is dropped.
		expect(adapted.referenceUrls).toEqual(["https://cdn/alice.png"]);
		expect(adapted.reason).not.toMatch(/style-anchor/);
	});

	it("firstFrameUrl still wins over styleAnchor (I2V path preserved)", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Scene opener",
				characters: [],
				firstFrameUrl: "https://cdn/first.png",
				durationSeconds: 5,
				styleAnchor: { name: "Alice", value: "https://cdn/alice.png" },
			},
			{},
			"gmi"
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_i2v");
		expect(adapted.referenceUrls).toEqual([]);
	});

	it("anchor with empty value is treated as no anchor", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Crowd",
				characters: [],
				durationSeconds: 5,
				styleAnchor: { name: "Alice", value: "" },
			},
			{},
			"gmi"
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_t2v");
	});
});

describe("adaptShotForSeedance — stylePrompt injection", () => {
	it("prepends stylePrompt before sanitized description", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "△ Alice enters the room",
				characters: ["Alice"],
				durationSeconds: 5,
				stylePrompt: "Modern anime film, soft cel-shading",
			},
			{ Alice: "https://cdn/alice.png" },
			"gmi"
		);
		expect(adapted.payload.prompt).toBe(
			"Modern anime film, soft cel-shading, Alice enters the room"
		);
	});

	it("trims whitespace from stylePrompt", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice walks",
				characters: ["Alice"],
				durationSeconds: 5,
				stylePrompt: "   anime film   ",
			},
			{ Alice: "https://cdn/a.png" },
			"gmi"
		);
		expect(adapted.payload.prompt).toBe("anime film, Alice walks");
	});

	it("omits stylePrompt when empty or whitespace-only", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice walks",
				characters: ["Alice"],
				durationSeconds: 5,
				stylePrompt: "   ",
			},
			{ Alice: "https://cdn/a.png" },
			"gmi"
		);
		expect(adapted.payload.prompt).toBe("Alice walks");
	});

	it("works with t2v path (no characters, no anchor)", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "a quiet street",
				characters: [],
				durationSeconds: 5,
				stylePrompt: "cinematic anime",
			},
			{},
			"gmi"
		);
		expect(adapted.variant).toBe("gmi_seedance_2_0_260128_t2v");
		expect(adapted.payload.prompt).toBe("cinematic anime, a quiet street");
	});

	it("works with Kling Omni element path + token substitution", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice greets Bob",
				characters: ["Alice", "Bob"],
				durationSeconds: 5,
				stylePrompt: "anime film",
			},
			{ Alice: "elm-1", Bob: "elm-2" },
			"kling-omni"
		);
		// Style prefix comes first, then tokens substitute the names
		expect(adapted.payload.prompt).toBe(
			"anime film, <<<element_1>>> greets <<<element_2>>>"
		);
	});
});

describe("adaptShotForSeedance — characterDescriptions injection", () => {
	it("injects [Reference: name — desc] for each catalogued character", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "沈薇薇 bursts through the door crying",
				characters: ["沈薇薇"],
				durationSeconds: 5,
				characterDescriptions: {
					沈薇薇: "20s East Asian female, long wavy hair, teal evening gown",
				},
			},
			{ 沈薇薇: "https://cdn/ww.png" },
			"gmi"
		);
		expect(adapted.payload.prompt).toContain(
			"[Reference: 沈薇薇 — 20s East Asian female, long wavy hair, teal evening gown]"
		);
		expect(adapted.payload.prompt).toContain(
			"沈薇薇 bursts through the door crying"
		);
	});

	it("injects multiple reference clauses for multi-character shots", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice and Bob argue",
				characters: ["Alice", "Bob"],
				durationSeconds: 5,
				characterDescriptions: {
					Alice: "20s female, long dark hair, white dress",
					Bob: "20s male, black hair, suit",
				},
			},
			{ Alice: "https://cdn/a.png", Bob: "https://cdn/b.png" },
			"gmi"
		);
		const prompt = adapted.payload.prompt as string;
		expect(prompt).toContain(
			"[Reference: Alice — 20s female, long dark hair, white dress]"
		);
		expect(prompt).toContain("[Reference: Bob — 20s male, black hair, suit]");
		expect(prompt).toContain("Alice and Bob argue");
	});

	it("skips characters without a description entry", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice and Ghost walk",
				characters: ["Alice", "Ghost"],
				durationSeconds: 5,
				characterDescriptions: {
					Alice: "20s female, dark hair",
				},
			},
			{ Alice: "https://cdn/a.png" },
			"gmi"
		);
		const prompt = adapted.payload.prompt as string;
		expect(prompt).toContain("[Reference: Alice");
		expect(prompt).not.toContain("[Reference: Ghost");
	});

	it("works with stylePrompt — style comes first, then refs, then scene", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice enters",
				characters: ["Alice"],
				durationSeconds: 5,
				stylePrompt: "anime film",
				characterDescriptions: { Alice: "20s female" },
			},
			{ Alice: "https://cdn/a.png" },
			"gmi"
		);
		const prompt = adapted.payload.prompt as string;
		// Order: style → refs → scene
		expect(prompt).toBe(
			"anime film, [Reference: Alice — 20s female] Alice enters"
		);
	});

	it("works with Kling Omni — ref clause uses original name, not token", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice walks in the garden",
				characters: ["Alice"],
				durationSeconds: 5,
				characterDescriptions: { Alice: "20s female, dark hair" },
			},
			{ Alice: "elm-123" },
			"kling-omni"
		);
		const prompt = adapted.payload.prompt as string;
		// Ref clause keeps original name (injected after token substitution)
		expect(prompt).toContain("[Reference: Alice — 20s female, dark hair]");
		// Scene text has the token
		expect(prompt).toContain("<<<element_1>>> walks in the garden");
		// Name in ref clause is NOT replaced with token
		expect(prompt).not.toContain("[Reference: <<<element_1>>>");
	});

	it("no injection when characterDescriptions is undefined", () => {
		const adapted = adaptShotForSeedance(
			{
				shotId: "1",
				description: "Alice walks",
				characters: ["Alice"],
				durationSeconds: 5,
			},
			{ Alice: "https://cdn/a.png" },
			"gmi"
		);
		expect(adapted.payload.prompt).toBe("Alice walks");
	});
});
