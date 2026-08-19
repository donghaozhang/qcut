import type {
	EffectElement,
	TimelineElement,
	TimelineTrack,
} from "../types/timeline.js";
import { getEffectiveDuration } from "./element-utils.js";
import { normalizeTrackOrder } from "./track-utils.js";

export interface CompositionLayer {
	track: TimelineTrack;
	element: TimelineElement;
	trackOrder: number;
	elementOrder: number;
	drawOrder: number;
}

/**
 * A region effect segment: for [startTime, endTime) it applies to every
 * visual layer whose track sits BELOW its own (trackOrder greater than its
 * trackOrder — UI order is top-to-bottom). Extracted here so preview and
 * export resolve coverage from the same plan.
 */
export interface CompositionRegionEffect {
	track: TimelineTrack;
	element: EffectElement;
	trackOrder: number;
	startTime: number;
	endTime: number;
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
	/** Active untargeted effect segments from effect tracks (region effects). */
	regionEffects: CompositionRegionEffect[];
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
	activeTransitionIds?: ReadonlySet<string>;
	getElementDuration?: (context: CompositionDurationContext) => number;
}

interface IndexedTimelineElement {
	element: TimelineElement;
	elementOrder: number;
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

function groupActiveTransitionElements({
	track,
	activeTrackElements,
	activeTransitionIds,
}: {
	track: TimelineTrack;
	activeTrackElements: IndexedTimelineElement[];
	activeTransitionIds: ReadonlySet<string> | undefined;
}): IndexedTimelineElement[] {
	if (
		track.type !== "media" ||
		!track.transitions?.length ||
		!activeTransitionIds?.size
	) {
		return activeTrackElements;
	}

	const orderedElements = [...activeTrackElements];
	for (const transition of track.transitions) {
		if (!activeTransitionIds.has(transition.id)) continue;

		const outgoingIndex = orderedElements.findIndex(
			({ element }) => element.id === transition.fromElementId
		);
		const incomingIndex = orderedElements.findIndex(
			({ element }) => element.id === transition.toElementId
		);
		if (
			outgoingIndex < 0 ||
			incomingIndex < 0 ||
			incomingIndex === outgoingIndex + 1
		) {
			continue;
		}

		// Native export anchors the combined transition run at the outgoing layer.
		const [incoming] = orderedElements.splice(incomingIndex, 1);
		const updatedOutgoingIndex = orderedElements.findIndex(
			({ element }) => element.id === transition.fromElementId
		);
		orderedElements.splice(updatedOutgoingIndex + 1, 0, incoming);
	}

	return orderedElements;
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
	activeTransitionIds,
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

	const regionEffects: CompositionRegionEffect[] = [];
	for (let trackOrder = 0; trackOrder < visibleTracks.length; trackOrder++) {
		const track = visibleTracks[trackOrder];
		if (track.type !== "effect") continue;
		for (const element of track.elements) {
			if (element.type !== "effect" || element.targetElementId) continue;
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
			const duration = Math.max(0, getElementDuration({ element, track }));
			regionEffects.push({
				track,
				element,
				trackOrder,
				startTime: element.startTime,
				endTime: element.startTime + duration,
			});
		}
	}

	// Effect tracks stay in the visual walk: their untargeted segments are
	// marker layers, applied to the composite below them the way adjustment
	// layers are (renderers branch on element.type === "effect").
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
		const activeTrackElements = groupActiveTransitionElements({
			track,
			activeTransitionIds,
			activeTrackElements: track.elements
				.map((element, elementOrder) => ({ element, elementOrder }))
				.filter(({ element }) => {
					if (!includeHidden && element.hidden) return false;
					return isElementActive({
						element,
						track,
						currentTime,
						getElementDuration,
						forceActiveElementIds,
					});
				}),
		});

		for (const { element, elementOrder } of activeTrackElements) {
			visualLayers.push({
				track,
				element,
				trackOrder,
				elementOrder,
				drawOrder: visualLayers.length,
			});
		}
	}

	return { tracks: orderedTracks, visualLayers, audioElements, regionEffects };
}
