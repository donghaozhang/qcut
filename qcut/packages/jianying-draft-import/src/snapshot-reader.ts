/**
 * Bounded draft snapshot reader (JYI-006).
 *
 * Reads the discovered files into an immutable snapshot: size limits are
 * enforced before any byte is read, every open uses O_NOFOLLOW, file
 * identity (device/inode/mtime) is captured before and re-checked after
 * each read so a mid-read swap surfaces as SOURCE_FILE_CHANGED, and
 * classification decides what later stages may parse. The reader never
 * writes and never touches files outside the discovery manifest.
 *
 * @module @qcut/jianying-draft-import/snapshot-reader
 */

import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type {
	DraftSourceFile,
	DraftSourceFileClassification,
	InteropIssue,
} from "@qcut/editor-core/draft-interop";
import type { DiscoveredDraftFile } from "./discovery.js";

export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

/** Stable identity of a source file at snapshot time. */
export interface DraftSourceFileIdentity {
	device: string;
	inode: string;
	size: string;
	mtimeNanoseconds: string;
}

export interface DraftSourceSnapshotFile extends DraftSourceFile {
	identity: DraftSourceFileIdentity;
}

export interface DraftSourceSnapshot {
	rootRealPath: string;
	files: DraftSourceSnapshotFile[];
	/** Parsed JSON for plaintext content/meta files, keyed by relative path. */
	parsedJsonByPath: Record<string, unknown>;
	/** RESTRICTED raw bytes, held in main-process memory for envelope capture. */
	bytesByPath: Record<string, Buffer>;
	issues: InteropIssue[];
}

function toIdentity({
	metadata,
}: {
	metadata: BigIntStats;
}): DraftSourceFileIdentity {
	return {
		device: metadata.dev.toString(),
		inode: metadata.ino.toString(),
		size: metadata.size.toString(),
		mtimeNanoseconds: metadata.mtimeNs.toString(),
	};
}

function identitiesEqual(
	a: DraftSourceFileIdentity,
	b: DraftSourceFileIdentity
): boolean {
	return (
		a.device === b.device &&
		a.inode === b.inode &&
		a.size === b.size &&
		a.mtimeNanoseconds === b.mtimeNanoseconds
	);
}

function classifyBytes({
	bytes,
	role,
}: {
	bytes: Buffer;
	role: DraftSourceFile["role"];
}): { classification: DraftSourceFileClassification; parsed?: unknown } {
	// A NUL byte is valid UTF-8 but never appears in draft text formats.
	if (bytes.includes(0)) {
		return { classification: role === "content" ? "encrypted" : "binary" };
	}
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		// Content files that are not valid text are encrypted in every
		// JianYing/CapCut version we track; other binary files stay "binary".
		return { classification: role === "content" ? "encrypted" : "binary" };
	}
	try {
		return { classification: "plaintext-json", parsed: JSON.parse(text) };
	} catch {
		return { classification: "opaque-text" };
	}
}

async function readBoundedFile({
	absolutePath,
	maxFileBytes,
}: {
	absolutePath: string;
	maxFileBytes: number;
}): Promise<
	| {
			ok: true;
			bytes: Buffer;
			sha256: string;
			identity: DraftSourceFileIdentity;
	  }
	| { ok: false; issue: Omit<InteropIssue, "path" | "subjectId"> }
> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
	} catch {
		return {
			ok: false,
			issue: {
				code: "SOURCE_FILE_MISSING",
				severity: "error",
				message: "file is missing or is not a regular readable file",
			},
		};
	}
	try {
		const before = await handle.stat({ bigint: true });
		if (!before.isFile()) {
			return {
				ok: false,
				issue: {
					code: "SOURCE_FILE_MISSING",
					severity: "error",
					message: "path is not a regular file",
				},
			};
		}
		if (before.size > BigInt(maxFileBytes)) {
			return {
				ok: false,
				issue: {
					code: "SOURCE_FILE_TOO_LARGE",
					severity: "error",
					message: `file exceeds the ${maxFileBytes}-byte read limit`,
				},
			};
		}
		const size = Number(before.size);
		const bytes = Buffer.alloc(size);
		let offset = 0;
		while (offset < size) {
			const { bytesRead } = await handle.read(
				bytes,
				offset,
				size - offset,
				offset
			);
			if (bytesRead === 0) {
				break;
			}
			offset += bytesRead;
		}
		const after = await handle.stat({ bigint: true });
		const beforeIdentity = toIdentity({ metadata: before });
		if (
			offset !== size ||
			!identitiesEqual(beforeIdentity, toIdentity({ metadata: after }))
		) {
			return {
				ok: false,
				issue: {
					code: "SOURCE_FILE_CHANGED",
					severity: "error",
					message: "file changed while it was being read",
				},
			};
		}
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		return { ok: true, bytes, sha256, identity: beforeIdentity };
	} finally {
		await handle.close().catch(() => undefined);
	}
}

/**
 * Reads every discovered file into an immutable snapshot. Per-file failures
 * become issues; the snapshot always describes exactly what was read.
 */
export async function readDraftSourceSnapshot({
	rootRealPath,
	files,
	maxFileBytes = DEFAULT_MAX_FILE_BYTES,
	maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
}: {
	rootRealPath: string;
	files: readonly DiscoveredDraftFile[];
	maxFileBytes?: number;
	maxTotalBytes?: number;
}): Promise<DraftSourceSnapshot> {
	const snapshot: DraftSourceSnapshot = {
		rootRealPath,
		files: [],
		parsedJsonByPath: {},
		bytesByPath: {},
		issues: [],
	};
	let totalBytes = 0;
	for (const file of files) {
		if (totalBytes + file.byteLength > maxTotalBytes) {
			snapshot.issues.push({
				code: "SOURCE_FILE_TOO_LARGE",
				severity: "error",
				message: `total snapshot budget of ${maxTotalBytes} bytes exhausted`,
				path: file.relativePath,
			});
			continue;
		}
		const result = await readBoundedFile({
			absolutePath: join(rootRealPath, file.relativePath),
			maxFileBytes,
		});
		if (!result.ok) {
			snapshot.issues.push({ ...result.issue, path: file.relativePath });
			continue;
		}
		totalBytes += result.bytes.length;
		const { classification, parsed } = classifyBytes({
			bytes: result.bytes,
			role: file.role,
		});
		if (parsed !== undefined && file.role !== "asset") {
			snapshot.parsedJsonByPath[file.relativePath] = parsed;
		}
		snapshot.bytesByPath[file.relativePath] = result.bytes;
		snapshot.files.push({
			relativePath: file.relativePath,
			byteLength: result.bytes.length,
			sha256: result.sha256,
			role: file.role,
			classification,
			identity: result.identity,
		});
	}
	return snapshot;
}

/**
 * Re-checks every snapshot file against the live filesystem — the "active
 * source changed" gate that plan/commit stages run before acting on a
 * snapshot taken earlier.
 */
export async function verifyDraftSourceUnchanged({
	snapshot,
}: {
	snapshot: DraftSourceSnapshot;
}): Promise<InteropIssue[]> {
	const issues: InteropIssue[] = [];
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	for (const file of snapshot.files) {
		const absolutePath = join(snapshot.rootRealPath, file.relativePath);
		let handle: Awaited<ReturnType<typeof open>> | undefined;
		try {
			handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
			const metadata = await handle.stat({ bigint: true });
			if (!identitiesEqual(file.identity, toIdentity({ metadata }))) {
				issues.push({
					code: "SOURCE_FILE_CHANGED",
					severity: "error",
					message: "file changed since the snapshot was taken",
					path: file.relativePath,
				});
			}
		} catch {
			issues.push({
				code: "SOURCE_FILE_MISSING",
				severity: "error",
				message: "file disappeared since the snapshot was taken",
				path: file.relativePath,
			});
		} finally {
			await handle?.close().catch(() => undefined);
		}
	}
	return issues;
}
