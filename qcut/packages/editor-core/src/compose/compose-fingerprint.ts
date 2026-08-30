import { sha256 } from "@noble/hashes/sha2";
import type {
	ComposeSnapshotCaption,
	ComposeSnapshotMedia,
	ComposeSnapshotProject,
} from "./compose-types.js";

export interface ComposeFingerprintInput {
	project: ComposeSnapshotProject;
	media: readonly ComposeSnapshotMedia[];
	captions: readonly ComposeSnapshotCaption[];
}

function bytesToHex({ bytes }: { bytes: Uint8Array }): string {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

function canonicalize({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize({ value: entry }));
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			if (record[key] === undefined) continue;
			result[key] = canonicalize({ value: record[key] });
		}
		return result;
	}
	return value;
}

function sortedByIdentity<T extends { id: string; startTime?: number }>({
	items,
}: {
	items: readonly T[];
}): T[] {
	return [...items].sort(
		(left, right) =>
			(left.startTime ?? 0) - (right.startTime ?? 0) ||
			left.id.localeCompare(right.id)
	);
}

/**
 * Fingerprints the identity-bearing parts of a snapshot: project settings and
 * the timeline elements a patch can target. Item order and object key order do
 * not affect the result, so repeated snapshots of an unchanged timeline agree.
 */
export function computeComposeSourceFingerprint({
	project,
	media,
	captions,
}: ComposeFingerprintInput): string {
	const canonical = canonicalize({
		value: {
			project,
			media: sortedByIdentity({ items: media }),
			captions: sortedByIdentity({ items: captions }),
		},
	});
	const encoded = new TextEncoder().encode(JSON.stringify(canonical));
	return bytesToHex({ bytes: sha256(encoded) });
}
