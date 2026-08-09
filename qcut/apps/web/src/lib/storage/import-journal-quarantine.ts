import type { StorageAdapter } from "./types";

export interface ImportJournalQuarantineMarkerV1 {
	schemaVersion: 1;
	sourceFingerprintSha256: string;
	quarantinedAtIso: string;
}

const MAX_FINGERPRINT_INPUT_BYTES = 1024 * 1024;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function bytesToHex({ bytes }: { bytes: Uint8Array }): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asCanonicalTimestamp({ value }: { value: unknown }): string {
	if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
		throw new Error("Import journal quarantine timestamp is invalid.");
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error("Import journal quarantine timestamp is invalid.");
	}
	return value;
}

export async function fingerprintCorruptImportJournalRecord({
	storageKey,
	value,
}: {
	storageKey: string;
	value: unknown;
}): Promise<string | null> {
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify([storageKey, value]);
	} catch {
		return null;
	}
	if (serialized === undefined) return null;
	const bytes = new TextEncoder().encode(serialized);
	if (bytes.byteLength > MAX_FINGERPRINT_INPUT_BYTES) return null;
	const subtle = globalThis.crypto?.subtle;
	if (subtle === undefined) return null;
	try {
		return bytesToHex({
			bytes: new Uint8Array(await subtle.digest("SHA-256", bytes)),
		});
	} catch {
		return null;
	}
}

export function parseImportJournalQuarantineMarkerV1({
	storageKey,
	value,
}: {
	storageKey: string;
	value: unknown;
}): ImportJournalQuarantineMarkerV1 {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Import journal quarantine marker must be an object.");
	}
	const record = value as Record<string, unknown>;
	const quarantinedAtIso = asCanonicalTimestamp({
		value: record.quarantinedAtIso,
	});
	const allowedKeys = new Set([
		"id",
		"schemaVersion",
		"sourceFingerprintSha256",
		"quarantinedAtIso",
	]);
	if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
		throw new Error("Import journal quarantine marker has unknown fields.");
	}
	if (
		record.schemaVersion !== 1 ||
		typeof record.sourceFingerprintSha256 !== "string" ||
		!SHA_256_PATTERN.test(record.sourceFingerprintSha256) ||
		record.sourceFingerprintSha256 !== storageKey ||
		(record.id !== undefined && record.id !== storageKey)
	) {
		throw new Error("Import journal quarantine marker is invalid.");
	}
	return {
		schemaVersion: 1,
		sourceFingerprintSha256: record.sourceFingerprintSha256,
		quarantinedAtIso,
	};
}

export async function hasImportJournalQuarantineMarker({
	adapter,
	fingerprint,
}: {
	adapter: StorageAdapter<ImportJournalQuarantineMarkerV1>;
	fingerprint: string;
}): Promise<boolean> {
	try {
		const value = await adapter.get(fingerprint);
		if (value === null) return false;
		parseImportJournalQuarantineMarkerV1({
			storageKey: fingerprint,
			value,
		});
		return true;
	} catch {
		return false;
	}
}

export async function persistImportJournalQuarantineMarker({
	adapter,
	fingerprint,
	quarantinedAtIso,
}: {
	adapter: StorageAdapter<ImportJournalQuarantineMarkerV1>;
	fingerprint: string;
	quarantinedAtIso: string;
}): Promise<void> {
	const marker = parseImportJournalQuarantineMarkerV1({
		storageKey: fingerprint,
		value: {
			schemaVersion: 1,
			sourceFingerprintSha256: fingerprint,
			quarantinedAtIso,
		},
	});
	await adapter.set(fingerprint, marker);
	const persisted = await adapter.get(fingerprint);
	if (persisted === null) {
		throw new Error("Import journal quarantine marker was not persisted.");
	}
	parseImportJournalQuarantineMarkerV1({
		storageKey: fingerprint,
		value: persisted,
	});
}
