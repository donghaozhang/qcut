import type { EffectInstance, EffectTimelineRange } from "../types/effects.js";
import type {
	EffectElement,
	TimelineElement,
	TimelineTrack,
} from "../types/timeline.js";
import { getElementEndTime } from "./element-utils.js";
import { sortTracksByOrder } from "./track-utils.js";

function findTargetElement({
	tracks,
	targetElementId,
}: {
	tracks: readonly TimelineTrack[];
	targetElementId: string;
}): TimelineElement | undefined {
	for (const track of tracks) {
		const target = track.elements.find(
			(element) => element.type !== "effect" && element.id === targetElementId
		);
		if (target) return target;
	}
}

function resolveEffectElementRange({
	effectElement,
	target,
}: {
	effectElement: EffectElement;
	target: TimelineElement;
}): EffectTimelineRange | undefined {
	const startTime = Math.max(effectElement.startTime, target.startTime);
	const endTime = Math.min(
		getElementEndTime(effectElement),
		getElementEndTime(target)
	);
	if (endTime <= startTime) return;
	return { startTime, duration: endTime - startTime };
}

/**
 * Resolves legacy clip effects and independent effect elements by target.
 * Lower effect tracks are evaluated first so visually higher tracks win last.
 */
export function collectTimelineEffectsByTarget({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): ReadonlyMap<string, readonly EffectInstance[]> {
	const effectsByTarget = new Map<string, EffectInstance[]>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "effect" || !element.effects?.length) continue;
			effectsByTarget.set(element.id, [...element.effects]);
		}
	}

	const effectTracks = sortTracksByOrder([...tracks])
		.filter((track) => track.type === "effect" && !track.hidden)
		.reverse();
	for (const track of effectTracks) {
		for (const element of track.elements) {
			if (element.type !== "effect" || element.hidden) continue;
			const target = findTargetElement({
				tracks,
				targetElementId: element.targetElementId,
			});
			if (!target) continue;
			const timelineRange = resolveEffectElementRange({
				effectElement: element,
				target,
			});
			if (!timelineRange) continue;
			const current = effectsByTarget.get(target.id) ?? [];
			current.push({
				...element.effect,
				duration: timelineRange.duration,
				timelineRange,
			});
			effectsByTarget.set(target.id, current);
		}
	}
	return effectsByTarget;
}

/** Returns only effects that are enabled at the requested global timeline time. */
export function getTimelineEffectsAtTime({
	tracks,
	currentTime,
}: {
	tracks: readonly TimelineTrack[];
	currentTime: number;
}): ReadonlyMap<string, readonly EffectInstance[]> {
	const active = new Map<string, readonly EffectInstance[]>();
	for (const [targetId, effects] of collectTimelineEffectsByTarget({
		tracks,
	})) {
		const atTime = effects.filter((effect) => {
			if (!effect.enabled) return false;
			if (!effect.timelineRange) return true;
			const endTime =
				effect.timelineRange.startTime + effect.timelineRange.duration;
			return (
				currentTime >= effect.timelineRange.startTime && currentTime < endTime
			);
		});
		if (atTime.length > 0) active.set(targetId, atTime);
	}
	return active;
}

/** Converts a global effect range to target-clip-local output time. */
export function getEffectRenderWindow({
	effect,
	target,
}: {
	effect: EffectInstance;
	target: Pick<
		TimelineElement,
		"startTime" | "duration" | "trimStart" | "trimEnd"
	>;
}): { startSeconds: number; endSeconds: number } | undefined {
	if (!effect.timelineRange) return;
	const targetDuration = Math.max(
		0,
		target.duration - target.trimStart - target.trimEnd
	);
	const startSeconds = Math.max(
		0,
		effect.timelineRange.startTime - target.startTime
	);
	const endSeconds = Math.min(
		targetDuration,
		startSeconds + effect.timelineRange.duration
	);
	if (endSeconds <= startSeconds) return;
	return { startSeconds, endSeconds };
}
