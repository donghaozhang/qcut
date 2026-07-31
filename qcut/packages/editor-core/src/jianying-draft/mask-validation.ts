import type {
	MediaElement,
	MediaMask,
	TimelineTrack,
} from "../types/timeline.js";
import type { JianyingDraftIssue } from "./types.js";

export type CapCut81StaticMaskType = Extract<
	MediaMask["type"],
	"ellipse" | "rectangle"
>;

function createMaskIssue({
	code,
	elementId,
	mediaId,
	message,
	trackId,
}: {
	code: string;
	elementId: string;
	mediaId?: string;
	message: string;
	trackId?: string;
}): JianyingDraftIssue {
	return {
		code,
		elementId,
		message,
		...(mediaId === undefined ? {} : { mediaId }),
		severity: "error",
		...(trackId === undefined ? {} : { trackId }),
	};
}

function hasKeyframes({ mask }: { mask: MediaMask }): boolean {
	return Object.values(mask.keyframes ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
}

function hasNonNeutralStroke({ mask }: { mask: MediaMask }): boolean {
	const stroke = mask.stroke;
	if (!stroke) return false;
	return (
		stroke.style !== "none" ||
		stroke.width !== 0 ||
		stroke.opacity !== 1 ||
		stroke.glow !== 0 ||
		stroke.offsetX !== 0 ||
		stroke.offsetY !== 0
	);
}

function hasUnsupportedShapeData({ mask }: { mask: MediaMask }): boolean {
	return (
		(mask.points?.length ?? 0) > 0 ||
		Boolean(mask.text?.trim()) ||
		Boolean(mask.fontFamily?.trim()) ||
		mask.fontWeight !== undefined
	);
}

function hasUnsupportedStaticState({ mask }: { mask: MediaMask }): boolean {
	return (
		mask.feather !== 0 ||
		(mask.roundness ?? 0) !== 0 ||
		(mask.expansion ?? 0) !== 0 ||
		(mask.opacity ?? 1) !== 1 ||
		mask.invert ||
		hasKeyframes({ mask }) ||
		mask.tracking !== undefined ||
		Boolean(mask.sourceMediaId?.trim()) ||
		hasUnsupportedShapeData({ mask }) ||
		hasNonNeutralStroke({ mask })
	);
}

function isNeutralInactiveMask({ mask }: { mask: MediaMask }): boolean {
	return (
		(mask.enabled ?? true) &&
		(mask.blendMode ?? "add") === "add" &&
		mask.centerX === 0.5 &&
		mask.centerY === 0.5 &&
		mask.width === 0.8 &&
		mask.height === 0.8 &&
		mask.rotation === 0 &&
		mask.feather === 0 &&
		(mask.roundness ?? 0) === 0 &&
		(mask.expansion ?? 0) === 0 &&
		(mask.opacity ?? 1) === 1 &&
		(mask.maintainAspectRatio ?? false) === false &&
		!mask.invert &&
		(mask.mirrorMode ?? "center") === "center" &&
		(mask.closed ?? true) &&
		!hasKeyframes({ mask }) &&
		mask.tracking === undefined &&
		!mask.sourceMediaId?.trim() &&
		!hasUnsupportedShapeData({ mask }) &&
		!hasNonNeutralStroke({ mask })
	);
}

function hasValidGeometry({ mask }: { mask: MediaMask }): boolean {
	return (
		[mask.centerX, mask.centerY, mask.width, mask.height, mask.rotation].every(
			Number.isFinite
		) &&
		mask.width > 0 &&
		mask.height > 0
	);
}

export function isCapCut81StaticMaskType({
	type,
}: {
	type: MediaMask["type"];
}): boolean {
	return type === "ellipse" || type === "rectangle";
}

export function resolveConfiguredMediaMasks({
	element,
}: {
	element: MediaElement;
}): MediaMask[] {
	return resolveSourceMediaMasks({ element }).filter(
		({ type }) => type !== "none"
	);
}

function resolveSourceMediaMasks({
	element,
}: {
	element: MediaElement;
}): MediaMask[] {
	return element.masks && element.masks.length > 0
		? element.masks
		: element.mask
			? [element.mask]
			: [];
}

export function validateCapCut81StaticMediaMask({
	elementId,
	mask,
	mediaId,
	trackId,
}: {
	elementId: string;
	mask: MediaMask;
	mediaId?: string;
	trackId?: string;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const issueContext = { elementId, mediaId, trackId };

	if ((mask.enabled ?? true) !== true || (mask.blendMode ?? "add") !== "add") {
		issues.push(
			createMaskIssue({
				...issueContext,
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_STATE",
				message: "CapCut 8.1 export supports only an enabled add-blend mask.",
			})
		);
	}
	if (!isCapCut81StaticMaskType({ type: mask.type })) {
		issues.push(
			createMaskIssue({
				...issueContext,
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_TYPE",
				message:
					"CapCut 8.1 export supports only verified rectangle and ellipse masks.",
			})
		);
	}
	if (!hasValidGeometry({ mask })) {
		issues.push(
			createMaskIssue({
				...issueContext,
				code: "INVALID_CAPCUT_8_1_MASK_GEOMETRY",
				message:
					"Mask center, size, and rotation must be finite, with positive width and height.",
			})
		);
	}
	if (hasUnsupportedStaticState({ mask })) {
		issues.push(
			createMaskIssue({
				...issueContext,
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_FEATURE",
				message:
					"Feather, roundness, expansion, opacity, inversion, keyframes, tracking, generated masks, custom shape data, and visible strokes need separate verified mappings.",
			})
		);
	}

	return issues;
}

export function validateCapCut81MediaMaskElement({
	element,
	track,
}: {
	element: MediaElement;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const sourceMasks = resolveSourceMediaMasks({ element });
	const inactiveIssues = sourceMasks
		.filter(({ type }) => type === "none")
		.filter((mask) => !isNeutralInactiveMask({ mask }))
		.map(() =>
			createMaskIssue({
				code: "UNSUPPORTED_CAPCUT_8_1_INACTIVE_MASK_STATE",
				elementId: element.id,
				mediaId: element.mediaId,
				message:
					"An inactive mask retains non-default state that cannot be silently discarded.",
				trackId: track.id,
			})
		);
	const masks = resolveConfiguredMediaMasks({ element });
	if (masks.length === 0) return inactiveIssues;
	if (masks.length !== 1) {
		return inactiveIssues.concat(
			createMaskIssue({
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_COUNT",
				elementId: element.id,
				mediaId: element.mediaId,
				message:
					"CapCut 8.1 export supports exactly one configured mask per media element.",
				trackId: track.id,
			})
		);
	}

	const mask = masks[0];
	if (!mask) return inactiveIssues;
	return inactiveIssues.concat(
		validateCapCut81StaticMediaMask({
			elementId: element.id,
			mask,
			mediaId: element.mediaId,
			trackId: track.id,
		})
	);
}
