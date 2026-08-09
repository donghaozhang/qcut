import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;

export type DraftSourceKind = "backup" | "draft" | "subdraft";

export interface DraftDocumentSummary {
	materialCollections: Record<string, number>;
	materialReferences: {
		resolved: number;
		total: number;
		unresolved: number;
	};
	segmentCount: number;
	topLevelKeys: string[];
	trackCount: number;
	trackTypes: Record<string, number>;
}

export interface DraftFileEvidence {
	byteLength: number;
	format: "json" | "opaque";
	modifiedAt: string;
	path?: string;
	rawSha256: string;
	semanticSha256: string | null;
	sourceKind: DraftSourceKind;
	summary: DraftDocumentSummary | null;
	version: {
		appVersion: string;
		newVersion: string;
		version: number | null;
	} | null;
}

export interface DraftInventory {
	bySourceKind: Record<
		DraftSourceKind,
		{ json: number; opaque: number; total: number; withTimeline: number }
	>;
	candidateCount: number;
	documents?: DraftFileEvidence[];
	jsonCount: number;
	lockedProjectCount: number;
	materialCollections: Record<string, number>;
	opaqueCount: number;
	timelineDocumentCount: number;
	trackTypes: Record<string, number>;
	versions: Record<string, number>;
}

export interface FieldChange {
	after: unknown;
	before: unknown;
	path: string;
}

interface IndexedEntity {
	id: string;
	location: string;
	value: JsonRecord;
}

interface EntityChanges {
	added: { id: string; location: string }[];
	changed: {
		changes: FieldChange[];
		id: string;
		locationAfter: string;
		locationBefore: string;
	}[];
	removed: { id: string; location: string }[];
}

export interface DraftSemanticDiff {
	after: DraftFileEvidence;
	before: DraftFileEvidence;
	changes: {
		config: FieldChange[];
		materials: EntityChanges;
		root: FieldChange[];
		segments: EntityChanges;
		trackOrder: { after: string[]; before: string[] } | null;
		tracks: EntityChanges;
	};
	schema: "qcut.jianying-draft-semantic-diff";
	schemaVersion: 1;
}

const MAX_FIELD_CHANGES = 2_000;
const ROOT_SECTIONS = new Set(["config", "materials", "tracks", "update_time"]);
const SAFE_STRING_KEY = /(^id$|_id$|^type$|^mode$|^platform$|version$)/u;
const PRIVATE_DIGEST_KEY =
	process.env.QCUT_JIANYING_EVIDENCE_KEY?.trim() || randomBytes(32);

function objectValue({ value }: { value: unknown }): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function objectArray({ value }: { value: unknown }): JsonRecord[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const object = objectValue({ value: entry });
		return object ? [object] : [];
	});
}

function stringValue({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

function sha256({ value }: { value: string | Uint8Array }): string {
	return createHash("sha256").update(value).digest("hex");
}

function privateDigest({ value }: { value: string }): string {
	return createHmac("sha256", PRIVATE_DIGEST_KEY).update(value).digest("hex");
}

function canonicalize({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize({ value: entry }));
	}
	const object = objectValue({ value });
	if (object) {
		return Object.fromEntries(
			Object.entries(object)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize({ value: entry })]),
		);
	}
	return value;
}

function canonicalSemanticValue({ value }: { value: JsonRecord }): JsonRecord {
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== "update_time")
			.map(([key, entry]) => [key, canonicalize({ value: entry })]),
	);
}

function increment({
	record,
	key,
	amount = 1,
}: {
	record: Record<string, number>;
	key: string;
	amount?: number;
}): void {
	record[key] = (record[key] ?? 0) + amount;
}

function sortedCounts({
	record,
}: {
	record: Record<string, number>;
}): Record<string, number> {
	return Object.fromEntries(
		Object.entries(record).sort(
			([leftKey, leftCount], [rightKey, rightCount]) =>
				rightCount - leftCount || leftKey.localeCompare(rightKey),
		),
	);
}

function sourceKind({ filePath }: { filePath: string }): DraftSourceKind {
	if (filePath.includes(`${path.sep}.backup${path.sep}`)) return "backup";
	if (filePath.includes(`${path.sep}subdraft${path.sep}`)) return "subdraft";
	return "draft";
}

function isDraftCandidate({ filePath }: { filePath: string }): boolean {
	const basename = path.basename(filePath);
	return (
		basename === "draft_info.json" ||
		basename === "draft_info.json.bak" ||
		basename === "draft_content.json" ||
		(filePath.includes(`${path.sep}.backup${path.sep}`) &&
			basename.endsWith(".bak"))
	);
}

function walkFiles({ rootPath }: { rootPath: string }): string[] {
	if (!existsSync(rootPath)) return [];
	if (statSync(rootPath).isFile()) return [rootPath];
	const files: string[] = [];
	const pending = [rootPath];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const candidate = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(candidate);
				continue;
			}
			if (entry.isFile()) files.push(candidate);
		}
	}
	return files.sort();
}

export function findDraftCandidateFiles({
	rootPath,
}: {
	rootPath: string;
}): string[] {
	return walkFiles({ rootPath }).filter((filePath) =>
		isDraftCandidate({ filePath }),
	);
}

function draftSummary({
	content,
}: {
	content: JsonRecord;
}): DraftDocumentSummary {
	const trackTypes: Record<string, number> = {};
	const materialCollections: Record<string, number> = {};
	const materialIds = new Set<string>();
	const references: string[] = [];
	let segmentCount = 0;
	const materials = objectValue({ value: content.materials }) ?? {};
	for (const [collection, value] of Object.entries(materials)) {
		if (!Array.isArray(value)) continue;
		materialCollections[collection] = value.length;
		for (const material of objectArray({ value })) {
			const id = stringValue({ value: material.id });
			if (id) materialIds.add(id);
		}
	}
	const tracks = objectArray({ value: content.tracks });
	for (const track of tracks) {
		increment({
			record: trackTypes,
			key: stringValue({ value: track.type }) || "<missing>",
		});
		for (const segment of objectArray({ value: track.segments })) {
			segmentCount += 1;
			const materialId = stringValue({ value: segment.material_id });
			if (materialId) references.push(materialId);
			if (Array.isArray(segment.extra_material_refs)) {
				for (const reference of segment.extra_material_refs) {
					if (typeof reference === "string" && reference)
						references.push(reference);
				}
			}
		}
	}
	const resolved = references.filter((reference) =>
		materialIds.has(reference),
	).length;
	return {
		materialCollections: sortedCounts({ record: materialCollections }),
		materialReferences: {
			resolved,
			total: references.length,
			unresolved: references.length - resolved,
		},
		segmentCount,
		topLevelKeys: Object.keys(content).sort(),
		trackCount: tracks.length,
		trackTypes: sortedCounts({ record: trackTypes }),
	};
}

function parseJsonRecord({ bytes }: { bytes: Uint8Array }): JsonRecord | null {
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return objectValue({ value: parsed });
	} catch {
		return null;
	}
}

export function inspectDraftFile({
	filePath,
	includePath = false,
}: {
	filePath: string;
	includePath?: boolean;
}): DraftFileEvidence {
	const bytes = readFileSync(filePath);
	const content = parseJsonRecord({ bytes });
	const platform = content ? objectValue({ value: content.platform }) : null;
	const version = content
		? {
				appVersion: stringValue({ value: platform?.app_version }),
				newVersion: stringValue({ value: content.new_version }),
				version: typeof content.version === "number" ? content.version : null,
			}
		: null;
	return {
		byteLength: bytes.byteLength,
		format: content ? "json" : "opaque",
		modifiedAt: statSync(filePath).mtime.toISOString(),
		...(includePath ? { path: path.resolve(filePath) } : {}),
		rawSha256: sha256({ value: bytes }),
		semanticSha256: content
			? privateDigest({
					value: JSON.stringify(canonicalSemanticValue({ value: content })),
				})
			: null,
		sourceKind: sourceKind({ filePath }),
		summary: content ? draftSummary({ content }) : null,
		version,
	};
}

function emptyKindCounts() {
	return { json: 0, opaque: 0, total: 0, withTimeline: 0 };
}

export function inventoryDraftRoot({
	rootPath,
	includePaths = false,
}: {
	rootPath: string;
	includePaths?: boolean;
}): DraftInventory {
	const candidateFiles = findDraftCandidateFiles({ rootPath });
	const documents = candidateFiles.map((filePath) =>
		inspectDraftFile({ filePath, includePath: includePaths }),
	);
	const bySourceKind: DraftInventory["bySourceKind"] = {
		backup: emptyKindCounts(),
		draft: emptyKindCounts(),
		subdraft: emptyKindCounts(),
	};
	const trackTypes: Record<string, number> = {};
	const materialCollections: Record<string, number> = {};
	const versions: Record<string, number> = {};
	let jsonCount = 0;
	let timelineDocumentCount = 0;
	for (const document of documents) {
		const kind = bySourceKind[document.sourceKind];
		kind.total += 1;
		kind[document.format] += 1;
		if (document.format === "json") jsonCount += 1;
		if (document.summary?.trackCount) {
			kind.withTimeline += 1;
			timelineDocumentCount += 1;
		}
		for (const [type, count] of Object.entries(
			document.summary?.trackTypes ?? {},
		)) {
			increment({ record: trackTypes, key: type, amount: count });
		}
		for (const [collection, count] of Object.entries(
			document.summary?.materialCollections ?? {},
		)) {
			increment({
				record: materialCollections,
				key: collection,
				amount: count,
			});
		}
		if (document.version) {
			const key = [
				document.version.version ?? "",
				document.version.newVersion,
				document.version.appVersion,
			].join("|");
			increment({ record: versions, key });
		}
	}
	return {
		bySourceKind,
		candidateCount: documents.length,
		...(includePaths ? { documents } : {}),
		jsonCount,
		lockedProjectCount: walkFiles({ rootPath }).filter(
			(filePath) => path.basename(filePath) === ".locked",
		).length,
		materialCollections: sortedCounts({ record: materialCollections }),
		opaqueCount: documents.length - jsonCount,
		timelineDocumentCount,
		trackTypes: sortedCounts({ record: trackTypes }),
		versions: sortedCounts({ record: versions }),
	};
}

function safeSnapshot({
	pathValue,
	value,
}: {
	pathValue: string;
	value: unknown;
}): unknown {
	if (typeof value === "string") {
		const key =
			pathValue
				.split(/[.[\]]/u)
				.filter(Boolean)
				.at(-1) ?? "";
		if (SAFE_STRING_KEY.test(key)) return value;
		return {
			kind: "string",
			length: value.length,
			hmacSha256: privateDigest({ value }),
		};
	}
	if (Array.isArray(value)) return { kind: "array", length: value.length };
	const object = objectValue({ value });
	if (object) return { kind: "object", keys: Object.keys(object).sort() };
	return value;
}

function collectFieldChanges({
	after,
	before,
	pathValue,
	changes,
}: {
	after: unknown;
	before: unknown;
	pathValue: string;
	changes: FieldChange[];
}): void {
	if (changes.length >= MAX_FIELD_CHANGES || isDeepStrictEqual(before, after))
		return;
	if (Array.isArray(before) && Array.isArray(after)) {
		const length = Math.max(before.length, after.length);
		for (let index = 0; index < length; index += 1) {
			collectFieldChanges({
				after: after[index],
				before: before[index],
				changes,
				pathValue: `${pathValue}[${index}]`,
			});
		}
		return;
	}
	const beforeObject = objectValue({ value: before });
	const afterObject = objectValue({ value: after });
	if (beforeObject && afterObject) {
		const keys = [
			...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]),
		].sort();
		for (const key of keys) {
			collectFieldChanges({
				after: afterObject[key],
				before: beforeObject[key],
				changes,
				pathValue: pathValue ? `${pathValue}.${key}` : key,
			});
		}
		return;
	}
	changes.push({
		after: safeSnapshot({ pathValue, value: after }),
		before: safeSnapshot({ pathValue, value: before }),
		path: pathValue,
	});
}

function fieldChanges({
	after,
	before,
}: {
	after: unknown;
	before: unknown;
}): FieldChange[] {
	const changes: FieldChange[] = [];
	collectFieldChanges({ after, before, changes, pathValue: "" });
	return changes;
}

function indexTracks({
	content,
}: {
	content: JsonRecord;
}): Map<string, IndexedEntity> {
	return new Map(
		objectArray({ value: content.tracks }).map((track, index) => {
			const id = stringValue({ value: track.id }) || `track-index:${index}`;
			return [id, { id, location: `tracks[${index}]`, value: track }];
		}),
	);
}

function indexSegments({
	content,
}: {
	content: JsonRecord;
}): Map<string, IndexedEntity> {
	const entries: [string, IndexedEntity][] = [];
	for (const [trackIndex, track] of objectArray({
		value: content.tracks,
	}).entries()) {
		const trackId =
			stringValue({ value: track.id }) || `track-index:${trackIndex}`;
		for (const [segmentIndex, segment] of objectArray({
			value: track.segments,
		}).entries()) {
			const id =
				stringValue({ value: segment.id }) ||
				`${trackId}/segment-index:${segmentIndex}`;
			entries.push([
				id,
				{
					id,
					location: `tracks[${trackIndex}].segments[${segmentIndex}]`,
					value: segment,
				},
			]);
		}
	}
	return new Map(entries);
}

function indexMaterials({
	content,
}: {
	content: JsonRecord;
}): Map<string, IndexedEntity> {
	const entries: [string, IndexedEntity][] = [];
	const materials = objectValue({ value: content.materials }) ?? {};
	for (const [collection, value] of Object.entries(materials).sort(
		([left], [right]) => left.localeCompare(right),
	)) {
		for (const [index, material] of objectArray({ value }).entries()) {
			const localId = stringValue({ value: material.id }) || `index:${index}`;
			const id = `${collection}/${localId}`;
			entries.push([
				id,
				{ id, location: `materials.${collection}[${index}]`, value: material },
			]);
		}
	}
	return new Map(entries);
}

function compareEntities({
	after,
	before,
}: {
	after: Map<string, IndexedEntity>;
	before: Map<string, IndexedEntity>;
}): EntityChanges {
	const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
	const result: EntityChanges = { added: [], changed: [], removed: [] };
	for (const id of ids) {
		const beforeEntity = before.get(id);
		const afterEntity = after.get(id);
		if (!beforeEntity && afterEntity) {
			result.added.push({ id, location: afterEntity.location });
			continue;
		}
		if (beforeEntity && !afterEntity) {
			result.removed.push({ id, location: beforeEntity.location });
			continue;
		}
		if (!(beforeEntity && afterEntity)) continue;
		const changes = fieldChanges({
			before: beforeEntity.value,
			after: afterEntity.value,
		});
		if (changes.length === 0 && beforeEntity.location === afterEntity.location)
			continue;
		result.changed.push({
			changes,
			id,
			locationAfter: afterEntity.location,
			locationBefore: beforeEntity.location,
		});
	}
	return result;
}

function requireJsonDraft({ filePath }: { filePath: string }): JsonRecord {
	const content = parseJsonRecord({ bytes: readFileSync(filePath) });
	if (!content) throw new Error(`${filePath} is not a plaintext JSON draft.`);
	return content;
}

function rootWithoutSections({ content }: { content: JsonRecord }): JsonRecord {
	return Object.fromEntries(
		Object.entries(content).filter(([key]) => !ROOT_SECTIONS.has(key)),
	);
}

export function diffDraftFiles({
	afterPath,
	beforePath,
	includePaths = false,
}: {
	afterPath: string;
	beforePath: string;
	includePaths?: boolean;
}): DraftSemanticDiff {
	const beforeContent = requireJsonDraft({ filePath: beforePath });
	const afterContent = requireJsonDraft({ filePath: afterPath });
	const beforeTrackOrder = [...indexTracks({ content: beforeContent }).keys()];
	const afterTrackOrder = [...indexTracks({ content: afterContent }).keys()];
	return {
		after: inspectDraftFile({ filePath: afterPath, includePath: includePaths }),
		before: inspectDraftFile({
			filePath: beforePath,
			includePath: includePaths,
		}),
		changes: {
			config: fieldChanges({
				before: beforeContent.config,
				after: afterContent.config,
			}),
			materials: compareEntities({
				before: indexMaterials({ content: beforeContent }),
				after: indexMaterials({ content: afterContent }),
			}),
			root: fieldChanges({
				before: rootWithoutSections({ content: beforeContent }),
				after: rootWithoutSections({ content: afterContent }),
			}),
			segments: compareEntities({
				before: indexSegments({ content: beforeContent }),
				after: indexSegments({ content: afterContent }),
			}),
			trackOrder: isDeepStrictEqual(beforeTrackOrder, afterTrackOrder)
				? null
				: { before: beforeTrackOrder, after: afterTrackOrder },
			tracks: compareEntities({
				before: indexTracks({ content: beforeContent }),
				after: indexTracks({ content: afterContent }),
			}),
		},
		schema: "qcut.jianying-draft-semantic-diff",
		schemaVersion: 1,
	};
}
