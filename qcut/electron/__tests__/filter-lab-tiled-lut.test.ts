// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	decodeTiledLutPixels,
	inspectDualTiledLutRenderer,
	isSupportedDualTiledLutShader,
	isSupportedTiledLutImage,
	isSupportedTiledLutShader,
	resolveTiledLutPath,
} from "../native-pipeline/filters/filter-lab-tiled-lut.js";
import { sampleCube } from "../native-pipeline/filters/filter-lab-lut.js";

const IMAGE_SIZE = 512;
const CUBE_SIZE = 64;

const NATIVE_SKIN_SEG_DUAL_LUT_SHADER = `
	precision highp float;
	varying vec2 uv0;
	uniform sampler2D inputImageTexture;
	uniform sampler2D filterBgTexture;
	uniform sampler2D filterSkinTexture;
	uniform sampler2D maskTexture;
	uniform float intensity;
	vec4 lm_take_effect_filter(sampler2D filterTex, vec4 inputColor, float uniAlpha) {
		vec4 textureColor = inputColor;
		float blueColor = textureColor.b * 63.;
		vec2 texPos1;
		vec2 texPos2;
		vec4 newColor1 = texture2D(filterTex, texPos1);
		vec4 newColor2 = texture2D(filterTex, texPos2);
		vec4 newColor = mix(newColor1, newColor2, fract(blueColor));
		return mix(textureColor, vec4(newColor.rgb, textureColor.w), uniAlpha);
	}
	void main() {
		vec2 maskCoord = vec2(uv0.x, 1.0 - uv0.y);
		float mask = texture2D(maskTexture, maskCoord).a;
		vec4 color = texture2D(inputImageTexture, uv0);
		float bgBaseIntensity = 0.8;
		float skinBaseIntensity = 0.6;
		vec4 bgResultColor = lm_take_effect_filter(filterBgTexture, color, intensity * bgBaseIntensity);
		vec4 skinResultColor = lm_take_effect_filter(filterSkinTexture, color, intensity * skinBaseIntensity);
		gl_FragColor = mix(bgResultColor, skinResultColor, mask);
	}
`;

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

	it("recognizes a dual tiled LUT mixed by a skin mask", () => {
		const source = `
			uniform sampler2D u_mask;
			uniform sampler2D u_lut0;
			uniform sampler2D u_lut1;
			vec3 lut8x8(sampler2D lut, vec3 src) {
				src *= 63.0;
				return texture2D(lut, src.xy).rgb;
			}
			vec4 res0;
			vec4 res1;
			vec4 mask;
			vec4 result = mix(res0, res1, mask.a);
		`;
		expect(isSupportedDualTiledLutShader({ source })).toBe(true);
		expect(
			isSupportedDualTiledLutShader({
				source: source.replace("mask.a", "0.5"),
			})
		).toBe(false);
	});

	it("recognizes the native skin-seg dual LUT shader without accepting a global mix", () => {
		expect(
			isSupportedDualTiledLutShader({
				source: NATIVE_SKIN_SEG_DUAL_LUT_SHADER,
			})
		).toBe(true);
		expect(
			isSupportedDualTiledLutShader({
				source: NATIVE_SKIN_SEG_DUAL_LUT_SHADER.replace(
					"texture2D(maskTexture, maskCoord).a",
					"0.5"
				),
			})
		).toBe(false);
	});

	it("requires a skin-seg graph and Lua mask binding for the native shader family", async () => {
		const directory = await mkdtemp(join(tmpdir(), "qcut-dual-skin-seg-"));
		try {
			const imageDirectory = join(directory, "AmazingFeature", "image");
			const shaderDirectory = join(directory, "AmazingFeature", "xshader");
			const luaDirectory = join(directory, "AmazingFeature", "lua");
			await Promise.all([
				mkdir(imageDirectory, { recursive: true }),
				mkdir(shaderDirectory, { recursive: true }),
				mkdir(luaDirectory, { recursive: true }),
			]);
			const paths = [
				"algorithmConfig.json",
				"AmazingFeature/image/filter_bg.png",
				"AmazingFeature/image/filter_skin.png",
				"AmazingFeature/xshader/quad.frag",
				"AmazingFeature/lua/TempScriptLua.lua",
			];
			await Promise.all([
				writeFile(
					join(directory, paths[0]),
					JSON.stringify({ nodes: [{ type: "skin_seg" }] })
				),
				writeFile(join(directory, paths[1]), createPngHeader()),
				writeFile(join(directory, paths[2]), createPngHeader()),
				writeFile(join(directory, paths[3]), NATIVE_SKIN_SEG_DUAL_LUT_SHADER),
				writeFile(
					join(directory, paths[4]),
					`local segInfo = result:getSkinSegInfo()
					local mask = segInfo.data
					local tex = material:getTex("maskTexture")
					tex:storage(mask)
					material:setFloat("intensity", intensity)`
				),
			]);
			const inspect = () =>
				inspectDualTiledLutRenderer({
					container: "artistEffect",
					identifier: "dual-filter",
					version: "v1",
					root: directory,
					paths,
				});
			await expect(inspect()).resolves.toMatchObject({
				kind: "dual-tiled-lut-8x8",
			});
			await writeFile(
				join(directory, paths[4]),
				'material:setFloat("intensity", intensity)'
			);
			await expect(inspect()).resolves.toBeNull();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
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
				// join keeps the expectation correct under Windows separators.
				join(
					"/cache",
					"artistEffect",
					"filter-id",
					"v1",
					"AmazingFeature",
					"image",
					"filter.png"
				)
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
