import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
	asJianyingRecord,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const HOST_CACHE_TTL_MS = 5_000;
const MAXIMUM_HOST_SCRIPT_BYTES = 8 * 1024 * 1024;
const DIRECTORY_SCAN_CONCURRENCY = 32;
const HOST_INSPECTION_CONCURRENCY = 16;
const MAIN_SCRIPT_PATH = path.join("js", "main.js");
const TEMPLATE_SCRIPT_PATH = path.join("js", "template", "template.js");

export interface ResolvedJianyingScriptHost {
	fingerprint: string;
	mainScriptPath: string;
	packagePath: string;
	templateScriptPath: string;
	version: string;
}

export interface JianyingScriptHostResolution {
	host: ResolvedJianyingScriptHost | null;
	required: boolean;
}

interface CachedHost {
	createdAt: number;
	promise: Promise<ResolvedJianyingScriptHost | null>;
}

const compatibleHosts = new Map<string, CachedHost>();

function hasCustomContourShape({ value }: { value: unknown }): boolean {
	if (Array.isArray(value)) {
		return value.some((child) => hasCustomContourShape({ value: child }));
	}
	const record = asJianyingRecord(value);
	if (!record) return false;
	const shapeParameters = asJianyingRecord(record.shape_params);
	if (record.type === "shape" && shapeParameters?.shape_type === 4) return true;
	return Object.values(record).some((child) =>
		hasCustomContourShape({ value: child })
	);
}

async function readBoundedHostScript({ filePath }: { filePath: string }) {
	const metadata = await stat(filePath);
	if (!metadata.isFile() || metadata.size > MAXIMUM_HOST_SCRIPT_BYTES) {
		throw new Error("Jianying script host file is invalid");
	}
	return readFile(filePath, "utf8");
}

function versionParts({ version }: { version: string }) {
	const parts = version.split(".").map(Number);
	return parts.length > 0 && parts.every(Number.isInteger) ? parts : null;
}

function compareVersions({ left, right }: { left: string; right: string }) {
	const leftParts = versionParts({ version: left });
	const rightParts = versionParts({ version: right });
	if (!leftParts || !rightParts) return left.localeCompare(right);
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

async function packagePaths({ containerRoot }: { containerRoot: string }) {
	const resources = await readdir(containerRoot, { withFileTypes: true }).catch(
		() => []
	);
	const versions = await mapWithConcurrency({
		items: resources.filter((resource) => resource.isDirectory()),
		limit: DIRECTORY_SCAN_CONCURRENCY,
		task: async ({ item: resource }) => {
			const resourceRoot = path.join(containerRoot, resource.name);
			const entries = await readdir(resourceRoot, {
				withFileTypes: true,
			}).catch(() => []);
			return entries.flatMap((entry) =>
				entry.isDirectory() ? [path.join(resourceRoot, entry.name)] : []
			);
		},
	});
	return versions.flat();
}

async function inspectHostCandidate({ packagePath }: { packagePath: string }) {
	try {
		const mainScriptPath = path.join(packagePath, MAIN_SCRIPT_PATH);
		const templateScriptPath = path.join(packagePath, TEMPLATE_SCRIPT_PATH);
		const [config, mainScript, templateScript] = await Promise.all([
			readBoundedJianyingTextJson({
				filePath: path.join(packagePath, "config.json"),
			}),
			readBoundedHostScript({ filePath: mainScriptPath }),
			readBoundedHostScript({ filePath: templateScriptPath }),
		]);
		const version = asJianyingRecord(config)?.version;
		if (
			typeof version !== "string" ||
			!mainScript.includes("IFShapeDrawFill") ||
			!mainScript.includes("IFShapeDrawStroke")
		) {
			return null;
		}
		return {
			fingerprint: createHash("sha256")
				.update(mainScript)
				.update(templateScript)
				.digest("hex"),
			mainScriptPath,
			packagePath,
			templateScriptPath,
			version,
		} satisfies ResolvedJianyingScriptHost;
	} catch {
		return null;
	}
}

async function findCompatibleHost({
	containerRoot,
}: {
	containerRoot: string;
}) {
	const candidates = await packagePaths({ containerRoot });
	const inspected = await mapWithConcurrency({
		items: candidates,
		limit: HOST_INSPECTION_CONCURRENCY,
		task: ({ item: packagePath }) => inspectHostCandidate({ packagePath }),
	});
	return (
		inspected
			.filter((host): host is ResolvedJianyingScriptHost => host !== null)
			.sort(
				(left, right) =>
					compareVersions({ left: right.version, right: left.version }) ||
					left.packagePath.localeCompare(right.packagePath)
			)[0] ?? null
	);
}

function compatibleHost({ containerRoot }: { containerRoot: string }) {
	const cached = compatibleHosts.get(containerRoot);
	if (cached && Date.now() - cached.createdAt < HOST_CACHE_TTL_MS) {
		return cached.promise;
	}
	const promise = findCompatibleHost({ containerRoot }).catch((cause) => {
		compatibleHosts.delete(containerRoot);
		throw cause;
	});
	compatibleHosts.set(containerRoot, { createdAt: Date.now(), promise });
	return promise;
}

export async function resolveJianyingScriptHost({
	packagePath,
}: {
	packagePath: string;
}) {
	try {
		const resolvedPackagePath = await realpath(packagePath);
		const [content, mainScript] = await Promise.all([
			readBoundedJianyingTextJson({
				filePath: path.join(resolvedPackagePath, "content.json"),
			}),
			readBoundedHostScript({
				filePath: path.join(resolvedPackagePath, MAIN_SCRIPT_PATH),
			}),
		]);
		if (
			!hasCustomContourShape({ value: content }) ||
			!mainScript.includes("IFShapeDrawSolidFill")
		) {
			return { host: null, required: false };
		}
		const containerRoot = path.dirname(path.dirname(resolvedPackagePath));
		return {
			host: await compatibleHost({ containerRoot }),
			required: true,
		};
	} catch {
		return { host: null, required: false };
	}
}
