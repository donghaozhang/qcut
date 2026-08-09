export type ImportJournalPhase = "staging" | "published";

export interface ImportJournalRecordV1 {
	schemaVersion: 1;
	/** Plan token of the bundle that started this import. */
	importId: string;
	bundleDigest: string;
	phase: ImportJournalPhase;
	projectId: string;
	sceneId: string;
	mediaItemIds: string[];
	startedAtIso: string;
	updatedAtIso: string;
}

const REQUIRED_RECORD_KEYS = [
	"schemaVersion",
	"importId",
	"bundleDigest",
	"phase",
	"projectId",
	"sceneId",
	"mediaItemIds",
	"startedAtIso",
	"updatedAtIso",
] as const;
const OPTIONAL_RECORD_KEYS = ["id"] as const;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_MEDIA_ITEM_IDS = 100_000;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class ImportJournalRecordCorruptError extends Error {
	constructor({ reason }: { reason: string }) {
		super(`Import journal record is corrupt: ${reason}`);
		this.name = "ImportJournalRecordCorruptError";
	}
}

function corrupt({ reason }: { reason: string }): never {
	throw new ImportJournalRecordCorruptError({ reason });
}

function asRecord({ value }: { value: unknown }): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return corrupt({ reason: "expected an object" });
	}
	return value as Record<string, unknown>;
}

function assertAllowedKeys({
	record,
}: {
	record: Record<string, unknown>;
}): void {
	const allowedKeys = new Set<string>([
		...REQUIRED_RECORD_KEYS,
		...OPTIONAL_RECORD_KEYS,
	]);
	for (const key of Object.keys(record)) {
		if (!allowedKeys.has(key)) {
			corrupt({ reason: `unsupported field '${key}'` });
		}
	}
	for (const key of REQUIRED_RECORD_KEYS) {
		if (!(key in record)) {
			corrupt({ reason: `missing field '${key}'` });
		}
	}
}

function asIdentifier({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > MAX_IDENTIFIER_LENGTH ||
		!SAFE_IDENTIFIER_PATTERN.test(value)
	) {
		return corrupt({ reason: `${label} is not a safe identifier` });
	}
	return value;
}

function asSha256({ value }: { value: unknown }): string {
	if (typeof value !== "string" || !SHA_256_PATTERN.test(value)) {
		return corrupt({
			reason: "bundleDigest is not a lowercase SHA-256 digest",
		});
	}
	return value;
}

function asTimestamp({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
		return corrupt({ reason: `${label} is not a canonical UTC timestamp` });
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		return corrupt({ reason: `${label} is not a valid timestamp` });
	}
	return value;
}

function asMediaItemIds({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value) || value.length > MAX_MEDIA_ITEM_IDS) {
		return corrupt({ reason: "mediaItemIds is not a bounded array" });
	}
	const mediaItemIds = value.map((mediaItemId) =>
		asIdentifier({ label: "mediaItemId", value: mediaItemId })
	);
	if (new Set(mediaItemIds).size !== mediaItemIds.length) {
		return corrupt({ reason: "mediaItemIds contains duplicates" });
	}
	return mediaItemIds;
}

export function assertImportJournalStorageKey({
	storageKey,
}: {
	storageKey: string;
}): void {
	asIdentifier({ label: "storage key", value: storageKey });
}

/** Parses persisted adapter data without trusting its TypeScript assertion. */
export function parseImportJournalRecordV1({
	storageKey,
	value,
}: {
	storageKey: string;
	value: unknown;
}): ImportJournalRecordV1 {
	assertImportJournalStorageKey({ storageKey });
	const record = asRecord({ value });
	assertAllowedKeys({ record });
	if (record.schemaVersion !== 1) {
		return corrupt({ reason: "unsupported schemaVersion" });
	}
	const importId = asIdentifier({ label: "importId", value: record.importId });
	if (importId !== storageKey) {
		return corrupt({ reason: "storage key does not match importId" });
	}
	if (record.id !== undefined && record.id !== storageKey) {
		return corrupt({ reason: "IndexedDB id does not match the storage key" });
	}
	if (record.phase !== "staging" && record.phase !== "published") {
		return corrupt({ reason: "phase is unsupported" });
	}
	const startedAtIso = asTimestamp({
		label: "startedAtIso",
		value: record.startedAtIso,
	});
	const updatedAtIso = asTimestamp({
		label: "updatedAtIso",
		value: record.updatedAtIso,
	});
	if (Date.parse(updatedAtIso) < Date.parse(startedAtIso)) {
		return corrupt({ reason: "updatedAtIso predates startedAtIso" });
	}
	return {
		schemaVersion: 1,
		importId,
		bundleDigest: asSha256({ value: record.bundleDigest }),
		phase: record.phase,
		projectId: asIdentifier({ label: "projectId", value: record.projectId }),
		sceneId: asIdentifier({ label: "sceneId", value: record.sceneId }),
		mediaItemIds: asMediaItemIds({ value: record.mediaItemIds }),
		startedAtIso,
		updatedAtIso,
	};
}
