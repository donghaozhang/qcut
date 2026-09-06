// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { loadDualTiledCube } from "../qcut-independent-filter/dual-lut-data.js";

describe("dual LUT image signatures", () => {
	it("decodes JPEG bytes behind a png extension with image chroma reconstruction", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-jpeg-lut-"));
		try {
			const canvas = createCanvas(512, 512);
			const context = canvas.getContext("2d");
			for (let i = 0; i < 512; i++) {
				context.fillStyle = i % 2 ? "#b14281" : "#32a487";
				context.fillRect(i, 0, 1, 512);
			}
			const jpeg = canvas.toBuffer("image/jpeg", 85);
			const filePath = join(root, "filter_bg.png");
			await writeFile(filePath, jpeg);
			const image = await loadImage(jpeg);
			context.drawImage(image, 0, 0);
			const expected = context.getImageData(0, 0, 512, 512).data;
			const cube = await loadDualTiledCube({ filePath });
			expect(cube?.size).toBe(64);
			for (let r = 0; r < 64; r++) {
				for (let channel = 0; channel < 3; channel++)
					expect(cube!.values[r * 3 + channel]).toBeCloseTo(
						expected[r * 4 + channel] / 255,
						6
					);
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("rejects JPEG images with non-LUT dimensions", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-bad-lut-"));
		try {
			const filePath = join(root, "filter_bg.png");
			await writeFile(filePath, createCanvas(64, 64).toBuffer("image/jpeg"));
			await expect(loadDualTiledCube({ filePath })).rejects.toThrow(
				"dimensions"
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
