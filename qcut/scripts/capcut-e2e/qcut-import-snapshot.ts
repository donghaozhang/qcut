import { createHash } from "node:crypto";
import { constants as fileSystemConstants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { mapWithConcurrency } from "./bounded-concurrency.js";
import type { QCutImportVerificationFileEvidence } from "./qcut-import-verification-contract.js";

const MAXIMUM_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;

export interface QCutImportSnapshotTrack {
	elements: unknown[];
	id: string;
	[key: string]: unknown;
}

export interface QCutImportSnapshotMedia {
	id: string;
	sourcePath: string;
	type: "audio" | "image" | "video";
}

export interface QCutImportSnapshotMediaEvidence {
	byteLength: number;
	id: string;
	sha256: string;
	type: "audio" | "image" | "video";
}

export interface ParsedQCutImportSnapshot {
	media: QCutImportSnapshotMedia[];
	project: { fps: number; height: number; name: string; width: number };
	tracks: QCutImportSnapshotTrack[];
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function requireFiniteNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number.`);
	}
	return value;
}

function requireArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireMediaType({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): QCutImportSnapshotMedia["type"] {
	if (value !== "audio" && value !== "image" && value !== "video") {
		throw new Error(`${label} is unsupported.`);
	}
	return value;
}

export function parseQCutImportSnapshot({
	value,
}: {
	value: unknown;
}): ParsedQCutImportSnapshot {
	const root = requireRecord({ label: "QCut snapshot", value });
	if (root.schemaVersion !== 1) {
		throw new Error("QCut snapshot schemaVersion must be 1.");
	}
	const projectValue = requireRecord({
		label: "QCut snapshot project",
		value: root.project,
	});
	const tracks = requireArray({
		label: "QCut snapshot tracks",
		value: root.tracks,
	}).map((trackValue, index) => {
		const track = requireRecord({
			label: `QCut snapshot track ${index}`,
			value: trackValue,
		});
		return {
			...track,
			elements: requireArray({
				label: `QCut snapshot track ${index} elements`,
				value: track.elements,
			}),
			id: requireString({
				label: `QCut snapshot track ${index} id`,
				value: track.id,
			}),
		};
	});
	const media = requireArray({
		label: "QCut snapshot media",
		value: root.media,
	}).map((mediaValue, index) => {
		const mediaItem = requireRecord({
			label: `QCut snapshot media ${index}`,
			value: mediaValue,
		});
		const sourcePath = requireString({
			label: `QCut snapshot media ${index} sourcePath`,
			value: mediaItem.sourcePath,
		});
		if (!isAbsolute(sourcePath)) {
			throw new Error(
				`QCut snapshot media ${index} sourcePath must be absolute.`
			);
		}
		return {
			id: requireString({
				label: `QCut snapshot media ${index} id`,
				value: mediaItem.id,
			}),
			sourcePath,
			type: requireMediaType({
				label: `QCut snapshot media ${index} type`,
				value: mediaItem.type,
			}),
		};
	});
	return {
		media,
		project: {
			fps: requireFiniteNumber({
				label: "QCut snapshot project fps",
				value: projectValue.fps,
			}),
			height: requireFiniteNumber({
				label: "QCut snapshot project height",
				value: projectValue.height,
			}),
			name: requireString({
				label: "QCut snapshot project name",
				value: projectValue.name,
			}),
			width: requireFiniteNumber({
				label: "QCut snapshot project width",
				value: projectValue.width,
			}),
		},
		tracks,
	};
}

function sameFileIdentity({
	left,
	right,
}: {
	left: BigIntStats;
	right: BigIntStats;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

export async function hashQCutImportSnapshotMedia({
	path,
}: {
	path: string;
}): Promise<QCutImportVerificationFileEvidence> {
	const before = await lstat(path, { bigint: true });
	if (before.isSymbolicLink() || !before.isFile()) {
		throw new Error("QCut snapshot media must be a regular non-symlink file.");
	}
	if (before.size <= 0n || before.size > BigInt(MAXIMUM_MEDIA_BYTES)) {
		throw new Error("QCut snapshot media is empty or exceeds the 4 GiB limit.");
	}
	const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
	const handle = await open(path, fileSystemConstants.O_RDONLY | noFollow);
	const hash = createHash("sha256");
	try {
		const opened = await handle.stat({ bigint: true });
		if (
			!opened.isFile() ||
			!sameFileIdentity({ left: before, right: opened })
		) {
			throw new Error("QCut snapshot media changed during preflight.");
		}
		const stream = handle.createReadStream({ autoClose: false });
		await new Promise<void>((resolveStream, rejectStream) => {
			stream.on("data", (chunk) => {
				hash.update(chunk);
			});
			stream.on("end", resolveStream);
			stream.on("error", rejectStream);
		});
		const afterRead = await handle.stat({ bigint: true });
		if (!sameFileIdentity({ left: opened, right: afterRead })) {
			throw new Error("QCut snapshot media changed while hashing.");
		}
	} finally {
		await handle.close();
	}
	const after = await lstat(path, { bigint: true });
	if (
		after.isSymbolicLink() ||
		!sameFileIdentity({ left: before, right: after })
	) {
		throw new Error("QCut snapshot media changed while hashing.");
	}
	return { byteLength: Number(after.size), sha256: hash.digest("hex") };
}

export async function describeQCutImportSnapshotMedia({
	concurrency = 4,
	media,
}: {
	concurrency?: number;
	media: readonly QCutImportSnapshotMedia[];
}): Promise<QCutImportSnapshotMediaEvidence[]> {
	return mapWithConcurrency({
		concurrency,
		items: media,
		mapper: async ({ item }) => ({
			...(await hashQCutImportSnapshotMedia({ path: item.sourcePath })),
			id: item.id,
			type: item.type,
		}),
	});
}

export function describeQCutImportVerificationBytes({
	bytes,
}: {
	bytes: Buffer;
}): QCutImportVerificationFileEvidence {
	return {
		byteLength: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

export function hashQCutImportMediaSet({
	media,
}: {
	media: readonly QCutImportSnapshotMediaEvidence[];
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify(
				[...media].sort((left, right) => left.id.localeCompare(right.id))
			)
		)
		.digest("hex");
}
