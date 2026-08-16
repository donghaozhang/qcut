import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { JianyingEffectCoverResult } from "../jianying-effect-contract.js";
import { findJianyingEffectCatalogItem } from "./catalog.js";

/**
 * Official covers are signed CDN URLs with ~1 year validity, so the renderer
 * never loads them directly: the main process fetches each cover once, keeps
 * it on disk, and hands the renderer a data URL — offline-friendly and immune
 * to signature expiry.
 */

const nodeRequire = createRequire(__filename);

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const inFlight = new Map<string, Promise<JianyingEffectCoverResult>>();

function coverCacheDirectory(): string {
	try {
		const electron = nodeRequire("electron") as
			| string
			| { app?: { getPath: (name: string) => string } };
		if (typeof electron !== "string" && electron.app) {
			return path.join(
				electron.app.getPath("userData"),
				"Cache",
				"jianying-effect-covers",
				"v1"
			);
		}
	} catch {
		// plain-node callers (tests, scripts) fall through to tmp
	}
	return path.join(os.tmpdir(), "qcut-jianying-effect-covers");
}

function contentTypeFor(data: Buffer, declared: string | null): string {
	if (declared?.startsWith("image/")) return declared;
	if (data.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
	if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
	return "image/png";
}

async function loadCover({
	effectId,
}: {
	effectId: string;
}): Promise<JianyingEffectCoverResult> {
	const item = await findJianyingEffectCatalogItem({ effectId });
	if (!item || item.coverUrl.length === 0) {
		throw new Error(`该特效没有封面：${effectId}`);
	}

	const directory = coverCacheDirectory();
	// Keyed by the un-signed part of the URL, so a re-signed catalog row still
	// hits the same cached file.
	const stableUrl = item.coverUrl.split("?")[0];
	const key = createHash("sha256").update(stableUrl).digest("hex");
	const dataPath = path.join(directory, `${key}.bin`);
	const typePath = path.join(directory, `${key}.type`);

	const cached = await readFile(dataPath).catch(() => null);
	if (cached) {
		const type = await readFile(typePath, "utf8").catch(() => "image/gif");
		return {
			effectId,
			dataUrl: `data:${type};base64,${cached.toString("base64")}`,
			cached: true,
		};
	}

	const response = await fetch(item.coverUrl, {
		headers: { "User-Agent": "JianyingPro/8.5.0 (Macintosh)" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`封面下载失败（HTTP ${response.status}）。`);
	}
	const data = Buffer.from(await response.arrayBuffer());
	if (data.byteLength === 0 || data.byteLength > MAX_COVER_BYTES) {
		throw new Error("封面大小异常。");
	}
	const type = contentTypeFor(data, response.headers.get("content-type"));

	await mkdir(directory, { recursive: true });
	// Write-aside then rename, so a torn write never poisons the cache.
	const scratchPath = `${dataPath}.${process.pid}.tmp`;
	await writeFile(scratchPath, data);
	await rename(scratchPath, dataPath);
	await writeFile(typePath, type);

	return {
		effectId,
		dataUrl: `data:${type};base64,${data.toString("base64")}`,
		cached: false,
	};
}

export function getJianyingEffectCover({
	effectId,
}: {
	effectId: string;
}): Promise<JianyingEffectCoverResult> {
	const pending = inFlight.get(effectId);
	if (pending) return pending;
	const task = loadCover({ effectId }).finally(() => {
		inFlight.delete(effectId);
	});
	inFlight.set(effectId, task);
	return task;
}
