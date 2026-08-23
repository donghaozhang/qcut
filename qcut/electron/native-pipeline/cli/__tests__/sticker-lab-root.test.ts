import { describe, expect, test } from "vitest";
import { resolveStickerLabRootOverride } from "../sticker-lab-root";

describe("Sticker Lab CLI root selection", () => {
	test("prefers a non-empty explicit root over the environment", () => {
		expect(
			resolveStickerLabRootOverride({
				root: "  /explicit/stickers  ",
				environment: { QCUT_STICKER_LAB_ROOT: "/configured/stickers" },
			})
		).toBe("/explicit/stickers");
	});

	test("uses a non-empty configured root when the explicit root is absent", () => {
		expect(
			resolveStickerLabRootOverride({
				environment: {
					QCUT_STICKER_LAB_ROOT: "  /configured/stickers  ",
				},
			})
		).toBe("/configured/stickers");
	});

	test("leaves the root undefined when both selectors are blank", () => {
		expect(
			resolveStickerLabRootOverride({
				root: "  ",
				environment: { QCUT_STICKER_LAB_ROOT: "\t" },
			})
		).toBeUndefined();
	});
});
