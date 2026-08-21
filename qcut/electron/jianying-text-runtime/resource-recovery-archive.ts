import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import type extractZipType from "extract-zip";

let cachedExtractZip: typeof extractZipType | null | undefined;

/**
 * Loaded lazily: this module's import chain reaches main.js, so a top-level
 * import would turn a packaging omission of extract-zip into a startup crash
 * of the whole app. Missing here only disables archive recovery.
 */
function loadExtractZip(): typeof extractZipType | null {
	if (cachedExtractZip !== undefined) return cachedExtractZip;
	try {
		const loaded = require("extract-zip") as
			| typeof extractZipType
			| { default: typeof extractZipType };
		cachedExtractZip =
			typeof loaded === "function" ? loaded : (loaded.default ?? null);
	} catch (error) {
		console.warn(
			"[JianyingTextRuntime] extract-zip unavailable; archive recovery disabled:",
			error
		);
		cachedExtractZip = null;
	}
	return cachedExtractZip;
}

const MAXIMUM_ARCHIVE_ENTRIES = 8192;
const MAXIMUM_ARCHIVE_FILE_BYTES = 128 * 1024 * 1024;
const MAXIMUM_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAXIMUM_COMPRESSION_RATIO = 1000;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const UNIX_DIRECTORY = 0o040000;

interface ArchiveEntryLike {
	fileName: string;
	compressedSize: number;
	uncompressedSize: number;
	externalFileAttributes: number;
	versionMadeBy: number;
}

interface ArchiveInspectionState {
	entryCount: number;
	uncompressedBytes: number;
}

export function validateJianyingRecoveryArchiveEntry({
	entry,
	state,
}: {
	entry: ArchiveEntryLike;
	state: ArchiveInspectionState;
}) {
	if (
		entry.fileName.length === 0 ||
		entry.fileName.includes("\0") ||
		entry.fileName.includes("\\") ||
		path.posix.isAbsolute(entry.fileName) ||
		entry.fileName.split("/").includes("..")
	) {
		throw new Error("Jianying resource archive contains an unsafe path");
	}
	const madeByUnix = entry.versionMadeBy >>> 8 === 3;
	if (madeByUnix) {
		const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
		const fileType = mode & UNIX_FILE_TYPE_MASK;
		if (
			fileType !== 0 &&
			fileType !== UNIX_REGULAR_FILE &&
			fileType !== UNIX_DIRECTORY
		) {
			throw new Error("Jianying resource archive contains a link or device");
		}
	}
	if (
		entry.uncompressedSize < 0 ||
		entry.uncompressedSize > MAXIMUM_ARCHIVE_FILE_BYTES
	) {
		throw new Error("Jianying resource archive entry is too large");
	}
	if (
		entry.uncompressedSize > 1024 * 1024 &&
		entry.uncompressedSize / Math.max(1, entry.compressedSize) >
			MAXIMUM_COMPRESSION_RATIO
	) {
		throw new Error("Jianying resource archive compression ratio is unsafe");
	}
	state.entryCount += 1;
	state.uncompressedBytes += entry.uncompressedSize;
	if (
		state.entryCount > MAXIMUM_ARCHIVE_ENTRIES ||
		state.uncompressedBytes > MAXIMUM_EXTRACTED_BYTES
	) {
		throw new Error("Jianying resource archive exceeds extraction limits");
	}
}

export async function extractValidatedJianyingResourceArchive({
	archivePath,
	destination,
}: {
	archivePath: string;
	destination: string;
}) {
	const state: ArchiveInspectionState = {
		entryCount: 0,
		uncompressedBytes: 0,
	};
	const extractZip = loadExtractZip();
	if (!extractZip) {
		throw new Error(
			"Archive extraction unavailable: extract-zip is missing from this build"
		);
	}
	await extractZip(archivePath, {
		dir: destination,
		onEntry: (entry) => validateJianyingRecoveryArchiveEntry({ entry, state }),
	});
}

export function calculateJianyingResourceArchiveMd5({
	filePath,
}: {
	filePath: string;
}) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash("md5");
		const stream = createReadStream(filePath);
		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}
