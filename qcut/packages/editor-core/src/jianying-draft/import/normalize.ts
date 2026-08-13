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
	type InteropTransition,
} from "../../draft-interop/document.js";
import type { InteropIssue } from "../../draft-interop/issues.js";
import type { RawNodeBinding } from "../../draft-interop/provenance.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { mapCapCut81SeamTransition } from "./capcut-8-1-transition-mapper.js";
import { resolveEditableDraftContent } from "./compound-draft.js";
import { readRawDraftGraph } from "./graph-reader.js";
import { readDraftProjectSettings } from "./project-settings.js";
import type { RawDraftContent } from "./raw-types.js";
import { mapStaticAudio } from "./static-audio-mapper.js";
import { mapStaticText } from "./static-text-mapper.js";
import { mapStaticVideo } from "./static-video-mapper.js";
import { validateRawDraftGraph } from "./validation.js";

const MEDIA_BUCKETS = new Set(["videos", "audios"]);
const STATIC_TEXT_PROFILE_IDS = new Set([
	CAPCUT_8_1_PROFILE_ID,
	JIANYING_11_3_BETA4_PROFILE_ID,
]);

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
	jsonPointerPrefix,
}: {
	content: RawDraftContent;
	fallbackProjectName?: string;
	issues: InteropIssue[];
	jsonPointerPrefix: string;
}): InteropProject {
	const { width, height, fps, durationUs } = readDraftProjectSettings({
		content,
	});
	if (width === undefined || height === undefined || fps === undefined) {
		issues.push({
			code: "DOCUMENT_MALFORMED",
			severity: "error",
			message: "canvas_config/fps missing or invalid; using placeholders",
			path: `${jsonPointerPrefix}/canvas_config`,
		});
	}
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

function inferMixedTrackKind({
	segments,
	graph,
}: {
	segments: RawGraphSegmentNode[];
	graph: RawDraftGraph;
}): InteropTrackKind {
	if (segments.length === 0) return "unknown";
	const kinds = segments.map((segment) => {
		const material =
			segment.materialId === undefined
				? undefined
				: graph.materialsById.get(segment.materialId);
		return classifySegment({ segment, material }).kind;
	});
	if (kinds.every((kind) => kind === "video" || kind === "image")) {
		return "video";
	}
	if (kinds.every((kind) => kind === "audio")) return "audio";
	return kinds.every((kind) => kind === "text") ? "text" : "unknown";
}

function resolveTrackKind({
	profileId,
	rawType,
	segments,
	graph,
}: {
	profileId: string;
	rawType: string | undefined;
	segments: RawGraphSegmentNode[];
	graph: RawDraftGraph;
}): InteropTrackKind {
	if (
		profileId === JIANYING_11_3_BETA4_PROFILE_ID &&
		rawType === "mixed" &&
		segments.length === 0
	) {
		return "video";
	}
	if (rawType === "mixed") return inferMixedTrackKind({ segments, graph });
	return TRACK_KIND_BY_RAW_TYPE[rawType ?? ""] ?? "unknown";
}

function normalizeSegment({
	segment,
	graph,
	profileId,
	canvasWidth,
	canvasHeight,
	contentFileName,
	issues,
	bindings,
	trackIndex,
}: {
	segment: RawGraphSegmentNode;
	graph: RawDraftGraph;
	profileId: string;
	canvasWidth: number;
	canvasHeight: number;
	contentFileName: string;
	issues: InteropIssue[];
	bindings: RawNodeBinding[];
	trackIndex: number;
}): InteropSegment {
	const material =
		segment.materialId === undefined
			? undefined
			: graph.materialsById.get(segment.materialId);
	const classified = classifySegment({ segment, material });
	let capability = classified.capability;
	let featureMappingIssueAdded = false;
	let text: InteropSegment["text"];
	if (
		classified.kind === "video" &&
		material !== undefined &&
		profileId === JIANYING_11_3_BETA4_PROFILE_ID
	) {
		const mapped = mapStaticVideo({
			profileId,
			material,
			segment,
			graph,
			trackIndex,
		});
		capability = combineInteropCapabilities([capability, mapped.capability]);
		if (mapped.issueCode !== undefined && mapped.reason !== undefined) {
			issues.push({
				code: mapped.issueCode,
				severity: mapped.capability === "blocked" ? "error" : "warning",
				message: mapped.reason,
				path: segment.jsonPointer,
				subjectId: segment.id,
			});
			featureMappingIssueAdded = true;
		}
	}
	if (
		classified.kind === "audio" &&
		material !== undefined &&
		profileId === JIANYING_11_3_BETA4_PROFILE_ID
	) {
		const mapped = mapStaticAudio({ profileId, material, segment, graph });
		capability = combineInteropCapabilities([capability, mapped.capability]);
		if (mapped.issueCode !== undefined && mapped.reason !== undefined) {
			issues.push({
				code: mapped.issueCode,
				severity: mapped.capability === "blocked" ? "error" : "warning",
				message: mapped.reason,
				path: segment.jsonPointer,
				subjectId: segment.id,
			});
			featureMappingIssueAdded = true;
		}
	}
	if (
		classified.kind === "text" &&
		material !== undefined &&
		STATIC_TEXT_PROFILE_IDS.has(profileId)
	) {
		const mapped = mapStaticText({
			profileId,
			canvasWidth,
			canvasHeight,
			material,
			segment,
			graph,
		});
		capability = combineInteropCapabilities([capability, mapped.capability]);
		text = mapped.text;
		issues.push({
			code: mapped.issueCode,
			severity: mapped.capability === "blocked" ? "error" : "warning",
			message: mapped.reason,
			path: material.jsonPointer,
			subjectId: segment.id,
		});
		featureMappingIssueAdded = true;
		bindings.push({
			foreignRef: material.id,
			file: contentFileName,
			jsonPointer: material.jsonPointer,
			semanticId: segment.id,
		});
	}

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
		if (extra.bucket === "transitions") {
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

	if (capability === "downgrade" && !featureMappingIssueAdded) {
		issues.push({
			code: "FEATURE_DOWNGRADED",
			severity: "warning",
			message: `segment maps with declared loss (${classified.kind})`,
			path: segment.jsonPointer,
			subjectId: segment.id,
		});
	} else if (capability === "opaque" && !featureMappingIssueAdded) {
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
		...(text === undefined ? {} : { text }),
		capability,
		foreignRef: segment.id,
	};
}

function normalizeTransitions({
	profileId,
	segments,
	graph,
	contentFileName,
	issues,
	bindings,
	claimedTransitionRefs,
}: {
	profileId: string;
	segments: RawGraphSegmentNode[];
	graph: RawDraftGraph;
	contentFileName: string;
	issues: InteropIssue[];
	bindings: RawNodeBinding[];
	claimedTransitionRefs: Set<string>;
}): InteropTransition[] {
	const transitions: InteropTransition[] = [];
	for (const [segmentIndex, segment] of segments.entries()) {
		const transitionMaterials = segment.extraMaterialRefs
			.map((ref) => graph.materialsById.get(ref))
			.filter(
				(material): material is RawGraphMaterialNode =>
					material?.bucket === "transitions"
			);
		const hasAmbiguousSeamOwner = transitionMaterials.length > 1;
		for (const material of transitionMaterials) {
			const ref = material.id;
			if (claimedTransitionRefs.has(ref)) {
				issues.push({
					code: "REF_BROKEN",
					severity: "error",
					message: "transition material is owned by more than one seam",
					path: material.jsonPointer,
					subjectId: material.id,
				});
				continue;
			}
			claimedTransitionRefs.add(ref);
			const mapped = mapCapCut81SeamTransition({
				profileId,
				material,
				fromSegment: segment,
				toSegment: segments[segmentIndex + 1],
			});
			const transition: InteropTransition = hasAmbiguousSeamOwner
				? { ...mapped.transition, type: "unknown", capability: "blocked" }
				: mapped.transition;
			transitions.push(transition);
			bindings.push({
				foreignRef: material.id,
				file: contentFileName,
				jsonPointer: material.jsonPointer,
				semanticId: material.id,
			});
			if (hasAmbiguousSeamOwner) {
				issues.push({
					code: "REF_BROKEN",
					severity: "error",
					message: "more than one transition material owns the same seam",
					path: material.jsonPointer,
					subjectId: material.id,
				});
			} else if (
				mapped.issueCode !== undefined &&
				mapped.reason !== undefined
			) {
				issues.push({
					code: mapped.issueCode,
					severity: transition.capability === "blocked" ? "error" : "warning",
					message: mapped.reason,
					path: material.jsonPointer,
					subjectId: material.id,
				});
			}
		}
	}
	return transitions;
}

function normalizeTracks({
	profileId,
	canvasWidth,
	canvasHeight,
	graph,
	contentFileName,
	issues,
	bindings,
}: {
	profileId: string;
	canvasWidth: number;
	canvasHeight: number;
	graph: RawDraftGraph;
	contentFileName: string;
	issues: InteropIssue[];
	bindings: RawNodeBinding[];
}): InteropTrack[] {
	const tracks: InteropTrack[] = [];
	const claimedTransitionRefs = new Set<string>();
	let mainAssigned = false;
	for (const [trackIndex, track] of graph.tracks.entries()) {
		const rawSegments = track.segmentIds
			.map((segmentId) => graph.segmentsById.get(segmentId))
			.filter(
				(segment): segment is RawGraphSegmentNode => segment !== undefined
			);
		const kind = resolveTrackKind({
			profileId,
			rawType: track.type,
			segments: rawSegments,
			graph,
		});
		if (kind === "unknown") {
			issues.push({
				code: "FEATURE_OPAQUE",
				severity: "warning",
				message: `track type "${track.type ?? "?"}" is not mapped`,
				path: track.jsonPointer,
				subjectId: track.id,
			});
		}
		const segments = rawSegments.map((segment) =>
			normalizeSegment({
				segment,
				graph,
				profileId,
				canvasWidth,
				canvasHeight,
				contentFileName,
				issues,
				bindings,
				trackIndex,
			})
		);
		const transitions = normalizeTransitions({
			profileId,
			segments: rawSegments,
			graph,
			contentFileName,
			issues,
			bindings,
			claimedTransitionRefs,
		});
		const capability = combineInteropCapabilities([
			kind === "unknown" ? "opaque" : "exact",
			...segments.map((segment) => segment.capability),
			...transitions.map((transition) => transition.capability),
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
			...(transitions.length === 0 ? {} : { transitions }),
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
	const editable = resolveEditableDraftContent({ content: input.content });
	const graph = readRawDraftGraph({
		content: editable.content,
		jsonPointerPrefix: editable.jsonPointerPrefix,
	});
	const issues: InteropIssue[] = validateRawDraftGraph({ graph });
	const bindings: RawNodeBinding[] = [];
	const restrictedSourcePathsByResourceId: Record<string, string> = {};

	const project = normalizeProject({
		content: editable.content,
		...(input.fallbackProjectName === undefined
			? {}
			: { fallbackProjectName: input.fallbackProjectName }),
		issues,
		jsonPointerPrefix: editable.jsonPointerPrefix,
	});
	const resources = normalizeResources({
		graph,
		contentFileName: input.contentFileName,
		bindings,
		restrictedSourcePathsByResourceId,
	});
	const tracks = normalizeTracks({
		profileId: input.source.profileId,
		canvasWidth: project.width,
		canvasHeight: project.height,
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
