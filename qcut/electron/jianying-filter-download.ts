import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { JianyingKnownFilter } from "./jianying-filter-metadata.js";
import { findUnsafeZipEntries } from "./jianying-effect/catalog-parsing.js";
import { qcutManagedFilterPackageRoot } from "./native-pipeline/filters/filter-lab-lut.js";

const execFileAsync = promisify(execFile);

/** Filter packages observed so far are well under 1 MB; this bounds a rogue response. */
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Package listings are small, but never let the entry check truncate. */
const ZIP_LISTING_MAX_BUFFER = 32 * 1024 * 1024;

export interface JianyingFilterDownloadResult {
	resourceId: string;
	version: string;
	packagePath: string;
}

/** One download per filter at a time; repeat clicks join the same promise. */
const inFlight = new Map<string, Promise<JianyingFilterDownloadResult>>();

async function fetchPackage({ url }: { url: string }): Promise<Buffer> {
	const response = await fetch(url, {
		headers: { "User-Agent": "JianyingPro/8.5.0 (Macintosh)" },
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`滤镜包下载失败（HTTP ${response.status}）。`);
	}
	const declaredLength = Number(response.headers.get("content-length") ?? 0);
	if (declaredLength > MAX_PACKAGE_BYTES) {
		throw new Error("滤镜包超出大小限制。");
	}
	const data = Buffer.from(await response.arrayBuffer());
	if (data.byteLength > MAX_PACKAGE_BYTES) {
		throw new Error("滤镜包超出大小限制。");
	}
	return data;
}

async function assertZipIsSafe({
	zipPath,
}: {
	zipPath: string;
}): Promise<void> {
	const { stdout } = await execFileAsync("unzip", ["-Z1", zipPath], {
		maxBuffer: ZIP_LISTING_MAX_BUFFER,
	});
	const entries = stdout.split("\n").filter(Boolean);
	if (entries.length === 0) {
		throw new Error("滤镜包为空。");
	}
	const unsafe = findUnsafeZipEntries({ entries });
	if (unsafe.length > 0) {
		throw new Error(`滤镜包包含不安全路径：${unsafe[0]}`);
	}
}

async function installPackage({
	filter,
	managedRoot,
}: {
	filter: JianyingKnownFilter;
	managedRoot: string;
}): Promise<JianyingFilterDownloadResult> {
	const url = filter.packageUrls?.[0];
	if (!url) {
		throw new Error(`该滤镜没有可用的下载地址：${filter.title}`);
	}
	// The version doubles as the package hash and as the directory name that
	// discovery reads, so a filter without one cannot be placed where
	// listJianyingLutReferences would find it.
	if (!filter.version) {
		throw new Error(`该滤镜缺少版本哈希：${filter.title}`);
	}

	const data = await fetchPackage({ url });
	const digest = createHash("md5").update(data).digest("hex");
	if (digest !== filter.version) {
		throw new Error(
			`滤镜包校验失败：${filter.title}（预期 ${filter.version}，实际 ${digest}）`
		);
	}

	// Unpack next to the final directory, then rename — a crash mid-extract
	// must not leave a half-package where discovery would pick it up.
	const finalDir = path.join(managedRoot, filter.resourceId, filter.version);
	const stagingDir = `${finalDir}.downloading`;
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	const zipPath = path.join(stagingDir, "__package.zip");
	try {
		await writeFile(zipPath, data);
		await assertZipIsSafe({ zipPath });
		await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", stagingDir]);
		await rm(zipPath, { force: true });
		await rm(finalDir, { recursive: true, force: true });
		await rename(stagingDir, finalDir);
	} catch (cause) {
		await rm(stagingDir, { recursive: true, force: true });
		throw cause;
	}

	return {
		resourceId: filter.resourceId,
		version: filter.version,
		packagePath: finalDir,
	};
}

/**
 * Fetches a filter package into QCut's own managed root. Jianying's cache is
 * never written to: it belongs to another application, and discovery already
 * reads both roots.
 */
export function downloadJianyingFilterPackage({
	filter,
	managedRoot = qcutManagedFilterPackageRoot(),
}: {
	filter: JianyingKnownFilter;
	managedRoot?: string | null;
}): Promise<JianyingFilterDownloadResult> {
	if (!managedRoot) {
		return Promise.reject(new Error("滤镜包下载仅在 QCut 桌面版中可用。"));
	}
	const pending = inFlight.get(filter.resourceId);
	if (pending) return pending;

	const task = installPackage({ filter, managedRoot }).finally(() => {
		inFlight.delete(filter.resourceId);
	});
	inFlight.set(filter.resourceId, task);
	return task;
}
