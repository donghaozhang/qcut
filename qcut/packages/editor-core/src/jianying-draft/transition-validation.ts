import {
	CLIP_TRANSITION_MAX_DURATION_SECONDS,
	CLIP_TRANSITION_MIN_DURATION_SECONDS,
	getTransitionMaxDuration,
	resolveClipTransition,
} from "../timeline/transitions.js";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";
import {
	CAPCUT_NATIVE_DISSOLVE_METADATA,
	JIANYING_NATIVE_DISSOLVE_METADATA,
} from "./transition-mapping.js";
import type {
	JianyingDraftIssue,
	JianyingTransitionMaterial,
} from "./types.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isExactNativeDissolve({
	transition,
}: {
	transition: ClipTransition;
}): boolean {
	return (
		transition.type === "dissolve" &&
		transition.presetId === "dissolve" &&
		transition.easing === "easeInOut" &&
		transition.direction === undefined &&
		transition.tuning === undefined &&
		transition.tuningKeyframes === undefined &&
		transition.maskShape === undefined
	);
}

function findVisibleMediaElement({
	elementId,
	track,
}: {
	elementId: string;
	track: TimelineTrack;
}): MediaElement | undefined {
	const element = track.elements.find(({ id }) => id === elementId);
	return element?.type === "media" && !element.hidden ? element : undefined;
}

export function validateJianyingTrackTransition({
	timelineDurationByElementId,
	track,
	transition,
}: {
	timelineDurationByElementId: Record<string, number>;
	track: TimelineTrack;
	transition: ClipTransition;
}): JianyingDraftIssue[] {
	if (track.type !== "media" || !isExactNativeDissolve({ transition })) {
		return [
			{
				code: "UNSUPPORTED_TRACK_TRANSITION",
				severity: "error",
				message:
					"Only the exact QCut dissolve preset with default ease-in-out behavior has verified CapCut native metadata.",
				trackId: track.id,
			},
		];
	}

	const fromElement = findVisibleMediaElement({
		elementId: transition.fromElementId,
		track,
	});
	const toElement = findVisibleMediaElement({
		elementId: transition.toElementId,
		track,
	});
	if (!(fromElement && toElement)) {
		return [
			{
				code: "INVALID_TRACK_TRANSITION",
				severity: "error",
				message: `Transition ${transition.id} must join two visible media elements.`,
				trackId: track.id,
			},
		];
	}

	const resolved = resolveClipTransition({
		getElementDuration: ({ element }) =>
			timelineDurationByElementId[element.id] ?? Number.NaN,
		track,
		transition,
	});
	const maximumDuration = getTransitionMaxDuration({
		excludeTransitionId: transition.id,
		fromElementId: transition.fromElementId,
		getElementDuration: ({ element }) =>
			timelineDurationByElementId[element.id] ?? Number.NaN,
		toElementId: transition.toElementId,
		track,
		transitions: track.transitions,
	});
	if (
		!resolved ||
		transition.duration > maximumDuration ||
		Math.abs(resolved.transition.duration - transition.duration) >
			Number.EPSILON
	) {
		return [
			{
				code: "INVALID_TRACK_TRANSITION",
				severity: "error",
				message: `Transition ${transition.id} must describe an unclamped adjacent clip seam.`,
				trackId: track.id,
			},
		];
	}

	return [];
}

function hasVerifiedTransitionShape({
	material,
}: {
	material: JianyingTransitionMaterial;
}): boolean {
	return (
		material.category_id === "" &&
		material.category_name === "" &&
		UUID_PATTERN.test(material.id) &&
		Number.isSafeInteger(material.duration) &&
		material.duration >= CLIP_TRANSITION_MIN_DURATION_SECONDS * 1_000_000 &&
		material.duration <= CLIP_TRANSITION_MAX_DURATION_SECONDS * 1_000_000 &&
		material.platform === "all" &&
		material.type === "transition"
	);
}

export function isVerifiedJianyingTransitionMaterial({
	material,
}: {
	material: JianyingTransitionMaterial;
}): boolean {
	return (
		hasVerifiedTransitionShape({ material }) &&
		material.effect_id === JIANYING_NATIVE_DISSOLVE_METADATA.effectId &&
		material.is_overlap === JIANYING_NATIVE_DISSOLVE_METADATA.isOverlap &&
		material.name === JIANYING_NATIVE_DISSOLVE_METADATA.name &&
		material.resource_id === JIANYING_NATIVE_DISSOLVE_METADATA.resourceId
	);
}

export function isVerifiedCapCut81TransitionMaterial({
	material,
}: {
	material: JianyingTransitionMaterial;
}): boolean {
	return (
		hasVerifiedTransitionShape({ material }) &&
		material.effect_id === CAPCUT_NATIVE_DISSOLVE_METADATA.effectId &&
		material.is_overlap === CAPCUT_NATIVE_DISSOLVE_METADATA.isOverlap &&
		material.name === CAPCUT_NATIVE_DISSOLVE_METADATA.name &&
		material.resource_id === CAPCUT_NATIVE_DISSOLVE_METADATA.resourceId
	);
}
