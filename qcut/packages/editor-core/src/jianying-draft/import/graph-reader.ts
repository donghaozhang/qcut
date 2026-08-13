/**
 * Raw draft graph reader (JYI-004).
 *
 * Single pass over a parsed draft content object: indexes tracks, segments,
 * and material buckets by id, records every segment→material reference, and
 * notes structurally unusable nodes as issues instead of throwing. Reading
 * never mutates the input and never decides semantics — that is the
 * normalizer's job (JYI-005).
 *
 * @module @qcut/editor-core/jianying-draft/import/graph-reader
 */

import type { InteropIssue } from "../../draft-interop/issues.js";
import {
	isRawRecord,
	type RawDraftContent,
	type RawDraftTimeRange,
} from "./raw-types.js";

/** Integer microsecond range as JianYing stores it. Unvalidated here. */
export interface RawGraphTimeRange {
	start: number;
	duration: number;
}

export interface RawGraphSegmentNode {
	id: string;
	trackId: string;
	trackIndex: number;
	segmentIndex: number;
	materialId?: string;
	extraMaterialRefs: string[];
	sourceRange?: RawGraphTimeRange;
	targetRange?: RawGraphTimeRange;
	jsonPointer: string;
	/** Reference to the raw segment record; never mutated. */
	raw: Record<string, unknown>;
}

export interface RawGraphTrackNode {
	id: string;
	type?: string;
	trackIndex: number;
	segmentIds: string[];
	jsonPointer: string;
}

export interface RawGraphMaterialNode {
	id: string;
	/** Bucket name under `materials`, e.g. "videos", "audios", "texts". */
	bucket: string;
	jsonPointer: string;
	/** Reference to the raw material record; never mutated. */
	raw: Record<string, unknown>;
}

export interface RawDraftGraph {
	draftId?: string;
	tracks: RawGraphTrackNode[];
	segmentsById: Map<string, RawGraphSegmentNode>;
	materialsById: Map<string, RawGraphMaterialNode>;
	/** Ids seen more than once across segments, tracks, or materials. */
	duplicateIds: DuplicateIdRecord[];
	/** Structurally skipped nodes; the graph above excludes them. */
	readIssues: InteropIssue[];
}

export interface DuplicateIdRecord {
	id: string;
	kind: "track" | "segment" | "material";
	jsonPointer: string;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readTimeRange(value: unknown): RawGraphTimeRange | undefined {
	if (!isRawRecord(value)) {
		return undefined;
	}
	const range = value as RawDraftTimeRange;
	if (typeof range.start !== "number" || typeof range.duration !== "number") {
		return undefined;
	}
	return { start: range.start, duration: range.duration };
}

function malformed({
	message,
	path,
}: {
	message: string;
	path: string;
}): InteropIssue {
	return { code: "DOCUMENT_MALFORMED", severity: "error", message, path };
}

function withPointerPrefix({
	jsonPointerPrefix,
	jsonPointer,
}: {
	jsonPointerPrefix: string;
	jsonPointer: string;
}): string {
	return `${jsonPointerPrefix}${jsonPointer}`;
}

/**
 * Indexes a raw draft content object into an id-addressable graph.
 * Malformed subtrees are skipped and reported; nothing throws.
 */
export function readRawDraftGraph({
	content,
	jsonPointerPrefix = "",
}: {
	content: RawDraftContent;
	jsonPointerPrefix?: string;
}): RawDraftGraph {
	const graph: RawDraftGraph = {
		draftId: readString(content.id),
		tracks: [],
		segmentsById: new Map(),
		materialsById: new Map(),
		duplicateIds: [],
		readIssues: [],
	};
	const seenIds = new Map<string, DuplicateIdRecord["kind"]>();

	const claimId = ({ id, kind, jsonPointer }: DuplicateIdRecord): boolean => {
		if (seenIds.has(id)) {
			graph.duplicateIds.push({ id, kind, jsonPointer });
			return false;
		}
		seenIds.set(id, kind);
		return true;
	};

	const rawTracks = Array.isArray(content.tracks) ? content.tracks : [];
	if (!Array.isArray(content.tracks) && content.tracks !== undefined) {
		graph.readIssues.push(
			malformed({
				message: "tracks must be an array",
				path: withPointerPrefix({
					jsonPointerPrefix,
					jsonPointer: "/tracks",
				}),
			})
		);
	}
	for (const [trackIndex, rawTrack] of rawTracks.entries()) {
		const trackPointer = withPointerPrefix({
			jsonPointerPrefix,
			jsonPointer: `/tracks/${trackIndex}`,
		});
		if (!isRawRecord(rawTrack)) {
			graph.readIssues.push(
				malformed({ message: "track must be an object", path: trackPointer })
			);
			continue;
		}
		const trackId = readString(rawTrack.id);
		if (trackId === undefined) {
			graph.readIssues.push(
				malformed({
					message: "track is missing a string id",
					path: `${trackPointer}/id`,
				})
			);
			continue;
		}
		const track: RawGraphTrackNode = {
			id: trackId,
			type: readString(rawTrack.type),
			trackIndex,
			segmentIds: [],
			jsonPointer: trackPointer,
		};
		if (!claimId({ id: trackId, kind: "track", jsonPointer: trackPointer })) {
			continue;
		}

		const rawSegments = Array.isArray(rawTrack.segments)
			? rawTrack.segments
			: [];
		if (!Array.isArray(rawTrack.segments) && rawTrack.segments !== undefined) {
			graph.readIssues.push(
				malformed({
					message: "segments must be an array",
					path: `${trackPointer}/segments`,
				})
			);
		}
		for (const [segmentIndex, rawSegment] of rawSegments.entries()) {
			const segmentPointer = `${trackPointer}/segments/${segmentIndex}`;
			if (!isRawRecord(rawSegment)) {
				graph.readIssues.push(
					malformed({
						message: "segment must be an object",
						path: segmentPointer,
					})
				);
				continue;
			}
			const segmentId = readString(rawSegment.id);
			if (segmentId === undefined) {
				graph.readIssues.push(
					malformed({
						message: "segment is missing a string id",
						path: `${segmentPointer}/id`,
					})
				);
				continue;
			}
			if (
				!claimId({
					id: segmentId,
					kind: "segment",
					jsonPointer: segmentPointer,
				})
			) {
				continue;
			}
			const extraRefs = Array.isArray(rawSegment.extra_material_refs)
				? rawSegment.extra_material_refs.filter(
						(ref): ref is string => typeof ref === "string" && ref.length > 0
					)
				: [];
			graph.segmentsById.set(segmentId, {
				id: segmentId,
				trackId,
				trackIndex,
				segmentIndex,
				materialId: readString(rawSegment.material_id),
				extraMaterialRefs: extraRefs,
				sourceRange: readTimeRange(rawSegment.source_timerange),
				targetRange: readTimeRange(rawSegment.target_timerange),
				jsonPointer: segmentPointer,
				raw: rawSegment,
			});
			track.segmentIds.push(segmentId);
		}
		graph.tracks.push(track);
	}

	const rawMaterials = isRawRecord(content.materials) ? content.materials : {};
	if (!isRawRecord(content.materials) && content.materials !== undefined) {
		graph.readIssues.push(
			malformed({
				message: "materials must be an object",
				path: withPointerPrefix({
					jsonPointerPrefix,
					jsonPointer: "/materials",
				}),
			})
		);
	}
	for (const [bucket, entries] of Object.entries(rawMaterials)) {
		if (!Array.isArray(entries)) {
			// Non-array buckets exist in some profiles; they carry no ids.
			continue;
		}
		for (const [entryIndex, entry] of entries.entries()) {
			const entryPointer = withPointerPrefix({
				jsonPointerPrefix,
				jsonPointer: `/materials/${bucket}/${entryIndex}`,
			});
			if (!isRawRecord(entry)) {
				graph.readIssues.push(
					malformed({
						message: "material must be an object",
						path: entryPointer,
					})
				);
				continue;
			}
			const materialId = readString(entry.id);
			if (materialId === undefined) {
				graph.readIssues.push(
					malformed({
						message: "material is missing a string id",
						path: `${entryPointer}/id`,
					})
				);
				continue;
			}
			if (
				!claimId({
					id: materialId,
					kind: "material",
					jsonPointer: entryPointer,
				})
			) {
				continue;
			}
			graph.materialsById.set(materialId, {
				id: materialId,
				bucket,
				jsonPointer: entryPointer,
				raw: entry,
			});
		}
	}

	return graph;
}
