import type { TimelineElement, TimelineTrack } from "../types/timeline.js";
import { getEffectiveDuration } from "./element-utils.js";
import { normalizeTrackOrder } from "./track-utils.js";

export interface CompositionLayer {
	track: TimelineTrack;
	element: TimelineElement;
	trackOrder: number;
	elementOrder: number;
	drawOrder: number;
}

export interface CompositionAudioElement {
	track: TimelineTrack;
	element: TimelineElement;
	trackOrder: number;
	elementOrder: number;
}

export interface CompositionPlan {
	/** All tracks in UI order, top to bottom. */
	tracks: TimelineTrack[];
	/** Active visual elements in compositor order, bottom to top. */
	visualLayers: CompositionLayer[];
	/** Active dedicated audio-track elements. Audio is mixed, not composited. */
	audioElements: CompositionAudioElement[];
}

export interface CompositionDurationContext {
	element: TimelineElement;
	track: TimelineTrack;
}

export interface BuildCompositionPlanOptions {
	tracks: TimelineTrack[];
	currentTime?: number;
	includeHidden?: boolean;
	forceActiveElementIds?: ReadonlySet<string>;
	getElementDuration?: (context: CompositionDurationContext) => number;
}

function isElementActive({
	element,
	track,
	currentTime,
	getElementDuration,
	forceActiveElementIds,
}: {
	element: TimelineElement;
	track: TimelineTrack;
	currentTime: number | undefined;
	getElementDuration: (context: CompositionDurationContext) => number;
	forceActiveElementIds?: ReadonlySet<string>;
}): boolean {
	if (forceActiveElementIds?.has(element.id)) return true;
	if (currentTime === undefined) return true;
	const duration = Math.max(0, getElementDuration({ element, track }));
	return (
		currentTime >= element.startTime &&
		currentTime < element.startTime + duration
	);
}

/**
 * Build the canonical layer plan shared by preview and export renderers.
 * UI order is top-to-bottom; visual draw order is deliberately reversed.
 */
export function buildCompositionPlan({
	tracks,
	currentTime,
	includeHidden = false,
	forceActiveElementIds,
	getElementDuration = ({ element }) => getEffectiveDuration(element),
}: BuildCompositionPlanOptions): CompositionPlan {
	const orderedTracks = normalizeTrackOrder({ tracks });
	const visibleTracks = includeHidden
		? orderedTracks
		: orderedTracks.filter((track) => !track.hidden);
	const visualLayers: CompositionLayer[] = [];
	const audioElements: CompositionAudioElement[] = [];

	for (let trackOrder = 0; trackOrder < visibleTracks.length; trackOrder++) {
		const track = visibleTracks[trackOrder];
		if (track.type !== "audio") continue;

		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder++
		) {
			const element = track.elements[elementOrder];
			if (!includeHidden && element.hidden) continue;
			if (
				!isElementActive({
					element,
					track,
					currentTime,
					getElementDuration,
					forceActiveElementIds,
				})
			) {
				continue;
			}

			audioElements.push({ track, element, trackOrder, elementOrder });
		}
	}

	const visualTracks = visibleTracks.filter((track) => track.type !== "audio");
	for (
		let reverseIndex = visualTracks.length - 1;
		reverseIndex >= 0;
		reverseIndex--
	) {
		const track = visualTracks[reverseIndex];
		const trackOrder = orderedTracks.findIndex(
			(candidate) => candidate.id === track.id
		);

		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder++
		) {
			const element = track.elements[elementOrder];
			if (!includeHidden && element.hidden) continue;
			if (
				!isElementActive({
					element,
					track,
					currentTime,
					getElementDuration,
					forceActiveElementIds,
				})
			) {
				continue;
			}

			visualLayers.push({
				track,
				element,
				trackOrder,
				elementOrder,
				drawOrder: visualLayers.length,
			});
		}
	}

	return { tracks: orderedTracks, visualLayers, audioElements };
}
