import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TemattingBlendImplementation } from "./tematting-blend.js";

const CACHE_VERSION = 3;
const CACHE_ROOT = path.join(
	os.homedir(),
	"Library",
	"Caches",
	"QCut",
	"person-cutout",
	`v${CACHE_VERSION}`
);

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
	processorSha256: string;
	settings: PersonCutoutCacheSettings;
	sourceMtimeMs: number;
	sourcePath: string;
	sourceContentSha256: string;
	sourceSize: number;
	width: number;
}

export type PersonCutoutModelRoute =
	| "portrait-gru"
	| "video-object"
	| "saliency-script";

export interface PersonCutoutMaskCacheEntry {
	alphaPath: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
}

interface PersonCutoutMaskCacheManifest {
	alphaBytes: number;
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
		blendImplementation: identity.blendImplementation,
		frameRate: identity.frameRate,
		height: identity.height,
		modelName: identity.modelName,
		modelRoute: identity.modelRoute,
		modelSha256: identity.modelSha256,
		processorSha256: identity.processorSha256,
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

function hashSourceContent({ filePath }: { filePath: string }) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const input = createReadStream(filePath);
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
	processorSha256,
	settings,
	sourcePath,
	width,
}: {
	blendImplementation: TemattingBlendImplementation;
	frameRate: number;
	height: number;
	modelName: string;
	modelRoute?: PersonCutoutModelRoute;
	modelSha256: string;
	processorSha256: string;
	settings: PersonCutoutCacheSettings;
	sourcePath: string;
	width: number;
}): Promise<PersonCutoutCacheIdentity> {
	const resolvedSourcePath = await realpath(sourcePath);
	const sourceStat = await stat(resolvedSourcePath);
	return {
		blendImplementation,
		frameRate,
		height,
		modelName,
		modelRoute: modelRoute ?? "portrait-gru",
		modelSha256,
		processorSha256,
		settings,
		sourceMtimeMs: sourceStat.mtimeMs,
		sourcePath: resolvedSourcePath,
		sourceContentSha256: await hashSourceContent({
			filePath: resolvedSourcePath,
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
		typeof manifest.frameCount === "number" &&
		manifest.frameCount > 0 &&
		Boolean(manifest.identity)
	);
}

export async function inspectPersonCutoutMaskCache({
	identity,
}: {
	identity: PersonCutoutCacheIdentity;
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
		return {
			alphaPath: paths.alphaPath,
			cacheKey,
			directory: paths.directory,
			frameCount: manifest.frameCount,
		};
	} catch {
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
	return {
		alphaPath: target.alphaPath,
		cacheKey,
		directory: target.directory,
		frameCount,
	};
}

export async function discardPersonCutoutMaskCacheBuild({
	buildDirectory,
}: {
	buildDirectory: string;
}) {
	await rm(buildDirectory, { force: true, recursive: true });
}
