"use client";

import { AudioPlayer } from "@/components/ui/audio-player";
import { VideoPlayer } from "@/components/ui/video-player";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import { FONT_CLASS_MAP } from "@/lib/font-config";
import type { VideoSource } from "@/lib/media/media-source";
import type { TextElementDragState } from "@/types/editor";
import type { TProject } from "@/types/project";
import type { TimelineElement } from "@/types/timeline";
import { MarkdownOverlay } from "@/components/editor/canvas/markdown-overlay";
import { RemotionPreview } from "./remotion-preview";
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
	onTextPointerDown,
	onElementSelect,
	onElementResize,
}: PreviewElementRendererProps): React.ReactNode {
	try {
		const { element, mediaItem } = elementData;
		const elementKey = `${element.id}-${elementData.track.id}`;

		if (element.type === "text") {
			const fontClassName =
				FONT_CLASS_MAP[element.fontFamily as keyof typeof FONT_CLASS_MAP] || "";

			const scaleRatio = previewDimensions.width / canvasSize.width;
			const isDraggingThisElement =
				dragState.isDragging && dragState.elementId === element.id;
			const displayX = isDraggingThisElement ? dragState.currentX : element.x;
			const displayY = isDraggingThisElement ? dragState.currentY : element.y;

			return (
				<div
					key={elementKey}
					className="absolute flex items-center justify-center cursor-grab"
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
						left: `${50 + (displayX / canvasSize.width) * 100}%`,
						top: `${50 + (displayY / canvasSize.height) * 100}%`,
						transform: `translate(-50%, -50%) rotate(${element.rotation}deg) scale(${scaleRatio})`,
						opacity: element.opacity,
						zIndex: 100 + index,
					}}
				>
					<div
						className={fontClassName}
						style={{
							fontSize: `${element.fontSize}px`,
							color: element.color,
							backgroundColor: element.backgroundColor,
							textAlign: element.textAlign,
							fontWeight: element.fontWeight,
							fontStyle: element.fontStyle,
							textDecoration: element.textDecoration,
							padding: "4px 8px",
							borderRadius: "2px",
							whiteSpace: "nowrap",
							...(fontClassName ? {} : { fontFamily: element.fontFamily }),
						}}
					>
						{element.content}
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

				return (
					<div
						key={elementKey}
						className="absolute inset-0 flex items-center justify-center"
						style={{ width: "100%", height: "100%" }}
					>
						<VideoPlayer
							videoSource={source}
							poster={mediaItem.thumbnailUrl}
							clipStartTime={element.startTime}
							trimStart={element.trimStart}
							trimEnd={element.trimEnd}
							clipDuration={element.duration}
							className="object-cover"
							videoId={mediaItem.id}
							style={shouldApplyFilter ? { filter: filterStyle } : undefined}
						/>
					</div>
				);
			}

			if (mediaItem.type === "image") {
				if (!mediaItem.url) {
					return null;
				}

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
								draggable={false}
							/>
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
							draggable={false}
						/>
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
