"use client";

import { useMemo } from "react";
import { AudioPlayer } from "@/components/ui/audio-player";
import { VideoPlayer } from "@/components/ui/video-player";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import { FONT_CLASS_MAP } from "@/lib/font-config";
import type { VideoSource } from "@/lib/media/media-source";
import {
	buildTextShadow,
	colorWithOpacity,
	resolveTextStyle,
	verticalAlignToFlex,
} from "@/lib/text/text-style";
import { getTextAnimationState } from "@/lib/text/text-animation";
import { resolveTextKeyframes } from "@/lib/text/text-keyframes";
import { resolveTrackedTextElement } from "@/lib/text/text-tracking";
import { getCurvedTextTransforms } from "@/lib/text/curved-text";
import {
	DEFAULT_MEDIA_ENHANCEMENTS,
	resolveMediaKeyframes,
} from "@/lib/video/video-properties";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { buildCssPerspectiveTransform } from "@/lib/video/video-perspective";
import {
	buildMediaChromaKeyCssFilter,
	buildMediaEnhancementCssFilter,
	buildMediaMaskStyle,
	getMediaAnimationState,
} from "@/lib/video/video-animation";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { getEffectMotionState } from "@/lib/effects/effect-motion-preview";
import { hasMediaColorEdits } from "@/lib/color/color-properties";
import type { TextElementDragState } from "@/types/editor";
import type { TProject } from "@/types/project";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { MarkdownOverlay } from "@/components/editor/canvas/markdown-overlay";
import { RemotionPreview } from "./remotion-preview";
import { MediaMaskOverlay } from "./media-mask-overlay";
import type { ActiveElement, PreviewDimensions } from "./types";
import { useMediaStore } from "@/stores/media/media-store";
import {
	createDerivedAudioElement,
	selectMediaAudioSources,
} from "@/lib/audio/audio-source-selection";
import { ColorPreviewCanvas } from "./color-preview-canvas";
import { CustomCutoutOverlay } from "./custom-cutout-overlay";
import {
	selectAudioPreviewBypassed,
	useAudioPreviewStore,
} from "@/stores/editor/audio-preview-store";
import { useColorPickerStore } from "@/stores/editor/color-picker-store";
import type { ClipTransitionPreviewState } from "@/lib/transitions/clip-transition-preview";
import {
	buildClipTransitionAnchoredTransform,
	buildClipTransitionContentStyle,
	buildClipTransitionCssFilter,
	buildClipTransitionCssTransform,
	buildClipTransitionMaskStyle,
	buildClipTransitionOverlayStyle,
	getClipTransitionLayerPresentation,
} from "@/lib/transitions/clip-transition-presentation";
import { buildMediaMaskStrokeCssFilter } from "@/lib/video/media-mask-stroke";
import { CaptionsDisplay } from "@/components/captions/captions-display";
import { WORD_FILTER_STATE } from "@/types/word-timeline";
import { TimelineStickerLayer } from "./timeline-sticker-layer";
import type { AudioCrossfadePreviewState } from "@/lib/audio/audio-crossfade-preview";
import { useNativeVideoEnhancementPreview } from "@/hooks/preview/use-native-video-enhancement-preview";
import {
	getVideoEnhancementProxyWindow,
	useVideoEnhancementProxy,
} from "@/hooks/preview/use-video-enhancement-proxy";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
	EMPTY_ELEMENT_EFFECTS_RENDERING,
	type ElementEffectsRendering,
} from "./use-effects-rendering";
import { EffectOverlayLayers } from "@/components/editor/effects/effect-overlay-layers";
import { EffectCompositeCanvas } from "@/components/editor/effects/effect-composite-canvas";
import { EffectParticleCanvas } from "@/components/editor/effects/effect-particle-canvas";
import { EffectPersonTrackingCanvas } from "@/components/editor/effects/effect-person-tracking-canvas";
import { useEffectAudioReactivePreview } from "@/components/editor/effects/use-effect-audio-reactive-preview";
import {
	appendAudioReactiveBrightnessFilter,
	mergeEffectMotionWithAudioReactive,
} from "@/lib/effects/effect-audio-reactive-state";

interface ElementResizeParams {
	elementId: string;
	width: number;
	height: number;
}

interface PreviewElementRendererProps {
	elementData: ActiveElement;
	index: number;
	previewDimensions: PreviewDimensions;
	canvasSize: { width: number; height: number };
	currentTime: number;
	effectRendering?: ElementEffectsRendering;
	videoSourcesById: Map<string, VideoSource>;
	currentMediaElement: ActiveElement | null;
	dragState: TextElementDragState;
	isPlaying: boolean;
	activeProject: TProject | null;
	tracks: TimelineTrack[];
	transitionState?: ClipTransitionPreviewState;
	audioCrossfadeState?: AudioCrossfadePreviewState;
	compositionPreviewEnabled: boolean;
	onTextPointerDown: (
		event: React.PointerEvent<HTMLDivElement>,
		element: Pick<TimelineElement, "id" | "x" | "y">,
		trackId: string
	) => void;
	onElementSelect: ({
		elementId,
		multi,
	}: {
		elementId: string;
		multi: boolean;
	}) => void;
	onElementResize: ({ elementId, width, height }: ElementResizeParams) => void;
}

interface PreviewBlurBackgroundProps {
	activeProject: TProject | null;
	blurBackgroundElements: ActiveElement[];
	blurBackgroundSource: VideoSource;
	effectsRenderingByElementId: ReadonlyMap<string, ElementEffectsRendering>;
}

/** Renders a blurred background video layer behind the main preview content. */
export function PreviewBlurBackground({
	activeProject,
	blurBackgroundElements,
	blurBackgroundSource,
	effectsRenderingByElementId,
}: PreviewBlurBackgroundProps): React.ReactNode {
	try {
		if (activeProject?.backgroundType !== "blur") {
			return null;
		}

		if (blurBackgroundElements.length === 0) {
			return null;
		}

		const backgroundElement = blurBackgroundElements[0];
		const { element, mediaItem } = backgroundElement;

		if (!mediaItem) {
			return null;
		}

		const blurIntensity = activeProject.blurIntensity ?? 8;

		if (mediaItem.type === "video") {
			if (!blurBackgroundSource) {
				return (
					<div
						key={`blur-${element.id}-${backgroundElement.track.id}`}
						className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs"
					>
						No available video source
					</div>
				);
			}

			const effectRendering =
				effectsRenderingByElementId.get(element.id) ??
				EMPTY_ELEMENT_EFFECTS_RENDERING;

			return (
				<div
					key={`blur-${element.id}-${backgroundElement.track.id}`}
					className="absolute inset-0 overflow-hidden"
					style={{
						filter: `blur(${blurIntensity}px)`,
						transform: "scale(1.1)",
						transformOrigin: "center",
					}}
				>
					<VideoPlayer
						videoId={`${mediaItem.id}-blur-background`}
						videoSource={blurBackgroundSource}
						poster={mediaItem.thumbnailUrl}
						clipStartTime={element.startTime}
						trimStart={element.trimStart}
						trimEnd={element.trimEnd}
						clipDuration={element.duration}
						clipVolume={0}
						className="object-cover"
						style={
							effectRendering.filterStyle
								? { filter: effectRendering.filterStyle }
								: undefined
						}
					/>
				</div>
			);
		}

		if (mediaItem.type === "image") {
			if (!mediaItem.url) {
				return null;
			}

			return (
				<div
					key={`blur-${element.id}-${backgroundElement.track.id}`}
					className="absolute inset-0 overflow-hidden"
					style={{
						filter: `blur(${blurIntensity}px)`,
						transform: "scale(1.1)",
						transformOrigin: "center",
					}}
				>
					<img
						src={mediaItem.url}
						alt={mediaItem.name}
						className="w-full h-full object-cover"
						draggable={false}
					/>
				</div>
			);
		}

		return null;
	} catch {
		return null;
	}
}

/** Renders a single timeline element (text, media, markdown, sticker) positioned on the preview canvas. */
export function PreviewElementRenderer({
	elementData,
	index,
	previewDimensions,
	canvasSize,
	currentTime,
	effectRendering = EMPTY_ELEMENT_EFFECTS_RENDERING,
	videoSourcesById,
	currentMediaElement,
	dragState,
	isPlaying,
	activeProject,
	tracks,
	transitionState,
	audioCrossfadeState,
	compositionPreviewEnabled,
	onTextPointerDown,
	onElementSelect,
	onElementResize,
}: PreviewElementRendererProps): React.ReactNode {
	const selectedMaskElementId = useMaskEditorStore(
		(state) => state.selectedElementId
	);
	const selectedMaskId = useMaskEditorStore((state) => state.selectedMaskId);
	const isEditingMask = useMaskEditorStore((state) => state.isEditing);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const colorPickerActive = useColorPickerStore((state) => state.active);
	const audioPreviewBypassed = useAudioPreviewStore((state) =>
		selectAudioPreviewBypassed({
			state,
			elementId: elementData.element.id,
		})
	);
	const audioReactive = useEffectAudioReactivePreview({
		program: effectRendering.renderProgram,
		trackId: elementData.track.id,
	});
	const effectFilterStyle = appendAudioReactiveBrightnessFilter({
		filter: effectRendering.filterStyle,
		audioReactive,
	});
	const previewMediaVisual =
		elementData.element.type === "media"
			? resolveMediaKeyframes({
					element: elementData.element,
					currentTime,
					fps: activeProject?.fps ?? 30,
				})
			: undefined;
	const generatedPreviewMask = previewMediaVisual?.masks.find(
		(mask) => mask.enabled !== false && Boolean(mask.sourceMediaId)
	);
	const previewMediaItem = elementData.mediaItem;
	const previewEnhancements =
		previewMediaVisual?.enhancements ?? DEFAULT_MEDIA_ENHANCEMENTS;
	const proxyWindow =
		elementData.element.type === "media"
			? getVideoEnhancementProxyWindow({
					element: elementData.element,
					currentTime,
				})
			: { sourceStart: 0, sourceDuration: 0 };
	const enhancementProxy = useVideoEnhancementProxy({
		enabled:
			elementData.element.type === "media" &&
			previewMediaItem?.type === "video" &&
			elementData.element.id === currentMediaElement?.element.id &&
			!generatedPreviewMask,
		elementId: elementData.element.id,
		sourcePath: previewMediaItem?.localPath,
		sourceStart: proxyWindow.sourceStart,
		sourceDuration: proxyWindow.sourceDuration,
		sourceWidth: previewMediaItem?.width ?? canvasSize.width,
		sourceHeight: previewMediaItem?.height ?? canvasSize.height,
		fps: activeProject?.fps ?? 30,
		enhancements: previewEnhancements,
	});
	const nativeEnhancementPreview = useNativeVideoEnhancementPreview({
		enabled:
			!isPlaying &&
			!compositionPreviewEnabled &&
			elementData.element.type === "media" &&
			previewMediaItem?.type === "video" &&
			elementData.element.id === currentMediaElement?.element.id &&
			!generatedPreviewMask,
		elementId: elementData.element.id,
		videoId: previewMediaItem?.id ?? "",
		sourcePath: previewMediaItem?.localPath,
		sourceTimeOffset:
			enhancementProxy.status === "ready"
				? enhancementProxy.sourceTimeOffset
				: 0,
		currentTime,
		width: previewDimensions.width || canvasSize.width,
		height: previewDimensions.height || canvasSize.height,
		fps: activeProject?.fps ?? 30,
		fitMode: previewMediaVisual?.fitMode ?? "cover",
		enhancements: previewEnhancements,
	});
	const enhancementProxyVideoSource = useMemo<VideoSource>(
		() =>
			enhancementProxy.status === "ready" && enhancementProxy.url
				? { type: "remote", src: enhancementProxy.url }
				: null,
		[enhancementProxy.status, enhancementProxy.url]
	);
	try {
		const { element, mediaItem } = elementData;
		const elementKey = `${element.id}-${elementData.track.id}`;
		const isColorPickerTarget =
			colorPickerActive && element.id === currentMediaElement?.element.id;

		if (element.type === "text") {
			const displayElement = resolveTrackedTextElement({
				element: resolveTextKeyframes(
					element,
					currentTime,
					activeProject?.fps ?? 30
				),
				tracks,
				currentTime,
				fps: activeProject?.fps ?? 30,
			});
			const fontClassName =
				FONT_CLASS_MAP[
					displayElement.fontFamily as keyof typeof FONT_CLASS_MAP
				] || "";
			const textStyle = resolveTextStyle(displayElement);
			const animationState = getTextAnimationState(element, currentTime);
			// Mirror the export cap in text-canvas-renderer.ts, which clamps the
			// box to 2x the canvas; without it oversized boxes preview differently
			// than they export.
			const boxWidth = Math.min(textStyle.width, canvasSize.width * 2);
			const boxHeight = Math.min(textStyle.height, canvasSize.height * 2);
			const curvedCharacters = getCurvedTextTransforms({
				text: displayElement.content,
				width: Math.max(1, boxWidth - textStyle.backgroundPadding * 2),
				curve: textStyle.curve,
			});

			const scaleRatio = previewDimensions.width / canvasSize.width;
			const isDraggingThisElement =
				dragState.isDragging && dragState.elementId === element.id;
			const displayX = isDraggingThisElement
				? dragState.currentX
				: displayElement.x;
			const displayY = isDraggingThisElement
				? dragState.currentY
				: displayElement.y;

			return (
				<div
					key={elementKey}
					className="absolute flex cursor-grab"
					onClick={(event) =>
						onElementSelect({
							elementId: element.id,
							multi: event.shiftKey || event.metaKey,
						})
					}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") {
							return;
						}
						event.preventDefault();
						onElementSelect({
							elementId: element.id,
							multi: event.shiftKey || event.metaKey,
						});
					}}
					onPointerDown={(event) =>
						onTextPointerDown(event, element, elementData.track.id)
					}
					tabIndex={0}
					role="button"
					aria-label={`Select ${element.type} element`}
					style={{
						left: `${50 + ((displayX + animationState.offsetX) / canvasSize.width) * 100}%`,
						top: `${50 + ((displayY + animationState.offsetY) / canvasSize.height) * 100}%`,
						transform: `translate(-50%, -50%) rotate(${displayElement.rotation}deg) scale(${scaleRatio})`,
						opacity: displayElement.opacity * animationState.opacity,
						width: `${boxWidth}px`,
						height: `${boxHeight}px`,
						mixBlendMode: textStyle.blendMode,
						zIndex: index + 1,
					}}
				>
					<div
						className={fontClassName}
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "stretch",
							justifyContent: verticalAlignToFlex(textStyle.verticalAlign),
							boxSizing: "border-box",
							width: "100%",
							height: "100%",
							fontSize: `${displayElement.fontSize}px`,
							color: displayElement.color,
							backgroundColor: colorWithOpacity(
								displayElement.backgroundColor,
								textStyle.backgroundOpacity
							),
							textAlign: displayElement.textAlign,
							fontWeight: displayElement.fontWeight,
							fontStyle: displayElement.fontStyle,
							textDecoration: displayElement.textDecoration,
							letterSpacing: `${textStyle.letterSpacing}px`,
							lineHeight: textStyle.lineHeight,
							padding: `${textStyle.backgroundPadding}px`,
							borderRadius: `${textStyle.backgroundRadius}px`,
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							overflow: "hidden",
							WebkitTextStroke:
								textStyle.strokeWidth > 0
									? `${textStyle.strokeWidth}px ${colorWithOpacity(textStyle.strokeColor, textStyle.strokeOpacity)}`
									: undefined,
							textShadow: buildTextShadow(textStyle),
							...(fontClassName
								? {}
								: { fontFamily: displayElement.fontFamily }),
						}}
					>
						{textStyle.curve !== 0 ? (
							<span
								className="relative block h-full w-full"
								aria-label={displayElement.content}
							>
								{curvedCharacters.map((character, characterIndex) => (
									<span
										key={`${characterIndex}-${character.character}`}
										aria-hidden="true"
										className="absolute left-1/2 top-1/2"
										style={{
											transform: `translate(-50%, -50%) translate(${character.x}px, ${character.y}px) rotate(${character.rotation}deg)`,
										}}
									>
										{character.character === " "
											? "\u00a0"
											: character.character}
									</span>
								))}
							</span>
						) : (
							<span style={{ width: "100%" }}>{displayElement.content}</span>
						)}
					</div>
				</div>
			);
		}

		if (element.type === "markdown") {
			const scaleRatio = previewDimensions.width / canvasSize.width;
			const isDraggingThisElement =
				dragState.isDragging && dragState.elementId === element.id;
			const displayX = isDraggingThisElement ? dragState.currentX : element.x;
			const displayY = isDraggingThisElement ? dragState.currentY : element.y;

			return (
				<div
					key={elementKey}
					className="absolute cursor-grab"
					onClick={(event) =>
						onElementSelect({
							elementId: element.id,
							multi: event.shiftKey || event.metaKey,
						})
					}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") {
							return;
						}
						event.preventDefault();
						onElementSelect({
							elementId: element.id,
							multi: event.shiftKey || event.metaKey,
						});
					}}
					onPointerDown={(event) =>
						onTextPointerDown(event, element, elementData.track.id)
					}
					tabIndex={0}
					role="button"
					aria-label={`Markdown: ${element.name}`}
					style={{
						left: `${50 + (displayX / canvasSize.width) * 100}%`,
						top: `${50 + (displayY / canvasSize.height) * 100}%`,
						width: `${(element.width ?? 720) * scaleRatio}px`,
						height: `${(element.height ?? 420) * scaleRatio}px`,
						transform: `translate(-50%, -50%) rotate(${element.rotation ?? 0}deg)`,
						opacity: element.opacity ?? 1,
						zIndex: index + 1,
					}}
				>
					<MarkdownOverlay
						element={element}
						currentTime={currentTime}
						canvasScale={scaleRatio}
					/>
				</div>
			);
		}

		if (element.type === "captions") {
			const canvasScale = previewDimensions.width / canvasSize.width;
			const segment = {
				id: 0,
				seek: element.startTime * 1000,
				start: element.startTime,
				end: element.startTime + element.duration,
				text: element.text,
				tokens: [],
				temperature: 0,
				avg_logprob: -0.5,
				compression_ratio: 1,
				no_speech_prob: Math.min(1, Math.max(0, 1 - (element.confidence ?? 1))),
			};
			const words = (element.words ?? []).map((word) => ({
				id: word.id,
				text: word.text,
				start: word.start,
				end: word.end,
				type: word.type,
				speaker_id: word.speakerId,
				filterState: WORD_FILTER_STATE.NONE,
			}));
			return (
				<div
					key={elementKey}
					className="absolute inset-0 pointer-events-none"
					style={{ zIndex: index + 1 }}
				>
					<CaptionsDisplay
						segments={[segment]}
						currentTime={currentTime}
						isVisible
						subtitleStyle={element.style}
						words={words}
						canvasScale={canvasScale}
					/>
				</div>
			);
		}

		if (element.type === "sticker") {
			return (
				<TimelineStickerLayer
					key={elementKey}
					element={element}
					elementOrder={index}
					mediaItems={mediaItems}
				/>
			);
		}

		if (element.type === "media") {
			const previewAudioElement =
				audioCrossfadeState?.previewElement ?? element;
			const previewAudioGain = audioCrossfadeState?.gain ?? 1;
			const audioPlaybackWindow =
				audioCrossfadeState?.playbackWindow ?? transitionState?.playbackWindow;
			const transitionPresentation = transitionState
				? getClipTransitionLayerPresentation({
						transition: transitionState.transition,
						role: transitionState.role,
						progress: transitionState.progress,
						canvasWidth: canvasSize.width,
						canvasHeight: canvasSize.height,
					})
				: {
						opacity: 1,
						contentOpacity: 1,
						offsetX: 0,
						offsetY: 0,
					};
			const transitionFilter = buildClipTransitionCssFilter({
				presentation: transitionPresentation,
			});
			const transitionMaskStyle = buildClipTransitionMaskStyle({
				presentation: transitionPresentation,
			});
			const transitionOverlayStyle = buildClipTransitionOverlayStyle({
				presentation: transitionPresentation,
			});
			if (!mediaItem || element.mediaId === TEST_MEDIA_ID) {
				return (
					<div
						key={elementKey}
						className="absolute inset-0 bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center"
						style={{
							zIndex: index + 1,
							opacity: transitionPresentation.opacity,
							clipPath: transitionPresentation.clipPath,
							backgroundColor: transitionPresentation.backgroundColor,
							filter: transitionFilter,
							transform: buildClipTransitionCssTransform({
								presentation: transitionPresentation,
							}),
							transformOrigin:
								transitionPresentation.transformOrigin ?? "center",
							...transitionMaskStyle,
						}}
					>
						<div className="text-center">
							<div className="text-2xl mb-2">🎬</div>
							<p className="text-xs text-foreground">{element.name}</p>
						</div>
						{transitionOverlayStyle ? (
							<div aria-hidden="true" style={transitionOverlayStyle} />
						) : null}
					</div>
				);
			}
			const selectedAudioSources = selectMediaAudioSources({
				element,
				bypassed: audioPreviewBypassed,
			});
			const hasDerivedAudio = selectedAudioSources.some(
				(source) => source.source !== "original"
			);
			const transitionMuted = Boolean(
				transitionState && !transitionState.isAudible && !audioCrossfadeState
			);
			const derivedAudioPlayers =
				hasDerivedAudio && !transitionMuted
					? selectedAudioSources.flatMap((selectedSource, sourceIndex) => {
							const selectedMedia = mediaItems.find(
								(item) => item.id === selectedSource.mediaId
							);
							const src = selectedMedia?.url || selectedMedia?.originalUrl;
							if (!src) return [];
							const derivedElement = createDerivedAudioElement({
								element,
								selectedSource,
								index: sourceIndex,
							});
							const previewDerivedElement = audioCrossfadeState
								? {
										...derivedElement,
										startTime: previewAudioElement.startTime,
										trimStart: previewAudioElement.trimStart,
										trimEnd: previewAudioElement.trimEnd,
									}
								: derivedElement;
							return [
								<AudioPlayer
									key={derivedElement.id}
									src={src}
									clipStartTime={previewAudioElement.startTime}
									trimStart={previewAudioElement.trimStart}
									trimEnd={previewAudioElement.trimEnd}
									clipDuration={previewAudioElement.duration}
									trackMuted={elementData.track.muted}
									trackId={elementData.track.id}
									previewGain={previewAudioGain}
									playbackWindow={audioPlaybackWindow}
									element={previewDerivedElement}
								/>,
							];
						})
					: [];

			if (mediaItem.type === "video") {
				const source = videoSourcesById.get(mediaItem.id) ?? null;
				if (!source) {
					return (
						<div
							key={elementKey}
							className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs"
							style={{ width: "100%", height: "100%" }}
						>
							No available video source
						</div>
					);
				}

				const isDraggingThisElement =
					dragState.isDragging && dragState.elementId === element.id;
				const visual = previewMediaVisual;
				if (!visual) return null;
				const proxyReady =
					enhancementProxy.status === "ready" && Boolean(enhancementProxy.url);
				const visualSource = enhancementProxyVideoSource ?? source;
				const nativePreviewUrl = isPlaying
					? undefined
					: nativeEnhancementPreview.url;
				const usesNativeEnhancement = proxyReady || Boolean(nativePreviewUrl);
				const mediaAnimation = getMediaAnimationState({
					element,
					currentTime,
					canvasWidth: canvasSize.width,
					canvasHeight: canvasSize.height,
				});
				const effectMotion = mergeEffectMotionWithAudioReactive({
					motion: getEffectMotionState({
						program: effectRendering.renderProgram,
						localTime: Math.max(0, currentTime - element.startTime),
						duration: getMediaTimelineDuration(element),
						canvasWidth: canvasSize.width,
						canvasHeight: canvasSize.height,
					}),
					audioReactive,
				});
				const displayX = isDraggingThisElement ? dragState.currentX : visual.x;
				const displayY = isDraggingThisElement ? dragState.currentY : visual.y;
				const previewWidth = previewDimensions.width || canvasSize.width;
				const previewHeight = previewDimensions.height || canvasSize.height;
				const perspectiveTransform = buildCssPerspectiveTransform({
					width: previewWidth,
					height: previewHeight,
					perspective: visual.perspective,
				});
				const usesPixelColor = hasMediaColorEdits({ settings: visual.color });
				const enhancementFilter = buildMediaEnhancementCssFilter(
					visual.enhancements
				);
				const chromaKeyFilter = isColorPickerTarget
					? ""
					: buildMediaChromaKeyCssFilter(visual.chromaKey);
				const combinedFilter = [
					usesNativeEnhancement ? "" : enhancementFilter,
					chromaKeyFilter,
					effectFilterStyle,
				]
					.filter(Boolean)
					.join(" ");
				const generatedMask = visual.masks.find(
					(mask) => mask.enabled !== false && Boolean(mask.sourceMediaId)
				);
				const generatedMaskSource = generatedMask?.sourceMediaId
					? videoSourcesById.get(generatedMask.sourceMediaId)
					: undefined;
				const geometricMasks = generatedMaskSource
					? visual.masks.filter((mask) => !mask.sourceMediaId)
					: visual.masks;
				const gradeMaskIds = visual.color.mask.enabled
					? new Set(visual.color.mask.maskIds)
					: new Set<string>();
				const outputMasks = geometricMasks.filter(
					(mask) => !mask.id || !gradeMaskIds.has(mask.id)
				);
				const maskStyle = buildMediaMaskStyle(
					outputMasks,
					visual.customCutout,
					Math.max(
						0,
						Math.round(
							(currentTime - element.startTime) * (activeProject?.fps ?? 30)
						)
					)
				);
				const maskStrokeFilter = buildMediaMaskStrokeCssFilter({
					masks: visual.masks,
				});
				const sourceVideoId = generatedMaskSource
					? `${mediaItem.id}-mask-${generatedMask?.sourceMediaId}`
					: mediaItem.id;
				const nativePreviewId = `${sourceVideoId}-native-enhancement`;
				const colorPreviewSourceSelector = nativePreviewUrl
					? `img[data-native-enhancement-id="${nativePreviewId.replaceAll('"', '\\"')}"]`
					: `video[data-video-id="${sourceVideoId.replaceAll('"', '\\"')}"]`;
				const selectedMask =
					isEditingMask && selectedMaskElementId === element.id
						? visual.masks.find((mask) => mask.id === selectedMaskId)
						: undefined;

				return (
					<div
						key={elementKey}
						className="absolute cursor-grab"
						onClick={(event) =>
							onElementSelect({
								elementId: element.id,
								multi: event.shiftKey || event.metaKey,
							})
						}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							onElementSelect({
								elementId: element.id,
								multi: event.shiftKey || event.metaKey,
							});
						}}
						tabIndex={0}
						role="button"
						aria-label={`Video: ${element.name}`}
						style={{
							left: `${50 + ((displayX + mediaAnimation.offsetX + effectMotion.offsetX + transitionPresentation.offsetX) / canvasSize.width) * 100}%`,
							top: `${50 + ((displayY + mediaAnimation.offsetY + effectMotion.offsetY + transitionPresentation.offsetY) / canvasSize.height) * 100}%`,
							width: "100%",
							height: "100%",
							transform: buildClipTransitionAnchoredTransform({
								presentation: transitionPresentation,
								rotation: visual.rotation + effectMotion.rotation,
								scaleX:
									visual.scaleX *
									mediaAnimation.scale *
									effectMotion.scale *
									(visual.flipHorizontal ? -1 : 1),
								scaleY:
									visual.scaleY *
									mediaAnimation.scale *
									effectMotion.scale *
									(visual.flipVertical ? -1 : 1),
							}),
							transformOrigin:
								transitionPresentation.transformOrigin ?? "center",
							filter:
								[transitionFilter, maskStrokeFilter]
									.filter(Boolean)
									.join(" ") || undefined,
							opacity:
								visual.opacity *
								mediaAnimation.opacity *
								effectMotion.opacity *
								transitionPresentation.opacity,
							mixBlendMode: visual.blendMode,
							zIndex: index + 1,
							clipPath: transitionPresentation.clipPath,
							backgroundColor: transitionPresentation.backgroundColor,
							...transitionMaskStyle,
						}}
					>
						<div
							className="size-full"
							data-native-enhancement-preview-status={
								nativeEnhancementPreview.status
							}
							data-video-enhancement-proxy-status={enhancementProxy.status}
							data-video-enhancement-proxy-progress={Math.round(
								enhancementProxy.progress * 100
							)}
							style={{
								...buildClipTransitionContentStyle({
									presentation: transitionPresentation,
									baseTransform: perspectiveTransform,
								}),
								clipPath: `inset(${visual.crop.top * 100}% ${visual.crop.right * 100}% ${visual.crop.bottom * 100}% ${visual.crop.left * 100}%)`,
								transformOrigin:
									transitionPresentation.pixelScale &&
									transitionPresentation.pixelScale > 1
										? "top left"
										: "0 0",
								...maskStyle,
							}}
						>
							<VideoPlayer
								videoSource={generatedMaskSource ?? visualSource}
								poster={
									generatedMaskSource ? undefined : mediaItem.thumbnailUrl
								}
								clipStartTime={previewAudioElement.startTime}
								trimStart={previewAudioElement.trimStart}
								trimEnd={previewAudioElement.trimEnd}
								clipDuration={previewAudioElement.duration}
								clipVolume={
									transitionMuted || generatedMaskSource || hasDerivedAudio
										? 0
										: audioPreviewBypassed
											? 1
											: (element.volume ?? 1)
								}
								fadeIn={audioPreviewBypassed ? 0 : (element.audioFadeIn ?? 0)}
								fadeOut={audioPreviewBypassed ? 0 : (element.audioFadeOut ?? 0)}
								clipPlaybackRate={element.playbackRate ?? 1}
								timingElement={previewAudioElement}
								trackId={elementData.track.id}
								trackMuted={elementData.track.muted}
								previewGain={previewAudioGain}
								playbackWindow={audioPlaybackWindow}
								videoId={sourceVideoId}
								sourceTimeOffset={
									proxyReady ? enhancementProxy.sourceTimeOffset : 0
								}
								style={{
									objectFit: visual.fitMode,
									filter: combinedFilter || undefined,
									opacity: nativePreviewUrl || usesPixelColor ? 0 : undefined,
								}}
							/>
							{nativePreviewUrl ? (
								<img
									src={nativePreviewUrl}
									alt=""
									className="absolute inset-0 size-full"
									data-native-enhancement-id={nativePreviewId}
									data-native-enhancement-preview="ready"
									style={{
										objectFit: "fill",
										filter: combinedFilter || undefined,
										opacity: usesPixelColor ? 0 : undefined,
									}}
								/>
							) : null}
							{usesPixelColor || isColorPickerTarget ? (
								<ColorPreviewCanvas
									sourceSelector={colorPreviewSourceSelector}
									settings={visual.color}
									masks={geometricMasks}
									fitMode={visual.fitMode}
									frameSeed={Math.round(
										currentTime * (activeProject?.fps ?? 30)
									)}
									filter={combinedFilter || undefined}
								/>
							) : null}
							<EffectCompositeCanvas
								program={effectRendering.renderProgram}
								sourceSelector={colorPreviewSourceSelector}
								fitMode={visual.fitMode}
							/>
							<EffectPersonTrackingCanvas
								program={effectRendering.renderProgram}
								sourceSelector={colorPreviewSourceSelector}
								fitMode={visual.fitMode}
							/>
							{enhancementProxy.status === "generating" ? (
								<div
									className="pointer-events-none absolute right-2 top-2 z-30 flex h-6 min-w-12 items-center justify-center gap-1 rounded-sm bg-background/85 px-1.5 text-[10px] tabular-nums text-foreground shadow-sm"
									title="Generating enhanced playback proxy"
								>
									<LoaderCircle className="size-3.5 animate-spin">
										<title>Generating enhanced playback proxy</title>
									</LoaderCircle>
									<span>{Math.round(enhancementProxy.progress * 100)}%</span>
								</div>
							) : nativeEnhancementPreview.status === "rendering" ? (
								<div
									className="pointer-events-none absolute right-2 top-2 z-30 flex size-6 items-center justify-center rounded-sm bg-background/80 text-foreground shadow-sm"
									title="Rendering high-quality preview"
								>
									<LoaderCircle className="size-3.5 animate-spin">
										<title>Rendering high-quality preview</title>
									</LoaderCircle>
								</div>
							) : null}
							{enhancementProxy.status === "error" ? (
								<div
									className="absolute right-2 top-2 z-30 flex size-6 cursor-pointer items-center justify-center rounded-sm bg-destructive/85 text-destructive-foreground shadow-sm"
									title={enhancementProxy.error ?? "Playback proxy failed"}
									onClick={(event) => {
										event.stopPropagation();
										enhancementProxy.retry();
									}}
									onPointerDown={(event) => event.stopPropagation()}
									onKeyDown={(event) => {
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										event.stopPropagation();
										enhancementProxy.retry();
									}}
									role="button"
									tabIndex={0}
								>
									<TriangleAlert className="size-3.5">
										<title>Retry enhanced playback proxy</title>
									</TriangleAlert>
								</div>
							) : nativeEnhancementPreview.status === "error" ? (
								<div
									className="pointer-events-none absolute right-2 top-2 z-30 flex size-6 items-center justify-center rounded-sm bg-destructive/85 text-destructive-foreground shadow-sm"
									title={
										nativeEnhancementPreview.error ??
										"High-quality preview failed"
									}
								>
									<TriangleAlert className="size-3.5">
										<title>High-quality preview failed</title>
									</TriangleAlert>
								</div>
							) : null}
							{generatedMaskSource && !hasDerivedAudio ? (
								<VideoPlayer
									videoSource={source}
									clipStartTime={previewAudioElement.startTime}
									trimStart={previewAudioElement.trimStart}
									trimEnd={previewAudioElement.trimEnd}
									clipDuration={previewAudioElement.duration}
									clipVolume={
										transitionMuted
											? 0
											: audioPreviewBypassed
												? 1
												: (element.volume ?? 1)
									}
									fadeIn={audioPreviewBypassed ? 0 : (element.audioFadeIn ?? 0)}
									fadeOut={
										audioPreviewBypassed ? 0 : (element.audioFadeOut ?? 0)
									}
									clipPlaybackRate={element.playbackRate ?? 1}
									timingElement={previewAudioElement}
									trackId={elementData.track.id}
									trackMuted={elementData.track.muted}
									previewGain={previewAudioGain}
									playbackWindow={audioPlaybackWindow}
									videoId={`${mediaItem.id}-mask-audio`}
									className="pointer-events-none absolute inset-0 opacity-0"
								/>
							) : null}
							{derivedAudioPlayers}
						</div>
						<EffectOverlayLayers
							program={effectRendering.renderProgram}
							parameters={effectRendering.parameters}
						/>
						<EffectParticleCanvas program={effectRendering.renderProgram} />
						{transitionOverlayStyle ? (
							<div aria-hidden="true" style={transitionOverlayStyle} />
						) : null}
						<CustomCutoutOverlay
							element={element}
							trackId={elementData.track.id}
							currentFrame={Math.max(
								0,
								Math.round(
									(currentTime - element.startTime) * (activeProject?.fps ?? 30)
								)
							)}
						/>
						{selectedMask ? (
							<MediaMaskOverlay
								element={element}
								trackId={elementData.track.id}
								mask={selectedMask}
								currentTime={currentTime}
								fps={activeProject?.fps ?? 30}
							/>
						) : null}
					</div>
				);
			}

			if (mediaItem.type === "image") {
				if (!mediaItem.url) {
					return null;
				}
				const visual = resolveMediaKeyframes({
					element,
					currentTime,
					fps: activeProject?.fps ?? 30,
				});
				const effectMotion = mergeEffectMotionWithAudioReactive({
					motion: getEffectMotionState({
						program: effectRendering.renderProgram,
						localTime: Math.max(0, currentTime - element.startTime),
						duration: getMediaTimelineDuration(element),
						canvasWidth: canvasSize.width,
						canvasHeight: canvasSize.height,
					}),
					audioReactive,
				});
				const usesPixelColor = hasMediaColorEdits({ settings: visual.color });
				const gradeMaskIds = visual.color.mask.enabled
					? new Set(visual.color.mask.maskIds)
					: new Set<string>();
				const outputMasks = visual.masks.filter(
					(mask) => !mask.id || !gradeMaskIds.has(mask.id)
				);
				const maskStyle = buildMediaMaskStyle(
					outputMasks,
					visual.customCutout,
					Math.max(
						0,
						Math.round(
							(currentTime - element.startTime) * (activeProject?.fps ?? 30)
						)
					)
				);
				const maskStrokeFilter = buildMediaMaskStrokeCssFilter({
					masks: visual.masks,
				});
				const selectedMask =
					isEditingMask && selectedMaskElementId === element.id
						? visual.masks.find((mask) => mask.id === selectedMaskId)
						: undefined;

				if (element.width !== undefined) {
					const scaleRatio = previewDimensions.width / canvasSize.width;
					const isDraggingThisElement =
						dragState.isDragging && dragState.elementId === element.id;
					const displayX = isDraggingThisElement
						? dragState.currentX
						: (element.x ?? 0);
					const displayY = isDraggingThisElement
						? dragState.currentY
						: (element.y ?? 0);
					const currentWidth = element.width ?? 200;
					const currentHeight = element.height ?? 200;

					return (
						<div
							key={elementKey}
							className="absolute cursor-grab"
							onClick={(event) =>
								onElementSelect({
									elementId: element.id,
									multi: event.shiftKey || event.metaKey,
								})
							}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") {
									return;
								}
								event.preventDefault();
								onElementSelect({
									elementId: element.id,
									multi: event.shiftKey || event.metaKey,
								});
							}}
							onPointerDown={(event) =>
								onTextPointerDown(event, element, elementData.track.id)
							}
							onWheel={(event) => {
								event.stopPropagation();
								const delta = event.deltaY > 0 ? -20 : 20;
								const aspect = currentWidth / currentHeight;
								const nextWidth = Math.max(
									30,
									Math.min(canvasSize.width, currentWidth + delta)
								);
								const nextHeight = nextWidth / aspect;

								onElementResize({
									elementId: element.id,
									width: nextWidth,
									height: nextHeight,
								});
							}}
							tabIndex={0}
							role="button"
							aria-label={`Sticker: ${element.name}`}
							style={{
								left: `${50 + ((displayX + effectMotion.offsetX + transitionPresentation.offsetX) / canvasSize.width) * 100}%`,
								top: `${50 + ((displayY + effectMotion.offsetY + transitionPresentation.offsetY) / canvasSize.height) * 100}%`,
								width: `${currentWidth * scaleRatio}px`,
								height: `${currentHeight * scaleRatio}px`,
								transform: buildClipTransitionAnchoredTransform({
									presentation: transitionPresentation,
									rotation: (element.rotation ?? 0) + effectMotion.rotation,
									scaleX: effectMotion.scale,
									scaleY: effectMotion.scale,
								}),
								transformOrigin:
									transitionPresentation.transformOrigin ?? "center",
								filter:
									[transitionFilter, maskStrokeFilter]
										.filter(Boolean)
										.join(" ") || undefined,
								zIndex: index + 1,
								opacity: transitionPresentation.opacity * effectMotion.opacity,
								clipPath: transitionPresentation.clipPath,
								backgroundColor: transitionPresentation.backgroundColor,
								...transitionMaskStyle,
							}}
						>
							<div
								className="size-full"
								style={buildClipTransitionContentStyle({
									presentation: transitionPresentation,
								})}
							>
								<img
									src={mediaItem.url}
									alt={mediaItem.name}
									className="w-full h-full object-contain"
									style={{
										...maskStyle,
										filter: effectFilterStyle || undefined,
										opacity: usesPixelColor ? 0 : undefined,
									}}
									data-color-source="true"
									draggable={false}
								/>
								{usesPixelColor || isColorPickerTarget ? (
									<ColorPreviewCanvas
										sourceSelector='img[data-color-source="true"]'
										settings={visual.color}
										masks={visual.masks}
										fitMode="contain"
										filter={effectFilterStyle || undefined}
										frameSeed={Math.round(
											currentTime * (activeProject?.fps ?? 30)
										)}
									/>
								) : null}
								<EffectCompositeCanvas
									program={effectRendering.renderProgram}
									sourceSelector='img[data-color-source="true"]'
									fitMode="contain"
								/>
								<EffectPersonTrackingCanvas
									program={effectRendering.renderProgram}
									sourceSelector='img[data-color-source="true"]'
									fitMode="contain"
								/>
							</div>
							<EffectOverlayLayers
								program={effectRendering.renderProgram}
								parameters={effectRendering.parameters}
							/>
							<EffectParticleCanvas program={effectRendering.renderProgram} />
							{transitionOverlayStyle ? (
								<div aria-hidden="true" style={transitionOverlayStyle} />
							) : null}
							{selectedMask ? (
								<MediaMaskOverlay
									element={element}
									trackId={elementData.track.id}
									mask={selectedMask}
									currentTime={currentTime}
									fps={activeProject?.fps ?? 30}
								/>
							) : null}
						</div>
					);
				}

				return (
					<div
						key={elementKey}
						className="absolute inset-0 flex items-center justify-center"
						style={{
							zIndex: index + 1,
							opacity: transitionPresentation.opacity * effectMotion.opacity,
							clipPath: transitionPresentation.clipPath,
							backgroundColor: transitionPresentation.backgroundColor,
							filter:
								[transitionFilter, maskStrokeFilter]
									.filter(Boolean)
									.join(" ") || undefined,
							transform: [
								buildClipTransitionCssTransform({
									presentation: transitionPresentation,
								}),
								`translate3d(${effectMotion.offsetX}px, ${effectMotion.offsetY}px, 0)`,
								`rotate(${effectMotion.rotation}deg)`,
								`scale(${effectMotion.scale})`,
							].join(" "),
							transformOrigin:
								transitionPresentation.transformOrigin ?? "center",
							...transitionMaskStyle,
						}}
					>
						<div
							className="size-full"
							style={buildClipTransitionContentStyle({
								presentation: transitionPresentation,
							})}
						>
							<img
								src={mediaItem.url}
								alt={mediaItem.name}
								className="w-full h-full object-cover"
								style={{
									...maskStyle,
									filter: effectFilterStyle || undefined,
									opacity: usesPixelColor ? 0 : undefined,
								}}
								data-color-source="true"
								draggable={false}
							/>
							{usesPixelColor || isColorPickerTarget ? (
								<ColorPreviewCanvas
									sourceSelector='img[data-color-source="true"]'
									settings={visual.color}
									masks={visual.masks}
									fitMode="cover"
									filter={effectFilterStyle || undefined}
									frameSeed={Math.round(
										currentTime * (activeProject?.fps ?? 30)
									)}
								/>
							) : null}
							<EffectCompositeCanvas
								program={effectRendering.renderProgram}
								sourceSelector='img[data-color-source="true"]'
								fitMode="cover"
							/>
							<EffectPersonTrackingCanvas
								program={effectRendering.renderProgram}
								sourceSelector='img[data-color-source="true"]'
								fitMode="cover"
							/>
						</div>
						<EffectOverlayLayers
							program={effectRendering.renderProgram}
							parameters={effectRendering.parameters}
						/>
						<EffectParticleCanvas program={effectRendering.renderProgram} />
						{transitionOverlayStyle ? (
							<div aria-hidden="true" style={transitionOverlayStyle} />
						) : null}
						{selectedMask ? (
							<MediaMaskOverlay
								element={element}
								trackId={elementData.track.id}
								mask={selectedMask}
								currentTime={currentTime}
								fps={activeProject?.fps ?? 30}
							/>
						) : null}
					</div>
				);
			}

			if (mediaItem.type === "audio") {
				if (!mediaItem.url && !mediaItem.originalUrl && !hasDerivedAudio) {
					return null;
				}

				return (
					<div key={elementKey} className="absolute inset-0">
						{hasDerivedAudio ? (
							derivedAudioPlayers
						) : (
							<AudioPlayer
								src={mediaItem.url || mediaItem.originalUrl || ""}
								clipStartTime={previewAudioElement.startTime}
								trimStart={previewAudioElement.trimStart}
								trimEnd={previewAudioElement.trimEnd}
								clipDuration={previewAudioElement.duration}
								trackMuted={elementData.track.muted}
								trackId={elementData.track.id}
								previewGain={previewAudioGain}
								playbackWindow={audioPlaybackWindow}
								element={previewAudioElement}
							/>
						)}
					</div>
				);
			}
		}

		if (element.type === "remotion") {
			// Offset into the Remotion composition by trimStart so a trimmed/split
			// element starts playback at the correct internal frame.
			const localTime = currentTime - element.startTime;
			const fps = activeProject?.fps ?? 30;
			const currentFrame = Math.max(
				0,
				Math.floor((localTime + element.trimStart) * fps)
			);

			return (
				<div
					key={elementKey}
					className="absolute inset-0"
					style={{ zIndex: index + 1 }}
				>
					<RemotionPreview
						elementId={element.id}
						componentId={element.componentId}
						inputProps={element.props}
						showControls={false}
						autoPlay={false}
						loop={false}
						width={previewDimensions.width}
						height={previewDimensions.height}
						maxWidth={previewDimensions.width}
						maxHeight={previewDimensions.height}
						externalFrame={currentFrame}
						externalIsPlaying={isPlaying}
					/>
				</div>
			);
		}

		return null;
	} catch {
		return null;
	}
}
