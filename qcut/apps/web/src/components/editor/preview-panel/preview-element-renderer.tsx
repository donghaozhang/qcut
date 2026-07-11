"use client";

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
import { resolveMediaKeyframes } from "@/lib/video/video-properties";
import { buildCssPerspectiveTransform } from "@/lib/video/video-perspective";
import {
	buildMediaChromaKeyCssFilter,
	buildMediaEnhancementCssFilter,
	buildMediaMaskStyle,
	getMediaAnimationState,
} from "@/lib/video/video-animation";
import { hasMediaColorEdits } from "@/lib/color/color-properties";
import type { TextElementDragState } from "@/types/editor";
import type { TProject } from "@/types/project";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { MarkdownOverlay } from "@/components/editor/canvas/markdown-overlay";
import { RemotionPreview } from "./remotion-preview";
import { ColorPreviewCanvas } from "./color-preview-canvas";
import type { ActiveElement, PreviewDimensions } from "./types";

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
	filterStyle: string;
	hasEnabledEffects: boolean;
	videoSourcesById: Map<string, VideoSource>;
	currentMediaElement: ActiveElement | null;
	dragState: TextElementDragState;
	isPlaying: boolean;
	activeProject: TProject | null;
	tracks: TimelineTrack[];
	onTextPointerDown: (
		event: React.PointerEvent<HTMLDivElement>,
		element: Pick<TimelineElement, "id" | "x" | "y">,
		trackId: string
	) => void;
	onElementSelect: ({ elementId }: { elementId: string }) => void;
	onElementResize: ({ elementId, width, height }: ElementResizeParams) => void;
}

interface PreviewBlurBackgroundProps {
	activeProject: TProject | null;
	blurBackgroundElements: ActiveElement[];
	blurBackgroundSource: VideoSource;
	currentMediaElement: ActiveElement | null;
	filterStyle: string;
	hasEnabledEffects: boolean;
}

/** Renders a blurred background video layer behind the main preview content. */
export function PreviewBlurBackground({
	activeProject,
	blurBackgroundElements,
	blurBackgroundSource,
	currentMediaElement,
	filterStyle,
	hasEnabledEffects,
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

			const shouldApplyFilter =
				hasEnabledEffects && element.id === currentMediaElement?.element.id;

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
						style={shouldApplyFilter ? { filter: filterStyle } : undefined}
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
	filterStyle,
	hasEnabledEffects,
	videoSourcesById,
	currentMediaElement,
	dragState,
	isPlaying,
	activeProject,
	tracks,
	onTextPointerDown,
	onElementSelect,
	onElementResize,
}: PreviewElementRendererProps): React.ReactNode {
	try {
		const { element, mediaItem } = elementData;
		const elementKey = `${element.id}-${elementData.track.id}`;

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
			const curvedCharacters = getCurvedTextTransforms({
				text: displayElement.content,
				width: Math.max(1, textStyle.width - textStyle.backgroundPadding * 2),
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
					onClick={() => onElementSelect({ elementId: element.id })}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") {
							return;
						}
						event.preventDefault();
						onElementSelect({ elementId: element.id });
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
						width: `${textStyle.width}px`,
						height: `${textStyle.height}px`,
						mixBlendMode: textStyle.blendMode,
						zIndex: 100 + index,
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
					onClick={() => onElementSelect({ elementId: element.id })}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") {
							return;
						}
						event.preventDefault();
						onElementSelect({ elementId: element.id });
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
						zIndex: 95 + index,
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

		if (element.type === "media") {
			if (!mediaItem || element.mediaId === TEST_MEDIA_ID) {
				return (
					<div
						key={elementKey}
						className="absolute inset-0 bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center"
					>
						<div className="text-center">
							<div className="text-2xl mb-2">🎬</div>
							<p className="text-xs text-foreground">{element.name}</p>
						</div>
					</div>
				);
			}

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

				const shouldApplyFilter =
					hasEnabledEffects && element.id === currentMediaElement?.element.id;
				const isDraggingThisElement =
					dragState.isDragging && dragState.elementId === element.id;
				const visual = resolveMediaKeyframes({
					element,
					currentTime,
					fps: activeProject?.fps ?? 30,
				});
				const mediaAnimation = getMediaAnimationState({
					element,
					currentTime,
					canvasWidth: canvasSize.width,
					canvasHeight: canvasSize.height,
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
				const chromaKeyFilter = buildMediaChromaKeyCssFilter(visual.chromaKey);
				const combinedFilter = [
					enhancementFilter,
					chromaKeyFilter,
					shouldApplyFilter ? filterStyle : "",
				]
					.filter(Boolean)
					.join(" ");
				const geometricMasks = visual.masks;
				const gradeMaskIds = visual.color.mask.enabled
					? new Set(visual.color.mask.maskIds)
					: new Set<string>();
				const outputMasks = geometricMasks.filter(
					(mask) => !mask.id || !gradeMaskIds.has(mask.id)
				);
				const maskStyle = buildMediaMaskStyle(outputMasks);
				const sourceVideoId = mediaItem.id;

				return (
					<div
						key={elementKey}
						className="absolute cursor-grab"
						onClick={() => onElementSelect({ elementId: element.id })}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							onElementSelect({ elementId: element.id });
						}}
						onPointerDown={(event) =>
							onTextPointerDown(event, element, elementData.track.id)
						}
						tabIndex={0}
						role="button"
						aria-label={`Video: ${element.name}`}
						style={{
							left: `${50 + ((displayX + mediaAnimation.offsetX) / canvasSize.width) * 100}%`,
							top: `${50 + ((displayY + mediaAnimation.offsetY) / canvasSize.height) * 100}%`,
							width: "100%",
							height: "100%",
							transform: `translate(-50%, -50%) rotate(${visual.rotation}deg) scale(${visual.scaleX * mediaAnimation.scale * (visual.flipHorizontal ? -1 : 1)}, ${visual.scaleY * mediaAnimation.scale * (visual.flipVertical ? -1 : 1)})`,
							transformOrigin: "center",
							opacity: visual.opacity * mediaAnimation.opacity,
							mixBlendMode: visual.blendMode,
							zIndex: 10 + index,
						}}
					>
						<div
							className="size-full"
							style={{
								clipPath: `inset(${visual.crop.top * 100}% ${visual.crop.right * 100}% ${visual.crop.bottom * 100}% ${visual.crop.left * 100}%)`,
								transform: perspectiveTransform,
								transformOrigin: "0 0",
								...maskStyle,
							}}
						>
							<VideoPlayer
								videoSource={source}
								poster={mediaItem.thumbnailUrl}
								clipStartTime={element.startTime}
								trimStart={element.trimStart}
								trimEnd={element.trimEnd}
								clipDuration={element.duration}
								clipVolume={element.volume ?? 1}
								fadeIn={element.audioFadeIn ?? 0}
								fadeOut={element.audioFadeOut ?? 0}
								clipPlaybackRate={element.playbackRate ?? 1}
								timingElement={element}
								videoId={mediaItem.id}
								style={{
									objectFit: visual.fitMode,
									filter: combinedFilter || undefined,
									opacity: usesPixelColor ? 0 : undefined,
								}}
							/>
							{usesPixelColor ? (
								<ColorPreviewCanvas
									sourceSelector={`video[data-video-id="${sourceVideoId.replaceAll('"', '\\"')}"]`}
									settings={visual.color}
									masks={geometricMasks}
									fitMode={visual.fitMode}
									frameSeed={Math.round(
										currentTime * (activeProject?.fps ?? 30)
									)}
									filter={combinedFilter || undefined}
								/>
							) : null}
						</div>
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
				const usesPixelColor = hasMediaColorEdits({ settings: visual.color });
				const gradeMaskIds = visual.color.mask.enabled
					? new Set(visual.color.mask.maskIds)
					: new Set<string>();
				const outputMasks = visual.masks.filter(
					(mask) => !mask.id || !gradeMaskIds.has(mask.id)
				);
				const maskStyle = buildMediaMaskStyle(outputMasks);

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
							onClick={() => onElementSelect({ elementId: element.id })}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") {
									return;
								}
								event.preventDefault();
								onElementSelect({ elementId: element.id });
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
								left: `${50 + (displayX / canvasSize.width) * 100}%`,
								top: `${50 + (displayY / canvasSize.height) * 100}%`,
								width: `${currentWidth * scaleRatio}px`,
								height: `${currentHeight * scaleRatio}px`,
								transform: `translate(-50%, -50%) rotate(${element.rotation ?? 0}deg)`,
								zIndex: 90 + index,
							}}
						>
							<img
								src={mediaItem.url}
								alt={mediaItem.name}
								className="w-full h-full object-contain"
								style={{
									...maskStyle,
									opacity: usesPixelColor ? 0 : undefined,
								}}
								data-color-source="true"
								draggable={false}
							/>
							{usesPixelColor ? (
								<ColorPreviewCanvas
									sourceSelector='img[data-color-source="true"]'
									settings={visual.color}
									masks={visual.masks}
									fitMode="contain"
									frameSeed={Math.round(
										currentTime * (activeProject?.fps ?? 30)
									)}
								/>
							) : null}
						</div>
					);
				}

				return (
					<div
						key={elementKey}
						className="absolute inset-0 flex items-center justify-center"
					>
						<img
							src={mediaItem.url}
							alt={mediaItem.name}
							className="w-full h-full object-cover"
							style={{ ...maskStyle, opacity: usesPixelColor ? 0 : undefined }}
							data-color-source="true"
							draggable={false}
						/>
						{usesPixelColor ? (
							<ColorPreviewCanvas
								sourceSelector='img[data-color-source="true"]'
								settings={visual.color}
								masks={visual.masks}
								fitMode="cover"
								frameSeed={Math.round(currentTime * (activeProject?.fps ?? 30))}
							/>
						) : null}
					</div>
				);
			}

			if (mediaItem.type === "audio") {
				if (!mediaItem.url) {
					return null;
				}

				return (
					<div key={elementKey} className="absolute inset-0">
						<AudioPlayer
							src={mediaItem.url}
							clipStartTime={element.startTime}
							trimStart={element.trimStart}
							trimEnd={element.trimEnd}
							clipDuration={element.duration}
							trackMuted={elementData.track.muted}
						/>
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
					style={{ zIndex: 50 + index }}
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
