import { describe, it, expect } from "vitest";
import { validateRecipe } from "../replicate-analyzer";

describe("validateRecipe", () => {
	const validRaw = {
		version: 1,
		source: {
			filename: "test.mp4",
			duration: 30,
			resolution: { width: 1920, height: 1080 },
			fps: 30,
		},
		style: {
			genre: "tutorial",
			mood: "calm",
			colorPalette: ["#ff0000", "#00ff00"],
			pacing: "medium",
		},
		audio: {
			hasBGM: true,
			bgmStyle: "ambient",
			hasVoiceover: false,
		},
		shots: [
			{
				index: 0,
				startTime: 0,
				endTime: 5,
				duration: 5,
				type: "wide",
				camera: "static",
				description: "Opening shot",
				prompt: "A wide establishing shot of a cityscape at dawn",
				transition: "cut",
				hasText: false,
				hasSubtitle: false,
			},
			{
				index: 1,
				startTime: 5,
				endTime: 10,
				duration: 5,
				type: "medium",
				camera: "pan-left",
				description: "Subject introduction",
				prompt: "Medium shot of a person walking, camera panning left",
				transition: "dissolve",
				hasText: true,
				textContent: "Chapter 1",
				hasSubtitle: false,
			},
		],
	};

	it("validates a well-formed recipe", () => {
		const recipe = validateRecipe(validRaw, "test.mp4");
		expect(recipe.version).toBe(1);
		expect(recipe.source.filename).toBe("test.mp4");
		expect(recipe.source.duration).toBe(30);
		expect(recipe.shots).toHaveLength(2);
		expect(recipe.shots[0].type).toBe("wide");
		expect(recipe.shots[1].transition).toBe("dissolve");
	});

	it("fills in defaults for missing source fields", () => {
		const raw = {
			...validRaw,
			source: { duration: 10 },
		};
		const recipe = validateRecipe(raw, "fallback.mp4");
		expect(recipe.source.filename).toBe("fallback.mp4");
		expect(recipe.source.resolution.width).toBe(1920);
		expect(recipe.source.resolution.height).toBe(1080);
		expect(recipe.source.fps).toBe(30);
	});

	it("normalizes invalid pacing to 'medium'", () => {
		const raw = {
			...validRaw,
			style: { ...validRaw.style, pacing: "super-fast" },
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.style.pacing).toBe("medium");
	});

	it("normalizes invalid shot type to 'medium'", () => {
		const raw = {
			...validRaw,
			shots: [{ ...validRaw.shots[0], type: "extreme-wide" }],
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.shots[0].type).toBe("medium");
	});

	it("normalizes invalid camera to 'static'", () => {
		const raw = {
			...validRaw,
			shots: [{ ...validRaw.shots[0], camera: "orbit" }],
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.shots[0].camera).toBe("static");
	});

	it("normalizes invalid transition to 'cut'", () => {
		const raw = {
			...validRaw,
			shots: [{ ...validRaw.shots[0], transition: "iris" }],
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.shots[0].transition).toBe("cut");
	});

	it("throws when shots array is empty", () => {
		const raw = { ...validRaw, shots: [] };
		expect(() => validateRecipe(raw, "test.mp4")).toThrow(
			"no shots detected"
		);
	});

	it("throws when input is not an object", () => {
		expect(() => validateRecipe(null, "test.mp4")).toThrow(
			"expected an object"
		);
		expect(() => validateRecipe("string", "test.mp4")).toThrow(
			"expected an object"
		);
	});

	it("uses fallback index when index is missing", () => {
		const raw = {
			...validRaw,
			shots: [
				{ ...validRaw.shots[0], index: undefined },
				{ ...validRaw.shots[1], index: undefined },
			],
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.shots[0].index).toBe(0);
		expect(recipe.shots[1].index).toBe(1);
	});

	it("computes duration from startTime/endTime when missing", () => {
		const raw = {
			...validRaw,
			shots: [
				{
					...validRaw.shots[0],
					startTime: 2,
					endTime: 7,
					duration: undefined,
				},
			],
		};
		const recipe = validateRecipe(raw, "test.mp4");
		expect(recipe.shots[0].duration).toBe(5);
	});

	it("preserves optional text fields", () => {
		const recipe = validateRecipe(validRaw, "test.mp4");
		expect(recipe.shots[1].hasText).toBe(true);
		expect(recipe.shots[1].textContent).toBe("Chapter 1");
		expect(recipe.shots[0].textContent).toBeUndefined();
	});

	it("preserves audio fields", () => {
		const recipe = validateRecipe(validRaw, "test.mp4");
		expect(recipe.audio.hasBGM).toBe(true);
		expect(recipe.audio.bgmStyle).toBe("ambient");
		expect(recipe.audio.hasVoiceover).toBe(false);
		expect(recipe.audio.transcript).toBeUndefined();
	});
});
