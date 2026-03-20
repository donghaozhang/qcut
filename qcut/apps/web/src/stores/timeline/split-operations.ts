/**
 * Split Operations
 *
 * Operations for splitting, trimming, and audio separation.
 * Uses OperationContext pattern for decoupling from Zustand.
 */

import type { TimelineTrack, TimelineElement } from "@/types/timeline";
import { generateUUID } from "@/lib/utils";
import type { OperationContext } from "./types";
import {
	getElementNameWithSuffix,
	getEffectiveDuration,
	getElementEndTime,
	createTrack,
} from "./utils";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";

/**
 * Result of a split operation
 */
export interface SplitResult {
	/** ID of the newly created second element, or null if split failed */
	secondElementId: string | null;
}

/**
 * Split an element at a specific time, creating two elements
 * @param ctx - Operation context
 * @param trackId - ID of the track containing the element
 * @param elementId - ID of the element to split
 * @param splitTime - Time at which to split the element
 * @returns The ID of the newly created second element, or null if split failed
 */
export function splitElementOperation(
	ctx: OperationContext,
	trackId: string,
	elementId: string,
	splitTime: number
): string | null {
	ctx.pushHistory();
	return splitElementOperationNoHistory(ctx, trackId, elementId, splitTime);
}

/**
 * Split an element without pushing history.
 * Used by batch operations (e.g. splitOnBeats) that manage history externally.
 */
function splitElementOperationNoHistory(
	ctx: OperationContext,
	trackId: string,
	elementId: string,
	splitTime: number
): string | null {
	const tracks = ctx.getTracks();
	const track = tracks.find((t) => t.id === trackId);
	const element = track?.elements.find((c) => c.id === elementId);

	if (!element) return null;

	const effectiveStart = element.startTime;
	const effectiveEnd = getElementEndTime(element);

	// Cannot split outside the element bounds
	if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return null;

	const relativeTime = splitTime - element.startTime;
	const firstDuration = relativeTime;
	const secondDuration = getEffectiveDuration(element) - relativeTime;

	const secondElementId = generateUUID();

	const leftPart = {
		...element,
		trimEnd: element.trimEnd + secondDuration,
		name: getElementNameWithSuffix(element.name, "left"),
	};

	const rightPart = {
		...element,
		id: secondElementId,
		startTime: splitTime,
		trimStart: element.trimStart + firstDuration,
		name: getElementNameWithSuffix(element.name, "right"),
	};

	ctx.updateTracksAndSave(
		tracks.map((t) =>
			t.id === trackId
				? {
						...t,
						elements: t.elements.flatMap((c) =>
							c.id === elementId ? [leftPart, rightPart] : [c]
						),
					}
				: t
		)
	);

	return secondElementId;
}

/**
 * Split an element and keep only the left portion
 * @param ctx - Operation context
 * @param trackId - ID of the track containing the element
 * @param elementId - ID of the element to split
 * @param splitTime - Time at which to split the element
 */
export function splitAndKeepLeftOperation(
	ctx: OperationContext,
	trackId: string,
	elementId: string,
	splitTime: number
): void {
	const tracks = ctx.getTracks();
	const track = tracks.find((t) => t.id === trackId);
	const element = track?.elements.find((c) => c.id === elementId);

	if (!element) return;

	const effectiveStart = element.startTime;
	const effectiveEnd = getElementEndTime(element);

	// Cannot split outside the element bounds
	if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return;

	ctx.pushHistory();

	const relativeTime = splitTime - element.startTime;
	const durationToRemove = getEffectiveDuration(element) - relativeTime;

	ctx.updateTracksAndSave(
		tracks.map((t) =>
			t.id === trackId
				? {
						...t,
						elements: t.elements.map((c) =>
							c.id === elementId
								? {
										...c,
										trimEnd: c.trimEnd + durationToRemove,
										name: getElementNameWithSuffix(c.name, "left"),
									}
								: c
						),
					}
				: t
		)
	);
}

/**
 * Split an element and keep only the right portion
 * @param ctx - Operation context
 * @param trackId - ID of the track containing the element
 * @param elementId - ID of the element to split
 * @param splitTime - Time at which to split the element
 */
export function splitAndKeepRightOperation(
	ctx: OperationContext,
	trackId: string,
	elementId: string,
	splitTime: number
): void {
	const tracks = ctx.getTracks();
	const track = tracks.find((t) => t.id === trackId);
	const element = track?.elements.find((c) => c.id === elementId);

	if (!element) return;

	const effectiveStart = element.startTime;
	const effectiveEnd = getElementEndTime(element);

	// Cannot split outside the element bounds
	if (splitTime <= effectiveStart || splitTime >= effectiveEnd) return;

	ctx.pushHistory();

	const relativeTime = splitTime - element.startTime;

	ctx.updateTracksAndSave(
		tracks.map((t) =>
			t.id === trackId
				? {
						...t,
						elements: t.elements.map((c) =>
							c.id === elementId
								? {
										...c,
										startTime: splitTime,
										trimStart: c.trimStart + relativeTime,
										name: getElementNameWithSuffix(c.name, "right"),
									}
								: c
						),
					}
				: t
		)
	);
}

/**
 * Separate audio from a video element to a dedicated audio track
 * @param ctx - Operation context
 * @param trackId - ID of the track containing the element
 * @param elementId - ID of the element to extract audio from
 * @returns The ID of the newly created audio element, or null if separation failed
 */
export function separateAudioOperation(
	ctx: OperationContext,
	trackId: string,
	elementId: string
): string | null {
	const tracks = ctx.getTracks();
	const track = tracks.find((t) => t.id === trackId);
	const element = track?.elements.find((c) => c.id === elementId);

	// Only allow audio separation from media tracks
	if (!element || track?.type !== "media") return null;

	ctx.pushHistory();

	// Find existing audio track or prepare to create one
	const existingAudioTrack = tracks.find((t) => t.type === "audio");
	const audioElementId = generateUUID();

	if (existingAudioTrack) {
		// Add audio element to existing audio track
		ctx.updateTracksAndSave(
			tracks.map((t) =>
				t.id === existingAudioTrack.id
					? {
							...t,
							elements: [
								...t.elements,
								{
									...element,
									id: audioElementId,
									name: getElementNameWithSuffix(element.name, "audio"),
								},
							],
						}
					: t
			)
		);
	} else {
		// Create new audio track with the audio element in a single atomic update
		const newAudioTrack: TimelineTrack = {
			...createTrack("audio"),
			elements: [
				{
					...element,
					id: audioElementId,
					name: getElementNameWithSuffix(element.name, "audio"),
				},
			],
		};

		ctx.updateTracksAndSave([...tracks, newAudioTrack]);
	}

	return audioElementId;
}

/**
 * Get all audio elements from the timeline for export
 * @param tracks - Timeline tracks to search
 * @returns Array of audio elements with their track and position info
 */
export function getAudioElementsOperation(tracks: TimelineTrack[]): Array<{
	element: TimelineElement;
	trackId: string;
	absoluteStart: number;
}> {
	const audioElements: Array<{
		element: TimelineElement;
		trackId: string;
		absoluteStart: number;
	}> = [];

	for (const track of tracks) {
		if (track.type === "audio" || track.type === "media") {
			for (const element of track.elements) {
				// Only media elements carry audio
				if (element.type === "media") {
					audioElements.push({
						element,
						trackId: track.id,
						absoluteStart: element.startTime,
					});
				}
			}
		}
	}

	return audioElements;
}

/**
 * Calculate the total duration of the timeline
 * @param tracks - Timeline tracks
 * @returns Total duration in seconds
 */
export function getTotalDurationOperation(tracks: TimelineTrack[]): number {
	if (tracks.length === 0) return 0;

	const trackEndTimes = tracks.map((track) =>
		track.elements.reduce((maxEnd, element) => {
			const elementEnd = getElementEndTime(element);
			return Math.max(maxEnd, elementEnd);
		}, 0)
	);

	return Math.max(...trackEndTimes, 0);
}

/**
 * Split an element at all detected beat points.
 * Splits are executed back-to-front to prevent time offset cascading.
 *
 * @param ctx - Operation context
 * @param trackId - ID of the track containing the element
 * @param elementId - ID of the element to split on beats
 * @returns Number of splits performed
 */
export function splitOnBeats(
	ctx: OperationContext,
	trackId: string,
	elementId: string,
): number {
	const tracks = ctx.getTracks();
	const track = tracks.find((t) => t.id === trackId);
	const element = track?.elements.find((c) => c.id === elementId);

	if (!element) return 0;

	// Set active element so getCutPoints reads the correct cache entry
	const beatStore = useBeatDetectionStore.getState();
	beatStore.setActiveElement(elementId);

	// Beat timestamps are audio-relative (0-based from analysis).
	// Map them to timeline coordinates using element.startTime + trimStart offset.
	const trimStart = element.trimStart ?? 0;
	const elementStart = element.startTime;
	const elementEnd = getElementEndTime(element);

	// Get cut points in audio-relative time, then map to timeline
	const audioCutPoints = beatStore.getCutPoints(trimStart, trimStart + (elementEnd - elementStart));
	const timelineCutPoints = audioCutPoints.map((t) => t - trimStart + elementStart);

	if (timelineCutPoints.length === 0) return 0;

	// Sort descending — split back-to-front to avoid offset cascading
	const sorted = [...timelineCutPoints].sort((a, b) => b - a);

	// Single history entry for the entire batch
	ctx.pushHistory();

	let splitCount = 0;
	let currentElementId = elementId;

	for (const time of sorted) {
		// Use splitElementOperationNoHistory to avoid N+1 undo entries
		const result = splitElementOperationNoHistory(ctx, trackId, currentElementId, time);
		if (result !== null) {
			splitCount++;
		}
	}

	return splitCount;
}
