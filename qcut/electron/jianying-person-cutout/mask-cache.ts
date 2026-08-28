import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPersonCutoutAbortError } from "./abort.js";
import {
	defaultPersonCutoutPipelineDescriptor,
	type PersonCutoutModelRoute,
	type PersonCutoutPipelineDescriptor,
	type PersonCutoutPipelineId,
	type PersonCutoutProviderId,
	type PersonCutoutRefinementProvider,
} from "./pipeline-descriptor.js";
import type { TemattingBlendImplementation } from "./tematting-blend.js";

const CACHE_VERSION = 4;
const CACHE_ROOT = path.join(
	os.homedir(),
	"Library",
	"Caches",
	"QCut",
	"person-cutout",
	`v${CACHE_VERSION}`
);
const MAX_CACHE_BYTES = 20 * 1024 * 1024 * 1024;

export interface PersonCutoutCacheSettings {
	edgeShift: number;
	feather: number;
	temporalSmoothing: number;
	threshold: number;
}

export interface PersonCutoutCacheIdentity {
	blendImplementation: TemattingBlendImplementation;
	frameRate: number;
	height: number;
	modelName: string;
	modelRoute: PersonCutoutModelRoute;
	modelSha256: string;
	pipelineId: PersonCutoutPipelineId;
	processorSha256: string;
	providerId: PersonCutoutProviderId;
	refinementProvider: PersonCutoutRefinementProvider;
	settings: PersonCutoutCacheSettings;
	sourceMtimeMs: number;
	sourcePath: string;
	sourceContentSha256: string;
	sourceSize: number;
	width: number;
}

export interface PersonCutoutMaskCacheEntry {
	alphaPath: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
}

interface PersonCutoutMaskCacheManifest {
	alphaBytes: number;
	alphaSha256: string;
	cacheKey: string;
	createdAt: string;
	frameCount: number;
	identity: PersonCutoutCacheIdentity;
	version: number;
}

function getCacheRoot() {
	return process.env.QCUT_PERSON_CUTOUT_CACHE_ROOT || CACHE_ROOT;
}

function stableIdentity({ identity }: { identity: PersonCutoutCacheIdentity }) {
	return JSON.stringify({
		version: CACHE_VERSION,
		frameRate: identity.frameRate,
		height: identity.height,
		modelName: identity.modelName,
		modelRoute: identity.modelRoute,
		modelSha256: identity.modelSha256,
		pipelineId: identity.pipelineId,
		processorSha256: identity.processorSha256,
		providerId: identity.providerId,
		refinementProvider: identity.refinementProvider,
		settings: identity.settings,
		sourceContentSha256: identity.sourceContentSha256,
		sourceSize: identity.sourceSize,
		width: identity.width,
	});
}

export function createPersonCutoutCacheKey({
	identity,
}: {
	identity: PersonCutoutCacheIdentity;
}) {
	return createHash("sha256")
		.update(stableIdentity({ identity }))
		.digest("hex");
}

function hashFileContents({
	filePath,
	signal,
}: {
	filePath: string;
	signal?: AbortSignal;
}) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const input = createReadStream(filePath, { signal });
		input.on("data", (chunk) => hash.update(chunk));
		input.once("error", reject);
		input.once("end", () => resolve(hash.digest("hex")));
	});
}

export async function createPersonCutoutCacheIdentity({
	blendImplementation,
	frameRate,
	height,
	modelName,
	modelRoute,
	modelSha256,
	pipelineDescriptor,
	processorSha256,
	settings,
	signal,
	sourcePath,
	width,
}: {
	blendImplementation: TemattingBlendImplementation;
	frameRate: number;
	height: number;
	modelName: string;
	modelRoute?: PersonCutoutModelRoute;
	modelSha256: string;
	pipelineDescriptor?: PersonCutoutPipelineDescriptor;
	processorSha256: string;
	settings: PersonCutoutCacheSettings;
	signal?: AbortSignal;
	sourcePath: string;
	width: number;
}): Promise<PersonCutoutCacheIdentity> {
	const resolvedSourcePath = await realpath(sourcePath);
	const sourceStat = await stat(resolvedSourcePath);
	const resolvedModelRoute =
		modelRoute ?? pipelineDescriptor?.modelRoute ?? "portrait-gru";
	const resolvedPipelineDescriptor =
		pipelineDescriptor ??
		defaultPersonCutoutPipelineDescriptor({ modelRoute: resolvedModelRoute });
	if (resolvedPipelineDescriptor.modelRoute !== resolvedModelRoute) {
		throw new Error("人物抠像管线与模型路线不一致");
	}
	return {
		blendImplementation,
		frameRate,
		height,
		modelName,
		modelRoute: resolvedModelRoute,
		modelSha256,
		pipelineId: resolvedPipelineDescriptor.pipelineId,
		processorSha256,
		providerId: resolvedPipelineDescriptor.providerId,
		refinementProvider: resolvedPipelineDescriptor.refinementProvider,
		settings,
		sourceMtimeMs: sourceStat.mtimeMs,
		sourcePath: resolvedSourcePath,
		sourceContentSha256: await hashFileContents({
			filePath: resolvedSourcePath,
			signal,
		}),
		sourceSize: sourceStat.size,
		width,
	};
}

function cachePaths({ cacheKey }: { cacheKey: string }) {
	const directory = path.join(getCacheRoot(), cacheKey);
	return {
		alphaPath: path.join(directory, "alpha.gray"),
		directory,
		manifestPath: path.join(directory, "manifest.json"),
	};
}

function isManifest({ value }: { value: unknown }) {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<PersonCutoutMaskCacheManifest>;
	return (
		manifest.version === CACHE_VERSION &&
		typeof manifest.cacheKey === "string" &&
		typeof manifest.alphaBytes === "number" &&
		typeof manifest.alphaSha256 === "string" &&
		typeof manifest.frameCount === "number" &&
		manifest.frameCount > 0 &&
		Boolean(manifest.identity)
	);
}

export async function inspectPersonCutoutMaskCache({
	identity,
	signal,
}: {
	identity: PersonCutoutCacheIdentity;
	signal?: AbortSignal;
}): Promise<PersonCutoutMaskCacheEntry | null> {
	const cacheKey = createPersonCutoutCacheKey({ identity });
	const paths = cachePaths({ cacheKey });
	try {
		const [manifestText, alphaStat] = await Promise.all([
			readFile(paths.manifestPath, "utf8"),
			stat(paths.alphaPath),
		]);
		const manifestValue: unknown = JSON.parse(manifestText);
		if (!isManifest({ value: manifestValue })) return null;
		const manifest = manifestValue as PersonCutoutMaskCacheManifest;
		const expectedBytes =
			manifest.frameCount * identity.width * identity.height;
		if (
			manifest.cacheKey !== cacheKey ||
			manifest.alphaBytes !== expectedBytes ||
			alphaStat.size !== expectedBytes ||
			stableIdentity({ identity: manifest.identity }) !==
				stableIdentity({ identity })
		) {
			return null;
		}
		if (
			manifest.alphaSha256 !==
			(await hashFileContents({ filePath: paths.alphaPath, signal }))
		) {
			return null;
		}
		return {
			alphaPath: paths.alphaPath,
			cacheKey,
			directory: paths.directory,
			frameCount: manifest.frameCount,
		};
	} catch {
		if (signal?.aborted) throw createPersonCutoutAbortError();
		return null;
	}
}

export async function createPersonCutoutMaskCacheBuild({
	identity,
}: {
	identity: PersonCutoutCacheIdentity;
}) {
	const cacheKey = createPersonCutoutCacheKey({ identity });
	const cacheRoot = getCacheRoot();
	await mkdir(cacheRoot, { recursive: true });
	const directory = path.join(
		cacheRoot,
		`.building-${cacheKey}-${process.pid}-${randomUUID()}`
	);
	await mkdir(directory);
	return {
		alphaPath: path.join(directory, "alpha.gray"),
		cacheKey,
		directory,
	};
}

async function prunePersonCutoutMaskCache({
	keepBytes,
	keepCacheKey,
}: {
	keepBytes: number;
	keepCacheKey: string;
}) {
	const cacheRoot = getCacheRoot();
	let names: string[];
	try {
		names = await readdir(cacheRoot);
	} catch {
		return;
	}
	const entries: Array<{
		bytes: number;
		createdAt: number;
		directory: string;
	}> = [];
	for (const name of names) {
		if (name === keepCacheKey || name.startsWith(".")) continue;
		const directory = path.join(cacheRoot, name);
		try {
			const manifestValue: unknown = JSON.parse(
				await readFile(path.join(directory, "manifest.json"), "utf8")
			);
			if (!isManifest({ value: manifestValue })) continue;
			const manifest = manifestValue as PersonCutoutMaskCacheManifest;
			entries.push({
				bytes: manifest.alphaBytes,
				createdAt: Date.parse(manifest.createdAt) || 0,
				directory,
			});
		} catch {
			// 读不出 manifest 的目录交给 inspect 当缓存未命中处理。
		}
	}
	entries.sort((a, b) => a.createdAt - b.createdAt);
	let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, keepBytes);
	for (const entry of entries) {
		if (totalBytes <= MAX_CACHE_BYTES) return;
		await rm(entry.directory, { force: true, recursive: true });
		totalBytes -= entry.bytes;
	}
}

export async function commitPersonCutoutMaskCache({
	buildDirectory,
	frameCount,
	identity,
}: {
	buildDirectory: string;
	frameCount: number;
	identity: PersonCutoutCacheIdentity;
}): Promise<PersonCutoutMaskCacheEntry> {
	const cacheKey = createPersonCutoutCacheKey({ identity });
	const alphaBytes = frameCount * identity.width * identity.height;
	const alphaPath = path.join(buildDirectory, "alpha.gray");
	const alphaStat = await stat(alphaPath);
	if (frameCount <= 0 || alphaStat.size !== alphaBytes) {
		throw new Error("人物蒙版缓存不完整，已停止导出");
	}
	const manifest: PersonCutoutMaskCacheManifest = {
		alphaBytes,
		alphaSha256: await hashFileContents({ filePath: alphaPath }),
		cacheKey,
		createdAt: new Date().toISOString(),
		frameCount,
		identity,
		version: CACHE_VERSION,
	};
	await writeFile(
		path.join(buildDirectory, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
	const target = cachePaths({ cacheKey });
	await rm(target.directory, { force: true, recursive: true });
	await rename(buildDirectory, target.directory);
	try {
		await prunePersonCutoutMaskCache({
			keepBytes: alphaBytes,
			keepCacheKey: cacheKey,
		});
	} catch {
		// 清理是尽力而为，失败不影响本次缓存提交。
	}
	return {
		alphaPath: target.alphaPath,
		cacheKey,
		directory: target.directory,
		frameCount,
	};
}

export type {
	PersonCutoutModelRoute,
	PersonCutoutPipelineDescriptor,
	PersonCutoutPipelineId,
	PersonCutoutProviderId,
	PersonCutoutRefinementProvider,
} from "./pipeline-descriptor.js";

export async function discardPersonCutoutMaskCacheBuild({
	buildDirectory,
}: {
	buildDirectory: string;
}) {
	await rm(buildDirectory, { force: true, recursive: true });
}
