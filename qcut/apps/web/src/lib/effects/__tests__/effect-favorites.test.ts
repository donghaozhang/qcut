import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readEffectFavoriteIds,
	writeEffectFavoriteIds,
} from "../effect-favorites";

describe("effect favorites storage", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps storage failures from breaking the effects library", () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => null),
			setItem: vi.fn(() => {
				throw new Error("Quota exceeded");
			}),
		});

		expect(() =>
			writeEffectFavoriteIds({ favoriteIds: new Set(["cinematic-glow"]) })
		).not.toThrow();
		expect(readEffectFavoriteIds()).toEqual(new Set());
	});
});
