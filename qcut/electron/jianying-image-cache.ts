import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type JianyingImageMimeType =
	| "image/gif"
	| "image/jpeg"
	| "image/png"
	| "image/webp";

export interface JianyingCachedImage {
	mimeType: JianyingImageMimeType;
	bytes: Buffer;
	fromCache: boolean;
}

export interface JianyingCachedImageSource {
	cacheKey: string;
	produce?: () => Promise<Buffer>;
	sourcePath?: string;
	sourceUrl?: string;
}

const inFlightImages = new Map<string, Promise<JianyingCachedImage>>();

function detectImageMimeType({
	bytes,
}: {
	bytes: Uint8Array;
}): JianyingImageMimeType | undefined {
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
		bytes.length >= 6 &&
		(Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF87a" ||
			Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF89a")
	) {
		return "image/gif";
	}
	if (
		bytes.length >= 12 &&
		Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
		Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
	) {
		return "image/webp";
	}
}

function assertValidImage({
	bytes,
	label,
	maximumBytes,
}: {
	bytes: Buffer;
	label: string;
	maximumBytes: number;
}) {
	if (bytes.length === 0 || bytes.length > maximumBytes) {
		throw new Error(`${label}大小无效`);
	}
	const mimeType = detectImageMimeType({ bytes });
	if (!mimeType) throw new Error(`${label}格式不受支持`);
	return mimeType;
}

function assertTrustedImageUrl({ value }: { value: string }) {
	const parsed = new URL(value);
	if (
		parsed.protocol !== "https:" ||
		!(
			parsed.hostname === "byteimg.com" ||
			parsed.hostname.endsWith(".byteimg.com")
		)
	) {
		throw new Error("剪映图片地址不受信任");
	}
	return parsed.toString();
}

function imageCachePath({
	cacheRoot,
	cacheKey,
}: {
	cacheRoot: string;
	cacheKey: string;
}) {
	if (!cacheKey) throw new Error("剪映图片缓存键不能为空");
	const fingerprint = createHash("sha256").update(cacheKey).digest("hex");
	return join(cacheRoot, `${fingerprint}.image`);
}

async function readCachedImage({
	filePath,
	label,
	maximumBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes: number;
}): Promise<JianyingCachedImage | undefined> {
	try {
		const bytes = await readFile(filePath);
		return {
			mimeType: assertValidImage({ bytes, label, maximumBytes }),
			bytes,
			fromCache: true,
		};
	} catch {
		return undefined;
	}
}

async function readLocalImage({
	filePath,
	label,
	maximumBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes: number;
}) {
	const fileStats = await stat(filePath);
	if (!fileStats.isFile() || fileStats.size > maximumBytes) {
		throw new Error(`本机${label}大小无效`);
	}
	return readFile(filePath);
}

async function readResponseBody({
	chunks,
	maximumBytes,
	reader,
	receivedBytes,
}: {
	chunks: Buffer[];
	maximumBytes: number;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	receivedBytes: number;
}): Promise<Buffer> {
	const { done, value } = await reader.read();
	if (done) return Buffer.concat(chunks, receivedBytes);
	const nextReceivedBytes = receivedBytes + value.byteLength;
	if (nextReceivedBytes > maximumBytes) {
		await reader.cancel();
		throw new Error("剪映图片超过大小限制");
	}
	chunks.push(Buffer.from(value));
	return readResponseBody({
		chunks,
		maximumBytes,
		reader,
		receivedBytes: nextReceivedBytes,
	});
}

async function fetchRemoteImage({
	fetcher,
	label,
	maximumBytes,
	timeoutMs,
	url,
}: {
	fetcher: typeof fetch;
	label: string;
	maximumBytes: number;
	timeoutMs: number;
	url: string;
}) {
	const trustedUrl = assertTrustedImageUrl({ value: url });
	const response = await fetcher(trustedUrl, {
		credentials: "omit",
		redirect: "follow",
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) throw new Error(`${label}请求失败 (${response.status})`);
	assertTrustedImageUrl({ value: response.url || trustedUrl });
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
		await response.body?.cancel();
		throw new Error(`${label}超过大小限制`);
	}
	if (!response.body) throw new Error(`${label}响应为空`);
	const bytes = await readResponseBody({
		chunks: [],
		maximumBytes,
		reader: response.body.getReader(),
		receivedBytes: 0,
	});
	assertValidImage({ bytes, label, maximumBytes });
	return bytes;
}

async function cacheImage({
	bytes,
	filePath,
}: {
	bytes: Buffer;
	filePath: string;
}) {
	await mkdir(dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, bytes, { flag: "wx" });
	await rename(temporaryPath, filePath);
}

async function loadJianyingCachedImage({
	cachePath,
	fetcher,
	label,
	maximumBytes,
	source,
	timeoutMs,
}: {
	cachePath: string;
	fetcher: typeof fetch;
	label: string;
	maximumBytes: number;
	source: JianyingCachedImageSource;
	timeoutMs: number;
}) {
	const cached = await readCachedImage({
		filePath: cachePath,
		label,
		maximumBytes,
	});
	if (cached) return cached;
	let sourceError: unknown;
	let bytes: Buffer | undefined;
	// Try every source the caller supplied, local first: a stale or missing
	// local path must still fall back to the remote copy instead of failing.
	if (source.sourcePath) {
		try {
			bytes = await readLocalImage({
				filePath: source.sourcePath,
				label,
				maximumBytes,
			});
		} catch (error) {
			sourceError = error;
		}
	}
	if (!bytes && source.sourceUrl) {
		try {
			bytes = await fetchRemoteImage({
				fetcher,
				label,
				maximumBytes,
				timeoutMs,
				url: source.sourceUrl,
			});
		} catch (error) {
			sourceError = error;
		}
	}
	if (!bytes && source.produce) bytes = await source.produce();
	if (!bytes && sourceError) throw sourceError;
	if (!bytes) throw new Error(`${label}没有可用来源`);
	const mimeType = assertValidImage({ bytes, label, maximumBytes });
	await cacheImage({ filePath: cachePath, bytes });
	return { mimeType, bytes, fromCache: false } satisfies JianyingCachedImage;
}

export function readJianyingCachedImage({
	cacheRoot,
	fetcher = fetch,
	label,
	maximumBytes = 2 * 1024 * 1024,
	source,
	timeoutMs = 10_000,
}: {
	cacheRoot: string;
	fetcher?: typeof fetch;
	label: string;
	maximumBytes?: number;
	source: JianyingCachedImageSource;
	timeoutMs?: number;
}): Promise<JianyingCachedImage> {
	const cachePath = imageCachePath({
		cacheRoot,
		cacheKey: source.cacheKey,
	});
	const pending = inFlightImages.get(cachePath);
	if (pending) return pending;
	const task = loadJianyingCachedImage({
		cachePath,
		fetcher,
		label,
		maximumBytes,
		source,
		timeoutMs,
	}).finally(() => {
		inFlightImages.delete(cachePath);
	});
	inFlightImages.set(cachePath, task);
	return task;
}
