import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const SUPPORTED_ALGORITHM_TYPES = new Set([
	"blit",
	"ext_texture_producer",
	"face",
	"kira",
	"matting",
	"scene_recognition",
	"script",
	"skin_seg",
	"sky_seg",
	"structxt",
	"texture_blit",
]);

function isSafeSegment({ value }: { value: string }) {
	return SAFE_SEGMENT.test(value) && value !== "." && value !== "..";
}

export interface JianyingNativeSwingRenderer {
	kind: "native-swing-dual-lut" | "native-swing-shader";
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
	passCount: number;
	algorithmTypes: string[];
}

function dualLutState({
	paths,
}: {
	paths: string[];
}): "complete" | "background-only" | "skin-only" | "none" {
	const byDirectory = new Map<string, Set<string>>();
	for (const filePath of paths) {
		const fileName = basename(filePath).toLowerCase();
		if (fileName !== "filter_bg.png" && fileName !== "filter_skin.png") {
			continue;
		}
		const directory = dirname(filePath);
		const names = byDirectory.get(directory) ?? new Set<string>();
		names.add(fileName);
		byDirectory.set(directory, names);
	}
	if (
		[...byDirectory.values()].some(
			(names) => names.has("filter_bg.png") && names.has("filter_skin.png")
		)
	) {
		return "complete";
	}
	const names = new Set(
		[...byDirectory.values()].flatMap((value) => [...value])
	);
	if (names.has("filter_bg.png")) return "background-only";
	if (names.has("filter_skin.png")) return "skin-only";
	return "none";
}

function algorithmTypes({ value }: { value: unknown }): string[] | null {
	if (!value || typeof value !== "object" || !("nodes" in value)) return null;
	const nodes = value.nodes;
	if (!Array.isArray(nodes)) return null;
	const types: string[] = [];
	for (const node of nodes) {
		if (!node || typeof node !== "object" || !("type" in node)) return null;
		if (typeof node.type !== "string" || node.type.length === 0) return null;
		types.push(node.type);
	}
	return types;
}

async function inspectAlgorithmTypes({
	root,
	paths,
}: {
	root: string;
	paths: string[];
}) {
	const configPaths = paths.filter(
		(filePath) => basename(filePath).toLowerCase() === "algorithmconfig.json"
	);
	const collected = new Set<string>();
	for (const configPath of configPaths) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await readFile(join(root, configPath), "utf8"));
		} catch {
			return null;
		}
		const types = algorithmTypes({ value: parsed });
		if (!types) return null;
		for (const type of types) collected.add(type);
	}
	if ([...collected].some((type) => !SUPPORTED_ALGORITHM_TYPES.has(type))) {
		return null;
	}
	return [...collected].sort();
}

function hasSuffix({ paths, suffix }: { paths: string[]; suffix: string }) {
	return paths.some((filePath) => filePath.toLowerCase().endsWith(suffix));
}

function hasFileName({ paths, name }: { paths: string[]; name: string }) {
	return paths.some((filePath) => basename(filePath).toLowerCase() === name);
}

/**
 * Recognizes complete scene graphs that the QCut Swing host has exercised.
 * A cached folder alone is not render support, and an unknown algorithm node
 * must not reach the native runtime.
 */
export async function inspectJianyingNativeSwingRenderer({
	container,
	packageIdentifier,
	paths,
	root,
	version,
}: {
	container: JianyingNativeSwingRenderer["container"];
	packageIdentifier: string;
	paths: string[];
	root: string;
	version: string;
}): Promise<JianyingNativeSwingRenderer | null> {
	if (
		!hasFileName({ paths, name: "main.scene" }) ||
		!hasSuffix({ paths, suffix: ".lua" }) ||
		!hasSuffix({ paths, suffix: ".material" }) ||
		!hasSuffix({ paths, suffix: ".xshader" })
	) {
		return null;
	}
	const types = await inspectAlgorithmTypes({ root, paths });
	if (!types) return null;
	const dualLut = dualLutState({ paths });
	const usesStandaloneSkinTexture =
		dualLut === "skin-only" &&
		types.includes("matting") &&
		types.includes("structxt");
	if (
		dualLut === "background-only" ||
		(dualLut === "skin-only" && !usesStandaloneSkinTexture)
	) {
		return null;
	}
	if (dualLut === "complete" && !types.includes("skin_seg")) return null;
	if (
		dualLut === "none" &&
		(!hasSuffix({ paths, suffix: ".frag" }) ||
			!hasSuffix({ paths, suffix: ".vert" }))
	) {
		return null;
	}
	return {
		kind:
			dualLut === "complete" ? "native-swing-dual-lut" : "native-swing-shader",
		container,
		packageIdentifier,
		version,
		passCount: paths.filter((filePath) =>
			filePath.toLowerCase().endsWith(".material")
		).length,
		algorithmTypes: types,
	};
}

export function resolveJianyingNativeSwingPackagePath({
	cacheRoot,
	renderer,
}: {
	cacheRoot: string;
	renderer: JianyingNativeSwingRenderer;
}) {
	if (
		!isSafeSegment({ value: renderer.packageIdentifier }) ||
		!isSafeSegment({ value: renderer.version })
	) {
		throw new Error("Invalid local Swing filter identity");
	}
	return join(
		cacheRoot,
		renderer.container,
		renderer.packageIdentifier,
		renderer.version
	);
}
