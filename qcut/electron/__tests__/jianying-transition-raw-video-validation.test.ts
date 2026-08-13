import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	findFirstInvalidRawFrame,
	findIntentionalRawBlackFrameRun,
	rawFrameHasVisibleColor,
	repairIsolatedRawOutputFrame,
	repairIsolatedRawTransitionBoundary,
} from "../jianying-transition/raw-video-validation.js";

const FRAME_BYTES = 16;
const temporaryDirectories: string[] = [];

function makeFrame({
	alpha = 255,
	color = 32,
}: {
	alpha?: number;
	color?: number;
} = {}) {
	const frame = Buffer.alloc(FRAME_BYTES, 0);
	for (let index = 0; index < frame.length; index += 4) {
		frame[index] = color;
		frame[index + 1] = color;
		frame[index + 2] = color;
		frame[index + 3] = alpha;
	}
	return frame;
}

async function writeRawFrames({ frames }: { frames: Buffer[] }) {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-raw-validation-")
	);
	temporaryDirectories.push(directory);
	const rawPath = path.join(directory, "frames.rgba");
	await writeFile(rawPath, Buffer.concat(frames));
	return rawPath;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("findFirstInvalidRawFrame", () => {
	it("accepts an opaque transition window without scanning adjacent frames", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ alpha: 0 }),
				makeFrame(),
				makeFrame(),
				makeFrame({ alpha: 0 }),
			],
		});

		await expect(
			findFirstInvalidRawFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				startFrame: 1,
				frameCount: 2,
			})
		).resolves.toBeNull();
	});

	it("accepts non-opaque effect pixels when their RGB output is visible", async () => {
		const translucentFrame = makeFrame();
		translucentFrame[7] = 0;
		const rawPath = await writeRawFrames({
			frames: [makeFrame(), makeFrame(), translucentFrame, makeFrame()],
		});

		await expect(
			findFirstInvalidRawFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				startFrame: 1,
				frameCount: 3,
			})
		).resolves.toBeNull();
	});

	it("skips the remaining bytes after finding visible frame color", async () => {
		const largeFrameBytes = 2 * 1024 * 1024;
		const visibleFrame = Buffer.alloc(largeFrameBytes);
		visibleFrame[0] = 32;
		const rawPath = await writeRawFrames({
			frames: [visibleFrame, Buffer.alloc(largeFrameBytes)],
		});

		await expect(
			findFirstInvalidRawFrame({
				rawPath,
				frameBytes: largeFrameBytes,
				startFrame: 0,
				frameCount: 2,
			})
		).resolves.toEqual({ frame: 1, reason: "empty" });
	});

	it("finds an opaque frame whose RGB channels are all empty", async () => {
		const rawPath = await writeRawFrames({
			frames: [makeFrame(), makeFrame({ color: 0 }), makeFrame()],
		});

		await expect(
			findFirstInvalidRawFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				startFrame: 0,
				frameCount: 3,
			})
		).resolves.toEqual({ frame: 1, reason: "empty" });
	});

	it("rejects a transition window that extends past the raw stream", async () => {
		const rawPath = await writeRawFrames({ frames: [makeFrame()] });

		await expect(
			findFirstInvalidRawFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				startFrame: 0,
				frameCount: 2,
			})
		).rejects.toThrow("ended unexpectedly");
	});
});

describe("rawFrameHasVisibleColor", () => {
	it("distinguishes a black source frame from a visible source frame", async () => {
		const rawPath = await writeRawFrames({
			frames: [makeFrame({ color: 0 }), makeFrame()],
		});

		await expect(
			rawFrameHasVisibleColor({ rawPath, frameBytes: FRAME_BYTES, frame: 0 })
		).resolves.toBe(false);
		await expect(
			rawFrameHasVisibleColor({ rawPath, frameBytes: FRAME_BYTES, frame: 1 })
		).resolves.toBe(true);
	});
});

describe("findIntentionalRawBlackFrameRun", () => {
	it("accepts a bounded black hold between a fade-out and fade-in", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ color: 90 }),
				makeFrame({ color: 45 }),
				makeFrame({ color: 15 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 10 }),
				makeFrame({ color: 35 }),
				makeFrame({ color: 70 }),
				makeFrame({ color: 90 }),
				makeFrame({ color: 90 }),
				makeFrame({ color: 90 }),
			],
		});

		await expect(
			findIntentionalRawBlackFrameRun({
				rawPath,
				frameBytes: FRAME_BYTES,
				firstEmptyFrame: 3,
				windowStartFrame: 0,
				windowEndFrame: 12,
			})
		).resolves.toEqual({ startFrame: 3, endFrameExclusive: 6 });
	});

	it("rejects an isolated empty frame", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ color: 90 }),
				makeFrame({ color: 45 }),
				makeFrame({ color: 15 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 10 }),
				makeFrame({ color: 35 }),
				makeFrame({ color: 70 }),
				makeFrame({ color: 90 }),
			],
		});

		await expect(
			findIntentionalRawBlackFrameRun({
				rawPath,
				frameBytes: FRAME_BYTES,
				firstEmptyFrame: 3,
				windowStartFrame: 0,
				windowEndFrame: 8,
			})
		).resolves.toBeNull();
	});

	it("rejects consecutive empty frames without fade evidence", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
				makeFrame({ color: 60 }),
			],
		});

		await expect(
			findIntentionalRawBlackFrameRun({
				rawPath,
				frameBytes: FRAME_BYTES,
				firstEmptyFrame: 3,
				windowStartFrame: 0,
				windowEndFrame: 10,
			})
		).resolves.toBeNull();
	});
});

describe("repairIsolatedRawOutputFrame", () => {
	it("interpolates one empty frame between visible transition frames", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ color: 20 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 80 }),
			],
		});

		await expect(
			repairIsolatedRawOutputFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				frame: 1,
				frameCount: 3,
			})
		).resolves.toBe(true);
		const repaired = (await readFile(rawPath)).subarray(
			FRAME_BYTES,
			FRAME_BYTES * 2
		);
		expect(repaired).toEqual(makeFrame({ color: 50 }));
	});

	it("preserves consecutive empty output frames", async () => {
		const rawPath = await writeRawFrames({
			frames: [
				makeFrame({ color: 20 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 0 }),
				makeFrame({ color: 80 }),
			],
		});

		await expect(
			repairIsolatedRawOutputFrame({
				rawPath,
				frameBytes: FRAME_BYTES,
				frame: 1,
				frameCount: 4,
			})
		).resolves.toBe(false);
	});
});

describe("repairIsolatedRawTransitionBoundary", () => {
	it("replaces an isolated empty outgoing boundary frame", async () => {
		const previousA = makeFrame({ color: 20 });
		const firstB = makeFrame({ color: 80 });
		const rawInputA = await writeRawFrames({
			frames: [previousA, makeFrame({ color: 0 })],
		});
		const rawInputB = await writeRawFrames({
			frames: [firstB, makeFrame({ color: 90 })],
		});

		await expect(
			repairIsolatedRawTransitionBoundary({
				rawInputA,
				rawInputB,
				frameBytes: FRAME_BYTES,
				inputAFrameCount: 2,
				inputBFrameCount: 2,
			})
		).resolves.toEqual({ inputARepaired: true, inputBRepaired: false });
		const repairedA = await readFile(rawInputA);
		expect(repairedA.subarray(FRAME_BYTES)).toEqual(previousA);
	});

	it("replaces an isolated empty incoming boundary frame", async () => {
		const nextB = makeFrame({ color: 90 });
		const rawInputA = await writeRawFrames({
			frames: [makeFrame({ color: 20 }), makeFrame({ color: 40 })],
		});
		const rawInputB = await writeRawFrames({
			frames: [makeFrame({ color: 0 }), nextB],
		});

		await expect(
			repairIsolatedRawTransitionBoundary({
				rawInputA,
				rawInputB,
				frameBytes: FRAME_BYTES,
				inputAFrameCount: 2,
				inputBFrameCount: 2,
			})
		).resolves.toEqual({ inputARepaired: false, inputBRepaired: true });
		const repairedB = await readFile(rawInputB);
		expect(repairedB.subarray(0, FRAME_BYTES)).toEqual(nextB);
	});

	it("preserves a continuous black boundary", async () => {
		const blackFrame = makeFrame({ color: 0 });
		const rawInputA = await writeRawFrames({
			frames: [blackFrame, blackFrame],
		});
		const rawInputB = await writeRawFrames({
			frames: [blackFrame, makeFrame()],
		});

		await expect(
			repairIsolatedRawTransitionBoundary({
				rawInputA,
				rawInputB,
				frameBytes: FRAME_BYTES,
				inputAFrameCount: 2,
				inputBFrameCount: 2,
			})
		).resolves.toEqual({ inputARepaired: false, inputBRepaired: false });
	});
});
