import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyPortraitPreset,
	createPortraitPreset,
	loadPortraitPresets,
	persistPortraitPresets,
	PORTRAIT_PRESET_STORAGE_KEY,
} from "../portrait-presets";

describe("portrait presets", () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
	});

	it("stores face and body values as separate reusable presets", () => {
		const adjustments = {
			enabled: true,
			values: {
				face_adjust_brow_size: 35,
				face_adjust_BrightEye: 60,
				body_adjust_SlimWaist: 70,
			},
		} as const;
		const face = createPortraitPreset({
			adjustments,
			name: "  Clean portrait  ",
			scope: "face",
		});
		const body = createPortraitPreset({
			adjustments,
			name: "Body",
			scope: "body",
		});

		expect(face.name).toBe("Clean portrait");
		expect(face.values).toEqual({
			face_adjust_brow_size: 35,
			face_adjust_BrightEye: 60,
		});
		expect(body.values).toEqual({ body_adjust_SlimWaist: 70 });
	});

	it("stores makeup and face targeting only in face presets", () => {
		const adjustments = {
			enabled: true,
			values: { body_adjust_SlimWaist: 70 },
			faceTarget: { mode: "single" as const, faceId: 1 },
			makeup: {
				lip: { cardId: "lip-soft-pink", intensity: 75 },
			},
		};
		const face = createPortraitPreset({
			adjustments,
			name: "Makeup",
			scope: "face",
		});
		const body = createPortraitPreset({
			adjustments,
			name: "Body",
			scope: "body",
		});
		expect(face).toMatchObject({
			faceTarget: { mode: "single", faceId: 1 },
			makeup: { lip: { cardId: "lip-soft-pink", intensity: 75 } },
		});
		expect(body).not.toHaveProperty("faceTarget");
		expect(body).not.toHaveProperty("makeup");
	});

	it("stores and reapplies manual body geometry in body presets", () => {
		const manualBody = {
			slim: {
				intensity: 45,
				x: 0.45,
				y: 0.55,
				width: 0.3,
				height: 0.5,
				rotation: 20,
			},
		};
		const preset = createPortraitPreset({
			adjustments: { enabled: true, values: {}, manualBody },
			name: "Manual body",
			scope: "body",
		});

		expect(preset.manualBody).toEqual(manualBody);
		expect(
			applyPortraitPreset({
				adjustments: { enabled: false, values: {} },
				preset,
			}).manualBody
		).toEqual(manualBody);
	});

	it("applies one scope without erasing the other", () => {
		const preset = createPortraitPreset({
			adjustments: {
				enabled: true,
				values: { face_adjust_brow_size: 45 },
			},
			name: "Brows",
			scope: "face",
		});
		expect(
			applyPortraitPreset({
				adjustments: {
					enabled: false,
					values: {
						face_adjust_Nose: 80,
						body_adjust_SlimWaist: 65,
					},
				},
				preset,
			})
		).toEqual({
			enabled: true,
			values: {
				body_adjust_SlimWaist: 65,
				face_adjust_brow_size: 45,
			},
		});
	});

	it("persists valid values and rejects malformed storage", () => {
		const preset = createPortraitPreset({
			adjustments: {
				enabled: true,
				values: { face_adjust_skin_Intensity: 50 },
			},
			name: "Skin",
			scope: "face",
		});
		persistPortraitPresets({ presets: [preset] });
		expect(
			JSON.parse(storage.get(PORTRAIT_PRESET_STORAGE_KEY) ?? "[]")
		).toHaveLength(1);
		expect(loadPortraitPresets()).toEqual([preset]);

		localStorage.setItem(PORTRAIT_PRESET_STORAGE_KEY, "not-json");
		expect(loadPortraitPresets()).toEqual([]);
	});

	it("applies a face preset with its makeup without erasing body values", () => {
		const preset = createPortraitPreset({
			adjustments: {
				enabled: true,
				values: { face_adjust_TotalFace: 60 },
				faceTarget: { mode: "single", faceId: 0 },
				makeup: {
					contacts: { cardId: "contacts-natural", intensity: 80 },
				},
			},
			name: "Face 1",
			scope: "face",
		});
		expect(
			applyPortraitPreset({
				adjustments: {
					enabled: true,
					values: { body_adjust_SlimWaist: 70 },
				},
				preset,
			})
		).toEqual({
			enabled: true,
			values: {
				body_adjust_SlimWaist: 70,
				face_adjust_TotalFace: 60,
			},
			faceTarget: { mode: "single", faceId: 0 },
			makeup: {
				contacts: { cardId: "contacts-natural", intensity: 80 },
			},
		});
	});
});
