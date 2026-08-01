import { isDeepStrictEqual } from "node:util";
import type {
	CapCut81FontBindingSnapshot,
	FieldSnapshot,
} from "./font-reference-binding.js";

const CAPCUT_81_PLATFORM = {
	appId: 359_289,
	appSource: "cc",
	appVersion: "8.1.1",
} as const;

const MATERIAL_FONT_IDENTITY_FIELDS = new Set([
	"font_id",
	"font_name",
	"font_path",
	"font_resource_id",
]);

export interface CapCut81TextSegmentEvidence {
	duration: number;
	segmentId: string;
	trackId: string;
}

export interface ParsedCapCut81FontReferenceDraft {
	binding: CapCut81FontBindingSnapshot;
	canonicalDraft: unknown;
	materialId: string;
	normalizedDraft: unknown;
	textSegment: CapCut81TextSegmentEvidence;
	updateTime: number;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
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

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function requireUpdateTime({
	label,
	root,
}: {
	label: string;
	root: Record<string, unknown>;
}): number {
	const updateTime = root.update_time;
	if (
		typeof updateTime !== "number" ||
		!Number.isSafeInteger(updateTime) ||
		updateTime < 0
	) {
		throw new Error(
			`${label} top-level update_time must be a non-negative safe integer.`
		);
	}
	return updateTime;
}

function parseJsonRecord({
	label,
	text,
}: {
	label: string;
	text: string;
}): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`${label} must contain valid JSON.`);
	}
	return requireRecord({ label, value: parsed });
}

function canonicalize({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize({ value: entry }));
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize({ value: entry })])
		);
	}
	return value;
}

function snapshotField({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}): FieldSnapshot {
	return {
		present: Object.hasOwn(record, key),
		value: Object.hasOwn(record, key)
			? canonicalize({ value: record[key] })
			: null,
	};
}

function validatePlatform({
	label,
	root,
}: {
	label: string;
	root: Record<string, unknown>;
}): void {
	const platform = requireRecord({
		label: `${label} platform`,
		value: root.platform,
	});
	const isCapCut81 =
		platform.app_id === CAPCUT_81_PLATFORM.appId &&
		platform.app_version === CAPCUT_81_PLATFORM.appVersion &&
		platform.app_source === CAPCUT_81_PLATFORM.appSource;
	if (!isCapCut81) {
		throw new Error(
			`${label} platform must identify CapCut app_id=359289, app_version=8.1.1, app_source=cc.`
		);
	}
}

function extractTargetMaterial({
	label,
	root,
	targetText,
}: {
	label: string;
	root: Record<string, unknown>;
	targetText: string;
}): {
	material: Record<string, unknown>;
	materials: Record<string, unknown>;
	payload: Record<string, unknown>;
	styles: Record<string, unknown>[];
} {
	const materials = requireRecord({
		label: `${label} materials`,
		value: root.materials,
	});
	const texts = requireArray({
		label: `${label} text materials`,
		value: materials.texts,
	});
	if (texts.length !== 1) {
		throw new Error(
			`${label} must be a dedicated single-text draft; found ${texts.length} text materials.`
		);
	}
	const material = requireRecord({
		label: `${label} target text material`,
		value: texts[0],
	});
	if (material.type !== "text") {
		throw new Error(`${label} target material type must be text.`);
	}
	const payload = parseJsonRecord({
		label: `${label} target text material content`,
		text: requireString({
			label: `${label} target text material content`,
			value: material.content,
		}),
	});
	if (payload.text !== targetText) {
		throw new Error(
			`${label} single text material must contain ${JSON.stringify(targetText)}.`
		);
	}
	const styles = requireArray({
		label: `${label} target styles`,
		value: payload.styles,
	}).map((value, styleIndex) =>
		requireRecord({
			label: `${label} target style ${styleIndex}`,
			value,
		})
	);
	if (styles.length === 0) {
		throw new Error(`${label} target must contain at least one text style.`);
	}
	return { material, materials, payload, styles };
}

function validateTextSegment({
	label,
	materialId,
	root,
}: {
	label: string;
	materialId: string;
	root: Record<string, unknown>;
}): CapCut81TextSegmentEvidence {
	const tracks = requireArray({
		label: `${label} tracks`,
		value: root.tracks,
	}).map((value, trackIndex) => ({
		track: requireRecord({ label: `${label} track ${trackIndex}`, value }),
		trackIndex,
	}));
	const textTracks = tracks.filter(({ track }) => track.type === "text");
	if (textTracks.length !== 1) {
		throw new Error(
			`${label} must contain exactly one text track; found ${textTracks.length}.`
		);
	}
	const textTrack = textTracks[0];
	if (!textTrack) throw new Error(`${label} text track is unavailable.`);
	const segments = requireArray({
		label: `${label} text track segments`,
		value: textTrack.track.segments,
	});
	if (segments.length !== 1) {
		throw new Error(
			`${label} must contain exactly one text track segment; found ${segments.length}.`
		);
	}
	const segment = requireRecord({
		label: `${label} text track segment`,
		value: segments[0],
	});
	const references = tracks.flatMap(({ track, trackIndex }) =>
		requireArray({
			label: `${label} track ${trackIndex} segments`,
			value: track.segments,
		}).flatMap((value, segmentIndex) => {
			const candidate = requireRecord({
				label: `${label} track ${trackIndex} segment ${segmentIndex}`,
				value,
			});
			return candidate.material_id === materialId ? [candidate] : [];
		})
	);
	if (references.length !== 1 || references[0] !== segment) {
		throw new Error(
			`${label} target text material must be referenced by exactly one text track segment.`
		);
	}
	if (segment.visible !== true) {
		throw new Error(`${label} target text segment must have visible=true.`);
	}
	const targetTimerange = requireRecord({
		label: `${label} target text segment target_timerange`,
		value: segment.target_timerange,
	});
	const duration = targetTimerange.duration;
	if (
		typeof duration !== "number" ||
		!Number.isFinite(duration) ||
		duration <= 0
	) {
		throw new Error(`${label} target text segment duration must be positive.`);
	}
	return {
		duration,
		segmentId: requireString({
			label: `${label} target text segment id`,
			value: segment.id,
		}),
		trackId: requireString({
			label: `${label} target text track id`,
			value: textTrack.track.id,
		}),
	};
}

function transformStyle({
	stripFont,
	style,
}: {
	stripFont: boolean;
	style: Record<string, unknown>;
}): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(style).filter(([key]) => !(stripFont && key === "font"))
	);
}

function transformMaterial({
	material,
	payload,
	stripFont,
	styles,
}: {
	material: Record<string, unknown>;
	payload: Record<string, unknown>;
	stripFont: boolean;
	styles: Record<string, unknown>[];
}): Record<string, unknown> {
	const transformedPayload = Object.fromEntries(
		Object.entries(payload).map(([key, value]) => [
			key,
			key === "styles"
				? styles.map((style) => transformStyle({ stripFont, style }))
				: value,
		])
	);
	return Object.fromEntries(
		Object.entries(material)
			.filter(
				([key]) =>
					!stripFont ||
					(key !== "fonts" && !MATERIAL_FONT_IDENTITY_FIELDS.has(key))
			)
			.map(([key, value]) => [
				key,
				key === "content" ? transformedPayload : value,
			])
	);
}

function transformDraft({
	material,
	materials,
	normalizeUpdateTime,
	payload,
	root,
	stripFont,
	styles,
}: {
	material: Record<string, unknown>;
	materials: Record<string, unknown>;
	normalizeUpdateTime: boolean;
	payload: Record<string, unknown>;
	root: Record<string, unknown>;
	stripFont: boolean;
	styles: Record<string, unknown>[];
}): unknown {
	const transformedMaterial = transformMaterial({
		material,
		payload,
		stripFont,
		styles,
	});
	const transformedMaterials = Object.fromEntries(
		Object.entries(materials)
			.filter(([key]) => !(stripFont && key === "fonts"))
			.map(([key, value]) => [
				key,
				key === "texts" ? [transformedMaterial] : value,
			])
	);
	const transformedRoot = Object.fromEntries(
		Object.entries(root).map(([key, value]) => [
			key,
			key === "materials"
				? transformedMaterials
				: normalizeUpdateTime && key === "update_time"
					? 0
					: value,
		])
	);
	return canonicalize({ value: transformedRoot });
}

export function parseCapCut81FontReferenceDraft({
	draftInfoText,
	label,
	targetText,
}: {
	draftInfoText: string;
	label: string;
	targetText: string;
}): ParsedCapCut81FontReferenceDraft {
	const root = parseJsonRecord({ label, text: draftInfoText });
	validatePlatform({ label, root });
	const updateTime = requireUpdateTime({ label, root });
	const { material, materials, payload, styles } = extractTargetMaterial({
		label,
		root,
		targetText,
	});
	const materialId = requireString({
		label: `${label} target material id`,
		value: material.id,
	});
	const textSegment = validateTextSegment({ label, materialId, root });
	const materialFields = Object.fromEntries(
		Object.entries(material)
			.filter(([key]) => MATERIAL_FONT_IDENTITY_FIELDS.has(key))
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, value]) => [key, canonicalize({ value })])
	);
	return {
		binding: {
			materialFields,
			materialFonts: snapshotField({ key: "fonts", record: material }),
			styleFonts: styles.map((style, styleIndex) => ({
				...snapshotField({ key: "font", record: style }),
				styleIndex,
			})),
			text: targetText,
			topLevelFontMaterials: snapshotField({ key: "fonts", record: materials }),
		},
		canonicalDraft: transformDraft({
			material,
			materials,
			normalizeUpdateTime: false,
			payload,
			root,
			stripFont: false,
			styles,
		}),
		materialId,
		normalizedDraft: transformDraft({
			material,
			materials,
			normalizeUpdateTime: true,
			payload,
			root,
			stripFont: true,
			styles,
		}),
		textSegment,
		updateTime,
	};
}

export function assertRootTimelineSemanticAgreement({
	root,
	timeline,
}: {
	root: ParsedCapCut81FontReferenceDraft;
	timeline: ParsedCapCut81FontReferenceDraft;
}): void {
	if (!isDeepStrictEqual(root.canonicalDraft, timeline.canonicalDraft)) {
		throw new Error(
			"Root and timeline draft_info.json must be semantically identical."
		);
	}
}
