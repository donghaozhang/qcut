import { describe, expect, it } from "vitest";
import {
	evaluateStickerRuntime,
	parseAtlasRuntimeDescriptor,
} from "../sticker-lab/index.js";

function atlasFixture(): Record<string, unknown> {
	return {
		frames: [
			{
				filename: "idle-02",
				frame: { x: 0, y: 0, w: 20, h: 30 },
				rotated: false,
				trimmed: false,
				duration: 100,
			},
			{
				filename: "idle-01",
				frame: { x: 20, y: 0, w: 12, h: 18 },
				rotated: true,
				trimmed: true,
				spriteSourceSize: { x: 3, y: 4, w: 18, h: 12 },
				sourceSize: { w: 24, h: 24 },
				duration: 200,
			},
		],
		meta: { image: "original-atlas.png", size: { w: 64, h: 64 } },
	};
}

describe("Sticker Lab atlas runtime", () => {
	it("keeps frames[] order and preserves trim and rotation geometry", () => {
		const descriptor = parseAtlasRuntimeDescriptor({ atlas: atlasFixture() });

		expect(descriptor.atlasSource).toBe("original-atlas.png");
		expect(descriptor.atlasSize).toEqual({ width: 64, height: 64 });
		expect(descriptor.cycleDurationSeconds).toBeCloseTo(0.3);
		expect(descriptor.frames.map(({ id }) => id)).toEqual([
			"idle-02",
			"idle-01",
		]);
		expect(descriptor.frames[1]).toMatchObject({
			startSeconds: 0.1,
			durationSeconds: 0.2,
			rotated: true,
			trimmed: true,
			frameRect: { x: 20, y: 0, width: 12, height: 18 },
			spriteSourceRect: { x: 3, y: 4, width: 18, height: 12 },
			sourceSize: { width: 24, height: 24 },
		});
	});

	it("wraps, seeks, and resolves exact frame boundaries", () => {
		const descriptor = parseAtlasRuntimeDescriptor({ atlas: atlasFixture() });
		const evaluateAt = (timelineTimeSeconds: number) =>
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 2 },
			});

		expect(evaluateAt(0.099)).toMatchObject({ active: true, frameIndex: 0 });
		expect(evaluateAt(0.1 - 5e-10)).toMatchObject({
			active: true,
			frameIndex: 0,
		});
		expect(evaluateAt(0.1)).toMatchObject({ active: true, frameIndex: 1 });
		expect(evaluateAt(0.25)).toMatchObject({ active: true, frameIndex: 1 });
		expect(evaluateAt(descriptor.cycleDurationSeconds)).toMatchObject({
			active: true,
			frameIndex: 0,
			iterationIndex: 1,
		});
	});

	it("requires explicit order for frame maps", () => {
		const atlas = {
			frames: {
				first: { frame: { x: 0, y: 0, w: 10, h: 10 } },
				second: { frame: { x: 10, y: 0, w: 10, h: 10 } },
			},
		};
		expect(() => parseAtlasRuntimeDescriptor({ atlas, frameRate: 10 })).toThrow(
			"explicit frameOrder"
		);

		const descriptor = parseAtlasRuntimeDescriptor({
			atlas,
			frameOrder: ["second", "first"],
			frameRate: 10,
		});
		expect(descriptor.frames.map(({ id }) => id)).toEqual(["second", "first"]);
	});

	it("supports split offsets and finite freeze behavior", () => {
		const descriptor = parseAtlasRuntimeDescriptor({
			atlas: atlasFixture(),
			repeat: { kind: "finite", additionalIterations: 0 },
		});
		expect(
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds: 8,
				timeline: {
					timelineStartSeconds: 8,
					timelineDurationSeconds: 1,
					sourceOffsetSeconds: 0.1,
				},
			})
		).toMatchObject({ active: true, frameIndex: 1, frozen: false });
		expect(
			evaluateStickerRuntime({
				descriptor,
				timelineTimeSeconds: descriptor.cycleDurationSeconds,
				timeline: { timelineStartSeconds: 0, timelineDurationSeconds: 1 },
			})
		).toMatchObject({ active: true, frameIndex: 1, frozen: true });
	});

	it("rejects discarded trim data and atlas overflow", () => {
		const missingTrimGeometry = {
			frames: [
				{
					filename: "rotated",
					frame: { x: 0, y: 0, w: 10, h: 10 },
					rotated: true,
					duration: 100,
				},
			],
		};
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: missingTrimGeometry })
		).toThrow("preserve trim geometry");

		const overflow = atlasFixture();
		const frames = overflow.frames as Record<string, unknown>[];
		frames[0] = {
			...frames[0],
			frame: { x: 60, y: 0, w: 20, h: 30 },
		};
		expect(() => parseAtlasRuntimeDescriptor({ atlas: overflow })).toThrow(
			"outside the atlas image"
		);

		const duplicateFrames = atlasFixture();
		const duplicateEntries = duplicateFrames.frames as Record<
			string,
			unknown
		>[];
		duplicateEntries[1] = { ...duplicateEntries[1], filename: "idle-02" };
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: duplicateFrames })
		).toThrow("duplicated");
	});

	it("rejects inconsistent pixel aliases and rotation geometry", () => {
		const aliasConflict = atlasFixture();
		const aliasFrames = aliasConflict.frames as Record<string, unknown>[];
		aliasFrames[0] = {
			...aliasFrames[0],
			frame: { x: 0, y: 0, w: 20, width: 21, h: 30 },
		};
		expect(() => parseAtlasRuntimeDescriptor({ atlas: aliasConflict })).toThrow(
			"aliases must match"
		);

		const invalidRotation = atlasFixture();
		const rotationFrames = invalidRotation.frames as Record<string, unknown>[];
		rotationFrames[1] = {
			...rotationFrames[1],
			frame: { x: 20, y: 0, w: 18, h: 12 },
		};
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: invalidRotation })
		).toThrow("rotation and trim rectangle");

		const invalidUntrimmed = atlasFixture();
		const untrimmedFrames = invalidUntrimmed.frames as Record<
			string,
			unknown
		>[];
		untrimmedFrames[0] = {
			...untrimmedFrames[0],
			spriteSourceSize: { x: 1, y: 0, w: 20, h: 30 },
			sourceSize: { w: 21, h: 30 },
		};
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: invalidUntrimmed })
		).toThrow("marked untrimmed");

		const invalidSourceSize = atlasFixture();
		const sourceSizeFrames = invalidSourceSize.frames as Record<
			string,
			unknown
		>[];
		sourceSizeFrames[1] = {
			...sourceSizeFrames[1],
			sourceSize: { w: 20, h: 24 },
		};
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: invalidSourceSize })
		).toThrow("outside its source size");

		const fractionalFrame = atlasFixture();
		const fractionalFrames = fractionalFrame.frames as Record<
			string,
			unknown
		>[];
		fractionalFrames[0] = {
			...fractionalFrames[0],
			frame: { x: 0.5, y: 0, w: 20, h: 30 },
		};
		expect(() =>
			parseAtlasRuntimeDescriptor({ atlas: fractionalFrame })
		).toThrow("safe non-negative integer");
	});
});
