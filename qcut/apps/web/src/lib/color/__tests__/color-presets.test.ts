import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	COLOR_PRESET_STORAGE_KEY,
	createColorPreset,
	loadColorPresets,
	persistColorPresets,
} from "../color-presets";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";

describe("color presets", () => {
	const storage = new Map<string, string>();
	beforeEach(() => {
		storage.clear();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		vi.mocked(localStorage.removeItem).mockImplementation((key) => {
			storage.delete(key);
		});
	});

	it("saves named presets without clip-local masks or animation", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.basic.exposure = 1.2;
		settings.mask = { enabled: true, maskIds: ["clip-mask"], invert: true };
		settings.keyframes = {
			"basic.exposure": [
				{ id: "exposure", frame: 10, value: 1.2, easing: "linear" },
			],
		};
		settings.curveShapeKeyframes = {
			"curves.master": [
				{
					id: "shape",
					frame: 10,
					points: settings.curves.master,
					easing: "linear",
				},
			],
		};
		const preset = createColorPreset({ settings, name: "  Night grade  " });
		expect(preset.name).toBe("Night grade");
		expect(preset.color.basic.exposure).toBe(1.2);
		expect(preset.color.mask).toEqual({
			enabled: false,
			maskIds: [],
			invert: false,
		});
		expect(preset.color.keyframes).toEqual({});
		expect(preset.color.curveShapeKeyframes).toEqual({});
	});

	it("persists, reloads, and safely rejects malformed storage", () => {
		const preset = createColorPreset({
			settings: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			name: "Reusable",
		});
		persistColorPresets({ presets: [preset] });
		const stored = localStorage.getItem(COLOR_PRESET_STORAGE_KEY);
		expect(stored).not.toBeNull();
		expect(JSON.parse(stored ?? "[]")).toHaveLength(1);
		expect(loadColorPresets()).toEqual([preset]);
		localStorage.setItem(COLOR_PRESET_STORAGE_KEY, "not-json");
		expect(loadColorPresets()).toEqual([]);
	});
});
