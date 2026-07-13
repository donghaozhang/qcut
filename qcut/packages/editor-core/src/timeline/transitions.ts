import type {
	AudioCrossfade,
	ClipTransition,
	ClipTransitionDirection,
	ClipTransitionEasing,
	ClipTransitionType,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";
import { getEffectiveDuration } from "./element-utils.js";

export const TRANSITION_SEAM_TOLERANCE_SECONDS = 1 / 30 + 1e-6;

export interface ResolvedClipTransition {
	transition: ClipTransition;
	fromElement: MediaElement;
	toElement: MediaElement;
	cutTime: number;
	windowStart: number;
	windowEnd: number;
	maxDuration: number;
}

export interface MediaSeam {
	fromElement: MediaElement;
	toElement: MediaElement;
	cutTime: number;
	distance: number;
}

export interface ResolvedAudioCrossfade {
	crossfade: AudioCrossfade;
	fromElement: MediaElement;
	toElement: MediaElement;
	cutTime: number;
	windowStart: number;
	windowEnd: number;
	maxDuration: number;
}

type ElementDurationResolver = ({
	element,
}: {
	element: MediaElement;
}) => number;

const TRANSITION_TYPES = new Set<ClipTransitionType>([
	"dissolve",
	"fade-black",
	"fade-white",
	"slide",
	"wipe",
	"push",
	"zoom-blur",
	"whip-pan",
	"flash",
	"light-leak",
	"rgb-glitch",
	"shake",
]);
const TRANSITION_DIRECTIONS = new Set<ClipTransitionDirection>([
	"left",
	"right",
	"up",
	"down",
]);
const TRANSITION_EASINGS = new Set<ClipTransitionEasing>([
	"linear",
	"easeInOut",
]);

function defaultElementDuration({
	element,
}: {
	element: MediaElement;
}): number {
	return getEffectiveDuration(element);
}

function sortedMediaElements({
	track,
}: {
	track: TimelineTrack;
}): MediaElement[] {
	return track.elements
		.filter((element): element is MediaElement => element.type === "media")
		.sort((left, right) => {
			const timeDifference = left.startTime - right.startTime;
			return timeDifference !== 0
				? timeDifference
				: left.id.localeCompare(right.id);
		});
}

function resolveMediaSeamRelation({
	track,
	fromElementId,
	toElementId,
	getElementDuration,
	seamTolerance,
}: {
	track: TimelineTrack;
	fromElementId: string;
	toElementId: string;
	getElementDuration: ElementDurationResolver;
	seamTolerance: number;
}): {
	fromElement: MediaElement;
	toElement: MediaElement;
	fromDuration: number;
	toDuration: number;
	cutTime: number;
	maxDuration: number;
} | null {
	if (track.type !== "media" && track.type !== "audio") return null;
	const mediaElements = sortedMediaElements({ track });
	const fromIndex = mediaElements.findIndex(
		(element) => element.id === fromElementId
	);
	const toIndex = mediaElements.findIndex(
		(element) => element.id === toElementId
	);
	if (fromIndex < 0 || toIndex !== fromIndex + 1) return null;

	const fromElement = mediaElements[fromIndex];
	const toElement = mediaElements[toIndex];
	const fromDuration = Math.max(
		0,
		getElementDuration({ element: fromElement })
	);
	const toDuration = Math.max(0, getElementDuration({ element: toElement }));
	const cutTime = fromElement.startTime + fromDuration;
	if (Math.abs(cutTime - toElement.startTime) > seamTolerance) return null;

	const maxDuration = Math.max(0, 2 * Math.min(fromDuration, toDuration));
	if (maxDuration <= 0) return null;
	return {
		fromElement,
		toElement,
		fromDuration,
		toDuration,
		cutTime,
		maxDuration,
	};
}

function normalizeTransition({
	transition,
}: {
	transition: ClipTransition;
}): ClipTransition | null {
	if (!TRANSITION_TYPES.has(transition.type)) return null;
	if (!Number.isFinite(transition.duration) || transition.duration <= 0) {
		return null;
	}

	const direction =
		transition.direction && TRANSITION_DIRECTIONS.has(transition.direction)
			? transition.direction
			: undefined;
	const easing = TRANSITION_EASINGS.has(transition.easing)
		? transition.easing
		: "easeInOut";
	const tuning = transition.tuning
		? {
				intensity:
					transition.tuning.intensity === undefined
						? undefined
						: Math.min(2, Math.max(0.1, transition.tuning.intensity)),
				frequency:
					transition.tuning.frequency === undefined
						? undefined
						: Math.min(4, Math.max(0.1, transition.tuning.frequency)),
				tint: /^#[\da-f]{6}$/i.test(transition.tuning.tint ?? "")
					? transition.tuning.tint
					: undefined,
			}
		: undefined;

	return {
		...transition,
		direction,
		easing,
		tuning,
	};
}

export function resolveClipTransition({
	track,
	transition,
	getElementDuration = defaultElementDuration,
	seamTolerance = TRANSITION_SEAM_TOLERANCE_SECONDS,
}: {
	track: TimelineTrack;
	transition: ClipTransition;
	getElementDuration?: ElementDurationResolver;
	seamTolerance?: number;
}): ResolvedClipTransition | null {
	if (track.type !== "media") return null;
	const relation = resolveMediaSeamRelation({
		track,
		fromElementId: transition.fromElementId,
		toElementId: transition.toElementId,
		getElementDuration,
		seamTolerance,
	});
	if (!relation) return null;
	const duration = Math.min(transition.duration, relation.maxDuration);
	const halfDuration = duration / 2;

	return {
		transition: { ...transition, duration },
		fromElement: relation.fromElement,
		toElement: relation.toElement,
		cutTime: relation.cutTime,
		windowStart: relation.cutTime - halfDuration,
		windowEnd: relation.cutTime + halfDuration,
		maxDuration: relation.maxDuration,
	};
}

export function resolveAudioCrossfade({
	track,
	crossfade,
	getElementDuration = defaultElementDuration,
	seamTolerance = TRANSITION_SEAM_TOLERANCE_SECONDS,
}: {
	track: TimelineTrack;
	crossfade: AudioCrossfade;
	getElementDuration?: ElementDurationResolver;
	seamTolerance?: number;
}): ResolvedAudioCrossfade | null {
	if (
		!Number.isFinite(crossfade.duration) ||
		crossfade.duration <= 0 ||
		(crossfade.curve !== "linear" && crossfade.curve !== "equal-power")
	) {
		return null;
	}
	const relation = resolveMediaSeamRelation({
		track,
		fromElementId: crossfade.fromElementId,
		toElementId: crossfade.toElementId,
		getElementDuration,
		seamTolerance,
	});
	if (!relation) return null;
	const duration = Math.min(crossfade.duration, relation.maxDuration);
	const halfDuration = duration / 2;
	return {
		crossfade: { ...crossfade, duration },
		fromElement: relation.fromElement,
		toElement: relation.toElement,
		cutTime: relation.cutTime,
		windowStart: relation.cutTime - halfDuration,
		windowEnd: relation.cutTime + halfDuration,
		maxDuration: relation.maxDuration,
	};
}

export function getAudioCrossfadeMaxDuration({
	track,
	fromElementId,
	toElementId,
	crossfades = track.audioCrossfades ?? [],
	excludeCrossfadeId,
	getElementDuration = defaultElementDuration,
}: {
	track: TimelineTrack;
	fromElementId: string;
	toElementId: string;
	crossfades?: AudioCrossfade[];
	excludeCrossfadeId?: string;
	getElementDuration?: ElementDurationResolver;
}): number {
	const probe: AudioCrossfade = {
		id: excludeCrossfadeId ?? "audio-crossfade-probe",
		fromElementId,
		toElementId,
		duration: Number.MAX_SAFE_INTEGER,
		curve: "equal-power",
	};
	const resolved = resolveAudioCrossfade({
		track,
		crossfade: probe,
		getElementDuration,
	});
	if (!resolved) return 0;

	let maxDuration = resolved.maxDuration;
	for (const existing of crossfades) {
		if (existing.id === excludeCrossfadeId) continue;
		if (existing.toElementId === fromElementId) {
			maxDuration = Math.min(
				maxDuration,
				Math.max(
					0,
					2 * getElementDuration({ element: resolved.fromElement }) -
						existing.duration
				)
			);
		}
		if (existing.fromElementId === toElementId) {
			maxDuration = Math.min(
				maxDuration,
				Math.max(
					0,
					2 * getElementDuration({ element: resolved.toElement }) -
						existing.duration
				)
			);
		}
	}
	return Math.max(0, maxDuration);
}

export function reconcileTrackAudioCrossfades({
	track,
	getElementDuration = defaultElementDuration,
}: {
	track: TimelineTrack;
	getElementDuration?: ElementDurationResolver;
}): TimelineTrack {
	if (!track.audioCrossfades) return track;
	if (track.type !== "media" && track.type !== "audio") {
		return { ...track, audioCrossfades: [] };
	}

	const seenIds = new Set<string>();
	const seenSeams = new Set<string>();
	const resolvedCrossfades: ResolvedAudioCrossfade[] = [];
	for (const candidate of track.audioCrossfades) {
		if (seenIds.has(candidate.id)) continue;
		const seamKey = candidate.fromElementId + ":" + candidate.toElementId;
		if (seenSeams.has(seamKey)) continue;
		const resolved = resolveAudioCrossfade({
			track,
			crossfade: candidate,
			getElementDuration,
		});
		if (!resolved) continue;
		seenIds.add(candidate.id);
		seenSeams.add(seamKey);
		resolvedCrossfades.push(resolved);
	}

	resolvedCrossfades.sort((left, right) => left.cutTime - right.cutTime);
	const accepted: AudioCrossfade[] = [];
	for (const resolved of resolvedCrossfades) {
		const maxDuration = getAudioCrossfadeMaxDuration({
			track,
			fromElementId: resolved.crossfade.fromElementId,
			toElementId: resolved.crossfade.toElementId,
			crossfades: accepted,
			getElementDuration,
		});
		const duration = Math.min(resolved.crossfade.duration, maxDuration);
		if (duration <= 0) continue;
		accepted.push({ ...resolved.crossfade, duration });
	}
	return { ...track, audioCrossfades: accepted };
}

export function getTransitionMaxDuration({
	track,
	fromElementId,
	toElementId,
	transitions = track.transitions ?? [],
	excludeTransitionId,
	getElementDuration = defaultElementDuration,
}: {
	track: TimelineTrack;
	fromElementId: string;
	toElementId: string;
	transitions?: ClipTransition[];
	excludeTransitionId?: string;
	getElementDuration?: ElementDurationResolver;
}): number {
	const probe: ClipTransition = {
		id: excludeTransitionId ?? "transition-probe",
		fromElementId,
		toElementId,
		presetId: "transition-probe",
		type: "dissolve",
		duration: Number.MAX_SAFE_INTEGER,
		easing: "linear",
	};
	const resolved = resolveClipTransition({
		track,
		transition: probe,
		getElementDuration,
	});
	if (!resolved) return 0;

	const fromDuration = Math.max(
		0,
		getElementDuration({ element: resolved.fromElement })
	);
	const toDuration = Math.max(
		0,
		getElementDuration({ element: resolved.toElement })
	);
	let maxDuration = resolved.maxDuration;

	for (const existing of transitions) {
		if (existing.id === excludeTransitionId) continue;
		if (existing.toElementId === fromElementId) {
			maxDuration = Math.min(
				maxDuration,
				Math.max(0, 2 * fromDuration - existing.duration)
			);
		}
		if (existing.fromElementId === toElementId) {
			maxDuration = Math.min(
				maxDuration,
				Math.max(0, 2 * toDuration - existing.duration)
			);
		}
	}

	return Math.max(0, maxDuration);
}

export function reconcileTrackTransitions({
	track,
	getElementDuration = defaultElementDuration,
}: {
	track: TimelineTrack;
	getElementDuration?: ElementDurationResolver;
}): TimelineTrack {
	if (!track.transitions) return track;
	if (track.type !== "media") return { ...track, transitions: [] };

	const seenIds = new Set<string>();
	const seenSeams = new Set<string>();
	const resolvedTransitions: Array<{
		transition: ClipTransition;
		cutTime: number;
	}> = [];

	for (const candidate of track.transitions) {
		const transition = normalizeTransition({ transition: candidate });
		if (!transition || seenIds.has(transition.id)) continue;
		const seamKey = `${transition.fromElementId}:${transition.toElementId}`;
		if (seenSeams.has(seamKey)) continue;

		const resolved = resolveClipTransition({
			track,
			transition,
			getElementDuration,
		});
		if (!resolved) continue;

		seenIds.add(transition.id);
		seenSeams.add(seamKey);
		resolvedTransitions.push({
			transition: resolved.transition,
			cutTime: resolved.cutTime,
		});
	}

	resolvedTransitions.sort((left, right) => left.cutTime - right.cutTime);
	const accepted: ClipTransition[] = [];
	for (const item of resolvedTransitions) {
		const maxDuration = getTransitionMaxDuration({
			track,
			fromElementId: item.transition.fromElementId,
			toElementId: item.transition.toElementId,
			transitions: accepted,
			getElementDuration,
		});
		const duration = Math.min(item.transition.duration, maxDuration);
		if (duration <= 0) continue;
		accepted.push({ ...item.transition, duration });
	}

	return { ...track, transitions: accepted };
}

export function reconcileTimelineTransitions({
	tracks,
	getElementDuration = defaultElementDuration,
}: {
	tracks: TimelineTrack[];
	getElementDuration?: ElementDurationResolver;
}): TimelineTrack[] {
	return tracks.map((track) =>
		reconcileTrackAudioCrossfades({
			track: reconcileTrackTransitions({ track, getElementDuration }),
			getElementDuration,
		})
	);
}

export function findClosestMediaSeam({
	track,
	time,
	maxDistance,
	getElementDuration = defaultElementDuration,
	seamTolerance = TRANSITION_SEAM_TOLERANCE_SECONDS,
}: {
	track: TimelineTrack;
	time: number;
	maxDistance: number;
	getElementDuration?: ElementDurationResolver;
	seamTolerance?: number;
}): MediaSeam | null {
	if (track.type !== "media") return null;
	const mediaElements = sortedMediaElements({ track });
	let closest: MediaSeam | null = null;

	for (let index = 0; index < mediaElements.length - 1; index++) {
		const fromElement = mediaElements[index];
		const toElement = mediaElements[index + 1];
		const cutTime =
			fromElement.startTime + getElementDuration({ element: fromElement });
		if (Math.abs(cutTime - toElement.startTime) > seamTolerance) continue;
		const distance = Math.abs(time - cutTime);
		if (distance > maxDistance || (closest && distance >= closest.distance)) {
			continue;
		}
		closest = { fromElement, toElement, cutTime, distance };
	}

	return closest;
}
