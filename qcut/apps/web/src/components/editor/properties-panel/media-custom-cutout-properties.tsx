import {
	Brush,
	Eraser,
	Loader2,
	MousePointer2,
	Trash2,
	Undo2,
	WandSparkles,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildGeneratedMaskStack } from "@/lib/segmentation/generated-mask-attachment";
import { generateSam3VideoMask } from "@/lib/segmentation/sam3-video-mask";
import {
	DEFAULT_MEDIA_CUSTOM_CUTOUT,
	compositionPointToSourcePixel,
	customCutoutSignature,
	normalizeMediaCustomCutout,
	sampleCustomCutoutStroke,
} from "@/lib/video/media-custom-cutout";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { mapMediaTimelineTime } from "@/lib/video/video-timing";
import { useCustomCutoutEditorStore } from "@/stores/editor/custom-cutout-editor-store";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaCustomCutout, MediaElement } from "@/types/timeline";
import {
	ColorIconButton,
	ColorModuleSection,
	ColorNumberControl,
} from "./color-property-controls";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

export function MediaCustomCutoutProperties({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
}) {
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
	const editorElementId = useCustomCutoutEditorStore(
		(state) => state.elementId
	);
	const editing = useCustomCutoutEditorStore((state) => state.editing);
	const tool = useCustomCutoutEditorStore((state) => state.tool);
	const brushSize = useCustomCutoutEditorStore((state) => state.brushSize);
	const startEditing = useCustomCutoutEditorStore(
		(state) => state.startEditing
	);
	const stopEditing = useCustomCutoutEditorStore((state) => state.stopEditing);
	const setTool = useCustomCutoutEditorStore((state) => state.setTool);
	const setBrushSize = useCustomCutoutEditorStore(
		(state) => state.setBrushSize
	);
	const interactionActive = useRef(false);
	const settings = normalizeMediaCustomCutout(element.customCutout);
	const currentFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	const editingThisClip = editing && editorElementId === element.id;
	const correctionFrames = [
		...new Set(settings.strokes.map((stroke) => stroke.frame)),
	].sort((left, right) => left - right);

	const persist = ({
		next,
		masks,
		history = !interactionActive.current,
	}: {
		next: MediaCustomCutout;
		masks?: MediaUpdates["masks"];
		history?: boolean;
	}) => {
		updateMediaElement(
			trackId,
			element.id,
			masks ? { customCutout: next, masks } : { customCutout: next },
			history
		);
	};
	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const setResultMaskEnabled = ({ enabled }: { enabled: boolean }) =>
		resolveMediaMasks(element).map((mask) =>
			mask.id === settings.resultMaskId ? { ...mask, enabled } : mask
		);
	const setEnabled = ({ enabled }: { enabled: boolean }) => {
		persist({
			next: { ...settings, enabled },
			masks: setResultMaskEnabled({
				enabled: enabled && !settings.applyStrokes,
			}),
		});
		if (!enabled) stopEditing();
	};
	const removeResult = () => {
		const masks = resolveMediaMasks(element).filter(
			(mask) => mask.id !== settings.resultMaskId
		);
		persist({
			next: {
				...settings,
				applyStrokes: true,
				status: "idle",
				error: undefined,
				sourceMediaId: undefined,
				resultMaskId: undefined,
				generatedFrom: undefined,
			},
			masks,
		});
	};
	const reset = () => {
		const masks = resolveMediaMasks(element).filter(
			(mask) => mask.id !== settings.resultMaskId
		);
		persist({
			next: { ...DEFAULT_MEDIA_CUSTOM_CUTOUT, strokes: [] },
			masks,
		});
		stopEditing();
	};
	const updateStrokes = ({
		strokes,
	}: {
		strokes: MediaCustomCutout["strokes"];
	}) => {
		persist({
			next: {
				...settings,
				applyStrokes: true,
				strokes,
				status: "idle",
				error: undefined,
			},
			masks: setResultMaskEnabled({ enabled: false }),
		});
	};
	const runAiCutout = async () => {
		if (!projectId || !mediaItem || settings.status === "processing") return;
		if (!settings.strokes.some((stroke) => stroke.mode === "foreground")) {
			toast.error("Add at least one foreground stroke");
			return;
		}
		const signature = customCutoutSignature({ customCutout: settings });
		if (
			settings.generatedFrom === signature &&
			settings.sourceMediaId &&
			settings.resultMaskId
		) {
			persist({
				next: { ...settings, applyStrokes: false, status: "ready" },
				masks: setResultMaskEnabled({ enabled: true }),
			});
			return;
		}
		const sourceWidth = mediaItem.width ?? canvasSize.width;
		const sourceHeight = mediaItem.height ?? canvasSize.height;
		const sourceFps = mediaItem.fps ?? fps;
		const pointPrompts = settings.strokes.flatMap((stroke) => {
			const timing = mapMediaTimelineTime({
				element,
				localTimelineTime: stroke.frame / fps,
				fps,
			});
			const frameIndex = Math.max(
				0,
				Math.round((element.trimStart + timing.sourceTime) * sourceFps)
			);
			return sampleCustomCutoutStroke({ stroke }).flatMap((point) => {
				const sourcePoint = compositionPointToSourcePixel({
					point,
					fitMode: element.fitMode ?? "cover",
					sourceWidth,
					sourceHeight,
					canvasWidth: canvasSize.width,
					canvasHeight: canvasSize.height,
				});
				return sourcePoint
					? [
							{
								...sourcePoint,
								label:
									stroke.mode === "foreground" ? (1 as const) : (0 as const),
								frame_index: frameIndex,
							},
						]
					: [];
			});
		});
		persist({ next: { ...settings, status: "processing", error: undefined } });
		try {
			const result = await generateSam3VideoMask({
				sourceFile: mediaItem.file,
				pointPrompts,
			});
			const sourceMediaId = await addMediaItem(projectId, {
				name: `Custom cutout: ${element.name}`,
				type: "video",
				file: result.file,
				url: result.url,
				originalUrl: result.originalUrl,
				metadata: {
					source: "sam3-custom-cutout",
					hasAlpha: result.hasAlpha,
					codec: "vp9",
				},
			});
			const resultMaskId = `custom-cutout-result-${element.id}`;
			const stack = buildGeneratedMaskStack({
				element,
				existingMasks: resolveMediaMasks(element).filter(
					(mask) => mask.id !== settings.resultMaskId
				),
				sourceMediaId,
				type: "object",
				source: "sam3",
				name: "Custom cutout",
				trackingSamples: result.trackingSamples,
				currentTime,
				fps,
				generatedId: resultMaskId,
			});
			persist({
				next: {
					...settings,
					applyStrokes: false,
					status: "ready",
					error: undefined,
					sourceMediaId,
					resultMaskId,
					generatedFrom: signature,
				},
				masks: stack.masks,
			});
			useMaskEditorStore.getState().selectMask(element.id, resultMaskId);
			toast.success("Custom cutout attached to selected clip");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			persist({
				next: { ...settings, status: "error", error: message },
				history: false,
			});
			toast.error("Custom cutout failed", { description: message });
		}
	};

	return (
		<ColorModuleSection
			title="Custom cutout"
			enabled={settings.enabled}
			onEnabledChange={(enabled) => setEnabled({ enabled })}
			onReset={reset}
			testId="media-custom-cutout-properties"
		>
			<div className="flex items-center justify-between gap-2">
				<ToggleGroup
					type="single"
					value={tool}
					onValueChange={(value) => {
						if (value) setTool(value as typeof tool);
					}}
					variant="outline"
					size="sm"
					className="justify-start"
				>
					<ToggleGroupItem value="foreground" aria-label="Foreground brush">
						<Brush className="size-3.5" />
					</ToggleGroupItem>
					<ToggleGroupItem value="background" aria-label="Background brush">
						<Brush className="size-3.5 text-destructive" />
					</ToggleGroupItem>
					<ToggleGroupItem value="erase" aria-label="Erase brush strokes">
						<Eraser className="size-3.5" />
					</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex items-center">
					<ColorIconButton
						label="Undo last stroke on this frame"
						onClick={() => {
							const lastIndex = settings.strokes
								.map((stroke) => stroke.frame)
								.lastIndexOf(currentFrame);
							if (lastIndex < 0) return;
							updateStrokes({
								strokes: settings.strokes.filter(
									(_, index) => index !== lastIndex
								),
							});
						}}
						disabled={
							!settings.strokes.some((stroke) => stroke.frame === currentFrame)
						}
					>
						<Undo2 className="size-3.5" />
					</ColorIconButton>
					<ColorIconButton
						label="Clear strokes on this frame"
						onClick={() =>
							updateStrokes({
								strokes: settings.strokes.filter(
									(stroke) => stroke.frame !== currentFrame
								),
							})
						}
						disabled={
							!settings.strokes.some((stroke) => stroke.frame === currentFrame)
						}
					>
						<Trash2 className="size-3.5" />
					</ColorIconButton>
				</div>
			</div>

			<ColorNumberControl
				label="Brush size"
				value={brushSize * 100}
				min={1}
				max={25}
				step={1}
				suffix="%"
				onChange={(value) => setBrushSize(value / 100)}
				onInteractionStart={beginInteraction}
				onInteractionEnd={endInteraction}
			/>

			<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
				<span>Frame {currentFrame}</span>
				<span>{correctionFrames.length} corrections</span>
			</div>

			<Button
				type="button"
				variant={editingThisClip ? "secondary" : "outline"}
				className="w-full"
				onClick={() =>
					editingThisClip ? stopEditing() : startEditing(element.id)
				}
			>
				{editingThisClip ? (
					<MousePointer2 className="size-4" />
				) : (
					<Brush className="size-4" />
				)}
				{editingThisClip ? "Finish brushing" : "Edit on canvas"}
			</Button>

			<Button
				type="button"
				className="w-full"
				disabled={
					settings.status === "processing" || settings.strokes.length === 0
				}
				onClick={() => void runAiCutout()}
			>
				{settings.status === "processing" ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<WandSparkles className="size-4" />
				)}
				{settings.status === "ready" ? "Regenerate cutout" : "Generate cutout"}
			</Button>

			{settings.resultMaskId ? (
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={removeResult}
				>
					<Trash2 className="size-4" /> Remove generated result
				</Button>
			) : null}

			{settings.status === "error" && settings.error ? (
				<p className="text-xs text-destructive" role="status">
					{settings.error}
				</p>
			) : null}
		</ColorModuleSection>
	);
}
