// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	decodeTiledLutPixels,
	isSupportedTiledLutImage,
	isSupportedTiledLutShader,
	resolveTiledLutPath,
} from "../native-pipeline/filters/filter-lab-tiled-lut.js";
import { sampleCube } from "../native-pipeline/filters/filter-lab-lut.js";

const IMAGE_SIZE = 512;
const CUBE_SIZE = 64;

function createIdentityTiledPixels(): Uint8Array {
	const pixels = new Uint8Array(IMAGE_SIZE * IMAGE_SIZE * 3);
	for (let blue = 0; blue < CUBE_SIZE; blue += 1) {
		for (let green = 0; green < CUBE_SIZE; green += 1) {
			for (let red = 0; red < CUBE_SIZE; red += 1) {
				const x = (blue % 8) * CUBE_SIZE + red;
				const y = Math.floor(blue / 8) * CUBE_SIZE + green;
				const offset = (y * IMAGE_SIZE + x) * 3;
				pixels[offset] = Math.round((red / 63) * 255);
				pixels[offset + 1] = Math.round((green / 63) * 255);
				pixels[offset + 2] = Math.round((blue / 63) * 255);
			}
		}
	}
	return pixels;
}

function createPngHeader({ width = 512, height = 512 } = {}): Buffer {
	const header = Buffer.alloc(24);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
	header.write("IHDR", 12, "ascii");
	header.writeUInt32BE(width, 16);
	header.writeUInt32BE(height, 20);
	return header;
}

describe("Jianying tiled LUT renderer", () => {
	it("recognizes the deterministic single-pass 8x8 LUT shader", () => {
		const source = `
			float blueColor = textureColor.b * 63.;
			vec4 newColor1 = texture2D(filterTex, texPos1);
			vec4 newColor2 = texture2D(filterTex, texPos2);
			vec4 newColor = mix(newColor1, newColor2, fract(blueColor));
		`;
		expect(isSupportedTiledLutShader({ source })).toBe(true);
		expect(
			isSupportedTiledLutShader({ source: "blur(inputImageTexture)" })
		).toBe(false);
	});

	it("decodes red-fastest cube values from the 8x8 tile layout", () => {
		const cube = decodeTiledLutPixels({ pixels: createIdentityTiledPixels() });
		expect(cube?.size).toBe(64);
		expect(sampleCube({ cube: cube!, red: 1, green: 0, blue: 0 })).toEqual([
			1, 0, 0,
		]);
		expect(sampleCube({ cube: cube!, red: 0, green: 1, blue: 1 })).toEqual([
			0, 1, 1,
		]);
	});

	it("requires an exact 512px PNG and keeps package paths rooted", async () => {
		const directory = await mkdtemp(join(tmpdir(), "qcut-tiled-lut-"));
		try {
			const validPath = join(directory, "valid.png");
			const invalidPath = join(directory, "invalid.png");
			await Promise.all([
				writeFile(validPath, createPngHeader()),
				writeFile(invalidPath, createPngHeader({ width: 256 })),
			]);
			expect(await isSupportedTiledLutImage({ filePath: validPath })).toBe(
				true
			);
			expect(await isSupportedTiledLutImage({ filePath: invalidPath })).toBe(
				false
			);
			expect(
				resolveTiledLutPath({
					cacheRoot: "/cache",
					renderer: {
						kind: "tiled-lut-8x8",
						container: "artistEffect",
						packageIdentifier: "filter-id",
						version: "v1",
						relativePath: "AmazingFeature/image/filter.png",
						cubeSize: 64,
					},
				})
			).toBe(
				"/cache/artistEffect/filter-id/v1/AmazingFeature/image/filter.png"
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
