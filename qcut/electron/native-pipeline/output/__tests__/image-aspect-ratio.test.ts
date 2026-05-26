import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { cropImageToAspectRatio } from "../image-aspect-ratio.js";

async function makeTempPng({
	width,
	height,
}: {
	width: number;
	height: number;
}) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qcut-ratio-"));
	const filePath = path.join(dir, "image.png");
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#66aaff";
	ctx.fillRect(0, 0, width, height);
	await fs.writeFile(filePath, canvas.toBuffer("image/png"));
	return { dir, filePath };
}

describe("cropImageToAspectRatio", () => {
	it("crops GPT Image landscape output to exact 16:9 without upscaling", async () => {
		const { dir, filePath } = await makeTempPng({ width: 1536, height: 1024 });
		try {
			const result = await cropImageToAspectRatio({
				filePath,
				aspectRatio: "16:9",
			});
			const cropped = await loadImage(filePath);

			expect(result.changed).toBe(true);
			expect(cropped.width).toBe(1536);
			expect(cropped.height).toBe(864);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("crops GPT Image portrait output to exact 9:16 without upscaling", async () => {
		const { dir, filePath } = await makeTempPng({ width: 1024, height: 1536 });
		try {
			const result = await cropImageToAspectRatio({
				filePath,
				aspectRatio: "9:16",
			});
			const cropped = await loadImage(filePath);

			expect(result.changed).toBe(true);
			expect(cropped.width).toBe(864);
			expect(cropped.height).toBe(1536);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("leaves already matching images unchanged", async () => {
		const { dir, filePath } = await makeTempPng({ width: 1600, height: 900 });
		try {
			const result = await cropImageToAspectRatio({
				filePath,
				aspectRatio: "16:9",
			});
			const cropped = await loadImage(filePath);

			expect(result.changed).toBe(false);
			expect(cropped.width).toBe(1600);
			expect(cropped.height).toBe(900);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});
