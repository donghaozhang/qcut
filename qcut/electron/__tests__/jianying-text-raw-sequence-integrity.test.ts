import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	findTransparentRgbaFrameIndices,
	repairTransientTransparentRgbaFrames,
} from "../jianying-text-runtime/raw-sequence-integrity.js";

const WIDTH = 2;
const HEIGHT = 1;

function frame({ visible = true }: { visible?: boolean } = {}) {
	return visible
		? Buffer.from([10, 20, 30, 255, 40, 50, 60, 128])
		: Buffer.alloc(WIDTH * HEIGHT * 4);
}

async function withSequence({
	frames,
	run,
}: {
	frames: Buffer[];
	run: (rawPath: string) => Promise<void>;
}) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-raw-sequence-"));
	const rawPath = path.join(directory, "frames.rgba");
	try {
		await writeFile(rawPath, Buffer.concat(frames));
		await run(rawPath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

describe("Jianying raw sequence integrity", () => {
	it("repairs an isolated transparent frame when a single-frame retry is visible", async () => {
		await withSequence({
			frames: [frame(), frame(), frame({ visible: false }), frame(), frame()],
			run: async (rawPath) => {
				const retryFrame = Buffer.from([70, 80, 90, 255, 100, 110, 120, 255]);
				const renderFrame = vi.fn(
					async ({ outputPath }: { outputPath: string }) => {
						await writeFile(outputPath, retryFrame);
					}
				);
				const result = await repairTransientTransparentRgbaFrames({
					rawPath,
					width: WIDTH,
					height: HEIGHT,
					frameCount: 5,
					renderFrame,
				});
				expect(result).toEqual({
					transparentFrameIndices: [2],
					candidateFrameIndices: [2],
					repairedFrameIndices: [2],
				});
				expect(renderFrame).toHaveBeenCalledWith({
					frameIndex: 2,
					outputPath: `${rawPath}.retry-2.rgba`,
				});
				const repaired = await readFile(rawPath);
				expect(repaired.subarray(16, 24)).toEqual(retryFrame);
			},
		});
	});

	it("preserves an intentional transparent frame when its retry is also transparent", async () => {
		await withSequence({
			frames: [frame(), frame({ visible: false }), frame()],
			run: async (rawPath) => {
				const renderFrame = vi.fn(
					async ({ outputPath }: { outputPath: string }) => {
						await writeFile(outputPath, frame({ visible: false }));
					}
				);
				const result = await repairTransientTransparentRgbaFrames({
					rawPath,
					width: WIDTH,
					height: HEIGHT,
					frameCount: 3,
					renderFrame,
				});
				expect(result.repairedFrameIndices).toEqual([]);
				expect(
					await findTransparentRgbaFrameIndices({
						rawPath,
						width: WIDTH,
						height: HEIGHT,
						frameCount: 3,
					})
				).toEqual([1]);
			},
		});
	});

	it("does not retry boundary frames or a long transparent run", async () => {
		await withSequence({
			frames: [
				frame({ visible: false }),
				frame(),
				frame({ visible: false }),
				frame({ visible: false }),
				frame({ visible: false }),
				frame({ visible: false }),
				frame(),
				frame({ visible: false }),
			],
			run: async (rawPath) => {
				const renderFrame = vi.fn(async () => undefined);
				const result = await repairTransientTransparentRgbaFrames({
					rawPath,
					width: WIDTH,
					height: HEIGHT,
					frameCount: 8,
					renderFrame,
				});
				expect(result.candidateFrameIndices).toEqual([]);
				expect(renderFrame).not.toHaveBeenCalled();
			},
		});
	});

	it("rejects a raw sequence with an incomplete frame", async () => {
		await withSequence({
			frames: [frame(), Buffer.alloc(3)],
			run: async (rawPath) => {
				await expect(
					findTransparentRgbaFrameIndices({
						rawPath,
						width: WIDTH,
						height: HEIGHT,
						frameCount: 2,
					})
				).rejects.toThrow("expected 16");
			},
		});
	});
});
