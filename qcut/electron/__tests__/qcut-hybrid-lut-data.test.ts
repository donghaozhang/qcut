// @vitest-environment node
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
	loadDualLutCube,
	loadDualTiledCube,
} from "../qcut-independent-filter/dual-lut-data.js";

async function withLutFile({
	text,
	check,
}: {
	text: string;
	check: (filePath: string) => Promise<void>;
}) {
	const root = await mkdtemp(join(tmpdir(), "qcut-text-dual-lut-"));
	try {
		const filePath = join(root, "filter_skin.3dl");
		await writeFile(filePath, text);
		await check(filePath);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe("dual LUT text assets", () => {
	it("transposes B-fastest Adobe rows and preserves twelve-bit output", async () => {
		const rows = Array.from({ length: 8 }, (_, i) =>
			[i & 4 ? 4095 : 17, i & 2 ? 4095 : 31, i & 1 ? 4095 : 63].join(" ")
		);
		await withLutFile({
			text: ["# Adobe LUT", "0 1023", ...rows].join("\n"),
			check: async (filePath) => {
				const cube = await loadDualLutCube({ filePath, format: "adobe-3dl" });
				expect(cube?.size).toBe(2);
				for (let i = 0; i < 8; i++) {
					const expected = [
						i & 1 ? 4095 : 17,
						i & 2 ? 4095 : 31,
						i & 4 ? 4095 : 63,
					];
					for (let channel = 0; channel < 3; channel++)
						expect(cube!.values[i * 3 + channel]).toBeCloseTo(
							expected[channel] / 4095,
							7
						);
				}
			},
		});
	});
	it.each([
		["0 1000\n", "input grid"],
		["0 1023\n0 0 0\n", "Incomplete"],
		["0 1023\n" + "4096 0 0\n".repeat(8), "output row"],
	])("rejects malformed text %s", async (text, message) => {
		await withLutFile({
			text,
			check: async (filePath) => {
				await expect(
					loadDualLutCube({ filePath, format: "adobe-3dl" })
				).rejects.toThrow(message);
			},
		});
	});
	it("rejects oversized files before decoding", async () => {
		await withLutFile({
			text: "",
			check: async (filePath) => {
				await truncate(filePath, 16 * 1024 * 1024 + 1);
				await expect(
					loadDualLutCube({ filePath, format: "adobe-3dl" })
				).rejects.toThrow("size limit");
			},
		});
	});
	it("does not substitute a cube when the file is missing", async () => {
		await withLutFile({
			text: "",
			check: async (filePath) => {
				await rm(filePath);
				await expect(
					loadDualLutCube({ filePath, format: "adobe-3dl" })
				).rejects.toThrow("ENOENT");
			},
		});
	});
});

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
