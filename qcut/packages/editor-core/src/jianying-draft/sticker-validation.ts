import type {
	MediaPerspective,
	StickerElement,
	TimelineTrack,
} from "../types/timeline.js";
import { secondsToMicroseconds } from "./time.js";
import type { JianyingDraftIssue, QCutDraftExportMedia } from "./types.js";

const DEFAULT_PERSPECTIVE: MediaPerspective = {
	bottomLeftX: 0,
	bottomLeftY: 1,
	bottomRightX: 1,
	bottomRightY: 1,
	topLeftX: 0,
	topLeftY: 0,
	topRightX: 1,
	topRightY: 0,
};

function addStickerIssue({
	code,
	element,
	issues,
	message,
	severity = "error",
	track,
}: {
	code: string;
	element: StickerElement;
	issues: JianyingDraftIssue[];
	message: string;
	severity?: JianyingDraftIssue["severity"];
	track: TimelineTrack;
}): void {
	issues.push({
		code,
		severity,
		message,
		elementId: element.id,
		mediaId: element.mediaId,
		trackId: track.id,
	});
}

function canRepresentSeconds({ value }: { value: number }): boolean {
	try {
		secondsToMicroseconds({ seconds: value });
		return true;
	} catch {
		return false;
	}
}

function hasValidNumbers({ element }: { element: StickerElement }): boolean {
	const effectiveDuration =
		element.duration - element.trimStart - element.trimEnd;
	const optionalNumbers = [
		element.x ?? 50,
		element.y ?? 50,
		element.width ?? 15,
		element.height ?? 15,
		element.rotation ?? 0,
		element.opacity ?? 1,
		element.animationInDuration ?? 0.5,
		element.animationOutDuration ?? 0.5,
		element.animationLoopIntensity ?? 0.5,
		...(element.zIndex === undefined ? [] : [element.zIndex]),
		...Object.values(element.perspective ?? DEFAULT_PERSPECTIVE),
	];
	return (
		[element.duration, element.startTime, element.trimStart, element.trimEnd]
			.concat(optionalNumbers)
			.every(Number.isFinite) &&
		element.duration >= 0 &&
		element.startTime >= 0 &&
		element.trimStart >= 0 &&
		element.trimEnd >= 0 &&
		effectiveDuration > 0 &&
		(element.width ?? 15) > 0 &&
		(element.height ?? 15) > 0 &&
		(element.opacity ?? 1) >= 0 &&
		(element.opacity ?? 1) <= 1 &&
		(element.animationInDuration ?? 0.5) >= 0 &&
		(element.animationOutDuration ?? 0.5) >= 0 &&
		(element.animationLoopIntensity ?? 0.5) >= 0 &&
		(element.animationLoopIntensity ?? 0.5) <= 1 &&
		canRepresentSeconds({ value: element.startTime }) &&
		canRepresentSeconds({ value: effectiveDuration })
	);
}

function isDefaultPerspective({
	perspective,
}: {
	perspective: MediaPerspective | undefined;
}): boolean {
	if (!perspective) return true;
	return (
		Object.keys(DEFAULT_PERSPECTIVE) as Array<keyof MediaPerspective>
	).every(
		(key) =>
			Math.abs(perspective[key] - DEFAULT_PERSPECTIVE[key]) < Number.EPSILON
	);
}

function hasKeyframes({ element }: { element: StickerElement }): boolean {
	return Object.values(element.keyframes ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
}

function collectFeatureBlockers({
	element,
	mediaName,
	track,
}: {
	element: StickerElement;
	mediaName: string;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	if (element.groupId?.trim()) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_METADATA",
			element,
			issues,
			message: "Sticker grouping metadata is not represented in the draft.",
			severity: "warning",
			track,
		});
	}
	if (element.templateBinding !== undefined) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_METADATA",
			element,
			issues,
			message:
				"Sticker template binding metadata is not represented in the draft.",
			severity: "warning",
			track,
		});
	}
	if (element.colorLabel?.trim()) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_METADATA",
			element,
			issues,
			message: "Sticker color labels are not represented in the draft.",
			severity: "warning",
			track,
		});
	}
	if (element.name.trim().length > 0 && element.name !== mediaName) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_METADATA",
			element,
			issues,
			message:
				"Custom sticker names are not represented separately from media names.",
			severity: "warning",
			track,
		});
	}
	if (element.zIndex !== undefined) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_Z_INDEX",
			element,
			issues,
			message:
				"Legacy sticker z-index can change compositing order and is not mapped.",
			track,
		});
	}
	if (!isDefaultPerspective({ perspective: element.perspective })) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_PERSPECTIVE",
			element,
			issues,
			message: "Sticker perspective cannot be preserved by a photo overlay.",
			track,
		});
	}
	if (
		(element.animationInType !== undefined &&
			element.animationInType !== "none") ||
		(element.animationOutType !== undefined &&
			element.animationOutType !== "none") ||
		(element.animationLoopType !== undefined &&
			element.animationLoopType !== "none")
	) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_ANIMATION",
			element,
			issues,
			message:
				"Sticker entrance, exit, and loop animations need native mapping.",
			track,
		});
	}
	if (
		(element.animationInType === "none" &&
			element.animationInDuration !== undefined &&
			element.animationInDuration !== 0.5) ||
		(element.animationOutType === "none" &&
			element.animationOutDuration !== undefined &&
			element.animationOutDuration !== 0.5) ||
		(element.animationLoopType === "none" &&
			element.animationLoopIntensity !== undefined &&
			element.animationLoopIntensity !== 0.5)
	) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_ANIMATION",
			element,
			issues,
			message:
				"Disabled sticker animations retain non-default parameters that are not represented in the draft.",
			track,
		});
	}
	if (hasKeyframes({ element })) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_KEYFRAMES",
			element,
			issues,
			message: "Sticker keyframes need native mapping.",
			track,
		});
	}
	if (element.tracking !== undefined) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_TRACKING",
			element,
			issues,
			message: "Sticker motion tracking needs native mapping.",
			track,
		});
	}
	if (
		(element.effects?.length ?? 0) > 0 ||
		(element.effectChains?.length ?? 0) > 0 ||
		(element.effectIds?.length ?? 0) > 0
	) {
		addStickerIssue({
			code: "UNSUPPORTED_STICKER_VISUAL_STATE",
			element,
			issues,
			message: "Sticker effects cannot be preserved by a plain photo overlay.",
			track,
		});
	}
	return issues;
}

export function validateJianyingStickerElement({
	element,
	media,
	track,
}: {
	element: StickerElement;
	media: QCutDraftExportMedia | undefined;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	if (!media) {
		return [
			{
				code: "MISSING_STICKER_MEDIA",
				severity: "error",
				message: `Sticker ${element.id} references missing media ${element.mediaId}.`,
				elementId: element.id,
				mediaId: element.mediaId,
				trackId: track.id,
			},
		];
	}
	if (media.type !== "image") {
		return [
			{
				code: "UNSUPPORTED_STICKER_MEDIA_TYPE",
				severity: "error",
				message: `Sticker ${element.id} requires static image media, not ${media.type}.`,
				elementId: element.id,
				mediaId: media.id,
				trackId: track.id,
			},
		];
	}

	const issues = collectFeatureBlockers({
		element,
		mediaName: media.name,
		track,
	});
	if (
		!media.sourcePath.trim() ||
		!Number.isFinite(media.width) ||
		media.width <= 0 ||
		!Number.isFinite(media.height) ||
		media.height <= 0
	) {
		addStickerIssue({
			code: "INVALID_STICKER_MEDIA_METADATA",
			element,
			issues,
			message: `Sticker media ${media.id} needs a local path and positive dimensions.`,
			track,
		});
	}
	if (
		!element.stickerId.trim() ||
		!element.mediaId.trim() ||
		!hasValidNumbers({ element })
	) {
		addStickerIssue({
			code: "INVALID_STICKER_VALUE",
			element,
			issues,
			message: `Sticker ${element.id} has invalid timing or geometry.`,
			track,
		});
	}
	return issues;
}

export function createStickerSemanticDowngradeIssue({
	element,
	track,
}: {
	element: StickerElement;
	track: TimelineTrack;
}): JianyingDraftIssue {
	return {
		code: "STICKER_EXPORTED_AS_IMAGE_OVERLAY",
		severity: "warning",
		message:
			"Local QCut sticker is exported as an editable photo overlay, not a native JianYing resource sticker; accept this semantic downgrade before writing.",
		elementId: element.id,
		mediaId: element.mediaId,
		trackId: track.id,
	};
}
