import { readFile, stat } from "node:fs/promises";
import { basename, join, posix } from "node:path";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_INSPECTED_TEXT_BYTES = 1024 * 1024;

function isSafeSegment({ value }: { value: string }): boolean {
	return SAFE_SEGMENT.test(value) && value !== "." && value !== "..";
}

export const JIANYING_NATIVE_FACE_REGION_PROFILES = [
	{ resourceId: "7127674287238008078", title: "焕肤" },
	{ resourceId: "7127671519450303775", title: "裸粉" },
	{ resourceId: "7127666004477414687", title: "净透" },
] as const;

export interface JianyingNativeFaceRegionRenderer {
	kind: "native-face-region-effect";
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
	region: "lips";
	backgroundLutRelativePath: string;
	regionLutRelativePath: string;
	maskRelativePath: string;
	requiresFlippedInputRoundTrip: true;
}

function pathByBasename({
	paths,
	name,
}: {
	paths: string[];
	name: string;
}): string | undefined {
	const normalizedName = name.toLowerCase();
	return paths.find(
		(filePath) => basename(filePath).toLowerCase() === normalizedName
	);
}

function featureRootForTexture({ filePath }: { filePath: string }): string {
	return posix.dirname(posix.dirname(filePath));
}

function isInsideFeatureRoot({
	filePath,
	featureRoot,
}: {
	filePath: string;
	featureRoot: string;
}): boolean {
	return filePath.startsWith(featureRoot ? `${featureRoot}/` : "");
}

async function readSmallText({
	root,
	relativePath,
}: {
	root: string;
	relativePath: string;
}): Promise<string | null> {
	try {
		const filePath = join(root, relativePath);
		const metadata = await stat(filePath);
		if (!metadata.isFile() || metadata.size > MAX_INSPECTED_TEXT_BYTES) {
			return null;
		}
		return await readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

async function hasFaceOnlyAlgorithmGraph({
	paths,
	root,
}: {
	paths: string[];
	root: string;
}): Promise<boolean> {
	const configs = paths.filter(
		(filePath) => basename(filePath).toLowerCase() === "algorithmconfig.json"
	);
	for (const relativePath of configs) {
		const text = await readSmallText({ root, relativePath });
		if (!text) continue;
		try {
			const parsed = JSON.parse(text) as { nodes?: Array<{ type?: unknown }> };
			const nodeTypes = new Set(
				(parsed.nodes ?? []).flatMap(({ type }) =>
					typeof type === "string" ? [type] : []
				)
			);
			if (nodeTypes.has("face") && !nodeTypes.has("skin_seg")) return true;
		} catch {
			// Another graph in the package can still carry the required face node.
		}
	}
	return false;
}

async function hasLipMixShader({
	paths,
	root,
	featureRoot,
}: {
	paths: string[];
	root: string;
	featureRoot: string;
}): Promise<boolean> {
	const shaderPaths = paths.filter(
		(filePath) =>
			isInsideFeatureRoot({ filePath, featureRoot }) &&
			(filePath.toLowerCase().endsWith(".xshader") ||
				filePath.toLowerCase().endsWith(".frag"))
	);
	const sources = await Promise.all(
		shaderPaths.map((relativePath) => readSmallText({ root, relativePath }))
	);
	const combined = sources
		.filter((source): source is string => source !== null)
		.join("\n");
	return ["lipsMaskTexture", "filterBg", "filterLips", "uniAlpha"].every(
		(token) => combined.includes(token)
	);
}

async function hasIntensityScript({
	paths,
	root,
	featureRoot,
}: {
	paths: string[];
	root: string;
	featureRoot: string;
}): Promise<boolean> {
	const scriptPath = paths.find(
		(filePath) =>
			isInsideFeatureRoot({ filePath, featureRoot }) &&
			basename(filePath).toLowerCase() === "seekmodescript.lua"
	);
	if (!scriptPath) return false;
	const source = await readSmallText({ root, relativePath: scriptPath });
	return Boolean(
		source?.includes('"intensity"') && source.includes('"uniAlpha"')
	);
}

export async function inspectJianyingNativeFaceRegionRenderer({
	container,
	packageIdentifier,
	paths,
	root,
	version,
}: {
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	paths: string[];
	root: string;
	version: string;
}): Promise<JianyingNativeFaceRegionRenderer | null> {
	const backgroundLut = pathByBasename({ paths, name: "filter_bg.3dl.vf" });
	if (!backgroundLut) return null;
	const regionLut = pathByBasename({ paths, name: "filter_lips.3dl.vf" });
	if (!regionLut || posix.dirname(regionLut) !== posix.dirname(backgroundLut)) {
		return null;
	}
	const featureRoot = featureRootForTexture({ filePath: backgroundLut });
	const mask = pathByBasename({ paths, name: "lipsMask.png" });
	const faceMesh = pathByBasename({
		paths,
		name: "mask_faceuv22994_mesh.mesh",
	});
	if (
		!mask ||
		!faceMesh ||
		!isInsideFeatureRoot({ filePath: mask, featureRoot }) ||
		!isInsideFeatureRoot({ filePath: faceMesh, featureRoot })
	) {
		return null;
	}
	const featurePaths = paths.filter((filePath) =>
		isInsideFeatureRoot({ filePath, featureRoot })
	);
	const hasScene = featurePaths.some(
		(filePath) => basename(filePath).toLowerCase() === "main.scene"
	);
	const materialCount = featurePaths.filter((filePath) =>
		filePath.toLowerCase().endsWith(".material")
	).length;
	if (!hasScene || materialCount < 2) return null;
	const [hasFaceGraph, hasShader, hasScript] = await Promise.all([
		hasFaceOnlyAlgorithmGraph({ paths, root }),
		hasLipMixShader({ paths, root, featureRoot }),
		hasIntensityScript({ paths, root, featureRoot }),
	]);
	if (!hasFaceGraph || !hasShader || !hasScript) return null;
	return {
		kind: "native-face-region-effect",
		container,
		packageIdentifier,
		version,
		region: "lips",
		backgroundLutRelativePath: backgroundLut,
		regionLutRelativePath: regionLut,
		maskRelativePath: mask,
		requiresFlippedInputRoundTrip: true,
	};
}

export function resolveJianyingNativeFaceRegionPackagePath({
	cacheRoot,
	renderer,
}: {
	cacheRoot: string;
	renderer: JianyingNativeFaceRegionRenderer;
}): string {
	if (
		!isSafeSegment({ value: renderer.packageIdentifier }) ||
		!isSafeSegment({ value: renderer.version })
	) {
		throw new Error("Invalid local face-region renderer identity");
	}
	return join(
		cacheRoot,
		renderer.container,
		renderer.packageIdentifier,
		renderer.version
	);
}
