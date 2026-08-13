// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	measureJianyingHostTextAlphaBounds,
	nextJianyingHostTextFontSize,
	shouldFitJianyingHostText,
} from "../jianying-text-runtime/host-text-fit.js";

function rgbaFrame({
	width,
	height,
	visible,
}: {
	width: number;
	height: number;
	visible?: { minX: number; minY: number; maxX: number; maxY: number };
}) {
	const bytes = Buffer.alloc(width * height * 4);
	if (!visible) return bytes;
	for (let y = visible.minY; y <= visible.maxY; y += 1) {
		for (let x = visible.minX; x <= visible.maxX; x += 1) {
			bytes[(y * width + x) * 4 + 3] = 255;
		}
	}
	return bytes;
}

describe("Jianying host-text fitting", () => {
	it("fits TextStyle and InfoSticker while leaving script templates to slot fitting", () => {
		expect(shouldFitJianyingHostText({ packageKind: "TextStyle" })).toBe(true);
		expect(shouldFitJianyingHostText({ packageKind: "InfoSticker" })).toBe(
			true
		);
		expect(
			shouldFitJianyingHostText({ packageKind: "ScriptInfoSticker" })
		).toBe(false);
	});

	it("measures alpha bounds without treating transparent pixels as a box", () => {
		expect(
			measureJianyingHostTextAlphaBounds({
				bytes: rgbaFrame({
					width: 20,
					height: 10,
					visible: { minX: 3, minY: 2, maxX: 16, maxY: 7 },
				}),
				width: 20,
				height: 10,
			})
		).toEqual({
			minX: 3,
			minY: 2,
			maxX: 16,
			maxY: 7,
			width: 14,
			height: 6,
		});
	});

	it("leaves a visible style unchanged when it has safe transparent margins", () => {
		expect(
			nextJianyingHostTextFontSize({
				fontSize: 72,
				bounds: {
					minX: 10,
					minY: 5,
					maxX: 89,
					maxY: 44,
					width: 80,
					height: 40,
				},
				width: 100,
				height: 50,
			})
		).toBeNull();
	});

	it("uses a conservative retry when clipped bounds hide the real width", () => {
		expect(
			nextJianyingHostTextFontSize({
				fontSize: 72,
				bounds: {
					minX: 0,
					minY: 10,
					maxX: 99,
					maxY: 39,
					width: 100,
					height: 30,
				},
				width: 100,
				height: 50,
			})
		).toBe(54);
	});

	it("does not shrink a transparent probe or accept malformed RGBA", () => {
		expect(
			nextJianyingHostTextFontSize({
				fontSize: 72,
				bounds: null,
				width: 100,
				height: 50,
			})
		).toBeNull();
		expect(() =>
			measureJianyingHostTextAlphaBounds({
				bytes: Buffer.alloc(3),
				width: 1,
				height: 1,
			})
		).toThrow("invalid RGBA frame size");
	});
});
