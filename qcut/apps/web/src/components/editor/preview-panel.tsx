"use client";

import { platform } from "@qcut/platform-core";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	buildCompositionPlan,
	type RemotionElement,
	type TimelineElement,
} from "@/types/timeline";
import { expandCompoundMediaTracks } from "@/lib/timeline/compound-media";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { debugLog } from "@/lib/debug/debug-config";
import { useProjectStore } from "@/stores/project-store";
import { useMcpAppStore } from "@/stores/mcp-app-store";
import {
	FullscreenPreview,
	PreviewToolbar,
	PreviewModeToggle,
} from "./preview-panel-components";
import { captureWithFallback } from "@/lib/effects/canvas-utils";
import { useFrameCache } from "@/hooks/timeline/use-frame-cache";
import {
	InteractiveElementOverlay,
	ElementTransform,
} from "./interactive-element-overlay";
import { EFFECTS_ENABLED } from "@/config/features";
import {
	PreviewBlurBackground,
	PreviewElementRenderer,
} from "./preview-panel/preview-element-renderer";
import { TimelineStickerInteractionLayer } from "./preview-panel/timeline-sticker-layer";
import {
	MediaTransformOverlay,
	type SelectedMediaTransformTarget,
} from "./preview-panel/media-transform-overlay";
import { usePreviewMedia } from "./preview-panel/use-preview-media";
import { usePreviewSizing } from "./preview-panel/use-preview-sizing";
import type { ActiveElement } from "./preview-panel/types";
import {
	MCP_MEDIA_TOOL_NAME,
	buildMcpMediaAppHtml,
} from "./preview-panel/mcp-media-app";
import { useEffectsRendering } from "./preview-panel/use-effects-rendering";
import { usePreviewDrag } from "./preview-panel/use-preview-drag";
import {
	usePreviewModeStore,
	type PreviewMode,
} from "@/stores/preview-mode-store";
import { PreviewAgentView } from "./preview-panel/preview-agent-view";
import { CursorOverlay } from "./preview-panel/cursor-overlay";
import { RecordingBackground } from "./preview-panel/recording-background";
import { useScreenRecordingPreview } from "./preview-panel/use-screen-recording-preview";
import { resolveActiveClipTransitionPreview } from "@/lib/transitions/clip-transition-preview";
import { useAudioMixMonitor } from "@/lib/audio/use-audio-mix-monitor";
import { resolveActiveAudioCrossfadePreview } from "@/lib/audio/audio-crossfade-preview";
import {
	TimelineStickerKeyboardController,
	useTimelineStickerDrop,
} from "./preview-panel/timeline-sticker-interactions";
import { AdjustmentLayerStack } from "./preview-panel/adjustment-layer-stack";
import {
	canUseNativeCompositionPreview,
	useNativeCompositionFramePreview,
} from "@/hooks/preview/use-native-composition-frame-preview";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { useColorPickerStore } from "@/stores/editor/color-picker-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { LoaderCircle, TriangleAlert } from "lucide-react";

function getPreviewElementDuration(element: TimelineElement): number {
	return element.type === "media"
		? getMediaTimelineDuration(element)
		: element.duration - element.trimStart - element.trimEnd;
}

/** Main preview panel component for video playback, MCP apps, and element overlays. */
export function PreviewPanel() {
	useAudioMixMonitor();
	const {
		tracks,
		getTotalDuration,
		updateTextElement,
		updateElementPosition,
		updateElementSize,
		updateElementRotation,
		selectedElements,
		selectElement,
	} = useTimelineStore();
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	const { currentTime, toggle, setCurrentTime, isPlaying } = usePlaybackStore();
	const { activeProject } = useProjectStore();
	const { canvasSize } = useEditorStore();
	const maskEditorActive = useMaskEditorStore((state) => state.isEditing);
	const colorPickerActive = useColorPickerStore((state) => state.active);
	const stickerInteractionActive = useStickersOverlayStore(
		(state) =>
			Boolean(state.selectedStickerId) ||
			state.isDragging ||
			state.isResizing ||
			state.isRotating
	);
	const previewRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	// Canvas refs for frame caching - non-interfering
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cacheCanvasRef = useRef<HTMLCanvasElement>(null);
	const lastSeekEventTimeRef = useRef<number | null>(null);

	// Track playback time for active element detection during playback.
	// During playback, Zustand currentTime doesn't update every frame (perf optimization).
	// This listener detects element boundary crossings and triggers re-renders only when
	// the set of active elements changes (not every frame).
	const [playbackTime, setPlaybackTime] = useState(currentTime);
	const lastActiveIdsRef = useRef<string>("");

	useEffect(() => {
		if (!isPlaying) {
			// When not playing, sync with store time
			setPlaybackTime(currentTime);
			return;
		}

		const handlePlaybackUpdate = (e: Event) => {
			const time = (e as CustomEvent).detail.time as number;
			// Check if active elements changed by testing element boundaries
			let activeIds = "";
			for (const track of tracks) {
				for (const el of track.elements) {
					if (el.hidden) continue;
					const end = el.startTime + getPreviewElementDuration(el);
					if (time >= el.startTime && time < end) {
						activeIds += el.id + ",";
					}
				}
			}
			const transitionPreview = resolveActiveClipTransitionPreview({
				tracks,
				currentTime: time,
				fps: activeProject?.fps ?? 30,
			});
			for (const elementId of transitionPreview.forceActiveElementIds) {
				activeIds += `transition:${elementId},`;
			}
			const audioCrossfadePreview = resolveActiveAudioCrossfadePreview({
				tracks,
				currentTime: time,
				fps: activeProject?.fps ?? 30,
			});
			for (const elementId of audioCrossfadePreview.forceActiveElementIds) {
				activeIds += `audio-crossfade:${elementId},`;
			}
			if (activeIds !== lastActiveIdsRef.current) {
				lastActiveIdsRef.current = activeIds;
				setPlaybackTime(time);
			}
		};

		window.addEventListener("playback-update", handlePlaybackUpdate);
		return () =>
			window.removeEventListener("playback-update", handlePlaybackUpdate);
	}, [activeProject?.fps, isPlaying, currentTime, tracks]);
	const [isExpanded, setIsExpanded] = useState(false);
	const [previewScale, setPreviewScale] = useState<
		"fit" | 75 | 100 | 125 | 150
	>("fit");
	const [showSafeAreas, setShowSafeAreas] = useState(false);
	const externalHtml = useMcpAppStore((state) => state.activeHtml);
	const externalToolName = useMcpAppStore((state) => state.toolName);
	const localMcpActive = useMcpAppStore((state) => state.localMcpActive);
	const setMcpApp = useMcpAppStore((state) => state.setMcpApp);
	const clearMcpApp = useMcpAppStore((state) => state.clearMcpApp);
	const setLocalMcpActive = useMcpAppStore((state) => state.setLocalMcpActive);
	const previewMode = usePreviewModeStore((state) => state.previewMode);
	const setPreviewMode = usePreviewModeStore((state) => state.setPreviewMode);

	// Local MCP: derive HTML fresh from template every render (auto-reload on HMR)
	// External MCP: use stored HTML from IPC
	const activeHtml = localMcpActive
		? buildMcpMediaAppHtml({ projectId: activeProject?.id ?? null })
		: externalHtml;
	const activeToolName = localMcpActive
		? MCP_MEDIA_TOOL_NAME
		: externalToolName;
	const isMcpMediaAppActive = localMcpActive;
	debugLog(
		"[MCP] render — localMcpActive:",
		localMcpActive,
		"activeHtml length:",
		activeHtml?.length ?? 0,
		"toolName:",
		activeToolName
	);
	const previewDimensions = usePreviewSizing({
		containerRef,
		canvasSize,
		isExpanded,
	});

	const {
		smoothTime,
		zoomStyle,
		cursorTelemetry,
		cursorConfig,
		showCursorOverlay,
		recordingBackground,
	} = useScreenRecordingPreview({
		isPlaying,
		currentTime,
		previewWidth: previewDimensions.width || canvasSize.width,
		previewHeight: previewDimensions.height || canvasSize.height,
	});

	// Preview element drag handling
	const { dragState, handleTextPointerDown } = usePreviewDrag({
		tracks,
		previewWidth: previewDimensions.width,
		canvasWidth: canvasSize.width,
		canvasHeight: canvasSize.height,
		updateTextElement,
		updateElementPosition,
	});

	// Frame caching - non-intrusive addition
	const { preRenderNearbyFrames } = useFrameCache({
		namespace: activeProject?.id ?? "default",
		persist: true,
	});

	useEffect(() => {
		const mcpApi = platform().mcp;
		if (!mcpApi?.onAppHtml) {
			return;
		}

		const handleAppHtml = (payload: { html: string; toolName?: string }) => {
			try {
				if (!payload || typeof payload.html !== "string") {
					return;
				}

				const html = payload.html.trim();
				if (!html) {
					return;
				}

				setMcpApp({
					html,
					toolName:
						typeof payload.toolName === "string" ? payload.toolName : null,
				});
				// Auto-switch to MCP mode when external app pushes HTML
				setPreviewMode("mcp");
			} catch {
				// Ignore malformed payloads from external tools.
			}
		};

		try {
			mcpApi.onAppHtml(handleAppHtml);
		} catch {
			return;
		}

		return () => {
			try {
				mcpApi.removeListeners?.();
			} catch {
				// Listener cleanup best-effort
			}
		};
	}, [setMcpApp, setPreviewMode]);

	useEffect(() => {
		const handleEscapeKey = (event: KeyboardEvent) => {
			if (event.key === "Escape" && isExpanded) {
				setIsExpanded(false);
			}
		};

		if (isExpanded) {
			document.addEventListener("keydown", handleEscapeKey);
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.removeEventListener("keydown", handleEscapeKey);
			document.body.style.overflow = "";
		};
	}, [isExpanded]);

	const toggleExpanded = useCallback(() => {
		setIsExpanded((prev) => !prev);
	}, []);

	const handleModeChange = useCallback(
		(mode: string) => {
			if (!mode) return;
			const newMode = mode as PreviewMode;
			debugLog("[PreviewMode] switching to:", newMode);
			if (newMode === "mcp" && !activeHtml) {
				// Activate built-in MCP app if no external HTML
				setLocalMcpActive(true);
			}
			if (newMode !== "mcp" && localMcpActive) {
				setLocalMcpActive(false);
			}
			setPreviewMode(newMode);
		},
		[activeHtml, localMcpActive, setLocalMcpActive, setPreviewMode]
	);

	useEffect(() => {
		const handlePlaybackSeek = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (detail && typeof detail.time === "number") {
				lastSeekEventTimeRef.current = detail.time;
			}
		};

		window.addEventListener(
			"playback-seek",
			handlePlaybackSeek as EventListener
		);
		return () =>
			window.removeEventListener(
				"playback-seek",
				handlePlaybackSeek as EventListener
			);
	}, []);

	const transitionPreviewTime = isPlaying ? smoothTime : currentTime;
	const activeTransitionPreview = useMemo(
		() =>
			resolveActiveClipTransitionPreview({
				tracks,
				currentTime: transitionPreviewTime,
				fps: activeProject?.fps ?? 30,
			}),
		[activeProject?.fps, tracks, transitionPreviewTime]
	);
	const activeAudioCrossfadePreview = useMemo(
		() =>
			resolveActiveAudioCrossfadePreview({
				tracks,
				currentTime: transitionPreviewTime,
				fps: activeProject?.fps ?? 30,
			}),
		[activeProject?.fps, tracks, transitionPreviewTime]
	);
	const forcedActiveElementIds = useMemo(
		() =>
			new Set([
				...activeTransitionPreview.forceActiveElementIds,
				...activeAudioCrossfadePreview.forceActiveElementIds,
			]),
		[
			activeAudioCrossfadePreview.forceActiveElementIds,
			activeTransitionPreview.forceActiveElementIds,
		]
	);
	const hasAnyElements = tracks.some((track) => track.elements.length > 0);
	const renderTracks = useMemo(
		() => expandCompoundMediaTracks({ tracks }),
		[tracks]
	);
	const getActiveElements = useCallback((): ActiveElement[] => {
		try {
			const effectiveTime = isPlaying ? playbackTime : currentTime;
			const plan = buildCompositionPlan({
				tracks: renderTracks,
				currentTime: effectiveTime,
				forceActiveElementIds: forcedActiveElementIds,
				getElementDuration: ({ element }) => getPreviewElementDuration(element),
			});
			const layers = [...plan.visualLayers, ...plan.audioElements];

			return layers.map(({ element, track }) => {
				const mediaItem =
					element.type === "media" && element.mediaId !== TEST_MEDIA_ID
						? (mediaItems.find((item) => item.id === element.mediaId) ?? null)
						: null;
				return { element, track, mediaItem };
			});
		} catch {
			return [];
		}
	}, [
		forcedActiveElementIds,
		renderTracks,
		currentTime,
		playbackTime,
		isPlaying,
		mediaItems,
	]);

	const activeElements = useMemo(
		() => getActiveElements(),
		[getActiveElements]
	);
	const totalDuration = getTotalDuration();
	const compositionPreviewEnabled =
		!isPlaying &&
		previewMode === "video" &&
		activeProject?.backgroundType !== "blur" &&
		!maskEditorActive &&
		!colorPickerActive &&
		canvasSize.width <= 4096 &&
		canvasSize.height <= 4096 &&
		canUseNativeCompositionPreview({
			activeElements,
			hasActiveTransition:
				activeTransitionPreview.forceActiveElementIds.size > 0,
			hasSelection: selectedElements.length > 0 || stickerInteractionActive,
		});
	const nativeCompositionPreview = useNativeCompositionFramePreview({
		enabled: compositionPreviewEnabled,
		tracks: renderTracks,
		mediaItems,
		currentTime,
		totalDuration,
		width: canvasSize.width,
		height: canvasSize.height,
		fps: activeProject?.fps ?? 30,
		backgroundColor: activeProject?.backgroundColor,
	});
	const selectedMediaTargets = useMemo<SelectedMediaTransformTarget[]>(() => {
		return selectedElements.flatMap(({ trackId, elementId }) => {
			const active = activeElements.find(
				(candidate) =>
					candidate.track.id === trackId && candidate.element.id === elementId
			);
			if (!active || active.element.type !== "media") return [];
			return [{ trackId, element: active.element }];
		});
	}, [activeElements, selectedElements]);
	const stickerDropHandlers = useTimelineStickerDrop({
		canvasSize,
		currentTime,
	});
	const {
		blurBackgroundElements,
		videoSourcesById,
		blurBackgroundSource,
		currentMediaElement,
	} = usePreviewMedia({
		activeElements,
		mediaItems,
		activeProject,
	});

	const { filterStyle, hasEffects: hasEnabledEffects } = useEffectsRendering(
		currentMediaElement?.element.id ?? null,
		EFFECTS_ENABLED
	);

	useEffect(() => {
		const seekTime = lastSeekEventTimeRef.current;
		const didSeek =
			typeof seekTime === "number" && Math.abs(seekTime - currentTime) < 0.001;

		if (didSeek) {
			lastSeekEventTimeRef.current = null;
			return;
		}
	}, [currentTime]);

	// Warm cache during idle time
	useEffect(() => {
		if (!isPlaying && previewRef.current) {
			const warmCache = () => {
				preRenderNearbyFrames(
					currentTime,
					async (time) => {
						if (!previewRef.current) throw new Error("No preview element");
						// Safety: only capture current-time frame to avoid mismatched cache
						const tolerance = 1 / 30;
						if (Math.abs(time - currentTime) > tolerance) {
							throw new Error("Cannot capture non-current time safely");
						}
						const imageData = await captureWithFallback(previewRef.current, {
							width: previewDimensions.width,
							height: previewDimensions.height,
							backgroundColor:
								activeProject?.backgroundType === "blur"
									? "transparent"
									: activeProject?.backgroundColor || "#000000",
						});
						if (!imageData) throw new Error("Failed to capture frame");
						return imageData;
					},
					3,
					tracks,
					mediaItems,
					activeProject
				);
			};

			const timeoutId = setTimeout(warmCache, 100);
			return () => clearTimeout(timeoutId);
		}
	}, [
		currentTime,
		isPlaying,
		preRenderNearbyFrames,
		previewDimensions.width,
		previewDimensions.height,
		activeProject?.backgroundColor,
		activeProject?.backgroundType,
		tracks,
		mediaItems,
		activeProject,
	]);

	// Handler for transform updates from interactive overlay
	const handleTransformUpdate = useCallback(
		(elementId: string, transform: ElementTransform) => {
			const element = activeElements.find((el) => el.element.id === elementId);
			if (!element) return;

			// Use generic element update methods that work for all element types
			// Update position if changed
			if (transform.x !== undefined || transform.y !== undefined) {
				updateElementPosition(elementId, {
					x: transform.x,
					y: transform.y,
				});
			}

			// Update size if changed
			if (transform.width !== undefined || transform.height !== undefined) {
				updateElementSize(elementId, {
					width: transform.width,
					height: transform.height,
				});
			}

			// Update rotation if changed
			if (transform.rotation !== undefined) {
				updateElementRotation(elementId, transform.rotation);
			}
		},
		[
			activeElements,
			updateElementPosition,
			updateElementSize,
			updateElementRotation,
		]
	);
	const handleElementResize = useCallback(
		({
			elementId,
			width,
			height,
		}: {
			elementId: string;
			width: number;
			height: number;
		}) => {
			try {
				updateElementSize(elementId, { width, height });
			} catch {
				// keep preview responsive even if a resize update fails
			}
		},
		[updateElementSize]
	);

	const loggedRemotionElementsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		for (const elementData of activeElements) {
			if (elementData.element.type !== "remotion") {
				continue;
			}
			if (loggedRemotionElementsRef.current.has(elementData.element.id)) {
				continue;
			}

			loggedRemotionElementsRef.current.add(elementData.element.id);
			const remotionElement = elementData.element as RemotionElement;
			debugLog("[REMOTION] Detected Remotion element", {
				elementId: remotionElement.id,
				componentId: remotionElement.componentId,
			});
		}
	}, [activeElements]);

	const renderBlurBackground = useCallback(
		() => (
			<PreviewBlurBackground
				activeProject={activeProject}
				blurBackgroundElements={blurBackgroundElements}
				blurBackgroundSource={blurBackgroundSource}
				currentMediaElement={currentMediaElement}
				filterStyle={filterStyle}
				hasEnabledEffects={hasEnabledEffects}
			/>
		),
		[
			activeProject,
			blurBackgroundElements,
			blurBackgroundSource,
			currentMediaElement,
			filterStyle,
			hasEnabledEffects,
		]
	);

	const renderElement = useCallback(
		(elementData: ActiveElement, index: number) => (
			<PreviewElementRenderer
				key={`${elementData.element.id}-${elementData.track.id}`}
				elementData={elementData}
				index={index}
				previewDimensions={previewDimensions}
				canvasSize={canvasSize}
				currentTime={isPlaying ? smoothTime : currentTime}
				filterStyle={filterStyle}
				hasEnabledEffects={hasEnabledEffects}
				videoSourcesById={videoSourcesById}
				currentMediaElement={currentMediaElement}
				dragState={dragState}
				isPlaying={isPlaying}
				activeProject={activeProject}
				tracks={tracks}
				transitionState={activeTransitionPreview.statesByElementId.get(
					elementData.element.id
				)}
				audioCrossfadeState={activeAudioCrossfadePreview.statesByElementId.get(
					elementData.element.id
				)}
				compositionPreviewEnabled={compositionPreviewEnabled}
				onTextPointerDown={handleTextPointerDown}
				onElementSelect={({ elementId, multi }) =>
					selectElement(elementData.track.id, elementId, multi)
				}
				onElementResize={handleElementResize}
			/>
		),
		[
			activeProject,
			activeAudioCrossfadePreview.statesByElementId,
			activeTransitionPreview.statesByElementId,
			canvasSize,
			compositionPreviewEnabled,
			currentMediaElement,
			currentTime,
			dragState,
			filterStyle,
			handleElementResize,
			handleTextPointerDown,
			hasEnabledEffects,
			isPlaying,
			previewDimensions,
			selectElement,
			smoothTime,
			videoSourcesById,
			tracks,
		]
	);

	// Enhanced sync check: Timeline elements exist but no media items loaded
	// If timeline has elements but media list is still empty, prefer showing normal UI and let
	// individual elements render placeholders as needed. Avoid global warning screen.

	// Handle media loading states
	if (mediaItemsError) {
		return (
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex-1 flex items-center justify-center p-3">
					<div className="text-center">
						<div className="text-red-500 mb-2">Failed to load media items</div>
						<div className="text-sm text-muted-foreground">
							{mediaItemsError.message}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (mediaItemsLoading) {
		return (
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex-1 flex items-center justify-center p-3">
					<div className="flex items-center space-x-2">
						<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
						<span>Loading preview...</span>
					</div>
				</div>
			</div>
		);
	}

	const modeToggle = (
		<PreviewModeToggle value={previewMode} onValueChange={handleModeChange} />
	);

	if (previewMode === "mcp") {
		return (
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex items-center justify-between px-3 py-2 border-b">
					<p className="text-sm font-medium text-foreground truncate">
						{activeToolName ? `MCP: ${activeToolName}` : "MCP App"}
					</p>
					{modeToggle}
				</div>
				<div className="flex-1 min-h-0 p-3">
					{activeHtml ? (
						<iframe
							key={activeHtml?.length ?? 0}
							title={activeToolName || "MCP app preview"}
							srcDoc={activeHtml}
							sandbox="allow-scripts allow-forms"
							className="h-full w-full border rounded bg-background"
						/>
					) : (
						<div className="h-full flex items-center justify-center text-muted-foreground text-sm">
							No MCP app active
						</div>
					)}
				</div>
			</div>
		);
	}

	if (previewMode === "agent") {
		return (
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex items-center justify-between px-3 py-2 border-b">
					<p className="text-sm font-medium text-foreground truncate">Agent</p>
					{modeToggle}
				</div>
				<div className="flex-1 min-h-0">
					<PreviewAgentView />
				</div>
			</div>
		);
	}

	return (
		<>
			<TimelineStickerKeyboardController />
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex items-center justify-end px-3 py-2 border-b">
					{modeToggle}
				</div>
				<div
					ref={containerRef}
					className="flex-1 flex flex-col items-center justify-center overflow-hidden p-3 min-h-0 min-w-0"
				>
					<div className="flex-1" />
					{hasAnyElements ? (
						<div
							ref={previewRef}
							className="relative overflow-visible border"
							data-testid="preview-canvas"
							style={{
								width: previewDimensions.width || canvasSize.width,
								height: previewDimensions.height || canvasSize.height,
								transform: `scale(${previewScale === "fit" ? 1 : previewScale / 100})`,
								transformOrigin: "center",
								transition: "transform 120ms ease-out",
								backgroundColor:
									activeProject?.backgroundType === "blur"
										? "transparent"
										: activeProject?.backgroundColor || "#000000",
							}}
							onDragOver={stickerDropHandlers.onDragOver}
							onDrop={stickerDropHandlers.onDrop}
						>
							<div className="absolute inset-0 overflow-hidden">
								{(() => {
									const pw = previewDimensions.width || canvasSize.width;
									const ph = previewDimensions.height || canvasSize.height;
									const hasBg = recordingBackground.type !== "none";
									const padding = hasBg ? recordingBackground.padding : 0;
									const cursorW = pw - padding * 2;
									const cursorH = ph - padding * 2;

									const cursorOverlay = cursorTelemetry &&
										showCursorOverlay && (
											<CursorOverlay
												canvasWidth={cursorW}
												canvasHeight={cursorH}
												currentTimeMs={
													(isPlaying ? smoothTime : currentTime) * 1000
												}
												telemetry={cursorTelemetry}
												config={cursorConfig}
												visible={showCursorOverlay}
											/>
										);

									const zoomContent = (
										<div className="absolute inset-0" style={zoomStyle}>
											{renderBlurBackground()}
											{activeElements.length === 0 ? (
												<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
													No elements at current time
												</div>
											) : (
												<AdjustmentLayerStack
													activeElements={activeElements}
													currentTime={currentTime}
													renderElement={renderElement}
												/>
											)}
											{nativeCompositionPreview.status === "ready" &&
											nativeCompositionPreview.url ? (
												<img
													src={nativeCompositionPreview.url}
													alt=""
													className="pointer-events-none absolute inset-0 z-30 size-full object-fill"
													data-native-composition-preview="ready"
												/>
											) : null}
											{cursorOverlay}
										</div>
									);
									return hasBg ? (
										<RecordingBackground
											background={recordingBackground}
											width={pw}
											height={ph}
										>
											{zoomContent}
										</RecordingBackground>
									) : (
										zoomContent
									);
								})()}
								{activeProject?.backgroundType === "blur" &&
									blurBackgroundElements.length === 0 &&
									activeElements.length > 0 && (
										<div className="absolute bottom-2 left-2 right-2 bg-background/70 text-foreground text-xs p-2 rounded">
											Add a video or image to use blur background
										</div>
									)}
								{nativeCompositionPreview.status === "rendering" ? (
									<div
										className="pointer-events-none absolute right-2 top-2 z-[60] flex size-7 items-center justify-center rounded-sm bg-background/85 text-foreground shadow-sm"
										title="Rendering exact composition preview"
										data-testid="native-composition-preview-loading"
									>
										<LoaderCircle className="size-4 animate-spin">
											<title>Rendering exact composition preview</title>
										</LoaderCircle>
									</div>
								) : nativeCompositionPreview.status === "error" ? (
									<div
										className="pointer-events-none absolute right-2 top-2 z-[60] flex size-7 items-center justify-center rounded-sm bg-destructive/85 text-destructive-foreground shadow-sm"
										title={
											nativeCompositionPreview.error ??
											"Exact composition preview failed"
										}
										data-testid="native-composition-preview-error"
									>
										<TriangleAlert className="size-4">
											<title>Exact composition preview failed</title>
										</TriangleAlert>
									</div>
								) : null}
							</div>

							{showSafeAreas ? (
								<div
									className="pointer-events-none absolute inset-0 z-40"
									data-testid="preview-safe-areas"
								>
									<div className="absolute inset-[5%] border border-white/45" />
									<div className="absolute inset-[10%] border border-dashed border-white/65" />
								</div>
							) : null}

							{isPlaying ? null : (
								<MediaTransformOverlay
									targets={selectedMediaTargets}
									canvasSize={canvasSize}
									previewRef={previewRef}
									currentTime={currentTime}
									fps={activeProject?.fps ?? 30}
								/>
							)}

							<TimelineStickerInteractionLayer
								activeElements={activeElements}
								mediaItems={mediaItems}
							/>

							{/* Canvas hit targets and transform controls */}
							{activeElements
								.filter((elementData) => elementData.element.type !== "media")
								.map((elementData) => (
									<InteractiveElementOverlay
										key={`${elementData.element.id}-${elementData.track.id}`}
										element={elementData.element}
										isSelected={selectedElements.some(
											(selection) =>
												selection.trackId === elementData.track.id &&
												selection.elementId === elementData.element.id
										)}
										canvasSize={canvasSize}
										previewDimensions={previewDimensions}
										onSelect={({ multi }) =>
											selectElement(
												elementData.track.id,
												elementData.element.id,
												multi
											)
										}
										onTransformUpdate={handleTransformUpdate}
									/>
								))}

							{/* Hidden canvas for frame caching - non-visual */}
							<canvas
								ref={canvasRef}
								className="hidden"
								width={previewDimensions.width}
								height={previewDimensions.height}
							/>
							<canvas
								ref={cacheCanvasRef}
								className="hidden"
								width={previewDimensions.width}
								height={previewDimensions.height}
							/>
						</div>
					) : null}

					<div className="flex-1" />

					<PreviewToolbar
						hasAnyElements={hasAnyElements}
						onToggleExpanded={toggleExpanded}
						isExpanded={isExpanded}
						currentTime={currentTime}
						setCurrentTime={setCurrentTime}
						toggle={toggle}
						getTotalDuration={getTotalDuration}
						previewScale={previewScale}
						onPreviewScaleChange={setPreviewScale}
						showSafeAreas={showSafeAreas}
						onToggleSafeAreas={() => setShowSafeAreas((visible) => !visible)}
					/>
				</div>
			</div>

			{isExpanded && (
				<FullscreenPreview
					previewDimensions={previewDimensions}
					activeProject={activeProject}
					renderBlurBackground={renderBlurBackground}
					activeElements={activeElements}
					renderElement={renderElement}
					blurBackgroundElements={blurBackgroundElements}
					hasAnyElements={hasAnyElements}
					toggleExpanded={toggleExpanded}
					currentTime={currentTime}
					setCurrentTime={setCurrentTime}
					toggle={toggle}
					getTotalDuration={getTotalDuration}
				/>
			)}
		</>
	);
}
