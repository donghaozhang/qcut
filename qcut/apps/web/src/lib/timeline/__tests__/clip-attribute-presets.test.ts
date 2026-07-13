import { beforeEach, describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	loadClipAttributePresets,
	saveClipAttributePreset,
} from "../clip-attribute-presets";

const element: MediaElement = {
	id: "clip",
	type: "media",
	name: "Interview",
	mediaId: "media",
	startTime: 0,
	duration: 10,
	trimStart: 0,
	trimEnd: 0,
	opacity: 0.7,
	rotation: 12,
	chromaKey: {
		enabled: true,
		color: "#00ff00",
		similarity: 0.4,
		blend: 0.1,
		shadow: 0,
		cleanup: 0.2,
		spill: 0.1,
	},
};

describe("clip attribute presets", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		const storage: Storage = {
			get length() {
				return values.size;
			},
			clear: () => values.clear(),
			getItem: (key) => values.get(key) ?? null,
			key: (index) => [...values.keys()][index] ?? null,
			removeItem: (key) => {
				values.delete(key);
			},
			setItem: (key, value) => {
				values.set(key, value);
			},
		};
		Object.defineProperty(window, "localStorage", {
			value: storage,
			writable: true,
		});
	});

	it("persists reusable non-destructive media attributes", () => {
		const { preset } = saveClipAttributePreset({ element });

		expect(preset.name).toBe("Interview preset 1");
		expect(preset.attributes).toMatchObject({
			opacity: 0.7,
			rotation: 12,
			chromaKey: element.chromaKey,
		});
		expect(loadClipAttributePresets()).toEqual([preset]);
	});

	it("keeps source identity and timing out of reusable presets", () => {
		const { preset } = saveClipAttributePreset({ element });

		expect(preset.attributes).not.toHaveProperty("id");
		expect(preset.attributes).not.toHaveProperty("mediaId");
		expect(preset.attributes).not.toHaveProperty("startTime");
		expect(preset.attributes).not.toHaveProperty("duration");
	});
});
