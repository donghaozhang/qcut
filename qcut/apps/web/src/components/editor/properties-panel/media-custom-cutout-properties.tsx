import {
	Brush,
	Eraser,
	Loader2,
	MousePointer2,
	Trash2,
	Undo2,
	WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	CutoutTaskStatus,
	isActiveCutoutPhase,
	type CutoutTaskPhase,
} from "@/components/editor/segmentation/CutoutTaskStatus";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CloudTaskStatus } from "@/components/editor/cloud-task-status";
import { estimateSam3TaskCostUsd } from "@/lib/cloud-tasks/task-costs";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
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
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import type { MediaCustomCutout, MediaElement } from "@/types/timeline";
import {
	ColorIconButton,
	ColorModuleSection,
	ColorNumberControl,
} from "./color-property-controls";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

interface CustomCutoutTask {
	phase: CutoutTaskPhase;
	progress: number;
	message: string;
	elapsedTime: number;
	error?: string;
}

const IDLE_CUSTOM_CUTOUT_TASK: CustomCutoutTask = {
	phase: "idle",
	progress: 0,
	message: "",
	elapsedTime: 0,
};

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
	const taskControllerRef = useRef<AbortController | null>(null);
	const activeElementIdRef = useRef<string | null>(element.id);
	const [task, setTask] = useState<CustomCutoutTask>(IDLE_CUSTOM_CUTOUT_TASK);
	const [cloudTaskId, setCloudTaskId] = useState<string>();
	const settings = normalizeMediaCustomCutout(element.customCutout);
	const taskIsActive = isActiveCutoutPhase({ phase: task.phase });
	const currentFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	const editingThisClip = editing && editorElementId === element.id;
	const correctionFrames = [
		...new Set(settings.strokes.map((stroke) => stroke.frame)),
	].sort((left, right) => left - right);

	useEffect(() => {
		activeElementIdRef.current = element.id;
		taskControllerRef.current?.abort();
		setTask(IDLE_CUSTOM_CUTOUT_TASK);
		setCloudTaskId(undefined);

		return () => {
			if (activeElementIdRef.current === element.id) {
				activeElementIdRef.current = null;
			}
			taskControllerRef.current?.abort();
		};
	}, [element.id]);

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
	const runAiCutout = async ({
		existingTaskId,
		resumeRequestId,
	}: {
		existingTaskId?: string;
		resumeRequestId?: string;
	} = {}) => {
		if (!projectId || !mediaItem || taskIsActive) return;
		if (!settings.strokes.some((stroke) => stroke.mode === "foreground")) {
			toast.error("请至少绘制一条保留区域笔画");
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
		const controller = new AbortController();
		taskControllerRef.current = controller;
		const cloudTasks = useCloudTaskStore.getState();
		const taskId =
			existingTaskId ??
			cloudTasks.createTask({
				kind: "sam3",
				label: `自定义抠像：${element.name}`,
				payload: {
					operation: "custom-cutout",
					sourceMediaId: mediaItem.id,
					targetElementId: element.id,
					signature,
				},
				estimatedCostUsd: estimateSam3TaskCostUsd({
					duration: mediaItem.duration ?? element.duration,
				}),
			});
		setCloudTaskId(taskId);
		const retry = () => {
			const current = useCloudTaskStore
				.getState()
				.tasks.find((candidate) => candidate.id === taskId);
			void runAiCutout({
				existingTaskId: taskId,
				resumeRequestId: current?.remoteId,
			});
		};
		const open = () => startEditing(element.id);
		registerCloudTaskRuntimeActions({
			taskId,
			actions: { cancel: () => controller.abort(), retry, open },
		});
		cloudTasks.startTask({
			id: taskId,
			message: resumeRequestId ? "正在继续云端抠像..." : "正在准备源视频...",
		});
		setTask({
			phase: "uploading",
			progress: 0,
			message: "正在准备源视频...",
			elapsedTime: 0,
		});
		persist({ next: { ...settings, status: "processing", error: undefined } });
		try {
			const result = await generateSam3VideoMask({
				sourceFile: mediaItem.file,
				pointPrompts,
				resumeRequestId,
				signal: controller.signal,
				onProgress: (progress) => {
					if (
						activeElementIdRef.current !== element.id ||
						taskControllerRef.current !== controller
					) {
						return;
					}
					if (progress.requestId) {
						useCloudTaskStore.getState().attachRemote({
							id: taskId,
							remoteId: progress.requestId,
						});
					}
					useCloudTaskStore.getState().updateProgress({
						id: taskId,
						progress: progress.progress,
						message: progress.message,
					});
					setTask({
						phase:
							progress.stage === "completed" ? "processing" : progress.stage,
						progress: Math.min(97, progress.progress),
						message:
							progress.stage === "completed"
								? "正在保存自定义蒙版..."
								: progress.message,
						elapsedTime: progress.elapsedTime,
					});
				},
			});
			if (controller.signal.aborted) {
				throw new DOMException("Custom cutout canceled", "AbortError");
			}
			const sourceMediaId = await addMediaItem(projectId, {
				name: `自定义抠像：${element.name}`,
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
			if (controller.signal.aborted) {
				throw new DOMException("Custom cutout canceled", "AbortError");
			}
			const resultMaskId = `custom-cutout-result-${element.id}`;
			const stack = buildGeneratedMaskStack({
				element,
				existingMasks: resolveMediaMasks(element).filter(
					(mask) => mask.id !== settings.resultMaskId
				),
				sourceMediaId,
				type: "object",
				source: "sam3",
				name: "自定义抠像",
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
			if (activeElementIdRef.current === element.id) {
				setTask((current) => ({
					...current,
					phase: "completed",
					progress: 100,
					message: "自定义抠像已应用到所选片段",
				}));
			}
			toast.success("自定义抠像已应用到所选片段");
			useCloudTaskStore.getState().completeTask({
				id: taskId,
				message: "自定义抠像已应用到所选片段",
				output: { sourceMediaId, resultMaskId, targetElementId: element.id },
			});
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					open,
					retry,
					undo: () => {
						const timeline = useTimelineStore.getState();
						const targetTrack = timeline._tracks.find((candidate) =>
							candidate.elements.some(
								(candidateElement) => candidateElement.id === element.id
							)
						);
						const targetElement = targetTrack?.elements.find(
							(candidate) => candidate.id === element.id
						);
						if (!targetTrack || targetElement?.type !== "media") return;
						const currentSettings = normalizeMediaCustomCutout(
							targetElement.customCutout
						);
						timeline.updateMediaElement(
							targetTrack.id,
							targetElement.id,
							{
								masks: resolveMediaMasks(targetElement).filter(
									(mask) => mask.id !== resultMaskId
								),
								customCutout: {
									...currentSettings,
									applyStrokes: true,
									status: "idle",
									error: undefined,
									sourceMediaId: undefined,
									resultMaskId: undefined,
									generatedFrom: undefined,
								},
							},
							true
						);
						useCloudTaskStore.getState().completeTask({
							id: taskId,
							message: "自定义抠像结果已撤销",
							output: { sourceMediaId, resultMaskId, undone: true },
						});
						registerCloudTaskRuntimeActions({
							taskId,
							actions: { open, retry },
						});
						toast.success("已撤销自定义抠像");
					},
				},
			});
		} catch (error) {
			const canceled =
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === "AbortError");
			const message = error instanceof Error ? error.message : String(error);
			persist({
				next: {
					...settings,
					status: canceled ? "idle" : "error",
					error: canceled ? undefined : message,
				},
				history: false,
			});
			if (activeElementIdRef.current === element.id) {
				setTask((current) => ({
					phase: canceled ? "canceled" : "error",
					progress: 0,
					message: canceled ? "自定义抠像已取消" : "自定义抠像失败",
					elapsedTime: current.elapsedTime,
					error: canceled ? undefined : message,
				}));
			}
			if (!canceled) {
				toast.error("自定义抠像失败", { description: message });
			}
			if (canceled) {
				useCloudTaskStore.getState().cancelTask({ id: taskId });
			} else {
				useCloudTaskStore.getState().failTask({ id: taskId, error: message });
			}
		} finally {
			if (taskControllerRef.current === controller) {
				taskControllerRef.current = null;
			}
		}
	};

	return (
		<ColorModuleSection
			title="自定义抠像"
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
					<ToggleGroupItem value="foreground" aria-label="保留区域画笔">
						<Brush className="size-3.5" />
					</ToggleGroupItem>
					<ToggleGroupItem value="background" aria-label="移除区域画笔">
						<Brush className="size-3.5 text-destructive" />
					</ToggleGroupItem>
					<ToggleGroupItem value="erase" aria-label="擦除笔画">
						<Eraser className="size-3.5" />
					</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex items-center">
					<ColorIconButton
						label="撤销当前帧的上一笔"
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
						label="清空当前帧笔画"
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
				label="画笔大小"
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
				<span>第 {currentFrame} 帧</span>
				<span>{correctionFrames.length} 个修正帧</span>
			</div>

			<Button
				type="button"
				variant={editingThisClip ? "secondary" : "outline"}
				className="w-full"
				onClick={() => {
					if (editingThisClip) {
						stopEditing();
						return;
					}
					useMaskEditorStore.getState().clearSelection();
					startEditing(element.id);
				}}
			>
				{editingThisClip ? (
					<MousePointer2 className="size-4" />
				) : (
					<Brush className="size-4" />
				)}
				{editingThisClip ? "完成绘制" : "在画布上编辑"}
			</Button>

			<Button
				type="button"
				className="w-full"
				disabled={taskIsActive || settings.strokes.length === 0}
				onClick={() => void runAiCutout()}
			>
				{taskIsActive ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<WandSparkles className="size-4" />
				)}
				{settings.status === "ready" ? "重新生成抠像" : "生成抠像"}
			</Button>

			<CutoutTaskStatus
				phase={task.phase}
				progress={task.progress}
				message={task.message}
				elapsedTime={task.elapsedTime}
				error={task.error}
				onCancel={() => taskControllerRef.current?.abort()}
				onRetry={() => void runAiCutout({ existingTaskId: cloudTaskId })}
			/>

			<CloudTaskStatus
				taskId={cloudTaskId}
				onCancel={() => taskControllerRef.current?.abort()}
				onRetry={() => void runAiCutout({ existingTaskId: cloudTaskId })}
			/>

			{settings.resultMaskId ? (
				<Button
					type="button"
					variant="outline"
					className="w-full"
					onClick={removeResult}
				>
					<Trash2 className="size-4" /> 移除生成结果
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
