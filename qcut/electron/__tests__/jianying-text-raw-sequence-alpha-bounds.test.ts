import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { measureJianyingTextRawSequenceAlphaBounds } from "../jianying-text-runtime/raw-sequence-alpha-bounds.js";

const directories: string[] = [];

function frame({
	width,
	height,
	opaquePixels,
}: {
	width: number;
	height: number;
	opaquePixels: Array<{ x: number; y: number }>;
}) {
	const bytes = Buffer.alloc(width * height * 4);
	for (const { x, y } of opaquePixels) {
		bytes[(y * width + x) * 4 + 3] = 255;
	}
	return bytes;
}

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text raw sequence alpha bounds", () => {
	it("unions visible pixels across every animation frame", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-bounds-"));
		directories.push(directory);
		const rawPath = path.join(directory, "frames.rgba");
		await writeFile(
			rawPath,
			Buffer.concat([
				frame({ width: 5, height: 4, opaquePixels: [{ x: 3, y: 1 }] }),
				frame({ width: 5, height: 4, opaquePixels: [{ x: 1, y: 3 }] }),
			])
		);

		await expect(
			measureJianyingTextRawSequenceAlphaBounds({
				rawPath,
				width: 5,
				height: 4,
				frameCount: 2,
			})
		).resolves.toEqual({ x: 1, y: 1, width: 3, height: 3 });
	});

	it("returns null for a fully transparent animation", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-bounds-"));
		directories.push(directory);
		const rawPath = path.join(directory, "frames.rgba");
		await writeFile(rawPath, Buffer.alloc(3 * 2 * 4));

		await expect(
			measureJianyingTextRawSequenceAlphaBounds({
				rawPath,
				width: 3,
				height: 2,
				frameCount: 1,
			})
		).resolves.toBeNull();
	});

	it("rejects a truncated sequence instead of trusting partial bounds", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-bounds-"));
		directories.push(directory);
		const rawPath = path.join(directory, "frames.rgba");
		await writeFile(rawPath, Buffer.alloc(11));

		await expect(
			measureJianyingTextRawSequenceAlphaBounds({
				rawPath,
				width: 2,
				height: 2,
				frameCount: 1,
			})
		).rejects.toThrow("raw sequence size mismatch");
	});
});
