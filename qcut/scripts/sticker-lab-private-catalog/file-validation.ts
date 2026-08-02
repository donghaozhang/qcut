import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import type { LocalPublicationAsset, StickerMimeType } from "./types";

function isPathInside({
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

async function assertNoSymlinkSegments({
	canonicalRoot,
	targetPath,
}: {
	canonicalRoot: string;
	targetPath: string;
}): Promise<void> {
	const relativePath = relative(canonicalRoot, targetPath);
	const segments = relativePath.split(sep).filter(Boolean);
	const paths = segments.map((_, index) =>
		resolve(canonicalRoot, ...segments.slice(0, index + 1))
	);
	const stats = await Promise.all(paths.map((path) => lstat(path)));
	for (const [index, pathStats] of stats.entries()) {
		if (pathStats.isSymbolicLink()) {
			throw new Error(
				`Sticker path must not contain symlinks: ${paths[index]}`
			);
		}
	}
}

function hasExpectedMagic({
	bytes,
	mimeType,
}: {
	bytes: Uint8Array;
	mimeType: StickerMimeType;
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

export async function readVerifiedStickerFile({
	expectedByteSize,
	expectedChecksumSha256,
	id,
	mimeType,
	sourcePath,
	sourceRoot,
}: {
	expectedByteSize: number;
	expectedChecksumSha256: string;
	id: string;
	mimeType: StickerMimeType;
	sourcePath: string;
	sourceRoot: string;
}): Promise<Uint8Array> {
	if (!isAbsolute(sourcePath)) {
		throw new Error(`Sticker file path must be absolute: ${id}`);
	}
	if (
		sourcePath
			.split(/[\\/]/)
			.some((segment) => segment === "." || segment === "..")
	) {
		throw new Error(`Sticker file path contains a dot segment: ${id}`);
	}
	const requestedPath = resolve(sourcePath);
	if (!isPathInside({ root: sourceRoot, target: requestedPath })) {
		throw new Error(`Sticker file path escapes its batch: ${id}`);
	}
	await assertNoSymlinkSegments({
		canonicalRoot: sourceRoot,
		targetPath: requestedPath,
	});
	const canonicalPath = await realpath(requestedPath);
	if (!isPathInside({ root: sourceRoot, target: canonicalPath })) {
		throw new Error(`Sticker realpath escapes its batch: ${id}`);
	}

	const beforeStats = await lstat(requestedPath);
	if (!beforeStats.isFile() || beforeStats.isSymbolicLink()) {
		throw new Error(`Sticker asset must be a regular non-symlink file: ${id}`);
	}
	const handle = await open(
		requestedPath,
		constants.O_RDONLY | constants.O_NOFOLLOW
	);
	try {
		const handleStats = await handle.stat();
		if (
			!handleStats.isFile() ||
			handleStats.dev !== beforeStats.dev ||
			handleStats.ino !== beforeStats.ino
		) {
			throw new Error(`Sticker asset changed before reading: ${id}`);
		}
		const bytes = new Uint8Array(await handle.readFile());
		const afterStats = await stat(requestedPath);
		if (
			afterStats.dev !== handleStats.dev ||
			afterStats.ino !== handleStats.ino ||
			afterStats.size !== handleStats.size ||
			afterStats.mtimeMs !== handleStats.mtimeMs
		) {
			throw new Error(`Sticker asset changed while reading: ${id}`);
		}
		if (bytes.byteLength !== expectedByteSize) {
			throw new Error(`Sticker byte size mismatch: ${id}`);
		}
		const checksum = createHash("sha256").update(bytes).digest("hex");
		if (checksum !== expectedChecksumSha256) {
			throw new Error(`Sticker SHA-256 mismatch: ${id}`);
		}
		if (!hasExpectedMagic({ bytes, mimeType })) {
			throw new Error(`Sticker magic does not match MIME type: ${id}`);
		}
		return bytes;
	} finally {
		await handle.close();
	}
}

export async function readLocalPublicationAssetBytes({
	asset,
}: {
	asset: LocalPublicationAsset;
}): Promise<Uint8Array> {
	return readVerifiedStickerFile({
		expectedByteSize: asset.byteSize,
		expectedChecksumSha256: asset.checksumSha256,
		id: asset.objectKey,
		mimeType: asset.mimeType,
		sourcePath: asset.sourcePath,
		sourceRoot: asset.sourceRoot,
	});
}

export async function mapWithConcurrency<TInput, TOutput>({
	concurrency,
	inputs,
	worker,
}: {
	concurrency: number;
	inputs: readonly TInput[];
	worker: ({ input }: { input: TInput }) => Promise<TOutput>;
}): Promise<TOutput[]> {
	const outputs = new Array<TOutput>(inputs.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= inputs.length) return;
		outputs[index] = await worker({ input: inputs[index] as TInput });
		return runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, inputs.length) }, () =>
			runNext()
		)
	);
	return outputs;
}
