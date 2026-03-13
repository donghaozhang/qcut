/**
 * Claude Timeline Bridge Helpers
 * Utility functions for element resolution, formatting, and import operations.
 * Extracted from claude-timeline-bridge.ts to keep files under 800 lines.
 */

import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore, type MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import type {
	ClaudeTimeline,
	ClaudeTrack,
	ClaudeElement,
} from "../../../../../electron/types/claude-api";
import { debugLog, debugWarn, debugError } from "@/lib/debug/debug-config";
import type {
	FolderCompositionInfo,
	FolderBundleResult,
} from "@/lib/remotion/component-loader/types";

const CLAUDE_MEDIA_ELEMENT_TYPES = {
	media: "media",
	video: "video",
	audio: "audio",
	image: "image",
} as const;

const DEFAULT_MEDIA_DURATION_SECONDS = 10;
const DEFAULT_TEXT_DURATION_SECONDS = 5;
const DEFAULT_TEXT_CONTENT = "Text";
const CLAUDE_DETERMINISTIC_MEDIA_ID_PREFIX = "media_";

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

/**
 * Calculate total duration from tracks
 */
export function calculateTimelineDuration(tracks: TimelineTrack[]): number {
	let maxEndTime = 0;
	for (const track of tracks) {
		for (const element of track.elements) {
			const effectiveDuration = getEffectiveDuration(element);
			const endTime = element.startTime + effectiveDuration;
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

	const trackId = timelineStore.findOrCreateTrack("media");
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

	timelineStore.addElementToTrack(trackId, {
		type: "media",
		name: resolvedName,
		mediaId: resolvedId,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
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
	});

	debugLog("[ClaudeTimelineBridge] Added text element:", content);
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
	console.log("[CaptionDebug] addClaudeCaptionElement called, element:", JSON.stringify(element, null, 2));

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
					((element as Record<string, unknown>).text as string).trim().length > 0
				? (element as Record<string, unknown>).text as string
				: "Caption";

	console.log("[CaptionDebug] Caption text:", captionText, "startTime:", startTime, "duration:", duration);

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
		style: (element.style as unknown as import("@qcut/editor-core").SubtitleStyle) || undefined,
	});

	if (elementId) {
		console.log("[CaptionDebug] Caption element created successfully, id:", elementId);
		debugLog("[ClaudeTimelineBridge] Added caption element:", captionText.slice(0, 50));
	} else {
		console.error("[CaptionDebug] addElementToTrack returned null — caption element NOT created");
		debugError("[ClaudeTimelineBridge] Failed to add caption element to track:", trackId);
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
export function formatTracksForExport(tracks: TimelineTrack[]): ClaudeTrack[] {
	return tracks.map((track, index) => ({
		id: track.id,
		index,
		name: track.name || `Track ${index + 1}`,
		type: track.type,
		elements: track.elements.map((element) =>
			formatElementForExport(element, index)
		),
	}));
}

/**
 * Format a single element for export
 */
function formatElementForExport(
	element: TimelineElement,
	trackIndex: number
): ClaudeElement {
	const effectiveDuration = getEffectiveDuration(element);

	const baseElement: ClaudeElement = {
		id: element.id,
		trackIndex,
		startTime: element.startTime,
		endTime: element.startTime + effectiveDuration,
		duration: effectiveDuration,
		type: element.type === "markdown" ? "text" : element.type,
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
			};
		}
		case "text":
			return {
				...baseElement,
				content: element.content,
			};
		case "captions":
			return {
				...baseElement,
				content: element.text,
			};
		case "sticker":
			return {
				...baseElement,
				sourceId: element.stickerId,
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
