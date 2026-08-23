import { createHash, randomUUID } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StickerLabMediaMetadata } from "../../types/sticker-lab-media-metadata.js";
import { parseStickerLabMediaMetadata } from "../../types/sticker-lab-media-metadata.js";
import {
	requireExactKeys,
	requireRecord,
	requireString,
} from "../../types/strict-json-validation.js";
import { getMediaPath } from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";

const HANDLER_NAME = "Media";
const SIDECAR_DIRECTORY_NAME = ".qcut-restricted-media";
const SIDECAR_MAX_BYTES = 8192;
const SIDECAR_VERSION = 1;

interface RestrictedMediaSidecar {
	mediaId: string;
	metadata: StickerLabMediaMetadata;
	version: typeof SIDECAR_VERSION;
}

function isFileSystemError({
	code,
	error,
}: {
	code: string;
	error: unknown;
}): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

function requireMediaId({ mediaId }: { mediaId: string }): string {
	return requireString({
		label: "Restricted media ID",
		maximumLength: 512,
		value: mediaId,
	});
}

function getSidecarDirectory({ projectId }: { projectId: string }): string {
	return path.join(getMediaPath(projectId), SIDECAR_DIRECTORY_NAME);
}

function getSidecarPath({
	mediaId,
	projectId,
}: {
	mediaId: string;
	projectId: string;
}): string {
	const normalizedMediaId = requireMediaId({ mediaId });
	const fileName = `${createHash("sha256")
		.update(normalizedMediaId, "utf8")
		.digest("hex")}.json`;
	return path.join(getSidecarDirectory({ projectId }), fileName);
}

async function ensureSidecarDirectory({
	projectId,
}: {
	projectId: string;
}): Promise<string> {
	const mediaPath = getMediaPath(projectId);
	const sidecarDirectory = getSidecarDirectory({ projectId });
	await fs.mkdir(mediaPath, { recursive: true });
	try {
		await fs.mkdir(sidecarDirectory, { mode: 0o700 });
	} catch (error) {
		if (!isFileSystemError({ code: "EEXIST", error })) throw error;
	}
	const stat = await fs.lstat(sidecarDirectory);
	if (stat.isSymbolicLink() || !stat.isDirectory()) {
		throw new Error("Restricted media sidecar path must be a local directory.");
	}
	await fs.chmod(sidecarDirectory, 0o700);
	return sidecarDirectory;
}

async function getExistingSidecarDirectory({
	projectId,
}: {
	projectId: string;
}): Promise<string | undefined> {
	const sidecarDirectory = getSidecarDirectory({ projectId });
	let stat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stat = await fs.lstat(sidecarDirectory);
	} catch (error) {
		if (isFileSystemError({ code: "ENOENT", error })) return;
		throw error;
	}
	if (stat.isSymbolicLink() || !stat.isDirectory()) {
		throw new Error("Restricted media sidecar path must be a local directory.");
	}
	return sidecarDirectory;
}

function parseSidecar({
	candidate,
	expectedMediaId,
}: {
	candidate: unknown;
	expectedMediaId: string;
}): RestrictedMediaSidecar {
	const record = requireRecord({
		label: "Restricted media sidecar",
		value: candidate,
	});
	requireExactKeys({
		keys: ["version", "mediaId", "metadata"],
		label: "Restricted media sidecar",
		record,
	});
	if (record.version !== SIDECAR_VERSION) {
		throw new Error("Restricted media sidecar version is unsupported.");
	}
	const mediaId = requireMediaId({
		mediaId: requireString({
			label: "Restricted media sidecar mediaId",
			maximumLength: 512,
			value: record.mediaId,
		}),
	});
	if (mediaId !== expectedMediaId) {
		throw new Error(
			"Restricted media sidecar mediaId does not match its file."
		);
	}
	return {
		mediaId,
		metadata: parseStickerLabMediaMetadata({
			candidate: record.metadata,
			label: "Restricted media sidecar metadata",
		}),
		version: SIDECAR_VERSION,
	};
}

export async function persistMediaRestrictedMetadata({
	mediaId,
	metadata,
	projectId,
}: {
	mediaId: string;
	metadata: StickerLabMediaMetadata;
	projectId: string;
}): Promise<void> {
	const normalizedMediaId = requireMediaId({ mediaId });
	const normalizedMetadata = parseStickerLabMediaMetadata({
		candidate: metadata,
		label: "Restricted media metadata",
	});
	const directory = await ensureSidecarDirectory({ projectId });
	const destinationPath = getSidecarPath({
		mediaId: normalizedMediaId,
		projectId,
	});
	const temporaryPath = path.join(
		directory,
		`.${path.basename(destinationPath)}.${randomUUID()}.tmp`
	);
	const sidecar: RestrictedMediaSidecar = {
		mediaId: normalizedMediaId,
		metadata: normalizedMetadata,
		version: SIDECAR_VERSION,
	};
	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(temporaryPath, "wx", 0o600);
		await handle.writeFile(`${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
		await handle.chmod(0o600);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await fs.rename(temporaryPath, destinationPath);
	} catch (error) {
		await handle?.close().catch(() => undefined);
		await fs.unlink(temporaryPath).catch(() => undefined);
		throw error;
	}
}

export async function readMediaRestrictedMetadata({
	mediaId,
	projectId,
}: {
	mediaId: string;
	projectId: string;
}): Promise<StickerLabMediaMetadata | undefined> {
	let normalizedMediaId: string;
	let sidecarPath: string;
	let handle: fs.FileHandle | undefined;
	try {
		normalizedMediaId = requireMediaId({ mediaId });
		if (!(await getExistingSidecarDirectory({ projectId }))) return;
		sidecarPath = getSidecarPath({ mediaId: normalizedMediaId, projectId });
		handle = await fs.open(
			sidecarPath,
			fileSystemConstants.O_RDONLY | fileSystemConstants.O_NOFOLLOW
		);
		const stat = await handle.stat();
		if (!stat.isFile() || stat.size < 2 || stat.size > SIDECAR_MAX_BYTES) {
			throw new Error(
				"Restricted media sidecar is not a bounded regular file."
			);
		}
		const buffer = Buffer.alloc(SIDECAR_MAX_BYTES + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const verifiedStat = await handle.stat();
		if (
			bytesRead !== stat.size ||
			verifiedStat.size !== stat.size ||
			verifiedStat.dev !== stat.dev ||
			verifiedStat.ino !== stat.ino
		) {
			throw new Error("Restricted media sidecar changed while it was read.");
		}
		const raw = buffer.subarray(0, bytesRead).toString("utf8");
		return parseSidecar({
			candidate: JSON.parse(raw),
			expectedMediaId: normalizedMediaId,
		}).metadata;
	} catch (error) {
		if (isFileSystemError({ code: "ENOENT", error })) return;
		claudeLog.warn(
			HANDLER_NAME,
			`Refusing invalid restricted metadata for media ${mediaId}`
		);
		throw error;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

export async function deleteMediaRestrictedMetadata({
	mediaId,
	projectId,
}: {
	mediaId: string;
	projectId: string;
}): Promise<void> {
	if (!(await getExistingSidecarDirectory({ projectId }))) return;
	const sidecarPath = getSidecarPath({ mediaId, projectId });
	try {
		await fs.unlink(sidecarPath);
	} catch (error) {
		if (!isFileSystemError({ code: "ENOENT", error })) throw error;
	}
}
