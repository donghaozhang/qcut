import { execFile } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath } from "../../ffmpeg/paths.js";
import type { FilterLabCube } from "./filter-lab-lut.js";

const CUBE_SIZE = 64;
const TILE_COLUMNS = 8;
const IMAGE_SIZE = CUBE_SIZE * TILE_COLUMNS;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface JianyingTiledLutRenderer {
	kind: "tiled-lut-8x8";
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
	relativePath: string;
	cubeSize: 64;
}

export interface JianyingDualTiledLutRenderer {
	kind: "dual-tiled-lut-8x8";
	background: JianyingTiledLutRenderer;
	skin: JianyingTiledLutRenderer;
}

export function createTiledLutId({
	resourceId,
	renderer,
}: {
	resourceId: string;
	renderer: JianyingTiledLutRenderer;
}): string {
	return `${resourceId}/${renderer.version}/${renderer.relativePath}`;
}

function safeRelativePath({ relativePath }: { relativePath: string }): boolean {
	return relativePath
		.split("/")
		.every((segment) => SAFE_SEGMENT.test(segment) && segment !== "..");
}

export function resolveTiledLutPath({
	cacheRoot,
	renderer,
}: {
	cacheRoot: string;
	renderer: JianyingTiledLutRenderer;
}): string {
	if (
		!SAFE_SEGMENT.test(renderer.packageIdentifier) ||
		!SAFE_SEGMENT.test(renderer.version) ||
		!safeRelativePath({ relativePath: renderer.relativePath })
	) {
		throw new Error("Invalid local tiled LUT renderer identity");
	}
	return join(
		cacheRoot,
		renderer.container,
		renderer.packageIdentifier,
		renderer.version,
		...renderer.relativePath.split("/")
	);
}

export function isSupportedTiledLutShader({
	source,
}: {
	source: string;
}): boolean {
	return (
		/blueColor\s*=\s*textureColor\.b\s*\*\s*63\.?/.test(source) &&
		/texture2D\s*\(\s*filterTex\s*,\s*texPos1\s*\)/.test(source) &&
		/texture2D\s*\(\s*filterTex\s*,\s*texPos2\s*\)/.test(source) &&
		/mix\s*\(\s*newColor1\s*,\s*newColor2\s*,\s*fract\s*\(\s*blueColor\s*\)\s*\)/.test(
			source
		)
	);
}

export function isSupportedDualTiledLutShader({
	source,
}: {
	source: string;
}): boolean {
	return (
		/uniform\s+sampler2D\s+u_mask\s*;/.test(source) &&
		/uniform\s+sampler2D\s+u_lut0\s*;/.test(source) &&
		/uniform\s+sampler2D\s+u_lut1\s*;/.test(source) &&
		/src\s*\*=\s*63\.?0*\s*;/.test(source) &&
		/texture2D\s*\(\s*lut\s*,/.test(source) &&
		/mix\s*\(\s*res0\s*,\s*res1\s*,\s*mask\.a\s*\)/.test(source)
	);
}

export async function isSupportedTiledLutImage({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		const handle = await open(filePath, "r");
		try {
			const header = Buffer.alloc(24);
			const { bytesRead } = await handle.read(header, 0, header.length, 0);
			return (
				bytesRead === header.length &&
				header.subarray(0, 8).equals(PNG_SIGNATURE) &&
				header.readUInt32BE(16) === IMAGE_SIZE &&
				header.readUInt32BE(20) === IMAGE_SIZE
			);
		} finally {
			await handle.close();
		}
	} catch {
		return false;
	}
}

export async function inspectTiledLutRenderer({
	container,
	identifier,
	version,
	root,
	paths,
}: {
	container: JianyingTiledLutRenderer["container"];
	identifier: string;
	version: string;
	root: string;
	paths: string[];
}): Promise<JianyingTiledLutRenderer | null> {
	const images = paths.filter((path) =>
		path.toLowerCase().endsWith("/image/filter.png")
	);
	const shaders = paths.filter((path) => {
		const normalized = path.toLowerCase();
		return normalized.endsWith(".frag") && !normalized.includes("/metal/");
	});
	if (images.length !== 1 || shaders.length !== 1) return null;
	const [source, validImage] = await Promise.all([
		readFile(join(root, shaders[0]), "utf8").catch(() => ""),
		isSupportedTiledLutImage({ filePath: join(root, images[0]) }),
	]);
	if (!validImage || !isSupportedTiledLutShader({ source })) return null;
	return {
		kind: "tiled-lut-8x8",
		container,
		packageIdentifier: identifier,
		version,
		relativePath: images[0],
		cubeSize: CUBE_SIZE,
	};
}

export async function inspectDualTiledLutRenderer({
	container,
	identifier,
	version,
	root,
	paths,
}: {
	container: JianyingTiledLutRenderer["container"];
	identifier: string;
	version: string;
	root: string;
	paths: string[];
}): Promise<JianyingDualTiledLutRenderer | null> {
	const backgroundImages = paths.filter((path) =>
		path.toLowerCase().endsWith("/image/filter_bg.png")
	);
	const skinImages = paths.filter((path) =>
		path.toLowerCase().endsWith("/image/filter_skin.png")
	);
	if (backgroundImages.length !== 1 || skinImages.length !== 1) return null;

	const shaderPaths = paths.filter((path) => {
		const normalized = path.toLowerCase();
		return normalized.endsWith(".frag") && !normalized.includes("/metal/");
	});
	const backgroundPath = backgroundImages[0];
	const skinPath = skinImages[0];
	const [validBackground, validSkin, shaderSources] = await Promise.all([
		isSupportedTiledLutImage({ filePath: join(root, backgroundPath) }),
		isSupportedTiledLutImage({ filePath: join(root, skinPath) }),
		Promise.all(
			shaderPaths.map((path) =>
				readFile(join(root, path), "utf8").catch(() => "")
			)
		),
	]);
	if (
		!validBackground ||
		!validSkin ||
		!shaderSources.some((source) => isSupportedDualTiledLutShader({ source }))
	) {
		return null;
	}

	const renderer = ({
		relativePath,
	}: {
		relativePath: string;
	}): JianyingTiledLutRenderer => ({
		kind: "tiled-lut-8x8" as const,
		container,
		packageIdentifier: identifier,
		version,
		relativePath,
		cubeSize: CUBE_SIZE,
	});
	return {
		kind: "dual-tiled-lut-8x8",
		background: renderer({ relativePath: backgroundPath }),
		skin: renderer({ relativePath: skinPath }),
	};
}

export function decodeTiledLutPixels({
	pixels,
}: {
	pixels: Uint8Array;
}): FilterLabCube | null {
	if (pixels.length !== IMAGE_SIZE * IMAGE_SIZE * 3) return null;
	const values = new Float64Array(CUBE_SIZE ** 3 * 3);
	let destination = 0;
	for (let blue = 0; blue < CUBE_SIZE; blue += 1) {
		const tileX = blue % TILE_COLUMNS;
		const tileY = Math.floor(blue / TILE_COLUMNS);
		for (let green = 0; green < CUBE_SIZE; green += 1) {
			for (let red = 0; red < CUBE_SIZE; red += 1) {
				const x = tileX * CUBE_SIZE + red;
				const y = tileY * CUBE_SIZE + green;
				const source = (y * IMAGE_SIZE + x) * 3;
				values[destination] = pixels[source] / 255;
				values[destination + 1] = pixels[source + 1] / 255;
				values[destination + 2] = pixels[source + 2] / 255;
				destination += 3;
			}
		}
	}
	return {
		size: CUBE_SIZE,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values,
	};
}

export async function loadTiledLutCube({
	filePath,
	ffmpegPath = getFFmpegPath(),
}: {
	filePath: string;
	ffmpegPath?: string;
}): Promise<FilterLabCube | null> {
	const run = promisify(execFile);
	try {
		const { stdout } = await run(
			ffmpegPath,
			[
				"-v",
				"error",
				"-i",
				filePath,
				"-frames:v",
				"1",
				"-pix_fmt",
				"rgb24",
				"-f",
				"rawvideo",
				"-",
			],
			{ encoding: "buffer", maxBuffer: 2 * 1024 * 1024 }
		);
		return decodeTiledLutPixels({ pixels: stdout });
	} catch {
		return null;
	}
}
