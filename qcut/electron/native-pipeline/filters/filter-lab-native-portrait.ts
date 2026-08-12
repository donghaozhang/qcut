import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

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
}

function hasNamedAsset({ paths, name }: { paths: string[]; name: string }) {
	const normalizedName = name.toLowerCase();
	return paths.some(
		(filePath) => basename(filePath).toLowerCase() === normalizedName
	);
}

function hasSkinSegNode({ value }: { value: unknown }) {
	if (!value || typeof value !== "object" || !("nodes" in value)) return false;
	const nodes = value.nodes;
	return (
		Array.isArray(nodes) &&
		nodes.some(
			(node) =>
				Boolean(node) &&
				typeof node === "object" &&
				"type" in node &&
				node.type === "skin_seg"
		)
	);
}

function hasDualPortraitAssets({ paths }: { paths: string[] }) {
	const hasBackground =
		hasNamedAsset({ paths, name: "filter_bg.3dl.vf" }) ||
		hasNamedAsset({ paths, name: "filter_bg.png" });
	const hasSkin =
		hasNamedAsset({ paths, name: "filter_skin.3dl.vf" }) ||
		hasNamedAsset({ paths, name: "filter_skin.png" });
	return hasBackground && hasSkin;
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
	if (!hasDualPortraitAssets({ paths })) return null;
	if (
		!hasNamedAsset({ paths, name: "Filter.material" }) ||
		!hasNamedAsset({ paths, name: "Filter.xshader" }) ||
		!hasNamedAsset({ paths, name: "SeekModeScript.lua" })
	) {
		return null;
	}
	const algorithmConfigPath = paths.find(
		(filePath) => basename(filePath).toLowerCase() === "algorithmconfig.json"
	);
	if (!algorithmConfigPath) return null;
	try {
		const algorithmConfig = JSON.parse(
			await readFile(join(root, algorithmConfigPath), "utf8")
		) as unknown;
		if (!hasSkinSegNode({ value: algorithmConfig })) return null;
	} catch {
		return null;
	}
	return {
		kind: "native-portrait-effect",
		container,
		packageIdentifier,
		version,
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
