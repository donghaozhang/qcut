import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";
import { createEmptyJianyingTextEffectCapabilities } from "../jianying-text-effect-capabilities.js";
import type { JianyingTextEffectCapabilities } from "../jianying-text-runtime-contract.js";
import {
	asJianyingRecord,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";

const MAXIMUM_PACKAGE_ENTRIES = 8192;
const MAXIMUM_SIGNAL_FILE_BYTES = 512 * 1024;
const MAXIMUM_SIGNAL_BYTES = 4 * 1024 * 1024;
const PACKAGE_SCAN_CONCURRENCY = 32;
const SIGNAL_READ_CONCURRENCY = 16;
const SIGNAL_EXTENSIONS = new Set([
	".frag",
	".fsh",
	".glsl",
	".json",
	".lua",
	".material",
	".prefab",
	".scene",
	".vert",
	".vsh",
	".xshader",
]);
const SHADER_EXTENSIONS = new Set([
	".frag",
	".fsh",
	".glsl",
	".material",
	".vert",
	".vsh",
	".xshader",
]);
const MESH_EXTENSIONS = new Set([".fbx", ".glb", ".gltf", ".mesh", ".obj"]);
const TEXTURE_EXTENSIONS = new Set([
	".jpeg",
	".jpg",
	".png",
	".texture",
	".webp",
]);
const THREE_DIMENSIONAL_SIGNAL =
	/\b(camera|modelview|perspective|projectionmatrix|worldmatrix)\b/i;
const FEEDBACK_SIGNAL =
	/\b(feedbacktexture|historytexture|lastframe|lasttex|previousframe|previoustexture)\b/i;

interface ComponentPackageFile {
	relativePath: string;
	resolvedPath: string;
	extension: string;
	size: number;
	modifiedAt: number;
}

export interface JianyingTextComponentManifest {
	schemaVersion: 1;
	packageVersion: string;
	fileCount: number;
	shaderFileCount: number;
	meshFileCount: number;
	renderTargetCount: number;
	scriptFileCount: number;
	textureFileCount: number;
	capabilities: JianyingTextEffectCapabilities;
	fingerprint: string;
}

function isWithinRoot({
	root,
	candidate,
}: {
	root: string;
	candidate: string;
}) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function packageVersion({ config }: { config: unknown }) {
	const value = asJianyingRecord(config)?.version;
	return typeof value === "string" ||
		(typeof value === "number" && Number.isFinite(value))
		? String(value)
		: "unknown";
}

async function collectPackageFiles({ packagePath }: { packagePath: string }) {
	const resolvedRoot = await realpath(packagePath);
	const entries = await readdir(resolvedRoot, {
		recursive: true,
		encoding: "utf8",
	});
	if (entries.length > MAXIMUM_PACKAGE_ENTRIES) {
		throw new Error(
			`component package contains more than ${MAXIMUM_PACKAGE_ENTRIES} entries`
		);
	}
	const files = await mapWithConcurrency({
		items: entries,
		limit: PACKAGE_SCAN_CONCURRENCY,
		task: async ({
			item: relativePath,
		}): Promise<ComponentPackageFile | null> => {
			const candidate = path.join(resolvedRoot, relativePath);
			const resolvedPath = await realpath(candidate).catch(() => null);
			if (
				!resolvedPath ||
				!isWithinRoot({ root: resolvedRoot, candidate: resolvedPath })
			) {
				throw new Error("component package contains an unsafe path");
			}
			const metadata = await stat(resolvedPath).catch(() => null);
			if (!metadata?.isFile()) return null;
			return {
				relativePath,
				resolvedPath,
				extension: path.extname(relativePath).toLowerCase(),
				size: metadata.size,
				modifiedAt: metadata.mtimeMs,
			};
		},
	});
	return files
		.filter((file): file is ComponentPackageFile => file !== null)
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function selectSignalFiles({ files }: { files: ComponentPackageFile[] }) {
	const selected: ComponentPackageFile[] = [];
	let selectedBytes = 0;
	for (const file of files) {
		if (
			!SIGNAL_EXTENSIONS.has(file.extension) ||
			file.size > MAXIMUM_SIGNAL_FILE_BYTES ||
			selectedBytes + file.size > MAXIMUM_SIGNAL_BYTES
		) {
			continue;
		}
		selected.push(file);
		selectedBytes += file.size;
	}
	return selected;
}

export async function inspectJianyingTextComponentPackage({
	config: providedConfig,
	packagePath,
}: {
	config?: unknown;
	packagePath: string;
}): Promise<JianyingTextComponentManifest> {
	const [config, files] = await Promise.all([
		providedConfig === undefined
			? readBoundedJianyingTextJson({
					filePath: path.join(packagePath, "config.json"),
				})
			: Promise.resolve(providedConfig),
		collectPackageFiles({ packagePath }),
	]);
	const signalFiles = selectSignalFiles({ files });
	const signalContents = await mapWithConcurrency({
		items: signalFiles,
		limit: SIGNAL_READ_CONCURRENCY,
		task: ({ item: { resolvedPath } }) => readFile(resolvedPath),
	});
	const signalText = Buffer.concat(signalContents).toString("utf8");
	const shaderFileCount = files.filter(({ extension }) =>
		SHADER_EXTENSIONS.has(extension)
	).length;
	const meshFileCount = files.filter(({ extension }) =>
		MESH_EXTENSIONS.has(extension)
	).length;
	const renderTargetCount = files.filter(
		({ extension }) => extension === ".rt"
	).length;
	const scriptFileCount = files.filter(
		({ extension }) => extension === ".lua"
	).length;
	const textureFileCount = files.filter(({ extension }) =>
		TEXTURE_EXTENSIONS.has(extension)
	).length;
	const capabilities = {
		...createEmptyJianyingTextEffectCapabilities(),
		staticTexture: textureFileCount > 0,
		animationComponents: true,
		shaderComponents: shaderFileCount > 0,
		threeDimensional:
			meshFileCount > 0 || THREE_DIMENSIONAL_SIGNAL.test(signalText),
		feedbackComponents: FEEDBACK_SIGNAL.test(signalText),
	};
	const fingerprintHash = createHash("sha256").update(JSON.stringify(config));
	for (const file of files) {
		fingerprintHash.update(
			JSON.stringify([
				file.relativePath,
				file.size,
				Math.round(file.modifiedAt),
			])
		);
	}
	for (let index = 0; index < signalFiles.length; index += 1) {
		fingerprintHash.update(signalFiles[index].relativePath);
		fingerprintHash.update(signalContents[index]);
	}
	return {
		schemaVersion: 1,
		packageVersion: packageVersion({ config }),
		fileCount: files.length,
		shaderFileCount,
		meshFileCount,
		renderTargetCount,
		scriptFileCount,
		textureFileCount,
		capabilities,
		fingerprint: fingerprintHash.digest("hex"),
	};
}
