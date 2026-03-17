"use client";

import { platform } from "@qcut/platform-core";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { RemotionElement } from "@/types/timeline";
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
import { StickerCanvas } from "./stickers-overlay/StickerCanvas";
import { CaptionsDisplay } from "@/components/captions/captions-display";
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

/** Main preview panel component for video playback, MCP apps, and element overlays. */
export function PreviewPanel() {
	const {
		tracks,
		getTotalDuration,
		updateTextElement,
		updateElementPosition,
		updateElementSize,
		updateElementRotation,
	} = useTimelineStore();
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	const { currentTime, toggle, setCurrentTime, isPlaying } = usePlaybackStore();
	const { canvasSize } = useEditorStore();
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
					const end = el.startTime + (el.duration - el.trimStart - el.trimEnd);
					if (time >= el.startTime && time < end) {
						activeIds += el.id + ",";
					}
				}
			}
			if (activeIds !== lastActiveIdsRef.current) {
				lastActiveIdsRef.current = activeIds;
				setPlaybackTime(time);
			}
		};

		window.addEventListener("playback-update", handlePlaybackUpdate);
		return () =>
			window.removeEventListener("playback-update", handlePlaybackUpdate);
	}, [isPlaying, currentTime, tracks]);
	const [isExpanded, setIsExpanded] = useState(false);
	const { activeProject } = useProjectStore();
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

	// State for selected element (for interactive overlay)
	const [selectedElementId, setSelectedElementId] = useState<string | null>(
		null
	);

	// Frame caching - non-intrusive addition
	const { preRenderNearbyFrames } = useFrameCache({
		maxCacheSize: 300,
		cacheResolution: 30,
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

	const hasAnyElements = tracks.some((track) => track.elements.length > 0);
	const getActiveElements = useCallback((): ActiveElement[] => {
		try {
			const activeElements: ActiveElement[] = [];

			for (const track of tracks) {
				for (const element of track.elements) {
					if (element.hidden) {
						continue;
					}

					const elementStart = element.startTime;
					const elementEnd =
						element.startTime +
						(element.duration - element.trimStart - element.trimEnd);

					// Use playbackTime during playback (updates on element boundary crossings),
					// fall back to store currentTime when paused
					const effectiveTime = isPlaying ? playbackTime : currentTime;
					if (effectiveTime < elementStart || effectiveTime >= elementEnd) {
						continue;
					}

					let mediaItem = null;
					if (element.type === "media") {
						mediaItem =
							element.mediaId === TEST_MEDIA_ID
								? null
								: (mediaItems.find((item) => item.id === element.mediaId) ??
									null);
					}

					activeElements.push({ element, track, mediaItem });
				}
			}

			return activeElements;
		} catch {
			return [];
		}
	}, [tracks, currentTime, playbackTime, isPlaying, mediaItems]);

	const activeElements = useMemo(
		() => getActiveElements(),
		[getActiveElements]
	);

	const {
		captionSegments,
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
				currentTime={currentTime}
				filterStyle={filterStyle}
				hasEnabledEffects={hasEnabledEffects}
				videoSourcesById={videoSourcesById}
				currentMediaElement={currentMediaElement}
				dragState={dragState}
				isPlaying={isPlaying}
				activeProject={activeProject}
				onTextPointerDown={handleTextPointerDown}
				onElementSelect={({ elementId }) => setSelectedElementId(elementId)}
				onElementResize={handleElementResize}
			/>
		),
		[
			activeProject,
			canvasSize,
			currentMediaElement,
			currentTime,
			dragState,
			filterStyle,
			handleElementResize,
			handleTextPointerDown,
			hasEnabledEffects,
			isPlaying,
			previewDimensions,
			videoSourcesById,
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
			<div
				className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm"
				data-testid="preview-panel"
			>
				<div className="flex items-center justify-end px-3 py-2 border-b">
					{modeToggle}
				</div>
				<div
					ref={containerRef}
					className="flex-1 flex flex-col items-center justify-center p-3 min-h-0 min-w-0"
				>
					<div className="flex-1" />
					{hasAnyElements ? (
						<div
							ref={previewRef}
							className="relative overflow-hidden border"
							style={{
								width: previewDimensions.width || canvasSize.width,
								height: previewDimensions.height || canvasSize.height,
								backgroundColor:
									activeProject?.backgroundType === "blur"
										? "transparent"
										: activeProject?.backgroundColor || "#000000",
							}}
						>
							{(() => {
								const pw = previewDimensions.width || canvasSize.width;
								const ph = previewDimensions.height || canvasSize.height;
								const hasBg = recordingBackground.type !== "none";
								const padding = hasBg ? recordingBackground.padding : 0;
								const cursorW = pw - padding * 2;
								const cursorH = ph - padding * 2;

								const cursorOverlay = cursorTelemetry && showCursorOverlay && (
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
											activeElements.map((elementData, index) =>
												renderElement(elementData, index)
											)
										)}
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

							{/* Sticker overlay layer - renders on top of everything */}
							<StickerCanvas
								className="absolute inset-0"
								disabled={isExpanded}
							/>

							{/* Captions overlay - renders on top of stickers */}
							<CaptionsDisplay
								segments={captionSegments}
								currentTime={currentTime}
								isVisible={captionSegments.length > 0}
								className="absolute inset-0 pointer-events-none"
							/>

							{/* Interactive element overlays for elements with effects */}
							{EFFECTS_ENABLED &&
								activeElements.map((elementData) => (
									<InteractiveElementOverlay
										key={`${elementData.element.id}-${elementData.track.id}`}
										element={elementData.element}
										isSelected={selectedElementId === elementData.element.id}
										canvasSize={canvasSize}
										previewDimensions={previewDimensions}
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
