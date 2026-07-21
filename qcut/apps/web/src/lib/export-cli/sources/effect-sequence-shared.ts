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

function utf8Hex({ value }: { value: string }): string {
	let hex = "";
	for (const byte of new TextEncoder().encode(value)) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

/**
 * Maps an element id to a filesystem-safe sequence directory name, matching
 * the main-process charset validation in save-effect-sequence-frame.
 *
 * The mapping is injective by construction: already-safe ids keep their name
 * inside the "p-" (plain) namespace, while ids that need sanitizing move to
 * the "e-" (encoded) namespace carrying a readable prefix plus the full
 * UTF-8 hex of the original id as the final hyphen-separated segment. Hex
 * never contains a hyphen, so the original id is always recoverable, and the
 * two namespaces cannot collide — distinct elements always get distinct
 * sequence directories.
 */
export function sanitizeSequenceElementId({
	elementId,
}: {
	elementId: string;
}): string {
	const sanitized = elementId.replace(/[^a-zA-Z0-9._-]/g, "_");
	if (sanitized === elementId) return `p-${elementId}`;
	return `e-${sanitized.slice(0, 24)}-${utf8Hex({ value: elementId })}`;
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
