import { sha256 } from "@noble/hashes/sha2";
import type { TimelineTrack } from "../types/timeline.js";
import type { QCutImportBundleV1 } from "./import-bundle.js";
import {
	buildQCutImportTimelineTracks,
	getQCutImportMediaType,
} from "./qcut-import-state.js";

export const QCUT_IMPORT_VERIFICATION_SCHEMA =
	"qcut.draft-interop.import-verification" as const;

export interface QCutImportVerificationMedia {
	byteLength: number;
	id: string;
	sha256?: string;
	type: "audio" | "image" | "video";
}

export interface QCutImportVerificationMediaSource {
	bytes: Blob;
	id: string;
	type: "audio" | "image" | "video";
}

export interface QCutImportVerificationIssue {
	code:
		| "EXPECTED_STATE_INVALID"
		| "MEDIA_DUPLICATE"
		| "MEDIA_MISMATCH"
		| "MEDIA_MISSING"
		| "MEDIA_UNEXPECTED"
		| "TRACK_DUPLICATE"
		| "TRACK_MISMATCH"
		| "TRACK_MISSING"
		| "TRACK_UNEXPECTED";
	path: string;
}

export interface QCutImportVerificationResult {
	actual: { mediaCount: number; trackCount: number };
	bundleDigest: string;
	expected: { mediaCount: number; trackCount: number };
	issues: QCutImportVerificationIssue[];
	schema: typeof QCUT_IMPORT_VERIFICATION_SCHEMA;
	schemaVersion: 1;
	verdict: "pass" | "fail";
}

interface ExpectedQCutImportMedia {
	byteLength?: number;
	id: string;
	sha256?: string;
	type: "audio" | "image" | "video";
}

function bytesToHex({ bytes }: { bytes: Uint8Array }): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashBlob({ bytes }: { bytes: Blob }): Promise<string> {
	const hasher = sha256.create();
	if (typeof bytes.stream !== "function") {
		const updateNextSlice = async ({
			offset,
		}: {
			offset: number;
		}): Promise<void> => {
			if (offset >= bytes.size) return;
			const end = Math.min(offset + 8 * 1024 * 1024, bytes.size);
			const chunk = await bytes.slice(offset, end).arrayBuffer();
			hasher.update(new Uint8Array(chunk));
			await updateNextSlice({ offset: end });
		};
		await updateNextSlice({ offset: 0 });
		return bytesToHex({ bytes: hasher.digest() });
	}
	await bytes.stream().pipeTo(
		new WritableStream<Uint8Array>({
			write(chunk) {
				hasher.update(chunk);
			},
		})
	);
	return bytesToHex({ bytes: hasher.digest() });
}

export async function describeQCutImportMedia({
	concurrency = 2,
	media,
}: {
	concurrency?: number;
	media: readonly QCutImportVerificationMediaSource[];
}): Promise<QCutImportVerificationMedia[]> {
	if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
		throw new Error(
			"Import media hash concurrency must be a positive integer."
		);
	}
	const results = new Array<QCutImportVerificationMedia>(media.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= media.length) return;
		const item = media[index];
		if (item === undefined) return;
		results[index] = {
			byteLength: item.bytes.size,
			id: item.id,
			sha256: await hashBlob({ bytes: item.bytes }),
			type: item.type,
		};
		await runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, media.length) }, async () =>
			runNext()
		)
	);
	return results;
}

function canonicalize({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize({ value: entry }));
	}
	if (typeof value !== "object" || value === null) return value;
	const record = value as Record<string, unknown>;
	const canonical: Record<string, unknown> = {};
	for (const key of Object.keys(record).sort()) {
		if (record[key] !== undefined) {
			canonical[key] = canonicalize({ value: record[key] });
		}
	}
	return canonical;
}

function valuesEqual({
	left,
	right,
}: {
	left: unknown;
	right: unknown;
}): boolean {
	return (
		JSON.stringify(canonicalize({ value: left })) ===
		JSON.stringify(canonicalize({ value: right }))
	);
}

function collectDuplicates<T extends { id: string }>({
	items,
}: {
	items: readonly T[];
}): Set<string> {
	const duplicates = new Set<string>();
	const seen = new Set<string>();
	for (const item of items) {
		if (seen.has(item.id)) duplicates.add(item.id);
		seen.add(item.id);
	}
	return duplicates;
}

function requireUniqueInternalIds({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): void {
	const internalIds = Object.values(bundle.internalIdBySemanticId);
	if (new Set(internalIds).size !== internalIds.length) {
		throw new Error("Import bundle contains duplicate internal ids.");
	}
}

function issuePath({
	collection,
	id,
}: {
	collection: "media" | "tracks";
	id: string;
}): string {
	const escapedId = encodeURIComponent(
		id.replaceAll("~", "~0").replaceAll("/", "~1")
	);
	return `/${collection}/${escapedId}`;
}

function collectExpectedMedia({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): ExpectedQCutImportMedia[] {
	return bundle.resourceStaging
		.filter(({ status }) => status === "resolved")
		.map((resource) => {
			const id = bundle.internalIdBySemanticId[resource.resourceId];
			if (id === undefined) {
				throw new Error(
					`Import bundle has no internal id for ${resource.resourceId}.`
				);
			}
			return {
				id,
				type: getQCutImportMediaType({ resourceKind: resource.kind }),
				...(resource.byteLength === undefined
					? {}
					: { byteLength: resource.byteLength }),
				...(resource.sha256 === undefined ? {} : { sha256: resource.sha256 }),
			};
		})
		.sort((left, right) => left.id.localeCompare(right.id));
}

function mediaMatches({
	actual,
	expected,
}: {
	actual: QCutImportVerificationMedia;
	expected: ExpectedQCutImportMedia;
}): boolean {
	return (
		actual.id === expected.id &&
		actual.type === expected.type &&
		(expected.byteLength === undefined ||
			actual.byteLength === expected.byteLength) &&
		(expected.sha256 === undefined || actual.sha256 === expected.sha256)
	);
}

function compareMedia({
	actualMedia,
	expectedMedia,
	issues,
}: {
	actualMedia: readonly QCutImportVerificationMedia[];
	expectedMedia: readonly ExpectedQCutImportMedia[];
	issues: QCutImportVerificationIssue[];
}): void {
	for (const id of [...collectDuplicates({ items: actualMedia })].sort()) {
		issues.push({
			code: "MEDIA_DUPLICATE",
			path: issuePath({ collection: "media", id }),
		});
	}
	const actualById = new Map(actualMedia.map((media) => [media.id, media]));
	const expectedById = new Map(expectedMedia.map((media) => [media.id, media]));
	for (const expected of expectedMedia) {
		const actual = actualById.get(expected.id);
		if (actual === undefined) {
			issues.push({
				code: "MEDIA_MISSING",
				path: issuePath({ collection: "media", id: expected.id }),
			});
			continue;
		}
		if (!mediaMatches({ actual, expected })) {
			issues.push({
				code: "MEDIA_MISMATCH",
				path: issuePath({ collection: "media", id: expected.id }),
			});
		}
	}
	for (const actual of [...actualMedia].sort((left, right) =>
		left.id.localeCompare(right.id)
	)) {
		if (!expectedById.has(actual.id)) {
			issues.push({
				code: "MEDIA_UNEXPECTED",
				path: issuePath({ collection: "media", id: actual.id }),
			});
		}
	}
}

function buildResolvedMediaIdMap({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): Map<string, string> {
	const mediaItemIdByResourceId = new Map<string, string>();
	for (const resource of bundle.resourceStaging) {
		if (resource.status !== "resolved") continue;
		const internalId = bundle.internalIdBySemanticId[resource.resourceId];
		if (internalId === undefined) {
			throw new Error(
				`Import bundle has no internal id for ${resource.resourceId}.`
			);
		}
		mediaItemIdByResourceId.set(resource.resourceId, internalId);
	}
	return mediaItemIdByResourceId;
}

function compareTracks({
	actualTracks,
	expectedTracks,
	issues,
}: {
	actualTracks: readonly TimelineTrack[];
	expectedTracks: readonly TimelineTrack[];
	issues: QCutImportVerificationIssue[];
}): void {
	for (const id of [...collectDuplicates({ items: actualTracks })].sort()) {
		issues.push({
			code: "TRACK_DUPLICATE",
			path: issuePath({ collection: "tracks", id }),
		});
	}
	const actualById = new Map(actualTracks.map((track) => [track.id, track]));
	const expectedById = new Map(
		expectedTracks.map((track) => [track.id, track])
	);
	for (const expected of expectedTracks) {
		const actual = actualById.get(expected.id);
		if (actual === undefined) {
			issues.push({
				code: "TRACK_MISSING",
				path: issuePath({ collection: "tracks", id: expected.id }),
			});
			continue;
		}
		if (!valuesEqual({ left: actual, right: expected })) {
			issues.push({
				code: "TRACK_MISMATCH",
				path: issuePath({ collection: "tracks", id: expected.id }),
			});
		}
	}
	for (const actual of [...actualTracks].sort((left, right) =>
		left.id.localeCompare(right.id)
	)) {
		if (!expectedById.has(actual.id)) {
			issues.push({
				code: "TRACK_UNEXPECTED",
				path: issuePath({ collection: "tracks", id: actual.id }),
			});
		}
	}
}

export function verifyQCutImportMaterialization({
	actualMedia,
	actualTracks,
	bundle,
}: {
	actualMedia: readonly QCutImportVerificationMedia[];
	actualTracks: readonly TimelineTrack[];
	bundle: QCutImportBundleV1;
}): QCutImportVerificationResult {
	const issues: QCutImportVerificationIssue[] = [];
	let expectedMedia: ExpectedQCutImportMedia[] = [];
	let expectedTracks: TimelineTrack[] = [];
	try {
		requireUniqueInternalIds({ bundle });
		expectedMedia = collectExpectedMedia({ bundle });
		expectedTracks = buildQCutImportTimelineTracks({
			bundle,
			mediaItemIdByResourceId: buildResolvedMediaIdMap({ bundle }),
		});
	} catch {
		issues.push({ code: "EXPECTED_STATE_INVALID", path: "/bundle" });
	}
	compareMedia({ actualMedia, expectedMedia, issues });
	compareTracks({ actualTracks, expectedTracks, issues });
	return {
		actual: { mediaCount: actualMedia.length, trackCount: actualTracks.length },
		bundleDigest: bundle.bundleDigest,
		expected: {
			mediaCount: expectedMedia.length,
			trackCount: expectedTracks.length,
		},
		issues,
		schema: QCUT_IMPORT_VERIFICATION_SCHEMA,
		schemaVersion: 1,
		verdict: issues.length === 0 ? "pass" : "fail",
	};
}
