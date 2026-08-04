import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import path from "node:path";
import {
	booleanValue,
	numberValue,
	objectArray,
	objectValue,
	stringValue,
} from "./json-values";

export type TransitionPackageFamily =
	| "simple-glsl"
	| "lua-pipeline"
	| "lumi-ae"
	| "sequence-composite"
	| "threejs"
	| "node-graph"
	| "unknown";

export interface TransitionPackageSummary {
	packagePath: string;
	equivalentPaths: string[];
	directoryKey: string;
	packageHash: string;
	primaryFamily: TransitionPackageFamily;
	families: TransitionPackageFamily[];
	engine: {
		aeTool: string;
		version: string;
		links: { type: string; path: string; zorder: number | null }[];
	};
	transitionDefaults: {
		durationSeconds: number | null;
		isOverlap: boolean | null;
	};
	protocol: {
		transitionInput0: boolean;
		transitionInput1: boolean;
		normalizedProgress: boolean;
		outputRenderTarget: boolean;
		easingSignals: string[];
		mathSignals: string[];
	};
	assetCounts: {
		images: number;
		videos: number;
		shaders: number;
		lua: number;
		javascript: number;
		sequenceDescriptors: number;
		renderTargets: number;
	};
	notableFiles: string[];
}

export interface TransitionPackageResolution {
	state: "found" | "missing" | "ambiguous";
	candidatePaths: string[];
	packages: TransitionPackageSummary[];
}

function walkFiles({ rootPath }: { rootPath: string }): string[] {
	const files: string[] = [];
	const pending = [rootPath];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const candidate = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(candidate);
				continue;
			}
			if (entry.isFile()) files.push(candidate);
		}
	}
	return files.sort();
}

function readJsonFile({ filePath }: { filePath: string }): Record<string, unknown> {
	if (!existsSync(filePath)) return {};
	try {
		return objectValue({ value: JSON.parse(readFileSync(filePath, "utf8")) }) ?? {};
	} catch {
		return {};
	}
}

function relativeFiles({
	packagePath,
	files,
}: {
	packagePath: string;
	files: string[];
}): string[] {
	return files.map((filePath) => path.relative(packagePath, filePath).split(path.sep).join("/"));
}

function packageFamilies({ files }: { files: string[] }): TransitionPackageFamily[] {
	const families: TransitionPackageFamily[] = [];
	if (files.some((file) => hasPathSuffix({ file, suffix: "xshader/generalEffect.json" }))) {
		families.push("simple-glsl");
	}
	if (files.some((file) => hasPathSuffix({ file, suffix: "lua/TransitionScript.lua" }))) {
		families.push("lua-pipeline");
	}
	if (
		files.some((file) =>
			hasPathSuffix({ file, suffix: "lua/LumiFamily/LumiExportData.lua" })
		)
	) {
		families.push("lumi-ae");
	}
	if (
		files.some(
			(file) => file.endsWith(".seq") || file.includes("/seq/")
		)
	) {
		families.push("sequence-composite");
	}
	if (
		files.some((file) =>
			hasPathSuffix({ file, suffix: "js/ThreeJS/scriptScene.js" })
		)
	) {
		families.push("threejs");
	}
	if (files.some((file) => file.endsWith("graph.dat") || file.endsWith(".lsproj"))) {
		families.push("node-graph");
	}
	return families.length > 0 ? families : ["unknown"];
}

function hasPathSuffix({ file, suffix }: { file: string; suffix: string }) {
	return file === suffix || file.endsWith(`/${suffix}`);
}

function primaryFamily({ families }: { families: TransitionPackageFamily[] }) {
	const precedence: TransitionPackageFamily[] = [
		"threejs",
		"lua-pipeline",
		"lumi-ae",
		"simple-glsl",
		"sequence-composite",
		"node-graph",
		"unknown",
	];
	return precedence.find((family) => families.includes(family)) ?? "unknown";
}

function extensionCount({ files, extensions }: { files: string[]; extensions: string[] }) {
	return files.filter((file) => extensions.some((extension) => file.endsWith(extension)))
		.length;
}

function protocolText({ packagePath, files }: { packagePath: string; files: string[] }) {
	const readableExtensions = [
		".json",
		".lua",
		".js",
		".frag",
		".vert",
		".metal",
		".xshader",
		".ausl",
	];
	const chunks: string[] = [];
	for (const relativeFile of files) {
		if (!readableExtensions.some((extension) => relativeFile.endsWith(extension))) {
			continue;
		}
		const absolutePath = path.join(packagePath, relativeFile);
		try {
			// Inside the try: a broken symlink or a file removed between the
			// listing and this read makes statSync throw and would otherwise
			// abort the whole classification.
			if (statSync(absolutePath).size > 2_000_000) continue;
			chunks.push(readFileSync(absolutePath, "utf8"));
		} catch {
			continue;
		}
	}
	return chunks.join("\n");
}

function easingSignals({ text }: { text: string }): string[] {
	const candidates = [
		"Linear",
		"easeInOutQuint",
		"Sinusoidal.InOut",
		"quadIn",
		"quadOut",
		"quadInOut",
		"cubicInOut",
		"bezier",
	];
	return candidates.filter((candidate) => text.includes(candidate));
}

function mathSignals({ text }: { text: string }): string[] {
	const candidates = [
		{ label: "linear-mix", pattern: "mix(" },
		{ label: "smoothstep", pattern: "smoothstep(" },
		{ label: "matrix-transform", pattern: "mat4" },
		{ label: "gaussian-blur", pattern: "GaussianBlur" },
		{ label: "perspective", pattern: "Perspective" },
		{ label: "tween", pattern: "TWEEN." },
	];
	return candidates
		.filter((candidate) => text.includes(candidate.pattern))
		.map((candidate) => candidate.label);
}

function engineLinks({ config }: { config: Record<string, unknown> }) {
	const effect = objectValue({ value: config.effect }) ?? {};
	return objectArray({ value: effect.Link }).map((link) => ({
		type: stringValue({ value: link.type }),
		path: stringValue({ value: link.path }),
		zorder: numberValue({ value: link.zorder }),
	}));
}

export function classifyTransitionPackage({
	packagePath,
}: {
	packagePath: string;
}): TransitionPackageSummary {
	const resolvedPath = path.resolve(packagePath);
	if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
		throw new Error(`Transition package directory does not exist: ${resolvedPath}`);
	}
	const files = relativeFiles({
		packagePath: resolvedPath,
		files: walkFiles({ rootPath: resolvedPath }),
	});
	const families = packageFamilies({ files });
	const config = readJsonFile({ filePath: path.join(resolvedPath, "config.json") });
	const extra = readJsonFile({ filePath: path.join(resolvedPath, "extra.json") });
	const transition = objectValue({ value: extra.transition }) ?? {};
	const text = protocolText({ packagePath: resolvedPath, files });
	return {
		packagePath: resolvedPath,
		equivalentPaths: [resolvedPath],
		directoryKey: path.basename(path.dirname(resolvedPath)),
		packageHash: path.basename(resolvedPath),
		primaryFamily: primaryFamily({ families }),
		families,
		engine: {
			aeTool: stringValue({ value: config.ae_tool }),
			version: stringValue({ value: config.version }),
			links: engineLinks({ config }),
		},
		transitionDefaults: {
			durationSeconds: numberValue({ value: transition.defaultDura }),
			isOverlap: booleanValue({ value: transition.isOverlap }),
		},
		protocol: {
			transitionInput0: text.includes("#TransitionInput0"),
			transitionInput1: text.includes("#TransitionInput1"),
			normalizedProgress:
				text.includes("frameTimestamp") ||
				text.includes("getFrameTimestamp") ||
				text.includes('"type": 3007'),
			outputRenderTarget:
				files.some((file) => file.endsWith("outputTex.rt")) ||
				text.includes("outputTex"),
			easingSignals: easingSignals({ text }),
			mathSignals: mathSignals({ text }),
		},
		assetCounts: {
			images: extensionCount({
				files,
				extensions: [".png", ".jpg", ".jpeg", ".webp"],
			}),
			videos: extensionCount({ files, extensions: [".mp4", ".mov", ".webm"] }),
			shaders: extensionCount({
				files,
				extensions: [".frag", ".vert", ".xshader", ".ausl", ".metal"],
			}),
			lua: extensionCount({ files, extensions: [".lua"] }),
			javascript: extensionCount({ files, extensions: [".js", ".jsdat"] }),
			sequenceDescriptors: extensionCount({ files, extensions: [".seq"] }),
			renderTargets: extensionCount({ files, extensions: [".rt"] }),
		},
		notableFiles: files.filter((file) =>
			[
				"config.json",
				"extra.json",
				"xshader/generalEffect.json",
				"lua/TransitionScript.lua",
				"lua/LumiFamily/LumiExportData.lua",
				"lua/SeekModeScript.lua",
				"js/ThreeJS/scriptScene.js",
				"graph.dat",
			].some((suffix) => file.endsWith(suffix)) ||
			[".frag", ".vert", ".lua", ".js", ".seq", ".lsproj"].some(
				(extension) => file.endsWith(extension)
			)
		),
	};
}

function addDirectoryPackages({
	candidates,
	directory,
	metadataMd5,
}: {
	candidates: Set<string>;
	directory: string;
	metadataMd5?: string;
}) {
	if (!existsSync(directory) || !statSync(directory).isDirectory()) return;
	if (metadataMd5) {
		const exact = path.join(directory, metadataMd5);
		if (existsSync(exact) && statSync(exact).isDirectory()) candidates.add(exact);
		return;
	}
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) candidates.add(path.join(directory, entry.name));
	}
}

export function resolveTransitionPackages({
	cacheRoot,
	cacheRoots = [],
	packagePath,
	packagePaths = [],
	metadataMd5,
	resourceIds = [],
	draftEffectIds = [],
	catalogEffectIds = [],
}: {
	cacheRoot: string;
	cacheRoots?: string[];
	packagePath?: string;
	packagePaths?: string[];
	metadataMd5?: string;
	resourceIds?: string[];
	draftEffectIds?: string[];
	catalogEffectIds?: string[];
}): TransitionPackageResolution {
	const candidates = new Set<string>();
	for (const explicitPath of [packagePath ?? "", ...packagePaths].filter(Boolean)) {
		if (existsSync(explicitPath) && statSync(explicitPath).isDirectory()) {
			candidates.add(path.resolve(explicitPath));
		}
	}
	const effectRoots = [...new Set([cacheRoot, ...cacheRoots])].map((root) =>
		path.join(root, "effect")
	);
	const ids = [
		...new Set(
			[...draftEffectIds, ...resourceIds, ...catalogEffectIds].filter(Boolean)
		),
	];
	for (const effectRoot of effectRoots) {
		for (const id of ids) {
			addDirectoryPackages({
				candidates,
				directory: path.join(effectRoot, id),
				metadataMd5,
			});
		}
	}
	if (metadataMd5) {
		for (const effectRoot of effectRoots) {
			if (!existsSync(effectRoot)) continue;
			for (const entry of readdirSync(effectRoot, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const candidate = path.join(effectRoot, entry.name, metadataMd5);
				if (existsSync(candidate) && statSync(candidate).isDirectory()) {
					candidates.add(candidate);
				}
			}
		}
	}
	const candidatePaths = [...candidates].sort();
	const packagesByIdentity = new Map<string, TransitionPackageSummary>();
	for (const candidate of candidatePaths) {
		const packageSummary = classifyTransitionPackage({ packagePath: candidate });
		const identity = `${packageSummary.directoryKey}:${packageSummary.packageHash}`;
		const current = packagesByIdentity.get(identity);
		if (!current) {
			packagesByIdentity.set(identity, packageSummary);
			continue;
		}
		packagesByIdentity.set(identity, {
			...current,
			equivalentPaths: [...current.equivalentPaths, packageSummary.packagePath].sort(),
		});
	}
	const packages = [...packagesByIdentity.values()];
	return {
		state:
			packages.length === 0 ? "missing" : packages.length === 1 ? "found" : "ambiguous",
		candidatePaths,
		packages,
	};
}
