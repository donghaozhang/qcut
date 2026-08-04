/**
 * Raw draft graph → DraftInteropDocumentV1 normalizer (JYI-005).
 *
 * Deterministic: the same content bytes always produce the same document —
 * no clocks, no randomness, semantic ids reuse the raw ids (unique per
 * JYI-004 validation). Capability is assigned honestly per node: only the
 * core media subset is `exact`; text/sticker/transition mapping is a
 * declared `downgrade` until the feature mapper registry (JYI-016) upgrades
 * them; unknown buckets and track types are `opaque`; broken references are
 * `blocked`.
 *
 * Original media paths are RESTRICTED: they never enter the document and
 * are returned separately for provenance-only storage (JYI-002).
 *
 * @module @qcut/editor-core/jianying-draft/import/normalize
 */

import {
	combineInteropCapabilities,
	type InteropCapability,
} from "../../draft-interop/capability.js";
import {
	DRAFT_INTEROP_SCHEMA_VERSION,
	DRAFT_INTEROP_TIME_UNIT,
	type DraftInteropDocumentV1,
	type DraftSourceDescriptor,
	type InteropProject,
	type InteropResource,
	type InteropSegment,
	type InteropSegmentKind,
	type InteropTrack,
	type InteropTrackKind,
} from "../../draft-interop/document.js";
import type { InteropIssue } from "../../draft-interop/issues.js";
import type { RawNodeBinding } from "../../draft-interop/provenance.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { readRawDraftGraph } from "./graph-reader.js";
import { isRawRecord, type RawDraftContent } from "./raw-types.js";
import { validateRawDraftGraph } from "./validation.js";

const MEDIA_BUCKETS = new Set(["videos", "audios"]);

const SEGMENT_KIND_BY_BUCKET: Record<string, InteropSegmentKind> = {
	videos: "video",
	audios: "audio",
	texts: "text",
	stickers: "sticker",
	video_effects: "effect",
	effects: "effect",
	filters: "filter",
	adjustments: "adjustment",
	transitions: "transition",
};

/** Honest per-kind ceiling until JYI-016 mappers raise specific features. */
const SEGMENT_CAPABILITY_BY_KIND: Record<
	InteropSegmentKind,
	InteropCapability
> = {
	video: "exact",
	image: "exact",
	audio: "exact",
	text: "downgrade",
	sticker: "downgrade",
	transition: "downgrade",
	effect: "opaque",
	filter: "opaque",
	adjustment: "opaque",
	unknown: "opaque",
};

/**
 * extra_material_refs whose buckets are mechanical companions already
 * captured on the segment itself (speed value, canvas color, channel
 * mapping…) — they never degrade capability.
 */
const NEUTRAL_EXTRA_BUCKETS = new Set([
	"speeds",
	"canvases",
	"sound_channel_mappings",
	"beats",
	"vocal_separations",
	"audio_configs",
	"placeholder_infos",
	"material_colors",
	"loudnesses",
]);

/** Extra refs we can map with declared loss until JYI-016. */
const DOWNGRADE_EXTRA_BUCKETS = new Set([
	"transitions",
	"material_animations",
	"audio_fades",
]);

const TRACK_KIND_BY_RAW_TYPE: Record<string, InteropTrackKind> = {
	video: "video",
	audio: "audio",
	text: "text",
	sticker: "sticker",
	effect: "effect",
	adjust: "adjustment",
};

export interface NormalizeRawDraftInput {
	content: RawDraftContent;
	/** Snapshot-bound source descriptor built by detection (JYI-003). */
	source: DraftSourceDescriptor;
	/** Relative path of the content file all bindings point into. */
	contentFileName: string;
	/** Display name when the content itself carries none. */
	fallbackProjectName?: string;
}

export interface NormalizeRawDraftResult {
	document: DraftInteropDocumentV1;
	/** Raw-node bindings for the foreign envelope (JYI-002). */
	bindings: RawNodeBinding[];
	/**
	 * RESTRICTED original media paths keyed by resource id. Provenance-only:
	 * callers must never serialize these into documents, logs, or evidence.
	 */
	restrictedSourcePathsByResourceId: Record<string, string>;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: undefined;
}

function normalizeProject({
	content,
	fallbackProjectName,
	issues,
}: {
	content: RawDraftContent;
	fallbackProjectName?: string;
	issues: InteropIssue[];
}): InteropProject {
	const canvas = isRawRecord(content.canvas_config)
		? content.canvas_config
		: undefined;
	const width = readPositiveNumber(canvas?.width);
	const height = readPositiveNumber(canvas?.height);
	const fps = readPositiveNumber(content.fps);
	if (width === undefined || height === undefined || fps === undefined) {
		issues.push({
			code: "DOCUMENT_MALFORMED",
			severity: "error",
			message: "canvas_config/fps missing or invalid; using placeholders",
			path: "/canvas_config",
		});
	}
	const durationUs = readNonNegativeInteger(content.duration);
	return {
		id: readString(content.id) ?? "draft",
		name: readString(content.name) ?? fallbackProjectName ?? "",
		width: width ?? 1920,
		height: height ?? 1080,
		fps: fps ?? 30,
		...(durationUs === undefined ? {} : { durationUs }),
	};
}

function normalizeResources({
	graph,
	contentFileName,
	bindings,
	restrictedSourcePathsByResourceId,
}: {
	graph: RawDraftGraph;
	contentFileName: string;
	bindings: RawNodeBinding[];
	restrictedSourcePathsByResourceId: Record<string, string>;
}): InteropResource[] {
	const resources: InteropResource[] = [];
	for (const material of graph.materialsById.values()) {
		if (!MEDIA_BUCKETS.has(material.bucket)) {
			continue;
		}
		const kind =
			material.bucket === "audios"
				? "audio"
				: material.raw.type === "photo"
					? "image"
					: "video";
		const name =
			readString(material.raw.material_name) ?? readString(material.raw.name);
		const durationUs = readNonNegativeInteger(material.raw.duration);
		resources.push({
			id: material.id,
			kind,
			...(name === undefined ? {} : { name }),
			originHint: "local-media",
			...(durationUs === undefined ? {} : { durationUs }),
			status: "pending",
			capability: "exact",
			foreignRef: material.id,
		});
		const path = readString(material.raw.path);
		if (path !== undefined) {
			restrictedSourcePathsByResourceId[material.id] = path;
		}
		bindings.push({
			foreignRef: material.id,
			file: contentFileName,
			jsonPointer: material.jsonPointer,
			semanticId: material.id,
		});
	}
	return resources;
}

function classifySegment({
	segment,
	material,
}: {
	segment: RawGraphSegmentNode;
	material: RawGraphMaterialNode | undefined;
}): { kind: InteropSegmentKind; capability: InteropCapability } {
	if (segment.materialId !== undefined && material === undefined) {
		// Dangling material reference — already REF_BROKEN in validation.
		return { kind: "unknown", capability: "blocked" };
	}
	if (material === undefined) {
		return { kind: "unknown", capability: "opaque" };
	}
	const mappedKind = SEGMENT_KIND_BY_BUCKET[material.bucket];
	if (mappedKind === undefined) {
		return { kind: "unknown", capability: "opaque" };
	}
	const kind =
		mappedKind === "video" && material.raw.type === "photo"
			? "image"
			: mappedKind;
	return { kind, capability: SEGMENT_CAPABILITY_BY_KIND[kind] };
}

function normalizeSegment({
	segment,
	graph,
	contentFileName,
	issues,
	bindings,
}: {
	segment: RawGraphSegmentNode;
	graph: RawDraftGraph;
	contentFileName: string;
	issues: InteropIssue[];
	bindings: RawNodeBinding[];
}): InteropSegment {
	const material =
		segment.materialId === undefined
			? undefined
			: graph.materialsById.get(segment.materialId);
	const classified = classifySegment({ segment, material });
	let capability = classified.capability;

	for (const ref of segment.extraMaterialRefs) {
		const extra = graph.materialsById.get(ref);
		if (extra === undefined) {
			// Dangling extra ref — already REF_BROKEN in validation.
			capability = combineInteropCapabilities([capability, "blocked"]);
			continue;
		}
		if (NEUTRAL_EXTRA_BUCKETS.has(extra.bucket)) {
			continue;
		}
		capability = combineInteropCapabilities([
			capability,
			DOWNGRADE_EXTRA_BUCKETS.has(extra.bucket) ? "downgrade" : "opaque",
		]);
	}

	let targetRange = segment.targetRange;
	if (targetRange === undefined) {
		issues.push({
			code: "TIME_RANGE_INVALID",
			severity: "error",
			message: "segment has no target_timerange",
			path: segment.jsonPointer,
			subjectId: segment.id,
		});
		capability = "blocked";
		targetRange = { start: 0, duration: 0 };
	}

	if (capability === "downgrade") {
		issues.push({
			code: "FEATURE_DOWNGRADED",
			severity: "warning",
			message: `segment maps with declared loss (${classified.kind})`,
			path: segment.jsonPointer,
			subjectId: segment.id,
		});
	} else if (capability === "opaque") {
		issues.push({
			code: "FEATURE_OPAQUE",
			severity: "warning",
			message: `segment cannot be edited in QCut (${classified.kind})`,
			path: segment.jsonPointer,
			subjectId: segment.id,
		});
	}

	bindings.push({
		foreignRef: segment.id,
		file: contentFileName,
		jsonPointer: segment.jsonPointer,
		semanticId: segment.id,
	});

	const resourceId =
		material !== undefined && MEDIA_BUCKETS.has(material.bucket)
			? material.id
			: undefined;
	const speed = readPositiveNumber(segment.raw.speed);
	return {
		id: segment.id,
		kind: classified.kind,
		...(resourceId === undefined ? {} : { resourceId }),
		...(segment.sourceRange === undefined
			? {}
			: {
					sourceRange: {
						startUs: segment.sourceRange.start,
						durationUs: segment.sourceRange.duration,
					},
				}),
		targetRange: {
			startUs: targetRange.start,
			durationUs: targetRange.duration,
		},
		...(speed === undefined ? {} : { speed }),
		capability,
		foreignRef: segment.id,
	};
}

function normalizeTracks({
	graph,
	contentFileName,
	issues,
	bindings,
}: {
	graph: RawDraftGraph;
	contentFileName: string;
	issues: InteropIssue[];
	bindings: RawNodeBinding[];
}): InteropTrack[] {
	const tracks: InteropTrack[] = [];
	let mainAssigned = false;
	for (const track of graph.tracks) {
		const kind = TRACK_KIND_BY_RAW_TYPE[track.type ?? ""] ?? "unknown";
		if (kind === "unknown") {
			issues.push({
				code: "FEATURE_OPAQUE",
				severity: "warning",
				message: `track type "${track.type ?? "?"}" is not mapped`,
				path: track.jsonPointer,
				subjectId: track.id,
			});
		}
		const segments = track.segmentIds
			.map((segmentId) => graph.segmentsById.get(segmentId))
			.filter(
				(segment): segment is RawGraphSegmentNode => segment !== undefined
			)
			.map((segment) =>
				normalizeSegment({ segment, graph, contentFileName, issues, bindings })
			);
		const capability = combineInteropCapabilities([
			kind === "unknown" ? "opaque" : "exact",
			...segments.map((segment) => segment.capability),
		]);
		const isMain = !mainAssigned && kind === "video";
		if (isMain) {
			mainAssigned = true;
		}
		bindings.push({
			foreignRef: track.id,
			file: contentFileName,
			jsonPointer: track.jsonPointer,
			semanticId: track.id,
		});
		tracks.push({
			id: track.id,
			kind,
			order: track.trackIndex,
			...(isMain ? { isMain } : {}),
			segments,
			capability,
			foreignRef: track.id,
		});
	}
	return tracks;
}

/**
 * Normalizes parsed raw draft content into the semantic interop document.
 * Runs the JYI-004 reader and validation internally so callers get one
 * consolidated issue list inside the document.
 */
export function normalizeRawDraft(
	input: NormalizeRawDraftInput
): NormalizeRawDraftResult {
	const graph = readRawDraftGraph({ content: input.content });
	const issues: InteropIssue[] = validateRawDraftGraph({ graph });
	const bindings: RawNodeBinding[] = [];
	const restrictedSourcePathsByResourceId: Record<string, string> = {};

	const project = normalizeProject({
		content: input.content,
		...(input.fallbackProjectName === undefined
			? {}
			: { fallbackProjectName: input.fallbackProjectName }),
		issues,
	});
	const resources = normalizeResources({
		graph,
		contentFileName: input.contentFileName,
		bindings,
		restrictedSourcePathsByResourceId,
	});
	const tracks = normalizeTracks({
		graph,
		contentFileName: input.contentFileName,
		issues,
		bindings,
	});

	const document: DraftInteropDocumentV1 = {
		schemaVersion: DRAFT_INTEROP_SCHEMA_VERSION,
		timeUnit: DRAFT_INTEROP_TIME_UNIT,
		source: input.source,
		project,
		timelines: [
			{
				id: graph.draftId ?? "root",
				isRoot: true,
				fps: project.fps,
				tracks,
			},
		],
		resources,
		// Link derivation (video-audio, group, compound-child) needs verified
		// bindings that are gated on JYR-004/JYR-007 research.
		links: [],
		issues,
	};
	return { document, bindings, restrictedSourcePathsByResourceId };
}
