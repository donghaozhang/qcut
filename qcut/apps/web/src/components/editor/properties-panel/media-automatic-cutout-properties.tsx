import { Loader2, ScanSearch, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudTaskStatus } from "@/components/editor/cloud-task-status";
import { LocalPersonCutoutPanel } from "@/components/editor/segmentation/LocalPersonCutoutPanel";
import {
	CutoutTaskStatus,
	isActiveCutoutPhase,
	type CutoutTaskPhase,
} from "@/components/editor/segmentation/CutoutTaskStatus";
import {
	attachGeneratedMask,
	failGeneratedMaskTracking,
} from "@/lib/segmentation/generated-mask-attachment";
import { createObjectURL } from "@/lib/media/blob-manager";
import { estimateSam3TaskCostUsd } from "@/lib/cloud-tasks/task-costs";
import { generateSam3VideoMask } from "@/lib/segmentation/sam3-video-mask";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement } from "@/types/timeline";
import { PropertyGroup, PropertyItemLabel } from "./property-item";

type AutomaticCutoutMode = "person" | "object";

interface ObjectCutoutTask {
	phase: CutoutTaskPhase;
	progress: number;
	message: string;
	elapsedTime: number;
	error?: string;
}

const IDLE_OBJECT_TASK: ObjectCutoutTask = {
	phase: "idle",
	progress: 0,
	message: "",
	elapsedTime: 0,
};

export function MediaAutomaticCutoutProperties({
	element,
}: {
	element: MediaElement;
}) {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
	const setSegmentationSource = useSegmentationStore(
		(state) => state.setSourceVideo
	);
	const [mode, setMode] = useState<AutomaticCutoutMode>("person");
	const [objectPrompt, setObjectPrompt] = useState("");
	const [objectTask, setObjectTask] =
		useState<ObjectCutoutTask>(IDLE_OBJECT_TASK);
	const [objectResultUrl, setObjectResultUrl] = useState<string | null>(null);
	const [activeObjectTaskId, setActiveObjectTaskId] = useState<string>();
	const objectControllerRef = useRef<AbortController | null>(null);
	const objectStartedAtRef = useRef(0);
	const isObjectProcessing = isActiveCutoutPhase({ phase: objectTask.phase });
	const sourceUrl = useMemo(() => {
		if (!mediaItem) return null;
		return (
			mediaItem.url ??
			createObjectURL(mediaItem.file, `properties-cutout-${element.id}`)
		);
	}, [element.id, mediaItem]);
	const sourceFile = mediaItem?.file;
	const resumableTask = useCloudTaskStore((state) =>
		state.tasks.find(
			(task) =>
				task.kind === "sam3" &&
				task.payload.targetElementId === element.id &&
				(task.status === "interrupted" || task.status === "failed")
		)
	);
	const objectCloudTaskId = activeObjectTaskId ?? resumableTask?.id;

	useEffect(() => {
		if (!element.id) return;
		objectControllerRef.current?.abort();
		objectControllerRef.current = null;
		setObjectPrompt("");
		setObjectTask(IDLE_OBJECT_TASK);
		setObjectResultUrl(null);
		setActiveObjectTaskId(undefined);
		if (sourceFile && sourceUrl) {
			setSegmentationSource(sourceFile, sourceUrl);
		}
	}, [element.id, setSegmentationSource, sourceFile, sourceUrl]);

	useEffect(() => {
		if (!isObjectProcessing) return;
		const timer = window.setInterval(() => {
			setObjectTask((current) => ({
				...current,
				elapsedTime: (Date.now() - objectStartedAtRef.current) / 1000,
			}));
		}, 1000);
		return () => window.clearInterval(timer);
	}, [isObjectProcessing]);

	useEffect(
		() => () => {
			objectControllerRef.current?.abort();
		},
		[]
	);

	const runObjectCutout = async ({
		existingTaskId,
		resumeRequestId,
		promptOverride,
	}: {
		existingTaskId?: string;
		resumeRequestId?: string;
		promptOverride?: string;
	} = {}) => {
		const prompt = (promptOverride ?? objectPrompt).trim();
		if (!projectId || !mediaItem || !prompt || isObjectProcessing) return;
		const cloudTasks = useCloudTaskStore.getState();
		const taskId =
			existingTaskId ??
			cloudTasks.createTask({
				kind: "sam3",
				label: `物体跟踪：${prompt}`,
				payload: {
					sourceMediaId: mediaItem.id,
					targetElementId: element.id,
					prompt,
				},
				estimatedCostUsd: estimateSam3TaskCostUsd({
					duration: mediaItem.duration ?? element.duration,
				}),
			});
		setActiveObjectTaskId(taskId);
		const controller = new AbortController();
		objectControllerRef.current = controller;
		const retry = () => {
			const task = useCloudTaskStore
				.getState()
				.tasks.find((candidate) => candidate.id === taskId);
			void runObjectCutout({
				existingTaskId: taskId,
				resumeRequestId: task?.remoteId,
				promptOverride: prompt,
			});
		};
		const open = () => setMode("object");
		registerCloudTaskRuntimeActions({
			taskId,
			actions: { cancel: () => controller.abort(), retry, open },
		});
		objectStartedAtRef.current = Date.now();
		setObjectTask({
			phase: "uploading",
			progress: 0,
			message: "正在准备源视频...",
			elapsedTime: 0,
		});
		cloudTasks.startTask({
			id: taskId,
			message: resumeRequestId ? "正在继续云端跟踪..." : "正在准备源视频...",
		});
		try {
			const result = await generateSam3VideoMask({
				sourceFile: mediaItem.file,
				prompt,
				resumeRequestId,
				signal: controller.signal,
				onProgress: (progress) => {
					if (objectControllerRef.current !== controller) return;
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
					setObjectTask({
						phase:
							progress.stage === "completed" ? "processing" : progress.stage,
						progress: Math.min(97, progress.progress),
						message:
							progress.stage === "completed"
								? "正在保存跟踪蒙版..."
								: progress.message,
						elapsedTime: progress.elapsedTime,
					});
				},
			});
			if (objectControllerRef.current !== controller) return;
			setObjectTask((current) => ({
				...current,
				phase: "processing",
				progress: 98,
				message: "正在保存跟踪蒙版...",
			}));
			const sourceMediaId = await addMediaItem(projectId, {
				name: `跟踪结果：${prompt}`,
				type: "video",
				file: result.file,
				url: result.url,
				originalUrl: result.originalUrl,
				metadata: {
					source: "sam3-video-mask",
					hasAlpha: result.hasAlpha,
					codec: "vp9",
					prompt,
				},
			});
			if (objectControllerRef.current !== controller) return;
			const attached = attachGeneratedMask({
				sourceMediaId,
				type: "object",
				source: "sam3",
				name: `SAM3: ${prompt}`,
				trackingSamples: result.trackingSamples,
				targetElementId: element.id,
			});
			setObjectResultUrl(result.url);
			setObjectTask({
				phase: "completed",
				progress: 100,
				message: attached
					? "物体蒙版已应用到所选片段"
					: "跟踪蒙版已添加到素材库",
				elapsedTime: (Date.now() - objectStartedAtRef.current) / 1000,
			});
			useCloudTaskStore.getState().completeTask({
				id: taskId,
				message: attached
					? "物体蒙版已应用到所选片段"
					: "跟踪蒙版已添加到素材库",
				output: {
					sourceMediaId,
					targetElementId: element.id,
				},
			});
			toast.success(
				attached ? "物体蒙版已应用到所选片段" : "跟踪蒙版已添加到素材库"
			);
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
						timeline.updateMediaElement(
							targetTrack.id,
							targetElement.id,
							{
								masks: resolveMediaMasks(targetElement).filter(
									(mask) => mask.sourceMediaId !== sourceMediaId
								),
							},
							true
						);
						setObjectResultUrl(null);
						useCloudTaskStore.getState().completeTask({
							id: taskId,
							message: "物体蒙版结果已撤销",
							output: {
								sourceMediaId,
								targetElementId: element.id,
								undone: true,
							},
						});
						registerCloudTaskRuntimeActions({
							taskId,
							actions: { open, retry },
						});
						toast.success("已撤销物体蒙版");
					},
				},
			});
		} catch (error) {
			if (objectControllerRef.current !== controller) return;
			const canceled =
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === "AbortError");
			const message = error instanceof Error ? error.message : String(error);
			if (!canceled) failGeneratedMaskTracking({ message });
			if (canceled) {
				useCloudTaskStore.getState().cancelTask({ id: taskId });
			} else {
				useCloudTaskStore.getState().failTask({ id: taskId, error: message });
			}
			setObjectTask({
				phase: canceled ? "canceled" : "error",
				progress: 0,
				message: canceled ? "物体跟踪已取消" : "物体跟踪失败",
				elapsedTime: (Date.now() - objectStartedAtRef.current) / 1000,
				error: canceled ? undefined : message,
			});
			if (!canceled) {
				toast.error("物体跟踪失败", { description: message });
			}
		} finally {
			if (objectControllerRef.current === controller) {
				objectControllerRef.current = null;
			}
		}
	};

	const retryObjectCutout = () => {
		if (!objectCloudTaskId) return;
		const task = useCloudTaskStore
			.getState()
			.tasks.find((candidate) => candidate.id === objectCloudTaskId);
		if (!task) return;
		const storedPrompt =
			typeof task.payload.prompt === "string"
				? task.payload.prompt
				: objectPrompt;
		setObjectPrompt(storedPrompt);
		void runObjectCutout({
			existingTaskId: task.id,
			resumeRequestId: task.remoteId,
			promptOverride: storedPrompt,
		});
	};

	const sourceReady = Boolean(projectId && mediaItem && sourceUrl);

	return (
		<PropertyGroup title="智能抠像" defaultExpanded>
			<Tabs
				value={mode}
				onValueChange={(value) => setMode(value as AutomaticCutoutMode)}
			>
				<TabsList className="grid h-8 w-full grid-cols-2 rounded-sm p-0.5">
					<TabsTrigger value="person" className="gap-1.5 text-xs">
						<UserRound className="size-3.5" />
						本地人物
					</TabsTrigger>
					<TabsTrigger value="object" className="gap-1.5 text-xs">
						<ScanSearch className="size-3.5" />
						云端物体
					</TabsTrigger>
				</TabsList>

				<TabsContent value="person" className="mt-3">
					{sourceReady && projectId && mediaItem && sourceUrl ? (
						<LocalPersonCutoutPanel
							projectId={projectId}
							sourceFile={mediaItem.file}
							sourceUrl={sourceUrl}
							addMediaItem={addMediaItem}
							onMaskReady={({ sourceMediaId, trackingSamples }) =>
								attachGeneratedMask({
									sourceMediaId,
									type: "person",
									source: "mediapipe",
									name: "MediaPipe 人物",
									trackingSamples,
									targetElementId: element.id,
								})
							}
							onMaskError={(message) => failGeneratedMaskTracking({ message })}
						/>
					) : (
						<p className="py-4 text-center text-xs text-muted-foreground">
							所选片段的源文件不可用。
						</p>
					)}
				</TabsContent>

				<TabsContent value="object" className="mt-3 space-y-3">
					<div className="space-y-1.5">
						<PropertyItemLabel>物体描述</PropertyItemLabel>
						<Input
							value={objectPrompt}
							onChange={(event) => setObjectPrompt(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void runObjectCutout({});
							}}
							placeholder="人物、汽车、产品..."
							aria-label="物体描述"
							disabled={isObjectProcessing}
						/>
					</div>
					<Button
						type="button"
						className="w-full"
						disabled={
							!sourceReady || !objectPrompt.trim() || isObjectProcessing
						}
						onClick={() => void runObjectCutout({})}
					>
						{isObjectProcessing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<ScanSearch className="size-4" />
						)}
						生成并应用蒙版
					</Button>
					<CutoutTaskStatus
						phase={objectTask.phase}
						progress={objectTask.progress}
						message={objectTask.message}
						elapsedTime={objectTask.elapsedTime}
						error={objectTask.error}
					/>
					<CloudTaskStatus
						taskId={objectCloudTaskId}
						onCancel={() => objectControllerRef.current?.abort()}
						onRetry={retryObjectCutout}
					/>
					{objectResultUrl ? (
						<video
							controls
							playsInline
							src={objectResultUrl}
							className="max-h-56 w-full rounded-sm border bg-black object-contain"
						/>
					) : null}
				</TabsContent>
			</Tabs>
		</PropertyGroup>
	);
}
