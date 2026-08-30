import type { DirectGifRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { describe, expect, test } from "vitest";
import type { StickerExportRuntimeDraw } from "./sticker-lab-export-runtime-trace";
import type { PreparedStickerSource } from "./sticker-lab-source-frame-evidence";
import { verifyStickerRuntimeSequence } from "./sticker-lab-runtime-sequence-evidence";

const DESCRIPTOR: DirectGifRuntimeDescriptor = {
	canvasSize: { height: 64, width: 64 },
	completion: "hide",
	cycleDurationSeconds: 0.4,
	frames: [
		{
			delayCentiseconds: 20,
			disposalMethod: 1,
			durationSeconds: 0.2,
			frameRect: { height: 64, width: 64, x: 0, y: 0 },
			hasTransparency: true,
			startSeconds: 0,
		},
		{
			delayCentiseconds: 20,
			disposalMethod: 1,
			durationSeconds: 0.2,
			frameRect: { height: 64, width: 64, x: 0, y: 0 },
			hasTransparency: true,
			startSeconds: 0.2,
		},
	],
	kind: "direct-gif",
	repeat: { kind: "infinite" },
};

function source({
	descriptor = DESCRIPTOR,
	endFrame = 42,
	frameHashes = ["source-frame-a", "source-frame-b"],
	startFrame = 30,
}: {
	descriptor?: DirectGifRuntimeDescriptor;
	endFrame?: number;
	frameHashes?: string[];
	startFrame?: number;
} = {}): PreparedStickerSource {
	return {
		descriptor,
		frameHashes,
		frames: frameHashes.map(() => Buffer.alloc(4)),
		item: {
			endFrame,
			region: { height: 0.2, width: 0.2, x: 0.4, y: 0.4 },
			sample: {
				batchId: "private-batch",
				byteSize: 1,
				categoryId: "category",
				categoryLabel: "category",
				checksumSha256: "a".repeat(64),
				cycleDurationSeconds: 0.4,
				displayName: "animated sticker",
				frameCount: 2,
				frameRate: 5,
				itemId: "sticker",
				mimeType: "image/gif",
				sourceKind: "preview-gif",
			},
			startFrame,
		},
		pixelRect: { height: 1, left: 0, top: 0, width: 1 },
	};
}

function runtimeDraw({
	outputFrameIndex,
	pixelHash,
	sourceHeight = 64,
	sourceWidth = 64,
}: {
	outputFrameIndex: number;
	pixelHash: string;
	sourceHeight?: number;
	sourceWidth?: number;
}): StickerExportRuntimeDraw {
	return {
		alphaPixelRatio: 0.5,
		outputFrameIndex,
		pixelHash,
		sourceHeight,
		sourceKind: "HTMLCanvasElement",
		sourceWidth,
	};
}

function validDraws(): StickerExportRuntimeDraw[] {
	return Array.from({ length: 12 }, (_, offset) => {
		const outputFrameIndex = 30 + offset;
		return runtimeDraw({
			outputFrameIndex,
			pixelHash: offset < 6 ? "runtime-frame-a" : "runtime-frame-b",
		});
	});
}

const RUNTIME_FRAME_HASHES = ["runtime-frame-a", "runtime-frame-b"];

describe("Sticker Lab runtime sequence evidence", () => {
	test("maps each expected visual frame to one distinct stable runtime hash", () => {
		const noise = Array.from({ length: 12 }, (_, offset) =>
			runtimeDraw({
				outputFrameIndex: 30 + offset,
				pixelHash: "base-video",
				sourceHeight: 720,
				sourceWidth: 1280,
			})
		);
		const evidence = verifyStickerRuntimeSequence({
			draws: [...noise, ...validDraws()],
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source(),
		});
		expect(evidence).toMatchObject({
			absoluteRuntimeHashMatchCount: 12,
			distinctRuntimePixelHashCount: 2,
			expectedOutputFrameCount: 12,
			failures: [],
			observedSourceVisualFrameCount: 2,
			observable: true,
			outputRateReachableSourceVisualFrameCount: 2,
			passed: true,
			requiredCycleDurationSeconds: 0.4,
			runtimeDrawCount: 12,
			runtimeWindowDurationSeconds: 0.4,
			sourceVisualFrameCount: 2,
		});
		expect(evidence.visualFrames).toEqual([
			{
				expectedRuntimeFrameIndices: [0],
				expectedSourceFrameHash: "source-frame-a",
				runtimePixelHashes: ["runtime-frame-a"],
			},
			{
				expectedRuntimeFrameIndices: [1],
				expectedSourceFrameHash: "source-frame-b",
				runtimePixelHashes: ["runtime-frame-b"],
			},
		]);
	});

	test("rejects a runtime frozen on one rendered frame", () => {
		const draws = validDraws().map((draw) => ({
			...draw,
			pixelHash: "frozen",
		}));
		const evidence = verifyStickerRuntimeSequence({
			draws,
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source(),
		});
		expect(evidence.passed).toBe(false);
		expect(evidence.failures).toContain(
			"2 source visual frames map to 1 distinct runtime hashes"
		);
	});

	test("rejects an unstable runtime hash for one expected visual frame", () => {
		const draws = validDraws();
		draws[2] = { ...draws[2], pixelHash: "runtime-frame-a-jitter" };
		const evidence = verifyStickerRuntimeSequence({
			draws,
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source(),
		});
		expect(evidence.passed).toBe(false);
		expect(evidence.failures).toContain(
			"Source visual frame source-frame-a produced 2 runtime hashes; expected 1"
		);
	});

	test("rejects missing and duplicate runtime draws", () => {
		const draws = validDraws();
		draws.splice(3, 1);
		draws.push(runtimeDraw({ outputFrameIndex: 35, pixelHash: "duplicate" }));
		const evidence = verifyStickerRuntimeSequence({
			draws,
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source(),
		});
		expect(evidence.passed).toBe(false);
		expect(evidence.failures).toEqual(
			expect.arrayContaining([
				"Output frame 33 has 0 matching runtime draws; expected 1",
				"Output frame 35 has 2 matching runtime draws; expected 1",
			])
		);
	});

	test("rejects a timeline shorter than one source cycle", () => {
		const evidence = verifyStickerRuntimeSequence({
			draws: validDraws().slice(0, 3),
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source({ endFrame: 33 }),
		});
		expect(evidence.passed).toBe(false);
		expect(evidence.failures).toContain(
			"Runtime window is 0.1s; expected at least one 0.4s source cycle"
		);
	});

	test("accepts source frames that cannot all be sampled at the output rate", () => {
		const highRateDescriptor: DirectGifRuntimeDescriptor = {
			...DESCRIPTOR,
			cycleDurationSeconds: 0.04,
			frames: Array.from({ length: 4 }, (_, index) => ({
				...DESCRIPTOR.frames[0],
				delayCentiseconds: 1,
				durationSeconds: 0.01,
				startSeconds: index * 0.01,
			})),
		};
		const highRateSource = source({
			descriptor: highRateDescriptor,
			endFrame: 32,
			frameHashes: ["source-0", "source-1", "source-2", "source-3"],
		});
		const expectedRuntimeHashes = ["runtime-0", "runtime-3"];
		const evidence = verifyStickerRuntimeSequence({
			draws: expectedRuntimeHashes.map((pixelHash, offset) =>
				runtimeDraw({ outputFrameIndex: 30 + offset, pixelHash })
			),
			frameRate: 30,
			runtimeFrameHashes: ["runtime-0", "runtime-1", "runtime-2", "runtime-3"],
			source: highRateSource,
		});
		expect(evidence).toMatchObject({
			observedSourceVisualFrameCount: 2,
			outputRateReachableSourceVisualFrameCount: 2,
			passed: true,
			sourceVisualFrameCount: 4,
		});
	});

	test("rejects a stable sequence whose source frames are globally swapped", () => {
		const swappedDraws = validDraws().map((draw) => ({
			...draw,
			pixelHash:
				draw.pixelHash === "runtime-frame-a"
					? "runtime-frame-b"
					: "runtime-frame-a",
		}));
		const evidence = verifyStickerRuntimeSequence({
			draws: swappedDraws,
			frameRate: 30,
			runtimeFrameHashes: RUNTIME_FRAME_HASHES,
			source: source(),
		});
		expect(evidence.passed).toBe(false);
		expect(evidence.absoluteRuntimeHashMatchCount).toBe(0);
		expect(evidence.failures).toContain(
			"Output frame 30 drew runtime hash runtime-frame-b; expected runtime-frame-a"
		);
	});
});
