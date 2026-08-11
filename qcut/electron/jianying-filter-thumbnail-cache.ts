import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_TIMEOUT_MS = 10_000;

export interface JianyingFilterThumbnailSource {
	resourceId: string;
	version?: string;
	sourcePath?: string;
	sourceUrl?: string;
}

export interface JianyingFilterThumbnail {
	mimeType: "image/jpeg" | "image/png" | "image/webp";
	bytes: Buffer;
	fromCache: boolean;
}

function detectImageMimeType({
	bytes,
}: {
	bytes: Uint8Array;
}): JianyingFilterThumbnail["mimeType"] | undefined {
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	if (
		bytes.length >= 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff
	) {
		return "image/jpeg";
	}
	if (
		bytes.length >= 12 &&
		Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
		Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
	) {
		return "image/webp";
	}
}

function assertValidThumbnail({ bytes }: { bytes: Buffer }) {
	if (bytes.length === 0 || bytes.length > MAX_THUMBNAIL_BYTES) {
		throw new Error("剪映滤镜缩略图大小无效");
	}
	const mimeType = detectImageMimeType({ bytes });
	if (!mimeType) throw new Error("剪映滤镜缩略图格式不受支持");
	return mimeType;
}

function assertTrustedThumbnailUrl({ value }: { value: string }) {
	const parsed = new URL(value);
	if (
		parsed.protocol !== "https:" ||
		!(
			parsed.hostname === "byteimg.com" ||
			parsed.hostname.endsWith(".byteimg.com")
		)
	) {
		throw new Error("剪映滤镜缩略图地址不受信任");
	}
	return parsed.toString();
}

function thumbnailCachePath({
	cacheRoot,
	source,
}: {
	cacheRoot: string;
	source: JianyingFilterThumbnailSource;
}) {
	const fingerprint = createHash("sha256")
		.update(
			[
				source.resourceId,
				source.version ?? "",
				source.sourcePath ?? "",
				source.sourceUrl ?? "",
			].join("\0")
		)
		.digest("hex");
	return join(cacheRoot, `${fingerprint}.image`);
}

async function readCachedThumbnail({
	filePath,
}: {
	filePath: string;
}): Promise<JianyingFilterThumbnail | undefined> {
	try {
		const bytes = await readFile(filePath);
		return {
			mimeType: assertValidThumbnail({ bytes }),
			bytes,
			fromCache: true,
		};
	} catch {
		return undefined;
	}
}

async function readLocalThumbnail({ filePath }: { filePath: string }) {
	const fileStats = await stat(filePath);
	if (!fileStats.isFile() || fileStats.size > MAX_THUMBNAIL_BYTES) {
		throw new Error("本机剪映滤镜缩略图大小无效");
	}
	return readFile(filePath);
}

async function fetchRemoteThumbnail({
	url,
	fetcher,
}: {
	url: string;
	fetcher: typeof fetch;
}) {
	const response = await fetcher(assertTrustedThumbnailUrl({ value: url }), {
		credentials: "omit",
		redirect: "follow",
		signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`剪映滤镜缩略图请求失败 (${response.status})`);
	}
	assertTrustedThumbnailUrl({ value: response.url || url });
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_THUMBNAIL_BYTES) {
		throw new Error("剪映滤镜缩略图超过大小限制");
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	assertValidThumbnail({ bytes });
	return bytes;
}

async function cacheThumbnail({
	filePath,
	bytes,
}: {
	filePath: string;
	bytes: Buffer;
}) {
	await mkdir(dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporaryPath, bytes, { flag: "wx" });
	await rename(temporaryPath, filePath);
}

export async function readJianyingFilterThumbnail({
	source,
	cacheRoot,
	fetcher = fetch,
}: {
	source: JianyingFilterThumbnailSource;
	cacheRoot: string;
	fetcher?: typeof fetch;
}): Promise<JianyingFilterThumbnail> {
	const cachePath = thumbnailCachePath({ cacheRoot, source });
	const cached = await readCachedThumbnail({ filePath: cachePath });
	if (cached) return cached;

	const bytes = source.sourcePath
		? await readLocalThumbnail({ filePath: source.sourcePath })
		: source.sourceUrl
			? await fetchRemoteThumbnail({ url: source.sourceUrl, fetcher })
			: undefined;
	if (!bytes) throw new Error("该剪映滤镜没有可用缩略图");
	const mimeType = assertValidThumbnail({ bytes });
	await cacheThumbnail({ filePath: cachePath, bytes });
	return { mimeType, bytes, fromCache: false };
}
