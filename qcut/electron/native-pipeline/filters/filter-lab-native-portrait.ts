import { readFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { isSupportedTiledLutImage } from "./filter-lab-tiled-lut.js";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export const JIANYING_NATIVE_PORTRAIT_PROFILES = [
	{
		resourceId: "7361792068475325735",
		title: "奥林巴斯",
		version: "3db90437187dd911b234766ef7297fe9",
		categories: ["相机模拟"],
	},
	{
		resourceId: "7127671508264078599",
		title: "青灰",
		version: "86fda99482c34b63caee66e497b1a8a4",
		categories: ["夜景"],
	},
	{
		resourceId: "7281165355353951543",
		title: "冷月夜",
		version: "ae8c86d364aec2c94e465e7d6b79787c",
		categories: ["夜景"],
	},
	{
		resourceId: "7127561047048850718",
		title: "橙蓝",
		version: "6412fe85feeae73f6f5deed52e253a53",
		categories: ["夜景"],
	},
	{
		resourceId: "7127655008715230495",
		title: "亮肤",
		version: "c564f1a4b48819aa9eeca3f1c9449d61",
		categories: ["人像"],
	},
	{
		resourceId: "7242215081663008056",
		title: "森山",
		version: "ce111150bd6019fa3023e15cf3feed06",
		categories: ["黑白"],
	},
	{
		resourceId: "7127823362356727077",
		title: "雾野",
		version: "12489f7769f2327cd1ce54c5334a57c3",
		categories: ["户外"],
	},
] as const;

export interface JianyingNativePortraitRenderer {
	kind: "native-portrait-effect";
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
	backgroundLutRelativePath?: string;
	skinLutRelativePath?: string;
	faceDetection?: true;
}

interface AlgorithmGraphCapabilities {
	face: boolean;
	skinSeg: boolean;
}

function algorithmGraphCapabilities({
	value,
}: {
	value: unknown;
}): AlgorithmGraphCapabilities {
	if (!value || typeof value !== "object" || !("nodes" in value)) {
		return { face: false, skinSeg: false };
	}
	const nodes = value.nodes;
	if (!Array.isArray(nodes)) return { face: false, skinSeg: false };
	const nodeTypes = new Set(
		nodes.flatMap((node) =>
			Boolean(node) && typeof node === "object" && "type" in node
				? [node.type]
				: []
		)
	);
	return {
		face: nodeTypes.has("face"),
		skinSeg: nodeTypes.has("skin_seg"),
	};
}

function dualPortraitAssets({ paths }: { paths: string[] }) {
	const pathsByLowercase = new Map(
		paths.map((filePath) => [filePath.toLowerCase(), filePath])
	);
	const pairs = [
		["filter_bg.png", "filter_skin.png"],
		["filter_bg.3dl.vf", "filter_skin.3dl.vf"],
	] as const;
	for (const background of paths) {
		const backgroundName = basename(background).toLowerCase();
		const pair = pairs.find(([name]) => name === backgroundName);
		if (!pair) continue;
		const skinPath = posix.join(posix.dirname(background), pair[1]);
		const skin = pathsByLowercase.get(skinPath.toLowerCase());
		if (skin) return { background, skin };
	}
	return null;
}

function sharedFeatureRoot({
	background,
	skin,
}: {
	background: string;
	skin: string;
}) {
	const backgroundRoot = posix.dirname(posix.dirname(background));
	const skinRoot = posix.dirname(posix.dirname(skin));
	return backgroundRoot === skinRoot ? backgroundRoot : null;
}

function hasFeatureAsset({
	paths,
	featureRoot,
	match,
}: {
	paths: string[];
	featureRoot: string;
	match: (fileName: string) => boolean;
}) {
	const prefix = featureRoot ? `${featureRoot}/` : "";
	return paths.some(
		(filePath) =>
			filePath.startsWith(prefix) && match(basename(filePath).toLowerCase())
	);
}

async function inspectAlgorithmGraphs({
	paths,
	root,
}: {
	paths: string[];
	root: string;
}) {
	const candidates = paths.filter(
		(filePath) => basename(filePath).toLowerCase() === "algorithmconfig.json"
	);
	const graphs = await Promise.all(
		candidates.map(async (filePath) => {
			try {
				return JSON.parse(
					await readFile(join(root, filePath), "utf8")
				) as unknown;
			} catch {
				return null;
			}
		})
	);
	return graphs.reduce<AlgorithmGraphCapabilities>(
		(capabilities, value) => {
			const graph = algorithmGraphCapabilities({ value });
			return {
				face: capabilities.face || graph.face,
				skinSeg: capabilities.skinSeg || graph.skinSeg,
			};
		},
		{ face: false, skinSeg: false }
	);
}

export async function inspectJianyingNativePortraitRenderer({
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
}): Promise<JianyingNativePortraitRenderer | null> {
	const assets = dualPortraitAssets({ paths });
	if (!assets) return null;
	const featureRoot = sharedFeatureRoot(assets);
	if (!featureRoot) return null;
	if (
		!hasFeatureAsset({
			paths,
			featureRoot,
			match: (fileName) => fileName.endsWith(".material"),
		}) ||
		!hasFeatureAsset({
			paths,
			featureRoot,
			match: (fileName) => fileName.endsWith(".xshader"),
		}) ||
		!hasFeatureAsset({
			paths,
			featureRoot,
			match: (fileName) => fileName === "seekmodescript.lua",
		})
	) {
		return null;
	}
	const algorithmGraphs = await inspectAlgorithmGraphs({ paths, root });
	if (!algorithmGraphs.skinSeg) return null;
	const tiledAssets =
		assets.background.toLowerCase().endsWith(".png") &&
		assets.skin.toLowerCase().endsWith(".png") &&
		(
			await Promise.all([
				isSupportedTiledLutImage({
					filePath: join(root, assets.background),
				}),
				isSupportedTiledLutImage({ filePath: join(root, assets.skin) }),
			])
		).every(Boolean)
			? {
					backgroundLutRelativePath: assets.background,
					skinLutRelativePath: assets.skin,
				}
			: {};
	return {
		kind: "native-portrait-effect",
		container,
		packageIdentifier,
		version,
		...(algorithmGraphs.face ? { faceDetection: true as const } : {}),
		...tiledAssets,
	};
}

export function resolveJianyingNativePortraitPackagePath({
	cacheRoot,
	renderer,
}: {
	cacheRoot: string;
	renderer: JianyingNativePortraitRenderer;
}) {
	if (
		!SAFE_SEGMENT.test(renderer.packageIdentifier) ||
		!SAFE_SEGMENT.test(renderer.version)
	) {
		throw new Error("Invalid local portrait renderer identity");
	}
	return join(
		cacheRoot,
		renderer.container,
		renderer.packageIdentifier,
		renderer.version
	);
}
