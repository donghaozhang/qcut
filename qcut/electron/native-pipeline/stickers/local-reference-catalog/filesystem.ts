import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

export const MAX_LOCAL_REFERENCE_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_LOCAL_REFERENCE_JSON_BYTES = 16 * 1024 * 1024;

interface FileIdentity {
	dev: number;
	ino: number;
	mode: number;
	mtimeMs: number;
	ctimeMs: number;
	size: number;
}

function fileIdentity({
	stats,
}: {
	stats: {
		dev: number;
		ino: number;
		mode: number;
		mtimeMs: number;
		ctimeMs: number;
		size: number;
	};
}): FileIdentity {
	return {
		dev: stats.dev,
		ino: stats.ino,
		mode: stats.mode,
		mtimeMs: stats.mtimeMs,
		ctimeMs: stats.ctimeMs,
		size: stats.size,
	};
}

function sameFileIdentity({
	left,
	right,
}: {
	left: FileIdentity;
	right: FileIdentity;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs &&
		left.size === right.size
	);
}

export function isPathInside({
	root,
	target,
}: {
	root: string;
	target: string;
}): boolean {
	const relativePath = relative(root, target);
	return (
		relativePath === "" ||
		(!relativePath.startsWith(`..${sep}`) &&
			relativePath !== ".." &&
			!isAbsolute(relativePath))
	);
}

function assertAbsolutePathWithoutDotSegments({
	filePath,
	label,
}: {
	filePath: string;
	label: string;
}): void {
	if (!isAbsolute(filePath)) {
		throw new Error(`${label} path must be absolute`);
	}
	if (
		filePath
			.split(/[\\/]/)
			.some((segment) => segment === "." || segment === "..")
	) {
		throw new Error(`${label} path must not contain dot segments`);
	}
}

async function assertNoSymlinkSegments({
	canonicalRoot,
	targetPath,
}: {
	canonicalRoot: string;
	targetPath: string;
}): Promise<void> {
	const relativePath = relative(canonicalRoot, targetPath);
	const segments = relativePath.split(sep).filter(Boolean);
	const segmentPaths = segments.map((_, index) =>
		resolve(canonicalRoot, ...segments.slice(0, index + 1))
	);
	const segmentStats = await Promise.all(
		segmentPaths.map((segmentPath) => lstat(segmentPath))
	);
	const symlinkIndex = segmentStats.findIndex((stats) =>
		stats.isSymbolicLink()
	);
	if (symlinkIndex >= 0) {
		throw new Error(
			`Local sticker path must not contain symlinks: ${segmentPaths[symlinkIndex]}`
		);
	}
}

async function assertStableRegularFile({
	canonicalRoot,
	filePath,
	label,
	maxBytes,
}: {
	canonicalRoot: string;
	filePath: string;
	label: string;
	maxBytes: number;
}): Promise<{ canonicalPath: string; identity: FileIdentity }> {
	assertAbsolutePathWithoutDotSegments({ filePath, label });
	const requestedPath = resolve(filePath);
	if (!isPathInside({ root: canonicalRoot, target: requestedPath })) {
		throw new Error(`${label} path escapes its batch`);
	}
	await assertNoSymlinkSegments({ canonicalRoot, targetPath: requestedPath });
	const canonicalPath = await realpath(requestedPath);
	if (!isPathInside({ root: canonicalRoot, target: canonicalPath })) {
		throw new Error(`${label} realpath escapes its batch`);
	}
	const stats = await lstat(requestedPath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file`);
	}
	if (stats.size <= 0 || stats.size > maxBytes) {
		throw new Error(`${label} has an invalid byte size: ${stats.size}`);
	}
	return { canonicalPath, identity: fileIdentity({ stats }) };
}

function openFlags(): number {
	return constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
}

async function readStableFile({
	canonicalRoot,
	filePath,
	label,
	maxBytes,
}: {
	canonicalRoot: string;
	filePath: string;
	label: string;
	maxBytes: number;
}): Promise<Uint8Array> {
	const inspected = await assertStableRegularFile({
		canonicalRoot,
		filePath,
		label,
		maxBytes,
	});
	const handle = await open(inspected.canonicalPath, openFlags());
	try {
		const handleStats = await handle.stat();
		const handleIdentity = fileIdentity({ stats: handleStats });
		if (
			!handleStats.isFile() ||
			!sameFileIdentity({
				left: inspected.identity,
				right: handleIdentity,
			})
		) {
			throw new Error(`${label} changed before reading`);
		}
		const bytes = new Uint8Array(await handle.readFile());
		const afterStats = await stat(inspected.canonicalPath);
		if (
			!sameFileIdentity({
				left: handleIdentity,
				right: fileIdentity({ stats: afterStats }),
			})
		) {
			throw new Error(`${label} changed while reading`);
		}
		return bytes;
	} finally {
		await handle.close();
	}
}

export async function resolveRegularDirectory({
	directoryPath,
	label,
}: {
	directoryPath: string;
	label: string;
}): Promise<string> {
	assertAbsolutePathWithoutDotSegments({ filePath: directoryPath, label });
	const requestedPath = resolve(directoryPath);
	const stats = await lstat(requestedPath);
	if (!stats.isDirectory() || stats.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink directory`);
	}
	const canonicalPath = await realpath(requestedPath);
	const [requestedAfter, canonicalStats] = await Promise.all([
		lstat(requestedPath),
		lstat(canonicalPath),
	]);
	const isStableDirectory =
		requestedAfter.isDirectory() &&
		!requestedAfter.isSymbolicLink() &&
		canonicalStats.isDirectory() &&
		!canonicalStats.isSymbolicLink() &&
		stats.dev === requestedAfter.dev &&
		stats.ino === requestedAfter.ino &&
		stats.dev === canonicalStats.dev &&
		stats.ino === canonicalStats.ino;
	if (!isStableDirectory) {
		throw new Error(`${label} changed while resolving`);
	}
	return canonicalPath;
}

export async function readSecureJson({
	batchRoot,
	filePath,
	label,
}: {
	batchRoot: string;
	filePath: string;
	label: string;
}): Promise<unknown> {
	const bytes = await readStableFile({
		canonicalRoot: batchRoot,
		filePath,
		label,
		maxBytes: MAX_LOCAL_REFERENCE_JSON_BYTES,
	});
	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error(`${label} must be UTF-8 JSON`);
	}
	try {
		return JSON.parse(jsonText) as unknown;
	} catch {
		throw new Error(`${label} contains malformed JSON`);
	}
}

export async function inspectLocalStickerFile({
	batchRoot,
	expectedByteSize,
	filePath,
	stickerId,
}: {
	batchRoot: string;
	expectedByteSize: number;
	filePath: string;
	stickerId: string;
}): Promise<string> {
	const inspected = await assertStableRegularFile({
		canonicalRoot: batchRoot,
		filePath,
		label: `Sticker ${stickerId}`,
		maxBytes: MAX_LOCAL_REFERENCE_ASSET_BYTES,
	});
	if (inspected.identity.size !== expectedByteSize) {
		throw new Error(`Sticker byte size mismatch: ${stickerId}`);
	}
	return inspected.canonicalPath;
}

function hasExpectedMagic({
	bytes,
	mimeType,
}: {
	bytes: Uint8Array;
	mimeType: "image/gif" | "image/png";
}): boolean {
	if (mimeType === "image/gif") {
		if (bytes.byteLength < 6) return false;
		const signature = new TextDecoder("ascii").decode(bytes.slice(0, 6));
		return signature === "GIF87a" || signature === "GIF89a";
	}
	const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
	return (
		bytes.byteLength >= pngSignature.length &&
		pngSignature.every((value, index) => bytes[index] === value)
	);
}

export async function readVerifiedLocalStickerFile({
	batchRoot,
	expectedByteSize,
	expectedChecksumSha256,
	filePath,
	mimeType,
	stickerId,
}: {
	batchRoot: string;
	expectedByteSize: number;
	expectedChecksumSha256: string;
	filePath: string;
	mimeType: "image/gif" | "image/png";
	stickerId: string;
}): Promise<Uint8Array> {
	const bytes = await readStableFile({
		canonicalRoot: batchRoot,
		filePath,
		label: `Sticker ${stickerId}`,
		maxBytes: MAX_LOCAL_REFERENCE_ASSET_BYTES,
	});
	if (bytes.byteLength !== expectedByteSize) {
		throw new Error(`Sticker byte size mismatch: ${stickerId}`);
	}
	const checksum = createHash("sha256").update(bytes).digest("hex");
	if (checksum !== expectedChecksumSha256) {
		throw new Error(`Sticker SHA-256 mismatch: ${stickerId}`);
	}
	if (!hasExpectedMagic({ bytes, mimeType })) {
		throw new Error(`Sticker magic does not match MIME type: ${stickerId}`);
	}
	return bytes;
}
