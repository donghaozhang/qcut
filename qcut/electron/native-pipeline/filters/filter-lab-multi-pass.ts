import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JianyingFilterMultiPassKind } from "../../jianying-filter-lab-contract.js";
import type { FilterLabCube } from "./filter-lab-lut.js";
import {
	isSupportedTiledLutImage,
	loadTiledLutCube,
} from "./filter-lab-tiled-lut.js";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const SIGNAL_SUFFIXES = [".lua", ".material", ".scene", ".xshader"];

export interface JianyingFilterMultiPassRenderer {
	kind: JianyingFilterMultiPassKind;
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
	lutRelativePath: string;
	passCount: number;
	fidelity: "structural";
}

export type FilterLabMultiPassOperation =
	| { kind: "sharpen"; amount: number }
	| { kind: "bilateral-blur"; radius: number; threshold: number }
	| { kind: "fog-blend"; radius: number; amount: number }
	| { kind: "vignette"; amount: number; softness: number }
	| { kind: "lut"; cube: FilterLabCube; intensity: number };

export interface FilterLabMultiPassRecipe {
	kind: JianyingFilterMultiPassKind;
	passes: FilterLabMultiPassOperation[];
}

function hasPaths({
	paths,
	required,
}: {
	paths: string[];
	required: string[];
}) {
	const normalized = new Set(paths.map((path) => path.toLowerCase()));
	return required.every((path) => normalized.has(path.toLowerCase()));
}

export function detectJianyingMultiPassTopology({
	paths,
	signals,
}: {
	paths: string[];
	signals: string;
}): {
	kind: JianyingFilterMultiPassKind;
	lutRelativePath: string;
	passCount: number;
} | null {
	if (
		hasPaths({
			paths,
			required: [
				"AmazingFeature/xshader/pass0.xshader",
				"AmazingFeature/xshader/filter.xshader",
				"AmazingFeature/material/pass0.material",
				"AmazingFeature/material/filter.material",
				"AmazingFeature/image/filter.png",
			],
		}) &&
		/u_sharpness/.test(signals) &&
		/midRenderTex0\.rt/.test(signals)
	) {
		return {
			kind: "sharpen-lut",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 2,
		};
	}

	if (
		hasPaths({
			paths,
			required: [
				"AmazingFeature/xshader/pass0.xshader",
				"AmazingFeature/xshader/pass1.xshader",
				"AmazingFeature/xshader/pass2.xshader",
				"AmazingFeature/xshader/filter.xshader",
				"AmazingFeature/image/filter.png",
			],
		}) &&
		/blurSize/.test(signals) &&
		/blurImageTexture/.test(signals) &&
		/1\.0\s*-\s*\(\s*intensity\s*\*\s*0\.50\s*\)/.test(signals)
	) {
		return {
			kind: "fog-lut",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 4,
		};
	}

	if (
		hasPaths({
			paths,
			required: [
				"AmazingFeature/xshader/filter.frag",
				"AmazingFeature/xshader/blur.frag",
				"AmazingFeature/xshader/corner.frag",
				"AmazingFeature/image/lut0.png",
				"AmazingFeature/image/src1.png",
			],
		}) &&
		/u_opacity/.test(signals) &&
		/BLUR_SIZE\s*=\s*0\.31/.test(signals) &&
		/BLUR\s*=\s*0\.19/.test(signals) &&
		/CORNER\s*=\s*1/.test(signals)
	) {
		return {
			kind: "vignette-lut",
			lutRelativePath: "AmazingFeature/image/lut0.png",
			passCount: 3,
		};
	}

	return null;
}

async function readPackageSignals({
	root,
	paths,
}: {
	root: string;
	paths: string[];
}): Promise<string> {
	const signalPaths = paths.filter((path) =>
		SIGNAL_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))
	);
	const chunks = await Promise.all(
		signalPaths.map((path) =>
			readFile(join(root, path))
				.then((buffer) => buffer.toString("latin1"))
				.catch(() => "")
		)
	);
	return chunks.join("\n");
}

export async function inspectJianyingMultiPassRenderer({
	container,
	identifier,
	version,
	root,
	paths,
}: {
	container: JianyingFilterMultiPassRenderer["container"];
	identifier: string;
	version: string;
	root: string;
	paths: string[];
}): Promise<JianyingFilterMultiPassRenderer | null> {
	const topology = detectJianyingMultiPassTopology({
		paths,
		signals: await readPackageSignals({ root, paths }),
	});
	if (!topology) return null;
	const validLut = await isSupportedTiledLutImage({
		filePath: join(root, topology.lutRelativePath),
	});
	if (!validLut) return null;
	return {
		...topology,
		container,
		packageIdentifier: identifier,
		version,
		fidelity: "structural",
	};
}

function safeRelativePath({ relativePath }: { relativePath: string }): boolean {
	return relativePath
		.split("/")
		.every((segment) => SAFE_SEGMENT.test(segment) && segment !== "..");
}

export function resolveMultiPassLutPath({
	cacheRoot,
	renderer,
}: {
	cacheRoot: string;
	renderer: JianyingFilterMultiPassRenderer;
}): string {
	if (
		!SAFE_SEGMENT.test(renderer.packageIdentifier) ||
		!SAFE_SEGMENT.test(renderer.version) ||
		!safeRelativePath({ relativePath: renderer.lutRelativePath })
	) {
		throw new Error("Invalid local multi-pass renderer identity");
	}
	return join(
		cacheRoot,
		renderer.container,
		renderer.packageIdentifier,
		renderer.version,
		...renderer.lutRelativePath.split("/")
	);
}

function operationsForRenderer({
	renderer,
	cube,
}: {
	renderer: JianyingFilterMultiPassRenderer;
	cube: FilterLabCube;
}): FilterLabMultiPassOperation[] {
	if (renderer.kind === "sharpen-lut") {
		return [
			{ kind: "sharpen", amount: 1 },
			{ kind: "lut", cube, intensity: 100 },
		];
	}
	if (renderer.kind === "vignette-lut") {
		return [
			{ kind: "lut", cube, intensity: 100 },
			{ kind: "bilateral-blur", radius: 1.52, threshold: 7.75 },
			{ kind: "vignette", amount: 100, softness: 65 },
		];
	}
	return [
		{ kind: "fog-blend", radius: 3.6, amount: 50 },
		{ kind: "lut", cube, intensity: 100 },
	];
}

export async function loadJianyingMultiPassRecipe({
	cacheRoot,
	renderer,
	loadCube = ({ filePath }) => loadTiledLutCube({ filePath }),
}: {
	cacheRoot: string;
	renderer: JianyingFilterMultiPassRenderer;
	loadCube?: ({
		filePath,
	}: {
		filePath: string;
	}) => Promise<FilterLabCube | null>;
}): Promise<FilterLabMultiPassRecipe | null> {
	const cube = await loadCube({
		filePath: resolveMultiPassLutPath({ cacheRoot, renderer }),
	});
	if (!cube) return null;
	return {
		kind: renderer.kind,
		passes: operationsForRenderer({ renderer, cube }),
	};
}
