import { describe, it, expect } from "vitest";
import { convertShot, convertRecipeToScript } from "../replicate-converter";
import { ShotType, CameraMovement } from "../../vimax/types/shot";
import type { VideoRecipe, ShotRecipe } from "../replicate-types";

function makeShot(overrides: Partial<ShotRecipe> = {}): ShotRecipe {
	return {
		index: 0,
		startTime: 0,
		endTime: 5,
		duration: 5,
		type: "wide",
		camera: "static",
		description: "Test shot",
		prompt: "A test prompt",
		transition: "cut",
		hasText: false,
		hasSubtitle: false,
		...overrides,
	};
}

function makeRecipe(shots: Partial<ShotRecipe>[]): VideoRecipe {
	return {
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
			colorPalette: [],
			pacing: "medium",
		},
		audio: { hasBGM: false, hasVoiceover: false },
		shots: shots.map((s, i) => makeShot({ index: i, ...s })),
	};
}

describe("convertShot", () => {
	it("maps wide shot type to ShotType.WIDE", () => {
		const result = convertShot(makeShot({ type: "wide" }));
		expect(result.shot_type).toBe(ShotType.WIDE);
	});

	it("maps closeup shot type to ShotType.CLOSE_UP", () => {
		const result = convertShot(makeShot({ type: "closeup" }));
		expect(result.shot_type).toBe(ShotType.CLOSE_UP);
	});

	it("maps detail shot type to ShotType.INSERT", () => {
		const result = convertShot(makeShot({ type: "detail" }));
		expect(result.shot_type).toBe(ShotType.INSERT);
	});

	it("maps pan-left camera to CameraMovement.PAN", () => {
		const result = convertShot(makeShot({ camera: "pan-left" }));
		expect(result.camera_movement).toBe(CameraMovement.PAN);
	});

	it("maps zoom-in camera to CameraMovement.ZOOM", () => {
		const result = convertShot(makeShot({ camera: "zoom-in" }));
		expect(result.camera_movement).toBe(CameraMovement.ZOOM);
	});

	it("maps tracking camera to CameraMovement.TRACKING", () => {
		const result = convertShot(makeShot({ camera: "tracking" }));
		expect(result.camera_movement).toBe(CameraMovement.TRACKING);
	});

	it("sets prompt_description from shot.prompt", () => {
		const result = convertShot(makeShot({ prompt: "Generate a sunset" }));
		expect(result.prompt_description).toBe("Generate a sunset");
	});

	it("generates shot_id from index", () => {
		const result = convertShot(makeShot({ index: 7 }));
		expect(result.shot_id).toBe("shot_007");
	});

	it("preserves duration", () => {
		const result = convertShot(makeShot({ duration: 8.5 }));
		expect(result.duration_seconds).toBe(8.5);
	});
});

describe("convertRecipeToScript", () => {
	it("creates a Script with one scene", () => {
		const recipe = makeRecipe([{}, {}]);
		const script = convertRecipeToScript(recipe);
		expect(script.scenes).toHaveLength(1);
		expect(script.scenes[0].shots).toHaveLength(2);
	});

	it("derives title from filename", () => {
		const recipe = makeRecipe([{}]);
		recipe.source.filename = "my-video.mp4";
		const script = convertRecipeToScript(recipe);
		expect(script.title).toBe("my-video");
	});

	it("computes total_duration from shot durations", () => {
		const recipe = makeRecipe([{ duration: 3 }, { duration: 7 }]);
		const script = convertRecipeToScript(recipe);
		expect(script.total_duration).toBe(10);
	});

	it("includes genre in logline", () => {
		const recipe = makeRecipe([{}]);
		recipe.style.genre = "cinematic";
		const script = convertRecipeToScript(recipe);
		expect(script.logline).toContain("cinematic");
	});
});
