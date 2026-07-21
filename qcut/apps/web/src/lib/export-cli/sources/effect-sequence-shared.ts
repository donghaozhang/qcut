import type { TimelineTrack } from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";

/**
 * Shared contract for the baked effect-sequence extractors
 * (effect-procedural-sources.ts, effect-distortion-sources.ts).
 */
export type LogFn = (...args: unknown[]) => void;

export interface EffectSequenceExportAPI {
	saveEffectSequenceFrame: (params: {
		sessionId: string;
		sequenceId: string;
		frameIndex: number;
		imageData: Uint8Array;
		/** File extension for the frame ("png" default, "pgm" for remap maps). */
		extension?: string;
	}) => Promise<{
		success: boolean;
		path?: string;
		patternPath?: string;
		error?: string;
	}>;
}

export function defaultEffectSequenceExportAPI(): EffectSequenceExportAPI {
	return platform().ffmpeg as unknown as EffectSequenceExportAPI;
}

function fnv1a32({ value }: { value: string }): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Maps an element id to a filesystem-safe sequence directory name, matching
 * the main-process charset validation in save-effect-sequence-frame. Charset
 * replacement alone is lossy ("clip/a" and "clip_a" both map to "clip_a"),
 * so ids that needed sanitizing get a hash of the original id appended to
 * keep distinct elements in distinct sequence directories.
 */
export function sanitizeSequenceElementId({
	elementId,
}: {
	elementId: string;
}): string {
	const sanitized = elementId.replace(/[^a-zA-Z0-9._-]/g, "_");
	if (sanitized === elementId) return sanitized;
	return `${sanitized}-h${fnv1a32({ value: elementId })}`;
}

export function elementTimelineDurationSeconds({
	tracks,
	elementId,
}: {
	tracks: readonly TimelineTrack[];
	elementId: string;
}): number | undefined {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.id !== elementId) continue;
			return Math.max(
				0,
				element.duration - element.trimStart - element.trimEnd
			);
		}
	}
	return undefined;
}
