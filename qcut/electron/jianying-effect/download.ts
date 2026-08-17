import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JianyingEffectDownloadResult } from "../jianying-effect-contract.js";
import {
	findJianyingEffectCatalogItem,
	qcutManagedEffectPackageRoot,
} from "./catalog.js";
import { findUnsafeZipEntries } from "./catalog-parsing.js";

const execFileAsync = promisify(execFile);

/** Effect packages observed so far are ~1 MB; this bounds a rogue response. */
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Package listings are small, but never let the entry check truncate. */
const ZIP_LISTING_MAX_BUFFER = 32 * 1024 * 1024;

/** One download per effect at a time; repeat clicks join the same promise. */
const inFlight = new Map<string, Promise<JianyingEffectDownloadResult>>();

async function fetchPackage({ url }: { url: string }): Promise<Buffer> {
	const response = await fetch(url, {
		headers: { "User-Agent": "JianyingPro/8.5.0 (Macintosh)" },
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`特效包下载失败（HTTP ${response.status}）。`);
	}
	const declaredLength = Number(response.headers.get("content-length") ?? 0);
	if (declaredLength > MAX_PACKAGE_BYTES) {
		throw new Error("特效包超出大小限制。");
	}
	const data = Buffer.from(await response.arrayBuffer());
	if (data.byteLength > MAX_PACKAGE_BYTES) {
		throw new Error("特效包超出大小限制。");
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
		throw new Error("特效包为空。");
	}
	const unsafe = findUnsafeZipEntries({ entries });
	if (unsafe.length > 0) {
		throw new Error(`特效包包含不安全路径：${unsafe[0]}`);
	}
}

async function installPackage({
	effectId,
}: {
	effectId: string;
}): Promise<JianyingEffectDownloadResult> {
	const item = await findJianyingEffectCatalogItem({ effectId });
	if (!item) {
		throw new Error(`未找到剪映特效目录条目：${effectId}`);
	}
	const url = item.itemUrls[0];
	if (!url) {
		throw new Error(`该特效没有可用的下载地址：${item.title}`);
	}
	const managedRoot = qcutManagedEffectPackageRoot();
	if (!managedRoot) {
		throw new Error("特效包下载仅在 QCut 桌面版中可用。");
	}

	const data = await fetchPackage({ url });
	const digest = createHash("md5").update(data).digest("hex");
	if (digest !== item.md5) {
		throw new Error(
			`特效包校验失败：${item.title}（预期 ${item.md5}，实际 ${digest}）`
		);
	}

	// Unpack next to the final directory, then rename — a crash mid-extract
	// must not leave a half-package where discovery would pick it up.
	const finalDir = path.join(managedRoot, item.effectId, item.md5);
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
		effectId: item.effectId,
		packageHash: item.md5,
		packagePath: finalDir,
	};
}

export function downloadJianyingEffectPackage({
	effectId,
}: {
	effectId: string;
}): Promise<JianyingEffectDownloadResult> {
	const pending = inFlight.get(effectId);
	if (pending) return pending;

	const task = installPackage({ effectId }).finally(() => {
		inFlight.delete(effectId);
	});
	inFlight.set(effectId, task);
	return task;
}
