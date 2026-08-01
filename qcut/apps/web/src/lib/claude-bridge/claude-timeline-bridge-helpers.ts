/**
 * Claude Timeline Bridge Helpers
 * Utility functions for element resolution, formatting, and import operations.
 * Extracted from claude-timeline-bridge.ts to keep files under 800 lines.
 */

import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore, type MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";
import { normalizeTextAnimations } from "@qcut/editor-core";
import type {
	AdjustmentElement,
	MediaAdjustments,
	MediaColorSettings,
	MediaMask,
	TextAnimationsV1,
	TextElement,
	TimelineElement,
	TimelineTrack,
} from "@/types/timeline";
import type {
	ClaudeTimeline,
	ClaudeTrack,
	ClaudeElement,
	ClaudeMediaTimingProperties,
	ClaudeTextProperties,
} from "../../../../../electron/types/claude-api";
import { debugLog, debugWarn, debugError } from "@/lib/debug/debug-config";
import type {
	FolderCompositionInfo,
	FolderBundleResult,
} from "@/lib/remotion/component-loader/types";
import {
	MAX_PLAYBACK_RATE,
	MIN_PLAYBACK_RATE,
} from "@/lib/video/video-speed-constants";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import {
	applyTextAnimationPreset,
	getTextAnimationPreset,
	updateTextAnimationPhaseTiming,
} from "@/lib/text/text-animation-presets";
import type { TextAnimationPhase } from "@/lib/text/text-animation-presets";

const CLAUDE_MEDIA_ELEMENT_TYPES = {
	media: "media",
	video: "video",
	audio: "audio",
	image: "image",
} as const;

const DEFAULT_MEDIA_DURATION_SECONDS = 10;
const DEFAULT_ADJUSTMENT_DURATION_SECONDS = 10;
const DEFAULT_TEXT_DURATION_SECONDS = 5;
const DEFAULT_TEXT_CONTENT = "Text";
const CLAUDE_DETERMINISTIC_MEDIA_ID_PREFIX = "media_";

export const CLAUDE_TEXT_PROPERTY_KEYS = [
	"fontSize",
	"fontFamily",
	"color",
	"backgroundColor",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
	"letterSpacing",
	"lineHeight",
	"verticalAlign",
	"strokeColor",
	"strokeWidth",
	"strokeOpacity",
	"backgroundOpacity",
	"backgroundRadius",
	"backgroundPadding",
	"shadowColor",
	"shadowOpacity",
	"shadowOffsetX",
	"shadowOffsetY",
	"shadowBlur",
	"glowColor",
	"glowOpacity",
	"glowBlur",
	"curve",
	"animationType",
	"animationDuration",
	"animationDelay",
	"textAnimations",
	"keyframes",
	"blendMode",
	"trackingTargetId",
	"trackingOffsetX",
	"trackingOffsetY",
	"trackingRotation",
] as const satisfies readonly (keyof ClaudeTextProperties)[];

type ClaudeTextPropertyKey = (typeof CLAUDE_TEXT_PROPERTY_KEYS)[number];

export type ValidatedClaudeTextProperties = Omit<
	ClaudeTextProperties,
	"textAnimations" | "textAnimationPreset"
> & {
	textAnimations?: TextAnimationsV1;
};

const isFiniteNumber = (value: unknown): boolean =>
	typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): boolean => typeof value === "string";
const isBoolean = (value: unknown): boolean => typeof value === "boolean";
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf =
	(...allowed: string[]) =>
	(value: unknown): boolean =>
		typeof value === "string" && allowed.includes(value);

/**
 * Runtime validators for external text-property input. The Claude HTTP API
 * feeds this helper, so each value must match the type/enum declared on
 * ClaudeTextProperties before it reaches the timeline store.
 */
const CLAUDE_TEXT_PROPERTY_VALIDATORS: Record<
	ClaudeTextPropertyKey,
	(value: unknown) => boolean
> = {
	fontSize: isFiniteNumber,
	fontFamily: isString,
	color: isString,
	backgroundColor: isString,
	textAlign: oneOf("left", "center", "right"),
	fontWeight: oneOf("normal", "bold"),
	fontStyle: oneOf("normal", "italic"),
	textDecoration: oneOf("none", "underline", "line-through"),
	x: isFiniteNumber,
	y: isFiniteNumber,
	width: isFiniteNumber,
	height: isFiniteNumber,
	rotation: isFiniteNumber,
	opacity: isFiniteNumber,
	letterSpacing: isFiniteNumber,
	lineHeight: isFiniteNumber,
	verticalAlign: oneOf("top", "middle", "bottom"),
	strokeColor: isString,
	strokeWidth: isFiniteNumber,
	strokeOpacity: isFiniteNumber,
	backgroundOpacity: isFiniteNumber,
	backgroundRadius: isFiniteNumber,
	backgroundPadding: isFiniteNumber,
	shadowColor: isString,
	shadowOpacity: isFiniteNumber,
	shadowOffsetX: isFiniteNumber,
	shadowOffsetY: isFiniteNumber,
	shadowBlur: isFiniteNumber,
	glowColor: isString,
	glowOpacity: isFiniteNumber,
	glowBlur: isFiniteNumber,
	curve: isFiniteNumber,
	animationType: oneOf("none", "fade", "slide-up", "slide-left"),
	animationDuration: isFiniteNumber,
	animationDelay: isFiniteNumber,
	textAnimations: isPlainObject,
	keyframes: isPlainObject,
	blendMode: oneOf(
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten"
	),
	trackingTargetId: isString,
	trackingOffsetX: isFiniteNumber,
	trackingOffsetY: isFiniteNumber,
	trackingRotation: isBoolean,
};

export function normalizeClaudeTextAnimations({
	elementId,
	fps,
	value,
}: {
	elementId: string;
	fps: number;
	value: unknown;
}): TextAnimationsV1 {
	const normalization = normalizeTextAnimations({
		element: {
			id: elementId,
			type: "text",
			textAnimations: value as TextAnimationsV1,
		} as TextElement,
		fps,
	});
	if (normalization.source === "unsupported") {
		const schemaVersion = isPlainObject(value)
			? (value as Record<string, unknown>).schemaVersion
			: undefined;
		throw new Error(
			`Unsupported QCut text animation schema version: ${String(schemaVersion)}`
		);
	}
	if (
		normalization.source !== "canonical" ||
		!normalization.animation ||
		normalization.issues.length > 0
	) {
		throw new Error("Invalid QCut text animation configuration");
	}
	return normalization.animation;
}

/** Read text properties from top-level fields, falling back to legacy style. */
export function getClaudeTextProperties({
	element,
	fps = useProjectStore.getState().activeProject?.fps ?? 30,
}: {
	element: { style?: Record<string, unknown> } & Record<string, unknown>;
	fps?: number;
}): ValidatedClaudeTextProperties {
	const properties: Record<string, unknown> = {};
	const style = element.style ?? {};
	for (const key of CLAUDE_TEXT_PROPERTY_KEYS) {
		const value = element[key] !== undefined ? element[key] : style[key];
		if (value === undefined) continue;
		if (key === "textAnimations") {
			properties[key] = normalizeClaudeTextAnimations({
				elementId: typeof element.id === "string" ? element.id : "claude-text",
				fps,
				value,
			});
			continue;
		}
		if (!CLAUDE_TEXT_PROPERTY_VALIDATORS[key](value)) {
			debugWarn(
				`[ClaudeTimelineBridge] Dropping invalid text property "${key}":`,
				value
			);
			continue;
		}
		properties[key] = value;
	}

	const presetValue = element.textAnimationPreset ?? style.textAnimationPreset;
	if (presetValue !== undefined) {
		if (!isPlainObject(presetValue)) {
			throw new Error("Text animation preset must be an object");
		}
		const phase = presetValue.phase;
		const presetId = presetValue.presetId;
		if (phase !== "entrance" && phase !== "exit" && phase !== "loop") {
			throw new Error(`Invalid text animation phase: ${String(phase)}`);
		}
		if (typeof presetId !== "string" || !presetId.trim()) {
			throw new Error("Text animation preset requires presetId");
		}
		const preset = getTextAnimationPreset({
			phase: phase as TextAnimationPhase,
			presetId,
		});
		if (preset.id !== presetId) {
			throw new Error(`Unknown ${phase} text animation preset: ${presetId}`);
		}
		const currentAnimations = properties.textAnimations as
			| TextAnimationsV1
			| undefined;
		let animations = applyTextAnimationPreset({
			animations: currentAnimations,
			preset,
		});
		const duration = presetValue.duration;
		const delay = presetValue.delay;
		if (
			(duration !== undefined &&
				(!isFiniteNumber(duration) || (duration as number) <= 0)) ||
			(delay !== undefined && (!isFiniteNumber(delay) || (delay as number) < 0))
		) {
			throw new Error(
				"Text animation preset duration must be > 0 and delay must be >= 0"
			);
		}
		if (duration !== undefined || delay !== undefined) {
			animations = updateTextAnimationPhaseTiming({
				animations,
				phase,
				duration: duration as number | undefined,
				delay: delay as number | undefined,
			});
		}
		properties.textAnimations = animations;
	}
	return properties as ValidatedClaudeTextProperties;
}

const SPEED_EASINGS = new Set([
	"linear",
	"easeIn",
	"easeOut",
	"easeInOut",
	"spring",
]);

export function getClaudeMediaTimingProperties({
	element,
}: {
	element: Partial<ClaudeMediaTimingProperties> & {
		style?: Record<string, unknown>;
	};
}): ClaudeMediaTimingProperties {
	const style = element.style ?? {};
	const read = (key: keyof ClaudeMediaTimingProperties) =>
		element[key] ?? style[key];
	const properties: ClaudeMediaTimingProperties = {};
	const playbackRate = read("playbackRate");
	if (typeof playbackRate === "number" && Number.isFinite(playbackRate)) {
		properties.playbackRate = Math.min(
			MAX_PLAYBACK_RATE,
			Math.max(MIN_PLAYBACK_RATE, playbackRate)
		);
	}

	const speedKeyframes = read("speedKeyframes");
	if (
		Array.isArray(speedKeyframes) &&
		speedKeyframes.every(
			(keyframe) =>
				isPlainObject(keyframe) &&
				typeof keyframe.frame === "number" &&
				Number.isFinite(keyframe.frame) &&
				keyframe.frame >= 0 &&
				typeof keyframe.value === "number" &&
				Number.isFinite(keyframe.value) &&
				typeof keyframe.easing === "string" &&
				SPEED_EASINGS.has(keyframe.easing)
		)
	) {
		properties.speedKeyframes = speedKeyframes.map((keyframe, index) => ({
			id:
				typeof keyframe.id === "string" && keyframe.id.length > 0
					? keyframe.id
					: `speed-${index}`,
			frame: keyframe.frame as number,
			value: Math.min(
				MAX_PLAYBACK_RATE,
				Math.max(MIN_PLAYBACK_RATE, keyframe.value as number)
			),
			easing: keyframe.easing as
				| "linear"
				| "easeIn"
				| "easeOut"
				| "easeInOut"
				| "spring",
		}));
	}

	const reverse = read("reverse");
	if (typeof reverse === "boolean") properties.reverse = reverse;
	const freezeFrameTime = read("freezeFrameTime");
	if (
		typeof freezeFrameTime === "number" &&
		Number.isFinite(freezeFrameTime) &&
		freezeFrameTime >= 0
	) {
		properties.freezeFrameTime = freezeFrameTime;
	}
	const freezeFrameDuration = read("freezeFrameDuration");
	if (
		typeof freezeFrameDuration === "number" &&
		Number.isFinite(freezeFrameDuration) &&
		freezeFrameDuration >= 0
	) {
		properties.freezeFrameDuration = freezeFrameDuration;
	}
	const preservePitch = read("preservePitch");
	if (typeof preservePitch === "boolean") {
		properties.preservePitch = preservePitch;
	}
	const frameInterpolation = read("frameInterpolation");
	if (
		frameInterpolation === "none" ||
		frameInterpolation === "blend" ||
		frameInterpolation === "motion-compensated"
	) {
		properties.frameInterpolation = frameInterpolation;
	}
	return properties;
}

export type TimelineStoreState = ReturnType<typeof useTimelineStore.getState>;

const projectMediaSyncInFlight = new Map<string, Promise<void>>();

/**
 * Calculate effective duration with safe trim handling
 */
export function getEffectiveDuration(element: TimelineElement): number {
	const trimStart = element.trimStart ?? 0;
	const trimEnd = element.trimEnd ?? 0;
	const effectiveDuration = element.duration - trimStart - trimEnd;
	return Math.max(0, effectiveDuration);
}

export function getTimelineElementDuration({
	element,
	fps,
}: {
	element: TimelineElement;
	fps: number;
}): number {
	if (element.type === "media") {
		return getMediaTimelineDuration(element, fps);
	}
	return getEffectiveDuration(element);
}

/**
 * Calculate total duration from tracks
 */
export function calculateTimelineDuration({
	tracks,
	fps,
}: {
	tracks: TimelineTrack[];
	fps: number;
}): number {
	let maxEndTime = 0;
	for (const track of tracks) {
		for (const element of track.elements) {
			const timelineDuration = getTimelineElementDuration({ element, fps });
			const endTime = element.startTime + timelineDuration;
			if (endTime > maxEndTime) {
				maxEndTime = endTime;
			}
		}
	}
	return maxEndTime;
}

/**
 * Find track containing an element
 */
export function findTrackByElementId(
	tracks: TimelineTrack[],
	elementId: string
): TimelineTrack | null {
	return (
		tracks.find((track) => track.elements.some((e) => e.id === elementId)) ||
		null
	);
}

/** Check if element type is a media type (media, video, audio, image). */
export function isClaudeMediaElementType({
	type,
}: {
	type: Partial<ClaudeElement>["type"] | undefined;
}): boolean {
	return (
		type === CLAUDE_MEDIA_ELEMENT_TYPES.media ||
		type === CLAUDE_MEDIA_ELEMENT_TYPES.video ||
		type === CLAUDE_MEDIA_ELEMENT_TYPES.audio ||
		type === CLAUDE_MEDIA_ELEMENT_TYPES.image
	);
}

type ClaudeAdjustmentFields = Partial<{
	name: string;
	opacity: number;
	color: MediaColorSettings;
	adjustments: MediaAdjustments;
	masks: MediaMask[];
}>;

export function getClaudeAdjustmentFields({
	element,
}: {
	element: Partial<ClaudeElement> & Record<string, unknown>;
}): ClaudeAdjustmentFields {
	const fields: ClaudeAdjustmentFields = {};
	const rawColor = element.color;
	const rawAdjustments = element.adjustments;
	const rawMasks = element.masks;

	if (typeof element.name === "string" && element.name.trim().length > 0) {
		fields.name = element.name;
	}
	if (isFiniteNumber(element.opacity)) {
		fields.opacity = element.opacity;
	}
	if (isPlainObject(rawColor)) {
		fields.color = rawColor as unknown as MediaColorSettings;
	}
	if (isPlainObject(rawAdjustments)) {
		fields.adjustments = rawAdjustments as unknown as MediaAdjustments;
	}
	if (Array.isArray(rawMasks)) {
		fields.masks = rawMasks as unknown as MediaMask[];
	}

	return fields;
}

/** Get element start time, defaulting to 0 if not set. */
function getElementStartTime({
	element,
}: {
	element: Partial<ClaudeElement>;
}): number {
	if (typeof element.startTime === "number" && element.startTime >= 0) {
		return element.startTime;
	}
	return 0;
}

/** Derive element duration from start/end times or use fallback. */
function getElementDuration({
	element,
	fallbackDuration,
}: {
	element: Partial<ClaudeElement>;
	fallbackDuration: number;
}): number {
	if (
		typeof element.startTime === "number" &&
		typeof element.endTime === "number"
	) {
		const rangeDuration = element.endTime - element.startTime;
		if (rangeDuration > 0) {
			return rangeDuration;
		}
	}

	if (typeof element.duration === "number" && element.duration > 0) {
		return element.duration;
	}

	if (fallbackDuration > 0) {
		return fallbackDuration;
	}

	return DEFAULT_MEDIA_DURATION_SECONDS;
}

/** Find matching media item by source name, source ID, or media ID. */
function findMediaItemForElement({
	element,
	mediaItems,
}: {
	element: Partial<ClaudeElement>;
	mediaItems: MediaItem[];
}): MediaItem | null {
	// Check mediaId first (used by CLI add-element)
	if (element.mediaId) {
		const mediaByMediaId = mediaItems.find(
			(item) => item.id === element.mediaId
		);
		if (mediaByMediaId) {
			return mediaByMediaId;
		}
	}

	if (element.sourceName) {
		// Exact match first
		const mediaByName = mediaItems.find(
			(item) => item.name === element.sourceName
		);
		if (mediaByName) {
			return mediaByName;
		}

		// Case-insensitive fallback
		const lowerName = element.sourceName.toLowerCase();
		const mediaByNameCI = mediaItems.find(
			(item) => item.name.toLowerCase() === lowerName
		);
		if (mediaByNameCI) {
			return mediaByNameCI;
		}
	}

	if (element.sourceId) {
		const mediaById = mediaItems.find((item) => item.id === element.sourceId);
		if (mediaById) {
			return mediaById;
		}

		const decodedSourceName = getSourceNameFromDeterministicSourceId({
			sourceId: element.sourceId,
		});
		if (decodedSourceName) {
			const mediaByDecodedName = mediaItems.find(
				(item) => item.name === decodedSourceName
			);
			if (mediaByDecodedName) {
				return mediaByDecodedName;
			}
		}
	}

	return null;
}

/** Decode a base64url-encoded UTF-8 string, returning null on failure. */
function decodeBase64UrlUtf8({ encoded }: { encoded: string }): string | null {
	try {
		const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		const binary = window.atob(padded);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

/** Extract original source name from a deterministic media ID prefix. */
function getSourceNameFromDeterministicSourceId({
	sourceId,
}: {
	sourceId: string;
}): string | null {
	if (!sourceId.startsWith(CLAUDE_DETERMINISTIC_MEDIA_ID_PREFIX)) {
		return null;
	}

	const encodedName = sourceId.slice(
		CLAUDE_DETERMINISTIC_MEDIA_ID_PREFIX.length
	);
	if (!encodedName) {
		return null;
	}

	return decodeBase64UrlUtf8({ encoded: encodedName });
}

/** Sync project media from disk if not already in flight. */
export async function syncProjectMediaIfNeeded({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	const existingSync = projectMediaSyncInFlight.get(projectId);
	if (existingSync) {
		await existingSync;
		return;
	}

	const syncPromise = (async (): Promise<void> => {
		try {
			const { syncProjectFolder } = await import(
				"@/lib/project/project-folder-sync"
			);
			await syncProjectFolder(projectId);
		} catch (error) {
			debugWarn("[ClaudeTimelineBridge] Media sync failed:", error);
		} finally {
			projectMediaSyncInFlight.delete(projectId);
		}
	})();

	projectMediaSyncInFlight.set(projectId, syncPromise);
	await syncPromise;
}

/**
 * Locate the MediaItem that corresponds to a Claude timeline element, performing a project media sync when necessary.
 *
 * @param element - The Claude element to resolve a media item for (may be partial).
 * @param projectId - The current project ID used to trigger a media sync if the item is not already present; if omitted no sync will be attempted.
 * @returns The matching `MediaItem` when found, or `null` if no match could be resolved.
 */
async function resolveMediaItemForElement({
	element,
	projectId,
}: {
	element: Partial<ClaudeElement>;
	projectId: string | undefined;
}): Promise<MediaItem | null> {
	try {
		const mediaBeforeSync = findMediaItemForElement({
			element,
			mediaItems: useMediaStore.getState().mediaItems,
		});
		if (mediaBeforeSync) {
			return mediaBeforeSync;
		}

		if (!projectId || !platform().projectFolder) {
			return null;
		}

		await syncProjectMediaIfNeeded({ projectId });

		return findMediaItemForElement({
			element,
			mediaItems: useMediaStore.getState().mediaItems,
		});
	} catch (error) {
		debugWarn("[ClaudeTimelineBridge] Media resolution failed:", error);
		return null;
	}
}

/** Add a Claude media element to the timeline store. */
export async function addClaudeMediaElement({
	element,
	timelineStore,
	projectId,
}: {
	element: Partial<ClaudeElement>;
	timelineStore: TimelineStoreState;
	projectId: string | undefined;
}): Promise<void> {
	const mediaItem = await resolveMediaItemForElement({
		element,
		projectId,
	});

	if (!mediaItem && !element.sourceId && !element.mediaId) {
		debugWarn(
			"[ClaudeTimelineBridge] Media not found:",
			element.sourceName || element.sourceId || element.mediaId
		);
		return;
	}

	// Route audio files to an audio track, matching the app's own drag-drop
	// behavior (timeline-add-ops), instead of stacking them on the media track.
	const trackId = timelineStore.findOrCreateTrack(
		mediaItem?.type === "audio" ? "audio" : "media"
	);
	const resolvedId = mediaItem?.id ?? element.mediaId ?? element.sourceId!;
	const resolvedName = mediaItem?.name ?? element.sourceName ?? "Media";
	const fallbackDuration =
		typeof mediaItem?.duration === "number" && mediaItem.duration > 0
			? mediaItem.duration
			: DEFAULT_MEDIA_DURATION_SECONDS;
	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration,
	});
	const mediaTiming = getClaudeMediaTimingProperties({ element });

	timelineStore.addElementToTrack(trackId, {
		type: "media",
		name: resolvedName,
		mediaId: resolvedId,
		startTime,
		duration,
		trimStart:
			typeof element.trimStart === "number" && element.trimStart >= 0
				? element.trimStart
				: 0,
		trimEnd:
			typeof element.trimEnd === "number" && element.trimEnd >= 0
				? element.trimEnd
				: 0,
		fitMode: element.fitMode ?? "cover",
		...mediaTiming,
	});

	debugLog("[ClaudeTimelineBridge] Added media element:", resolvedName);
}

/** Add a Claude text element to the timeline store. */
export function addClaudeTextElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement>;
	timelineStore: TimelineStoreState;
}): void {
	const trackId = timelineStore.findOrCreateTrack("text");
	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_TEXT_DURATION_SECONDS,
	});
	const content =
		typeof element.content === "string" && element.content.trim().length > 0
			? element.content
			: DEFAULT_TEXT_CONTENT;
	const textProperties = getClaudeTextProperties({
		element: element as Partial<ClaudeElement> & Record<string, unknown>,
	});

	timelineStore.addElementToTrack(trackId, {
		type: "text",
		name: content,
		content,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 48,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0.5,
		y: 0.5,
		rotation: 0,
		opacity: 1,
		...textProperties,
	});

	debugLog("[ClaudeTimelineBridge] Added text element:", content);
}

/** Add a Claude adjustment element to the timeline store. */
export function addClaudeAdjustmentElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement> & { trackId?: string };
	timelineStore: TimelineStoreState;
}): string | null {
	const existingTrack = element.trackId
		? timelineStore.tracks.find((track) => track.id === element.trackId)
		: null;
	const trackId =
		existingTrack?.type === "adjustment"
			? existingTrack.id
			: timelineStore.findOrCreateTrack("adjustment");
	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_ADJUSTMENT_DURATION_SECONDS,
	});
	const adjustmentFields = getClaudeAdjustmentFields({
		element: element as Partial<ClaudeElement> & Record<string, unknown>,
	});

	const elementId = timelineStore.addElementToTrack(trackId, {
		...(typeof element.id === "string" && element.id.trim().length > 0
			? { id: element.id }
			: {}),
		type: "adjustment",
		name: adjustmentFields.name ?? "自定义调节",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		opacity: adjustmentFields.opacity ?? 1,
		...(adjustmentFields.color ? { color: adjustmentFields.color } : {}),
		...(adjustmentFields.adjustments
			? { adjustments: adjustmentFields.adjustments }
			: {}),
		...(adjustmentFields.masks ? { masks: adjustmentFields.masks } : {}),
	});

	debugLog("[ClaudeTimelineBridge] Added adjustment element:", elementId);
	return elementId;
}

const DEFAULT_STICKER_DURATION_SECONDS = 5;

/** Add a Claude sticker element to the timeline store and overlay store. */
export async function addClaudeStickerElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement> & {
		stickerId?: string;
		mediaId?: string;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		rotation?: number;
		opacity?: number;
	};
	timelineStore: TimelineStoreState;
}): Promise<void> {
	const trackId = timelineStore.findOrCreateTrack("sticker");
	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_STICKER_DURATION_SECONDS,
	});

	const stickerId = element.stickerId ?? `sticker_${Date.now()}`;
	const mediaId = element.mediaId ?? stickerId;

	timelineStore.addElementToTrack(trackId, {
		type: "sticker",
		name: element.sourceName ?? "Sticker",
		stickerId,
		mediaId,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		x: element.x ?? 0,
		y: element.y ?? 0,
		width: element.width,
		height: element.height,
		rotation: element.rotation ?? 0,
		opacity: element.opacity ?? 1,
	});

	// Also add to sticker overlay store for canvas rendering + export
	// NOTE: Overlay store uses percentage-based coordinates (0-100)
	// CLI passes pixel coordinates, so we convert using timeline dimensions
	try {
		const { useStickersOverlayStore } = await import(
			"@/stores/stickers-overlay-store"
		);
		// Default canvas dimensions — matches standard export presets
		const canvasWidth = 1920;
		const canvasHeight = 1080;

		// Convert pixel → percentage for overlay store
		// Position: percentage of canvas dimensions (center-based in overlay)
		const pxX = element.x ?? 0;
		const pxY = element.y ?? 0;
		const pxW = element.width ?? 200;
		const pxH = element.height ?? 200;

		// Overlay store position is center-based, CLI gives top-left
		const centerX = pxX + pxW / 2;
		const centerY = pxY + pxH / 2;
		const pctX = (centerX / canvasWidth) * 100;
		const pctY = (centerY / canvasHeight) * 100;
		// Size: percentage of respective canvas dimension (width % of canvasWidth, height % of canvasHeight)
		const pctW = (pxW / canvasWidth) * 100;
		const pctH = (pxH / canvasHeight) * 100;

		debugLog(
			`[ClaudeTimelineBridge] Sticker coords: px(${pxX},${pxY} ${pxW}x${pxH}) → pct(${pctX.toFixed(1)},${pctY.toFixed(1)} ${pctW.toFixed(1)}x${pctH.toFixed(1)})`
		);

		debugLog(
			`[ClaudeTimelineBridge] Adding sticker to overlay store: mediaId=${mediaId}, pos=(${pctX.toFixed(1)}%,${pctY.toFixed(1)}%), size=(${pctW.toFixed(1)}%x${pctH.toFixed(1)}%)`
		);
		useStickersOverlayStore.getState().addOverlaySticker(mediaId, {
			position: { x: pctX, y: pctY },
			size: { width: pctW, height: pctH },
			rotation: element.rotation ?? 0,
			opacity: element.opacity ?? 1,
		});
		// Verify it was added
		const afterCount = useStickersOverlayStore
			.getState()
			.getStickersForExport().length;
		debugLog(
			`[ClaudeTimelineBridge] Overlay store now has ${afterCount} sticker(s)`
		);
	} catch (err) {
		debugWarn("[ClaudeTimelineBridge] Failed to add sticker overlay:", err);
	}

	debugLog("[ClaudeTimelineBridge] Added sticker element:", stickerId);
}

const DEFAULT_MARKDOWN_DURATION_SECONDS = 120;
const DEFAULT_MARKDOWN_CONTENT = "Markdown";

/** Add a Claude markdown element to the timeline store. */
export function addClaudeMarkdownElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement>;
	timelineStore: TimelineStoreState;
}): void {
	// Reuse existing markdown track instead of creating one per element
	const existingTrack = timelineStore.tracks.find((t) => t.type === "markdown");
	const trackId = existingTrack?.id ?? timelineStore.addTrack("markdown");

	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_MARKDOWN_DURATION_SECONDS,
	});
	const rawMarkdown =
		typeof element.markdownContent === "string"
			? element.markdownContent
			: element.content;
	const markdownContent =
		typeof rawMarkdown === "string" && rawMarkdown.trim().length > 0
			? rawMarkdown
			: DEFAULT_MARKDOWN_CONTENT;

	// Clamp any existing element whose end time would overlap this one's start
	const track = timelineStore.tracks.find((t) => t.id === trackId);
	if (track) {
		const endTime = startTime + duration;
		for (const existing of track.elements) {
			const existingEnd = existing.startTime + getEffectiveDuration(existing);
			if (existing.startTime < endTime && existingEnd > startTime) {
				const clampedDuration = startTime - existing.startTime;
				if (clampedDuration > 0) {
					timelineStore.updateElementDuration(
						trackId,
						existing.id,
						clampedDuration,
						false
					);
				}
			}
		}
	}

	// Subtitle-style: positioned at bottom center, compact height
	timelineStore.addElementToTrack(trackId, {
		type: "markdown",
		name: markdownContent.slice(0, 50),
		markdownContent,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		theme: "transparent",
		fontSize: 24,
		fontFamily: "Inter",
		padding: 8,
		backgroundColor: element.backgroundColor ?? "rgba(0,0,0,0.6)",
		textColor: element.textColor ?? "#ffffff",
		scrollMode: "static",
		scrollSpeed: 50,
		x: 0,
		y: 480,
		width: 1600,
		height: 80,
		rotation: 0,
		opacity: 1,
	});

	debugLog(
		"[ClaudeTimelineBridge] Added markdown element:",
		markdownContent.slice(0, 50)
	);
}

const DEFAULT_CAPTION_DURATION_SECONDS = 5;

/** Add a Claude caption element to the timeline store. */
export function addClaudeCaptionElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement>;
	timelineStore: TimelineStoreState;
}): void {
	console.log(
		"[CaptionDebug] addClaudeCaptionElement called, element:",
		JSON.stringify(element, null, 2)
	);

	// Use findOrCreateTrack for robust live-state track creation (consistent with media/text helpers)
	const trackId = timelineStore.findOrCreateTrack("captions");
	console.log("[CaptionDebug] Using captions track:", trackId);

	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_CAPTION_DURATION_SECONDS,
	});

	// Check both element.content and element.text (CLI may send either field)
	const captionText =
		typeof element.content === "string" && element.content.trim().length > 0
			? element.content
			: typeof (element as Record<string, unknown>).text === "string" &&
					((element as Record<string, unknown>).text as string).trim().length >
						0
				? ((element as Record<string, unknown>).text as string)
				: "Caption";

	console.log(
		"[CaptionDebug] Caption text:",
		captionText,
		"startTime:",
		startTime,
		"duration:",
		duration
	);

	const elementId = timelineStore.addElementToTrack(trackId, {
		type: "captions",
		name: captionText.slice(0, 50),
		text: captionText,
		language: "en",
		source: "manual",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		style:
			(element.style as unknown as import("@qcut/editor-core").SubtitleStyle) ||
			undefined,
	});

	if (elementId) {
		console.log(
			"[CaptionDebug] Caption element created successfully, id:",
			elementId
		);
		debugLog(
			"[ClaudeTimelineBridge] Added caption element:",
			captionText.slice(0, 50)
		);
	} else {
		console.error(
			"[CaptionDebug] addElementToTrack returned null — caption element NOT created"
		);
		debugError(
			"[ClaudeTimelineBridge] Failed to add caption element to track:",
			trackId
		);
	}
}

const DEFAULT_REMOTION_DURATION_SECONDS = 5;

/**
 * Bundle, load, and register a Remotion component from a .tsx file path.
 *
 * @param componentPath - Filesystem path to the source .tsx component to bundle
 * @param componentId - Identifier to assign to the registered component
 * @param componentName - Human-readable name for the registered component
 * @param durationInFrames - Duration of the component in frames (default: 150)
 * @param fps - Frames per second for the component (default: 30)
 * @param width - Width in pixels for the component (default: 1920)
 * @param height - Height in pixels for the component (default: 1080)
 * @returns The `componentId` if the component was bundled, loaded, and registered successfully, `null` otherwise.
 */
async function bundleAndRegisterComponent({
	componentPath,
	componentId,
	componentName,
	durationInFrames = 150,
	fps = 30,
	width = 1920,
	height = 1080,
}: {
	componentPath: string;
	componentId: string;
	componentName: string;
	durationInFrames?: number;
	fps?: number;
	width?: number;
	height?: number;
}): Promise<string | null> {
	try {
		const api = platform().remotionFolder;
		if (!api?.bundleFile) {
			debugWarn(
				"[ClaudeTimelineBridge] remotionFolder.bundleFile not available"
			);
			return null;
		}

		debugLog("[ClaudeTimelineBridge] Bundling component:", componentPath);
		const bundleResult = await api.bundleFile(componentPath, componentId);

		if (!bundleResult.success || !bundleResult.code) {
			debugError("[ClaudeTimelineBridge] Bundle failed:", bundleResult.error);
			return null;
		}

		debugLog("[ClaudeTimelineBridge] Loading bundled component...");
		const { loadBundledComponent } = await import(
			"@/lib/remotion/dynamic-loader"
		);
		const loadResult = await loadBundledComponent(
			bundleResult.code,
			componentId
		);

		if (!loadResult.success || !loadResult.component) {
			debugError(
				"[ClaudeTimelineBridge] Dynamic load failed:",
				loadResult.error
			);
			return null;
		}

		debugLog("[ClaudeTimelineBridge] Registering component in store...");
		const { useRemotionStore } = await import("@/stores/ai/remotion-store");
		useRemotionStore.getState().registerComponent({
			id: componentId,
			name: componentName,
			description: `Generated component: ${componentName}`,
			category: "custom",
			durationInFrames,
			fps,
			width,
			height,
			// Dynamically generated components don't export a Zod schema;
			// accept any props since the component handles its own defaults.
			schema: { safeParse: () => ({ success: true, data: {} }) } as never,
			defaultProps: {},
			component: loadResult.component,
			source: "imported",
			tags: ["claude-generated"],
		});

		debugLog("[ClaudeTimelineBridge] Component registered:", componentId);
		return componentId;
	} catch (error) {
		debugError("[ClaudeTimelineBridge] Bundle/register failed:", error);
		return null;
	}
}

/**
 * Imports a Remotion project folder, loads its compositions, and registers bundled components in the remotion store.
 *
 * @param folderPath - Filesystem path to the Remotion project root (folder containing Root.tsx and compositions)
 * @returns An array of registered component IDs; returns an empty array if the import or registration fails or no components were found
 */
async function importRemotionFolder({
	folderPath,
}: {
	folderPath: string;
}): Promise<string[]> {
	try {
		const api = platform().remotionFolder;
		if (!api?.import) {
			debugWarn("[ClaudeTimelineBridge] remotionFolder.import not available");
			return [];
		}

		debugLog("[ClaudeTimelineBridge] Importing folder:", folderPath);
		const importResult = await api.import(folderPath);

		if (
			!importResult.success ||
			!importResult.bundle ||
			!importResult.scan?.compositions
		) {
			debugError(
				"[ClaudeTimelineBridge] Folder import failed:",
				importResult.error
			);
			return [];
		}

		const { loadComponentsFromFolder } = await import(
			"@/lib/remotion/component-loader"
		);
		const loadResult = await loadComponentsFromFolder(
			folderPath,
			importResult.scan!.compositions as unknown as FolderCompositionInfo[],
			importResult.bundle!.results as unknown as FolderBundleResult[]
		);

		if (!loadResult.success || loadResult.components.length === 0) {
			debugError(
				"[ClaudeTimelineBridge] Component loading failed:",
				loadResult.errors
			);
			return [];
		}

		const { useRemotionStore } = await import("@/stores/ai/remotion-store");
		const store = useRemotionStore.getState();
		const registeredIds: string[] = [];

		for (const component of loadResult.components) {
			store.registerComponent(component);
			registeredIds.push(component.id);
			debugLog("[ClaudeTimelineBridge] Registered component:", component.id);
		}

		return registeredIds;
	} catch (error) {
		debugError("[ClaudeTimelineBridge] Folder import/register failed:", error);
		return [];
	}
}

/** Add a Claude remotion element to the timeline store. */
export async function addClaudeRemotionElement({
	element,
	timelineStore,
}: {
	element: Partial<ClaudeElement>;
	timelineStore: TimelineStoreState;
}): Promise<void> {
	const componentName = element.sourceName || "Remotion";

	// Folder-based import: use the existing remotion-folder pipeline
	if (element.folderPath) {
		const registeredIds = await importRemotionFolder({
			folderPath: element.folderPath,
		});

		if (registeredIds.length === 0) {
			debugWarn("[ClaudeTimelineBridge] No components imported from folder");
			return;
		}

		const trackId = timelineStore.findOrCreateTrack("remotion");
		const startTime = getElementStartTime({ element });
		const duration = getElementDuration({
			element,
			fallbackDuration: DEFAULT_REMOTION_DURATION_SECONDS,
		});

		// Add a timeline element for each imported composition
		let offset = startTime;
		for (const compId of registeredIds) {
			timelineStore.addElementToTrack(trackId, {
				type: "remotion",
				name: compId,
				componentId: compId,
				props: element.props || {},
				renderMode: "live",
				startTime: offset,
				duration,
				trimStart: 0,
				trimEnd: 0,
				opacity: 1,
			});
			offset += duration;
		}

		debugLog(
			"[ClaudeTimelineBridge] Added",
			registeredIds.length,
			"remotion elements from folder"
		);
		return;
	}

	// Single-file fallback: bundle one .tsx file
	const componentId = element.sourceId || `remotion-${Date.now()}`;

	if (element.componentPath) {
		const fps = 30;
		const durationSec = element.duration || DEFAULT_REMOTION_DURATION_SECONDS;
		const registeredId = await bundleAndRegisterComponent({
			componentPath: element.componentPath,
			componentId,
			componentName,
			durationInFrames: Math.round(durationSec * fps),
			fps,
		});

		if (!registeredId) {
			debugWarn(
				"[ClaudeTimelineBridge] Component registration failed, adding element without preview"
			);
		}
	}

	const trackId = timelineStore.findOrCreateTrack("remotion");
	const startTime = getElementStartTime({ element });
	const duration = getElementDuration({
		element,
		fallbackDuration: DEFAULT_REMOTION_DURATION_SECONDS,
	});

	timelineStore.addElementToTrack(trackId, {
		type: "remotion",
		name: componentName,
		componentId,
		componentPath: element.componentPath,
		props: element.props || {},
		renderMode: "live",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		opacity: 1,
	});

	debugLog("[ClaudeTimelineBridge] Added remotion element:", componentName);
}

/**
 * Format internal tracks for Claude export
 */
export function formatTracksForExport({
	tracks,
	fps,
}: {
	tracks: TimelineTrack[];
	fps: number;
}): ClaudeTrack[] {
	return tracks.map((track, index) => ({
		id: track.id,
		index,
		name: track.name || `Track ${index + 1}`,
		type: track.type,
		isMain: track.isMain,
		hidden: track.hidden,
		elements: track.elements.map((element) =>
			formatElementForExport({ element, trackIndex: index, fps })
		),
		transitions: track.transitions?.map((transition) => ({
			...transition,
			tuning: transition.tuning as Record<string, unknown> | undefined,
		})),
	}));
}

/**
 * Format a single element for export
 */
function formatElementForExport({
	element,
	trackIndex,
	fps,
}: {
	element: TimelineElement;
	trackIndex: number;
	fps: number;
}): ClaudeElement {
	const sourceDuration = getEffectiveDuration(element);
	const timelineDuration = getTimelineElementDuration({ element, fps });

	const baseElement: ClaudeElement = {
		id: element.id,
		trackIndex,
		startTime: element.startTime,
		endTime: element.startTime + timelineDuration,
		duration: sourceDuration,
		type: element.type === "markdown" ? "text" : element.type,
		hidden: element.hidden,
	};

	// Add type-specific fields
	switch (element.type) {
		case "media": {
			// Resolve the actual media file name from the store for reliable export matching
			let sourceName = element.name;
			if (element.mediaId) {
				const mediaItem = useMediaStore
					.getState()
					.mediaItems.find((item) => item.id === element.mediaId);
				if (mediaItem?.name) {
					sourceName = mediaItem.name;
				}
			}
			return {
				...baseElement,
				sourceId: element.mediaId,
				sourceName,
				fitMode: element.fitMode,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				playbackRate: element.playbackRate,
				speedKeyframes: element.speedKeyframes,
				reverse: element.reverse,
				freezeFrameTime: element.freezeFrameTime,
				freezeFrameDuration: element.freezeFrameDuration,
				preservePitch: element.preservePitch,
				frameInterpolation: element.frameInterpolation,
				timelineDuration,
			};
		}
		case "text": {
			const textProperties = getClaudeTextProperties({
				element: element as unknown as Record<string, unknown>,
				fps,
			});
			return {
				...baseElement,
				content: element.content,
				...textProperties,
				style: textProperties as Record<string, unknown>,
			};
		}
		case "captions":
			return {
				...baseElement,
				content: element.text,
			};
		case "sticker":
			return {
				...baseElement,
				sourceId: element.stickerId,
				stickerId: element.stickerId,
				mediaId: element.mediaId,
				x: element.x,
				y: element.y,
				width: element.width,
				height: element.height,
				rotation: element.rotation,
				opacity: element.opacity,
				zIndex: element.zIndex,
			};
		case "adjustment":
			return {
				...baseElement,
				name: element.name,
				opacity: element.opacity,
				color: element.color as Record<string, unknown> | undefined,
				adjustments: element.adjustments as Record<string, unknown> | undefined,
				masks: element.masks as Record<string, unknown>[] | undefined,
			} as unknown as ClaudeElement;
		case "effect":
			return {
				...baseElement,
				targetElementId: element.targetElementId,
				effects: [element.effect.presetId ?? element.effect.effectType],
			};
		case "remotion":
			return {
				...baseElement,
				sourceId: element.componentId,
			};
		case "markdown":
			return {
				...baseElement,
				content: element.markdownContent,
			};
		default:
			return baseElement;
	}
}

/**
 * Apply imported Claude timeline to store (appends to existing timeline)
 */
export async function applyTimelineToStore(
	timeline: ClaudeTimeline
): Promise<void> {
	const totalElements = timeline.tracks.reduce(
		(sum, t) => sum + t.elements.length,
		0
	);
	debugLog("[ClaudeTimelineBridge] Applying timeline:", {
		name: timeline.name,
		duration: timeline.duration,
		tracks: timeline.tracks.length,
		totalElements,
	});

	const projectId = useProjectStore.getState().activeProject?.id;

	// Sync media from disk before resolving elements so newly-imported files are discoverable
	if (projectId) {
		await syncProjectMediaIfNeeded({ projectId });
	}

	let added = 0;

	for (const track of timeline.tracks) {
		for (const element of track.elements) {
			try {
				if (isClaudeMediaElementType({ type: element.type })) {
					await addClaudeMediaElement({
						element,
						timelineStore: useTimelineStore.getState(),
						projectId,
					});
					added++;
				} else if (element.type === "text") {
					addClaudeTextElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else if (element.type === "adjustment") {
					addClaudeAdjustmentElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else if (element.type === "markdown") {
					addClaudeMarkdownElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else if (element.type === "remotion") {
					await addClaudeRemotionElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else if (element.type === "sticker") {
					await addClaudeStickerElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else if (element.type === "captions") {
					addClaudeCaptionElement({
						element,
						timelineStore: useTimelineStore.getState(),
					});
					added++;
				} else {
					debugWarn(
						"[ClaudeTimelineBridge] Skipping unsupported element type:",
						element.type
					);
				}
			} catch (error) {
				debugError(
					"[ClaudeTimelineBridge] Failed to add element during import:",
					element.id,
					error
				);
			}
		}
	}

	debugLog(
		`[ClaudeTimelineBridge] Timeline import complete: ${added}/${totalElements} elements added`
	);
}
