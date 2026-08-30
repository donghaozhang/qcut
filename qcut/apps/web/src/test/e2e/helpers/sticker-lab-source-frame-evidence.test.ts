import type { DirectGifRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { describe, expect, test } from "vitest";
import {
	type PreparedStickerSource,
	selectStickerSourceEvidenceFrames,
} from "./sticker-lab-source-frame-evidence";

const DESCRIPTOR: DirectGifRuntimeDescriptor = {
	canvasSize: { height: 2, width: 2 },
	completion: "hide",
	cycleDurationSeconds: 0.2,
	frames: [
		{
			delayCentiseconds: 10,
			disposalMethod: 1,
			durationSeconds: 0.1,
			frameRect: { height: 2, width: 2, x: 0, y: 0 },
			hasTransparency: true,
			startSeconds: 0,
		},
		{
			delayCentiseconds: 10,
			disposalMethod: 1,
			durationSeconds: 0.1,
			frameRect: { height: 2, width: 2, x: 0, y: 0 },
			hasTransparency: true,
			startSeconds: 0.1,
		},
	],
	kind: "direct-gif",
	repeat: { kind: "infinite" },
};

function rgbaFrame({ visible }: { visible: boolean }): Buffer {
	const frame = Buffer.alloc(2 * 2 * 4);
	for (let offset = 0; offset < frame.byteLength; offset += 4) {
		frame[offset] = 220;
		frame[offset + 1] = 40;
		frame[offset + 2] = 30;
		frame[offset + 3] = visible ? 255 : 0;
	}
	return frame;
}

function source({ frames }: { frames: Buffer[] }): PreparedStickerSource {
	return {
		descriptor: DESCRIPTOR,
		frameHashes: ["transparent", "visible"],
		frames,
		item: {
			endFrame: 6,
			region: { height: 0.2, width: 0.2, x: 0.4, y: 0.4 },
			sample: {
				batchId: "private-batch",
				byteSize: 1,
				categoryId: "category",
				categoryLabel: "category",
				checksumSha256: "a".repeat(64),
				cycleDurationSeconds: 0.2,
				displayName: "animated sticker",
				frameCount: 2,
				frameRate: 10,
				itemId: "sticker",
				mimeType: "image/gif",
				sourceKind: "preview-gif",
			},
			startFrame: 0,
		},
		pixelRect: { height: 2, left: 0, top: 0, width: 2 },
	};
}

function staticSource(): PreparedStickerSource {
	return {
		descriptor: null,
		frameHashes: ["static"],
		frames: [rgbaFrame({ visible: true })],
		item: {
			endFrame: 64,
			region: { height: 0.2, width: 0.2, x: 0.4, y: 0.4 },
			sample: {
				batchId: "private-batch",
				byteSize: 1,
				categoryId: "category",
				categoryLabel: "category",
				checksumSha256: "b".repeat(64),
				cycleDurationSeconds: 0,
				displayName: "static sticker",
				frameCount: 1,
				frameRate: null,
				itemId: "static-sticker",
				mimeType: "image/png",
				sourceKind: "static-image",
			},
			startFrame: 58,
		},
		pixelRect: { height: 2, left: 0, top: 0, width: 2 },
	};
}

describe("Sticker Lab source frame selection", () => {
	test("samples guarded start, middle, and end frames for static stickers", () => {
		expect(
			selectStickerSourceEvidenceFrames({
				frameRate: 30,
				source: staticSource(),
			})
		).toEqual([
			{ outputFrame: 60, sourceFrameHash: "static", sourceFrameIndex: 0 },
			{ outputFrame: 61, sourceFrameHash: "static", sourceFrameIndex: 0 },
		]);
	});

	test("excludes fully transparent GIF frames from encoded identity checks", () => {
		const selections = selectStickerSourceEvidenceFrames({
			frameRate: 30,
			source: source({
				frames: [rgbaFrame({ visible: false }), rgbaFrame({ visible: true })],
			}),
		});
		expect(selections).toEqual([
			{
				outputFrame: 3,
				sourceFrameHash: "visible",
				sourceFrameIndex: 1,
			},
		]);
	});

	test("rejects a safe evidence window containing only transparent frames", () => {
		expect(() =>
			selectStickerSourceEvidenceFrames({
				frameRate: 30,
				source: source({
					frames: [
						rgbaFrame({ visible: false }),
						rgbaFrame({ visible: false }),
					],
				}),
			})
		).toThrowError(
			"Sticker sticker has no observable source frame inside its safe evidence window"
		);
	});
});
