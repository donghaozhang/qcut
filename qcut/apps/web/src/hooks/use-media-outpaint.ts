import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAIPipeline } from "@/hooks/use-ai-pipeline";
import { resolveGeneratedMedia } from "@/lib/ai-video/generated-media";
import {
	buildMediaOutpaintArgs,
	ensureMediaOutpaintLocalSource,
	getMediaOutpaintSourceRange,
	mediaOutpaintClipSnapshot,
	mediaOutpaintReplacementUpdates,
	mediaOutpaintRequestFromPayload,
	mediaOutpaintValidationError,
	prepareMediaOutpaintSource,
	type MediaOutpaintClipSnapshot,
	type MediaOutpaintRequest,
} from "@/lib/ai-video/media-outpaint";
import { estimatePipelineTaskCostUsd } from "@/lib/cloud-tasks/task-costs";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { debugWarn } from "@/lib/debug/debug-config";
import { type CloudTask, useCloudTaskStore } from "@/stores/cloud-task-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement } from "@/types/timeline";

const OUTPAINT_TASK_OPERATION = "media-outpaint";

function isTaskForElement({
	task,
	elementId,
}: {
	task: CloudTask;
	elementId: string;
}): boolean {
	return (
		task.payload.operation === OUTPAINT_TASK_OPERATION &&
		task.payload.targetElementId === elementId
	);
}

function latestTaskForElement({
	tasks,
	elementId,
}: {
	tasks: CloudTask[];
	elementId: string;
}): CloudTask | undefined {
	for (let index = tasks.length - 1; index >= 0; index -= 1) {
		const task = tasks[index];
		if (task && isTaskForElement({ task, elementId })) return task;
	}
}

function taskClipSnapshot({
	task,
}: {
	task: CloudTask;
}): MediaOutpaintClipSnapshot | null {
	const mediaId = task.payload.sourceMediaId;
	const name = task.payload.sourceName;
	const duration = task.payload.sourceDuration;
	const trimStart = task.payload.sourceTrimStart;
	const trimEnd = task.payload.sourceTrimEnd;
	if (
		typeof mediaId !== "string" ||
		typeof name !== "string" ||
		typeof duration !== "number" ||
		typeof trimStart !== "number" ||
		typeof trimEnd !== "number"
	) {
		return null;
	}
	return { mediaId, name, duration, trimStart, trimEnd };
}

function taskTarget({
	task,
}: {
	task: CloudTask;
}): { trackId: string; elementId: string } | null {
	const trackId = task.payload.targetTrackId;
	const elementId = task.payload.targetElementId;
	if (typeof trackId !== "string" || typeof elementId !== "string") {
		return null;
	}
	return { trackId, elementId };
}

function clipMatchesSnapshot({
	element,
	snapshot,
}: {
	element: MediaElement;
	snapshot: MediaOutpaintClipSnapshot;
}): boolean {
	return (
		element.mediaId === snapshot.mediaId &&
		element.duration === snapshot.duration &&
		element.trimStart === snapshot.trimStart &&
		element.trimEnd === snapshot.trimEnd
	);
}

function findCurrentTarget({
	trackId,
	elementId,
}: {
	trackId: string;
	elementId: string;
}): MediaElement | null {
	const candidate = useTimelineStore
		.getState()
		._tracks.find((track) => track.id === trackId)
		?.elements.find((element) => element.id === elementId);
	return candidate?.type === "media" ? candidate : null;
}

function openOutpaintTarget({ task }: { task: CloudTask }): void {
	const target = taskTarget({ task });
	if (!target) return;
	const timeline = useTimelineStore.getState();
	const exists = timeline._tracks
		.find((track) => track.id === target.trackId)
		?.elements.some((element) => element.id === target.elementId);
	if (exists) timeline.selectElement(target.trackId, target.elementId);
}

function openOutpaintTaskById({ taskId }: { taskId: string }): void {
	const task = useCloudTaskStore
		.getState()
		.tasks.find((candidate) => candidate.id === taskId);
	if (task) openOutpaintTarget({ task });
}

export function useMediaOutpaint({
	element,
	trackId,
	fps,
}: {
	element: MediaElement;
	trackId: string;
	fps: number;
}) {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const tasks = useCloudTaskStore((state) => state.tasks);
	const [activeTask, setActiveTask] = useState<{
		elementId: string;
		taskId: string;
	}>();
	const taskIdRef = useRef<string | null>(null);
	const selectedTask =
		tasks.find(
			(task) =>
				activeTask?.elementId === element.id &&
				task.id === activeTask.taskId &&
				isTaskForElement({ task, elementId: element.id })
		) ?? latestTaskForElement({ tasks, elementId: element.id });

	const handleProgress = useCallback(
		({ percent, message }: { percent: number; message: string }) => {
			const taskId = taskIdRef.current;
			if (!taskId) return;
			useCloudTaskStore.getState().updateProgress({
				id: taskId,
				progress: 10 + Math.max(0, Math.min(100, percent)) * 0.85,
				message,
			});
		},
		[]
	);
	const { generate, cancel, isAvailable, isChecked, isGenerating } =
		useAIPipeline({ onProgress: handleProgress, persistTasks: false });

	const restoreTaskResult = useCallback(
		async ({ task }: { task: CloudTask }): Promise<void> => {
			const target = taskTarget({ task });
			const snapshot = taskClipSnapshot({ task });
			const generatedMediaId = task.output?.generatedMediaId;
			if (!target || !snapshot || typeof generatedMediaId !== "string") return;
			const current = findCurrentTarget(target);
			if (!current) {
				toast.error("原时间线片段已不存在");
				return;
			}
			if (current.mediaId !== generatedMediaId) {
				toast.warning("片段后来已被修改，未覆盖当前内容");
				return;
			}
			const timeline = useTimelineStore.getState();
			timeline.updateMediaElement(target.trackId, target.elementId, snapshot);
			await timeline.saveImmediate();
			toast.success("已恢复扩图前的片段");
		},
		[]
	);

	const runOutpaint = useCallback(
		async ({
			request,
			existingTaskId,
		}: {
			request: MediaOutpaintRequest;
			existingTaskId?: string;
		}): Promise<boolean> => {
			const currentElement = findCurrentTarget({
				trackId,
				elementId: element.id,
			});
			const currentMedia = currentElement
				? useMediaStore
						.getState()
						.mediaItems.find((item) => item.id === currentElement.mediaId)
				: undefined;
			if (!currentElement) {
				toast.error("所选时间线片段已不存在");
				return false;
			}
			const normalizedRequest = { ...request, prompt: request.prompt.trim() };
			const validationError = mediaOutpaintValidationError({
				element: currentElement,
				mediaItem: currentMedia,
				projectId,
				request: normalizedRequest,
			});
			if (validationError) {
				toast.error(validationError);
				return false;
			}
			if (!isAvailable || !currentMedia || !projectId) {
				toast.error("AI 流水线当前不可用");
				return false;
			}

			const sourceRange = getMediaOutpaintSourceRange({
				element: currentElement,
			});
			const originalClip = mediaOutpaintClipSnapshot({
				element: currentElement,
			});
			const cloudTasks = useCloudTaskStore.getState();
			const existingTask = existingTaskId
				? cloudTasks.tasks.find((task) => task.id === existingTaskId)
				: undefined;
			const retrySnapshot = existingTask
				? taskClipSnapshot({ task: existingTask })
				: null;
			if (
				existingTask &&
				(!retrySnapshot ||
					!clipMatchesSnapshot({
						element: currentElement,
						snapshot: retrySnapshot,
					}))
			) {
				toast.error("片段已更改，请重新发起扩图任务");
				return false;
			}
			if (existingTask && existingTask.status !== "queued") {
				cloudTasks.retryTask({ id: existingTask.id });
			}
			const taskId =
				existingTask?.id ??
				cloudTasks.createTask({
					kind: "generation",
					label: "AI 扩图",
					message: "等待准备片段",
					payload: {
						operation: OUTPAINT_TASK_OPERATION,
						projectId,
						targetTrackId: trackId,
						targetElementId: currentElement.id,
						sourceMediaId: originalClip.mediaId,
						sourceName: originalClip.name,
						sourceDuration: originalClip.duration,
						sourceTrimStart: originalClip.trimStart,
						sourceTrimEnd: originalClip.trimEnd,
						prompt: normalizedRequest.prompt,
						aspectRatio: normalizedRequest.aspectRatio,
						resolution: normalizedRequest.resolution,
					},
					estimatedCostUsd: estimatePipelineTaskCostUsd({
						options: {
							command: "create-video",
							args: {
								duration: sourceRange.duration,
								resolution: normalizedRequest.resolution,
							},
						},
					}),
				});
			setActiveTask({ elementId: element.id, taskId });
			taskIdRef.current = taskId;
			const sessionId = `media-outpaint-${taskId}-${Date.now()}`;
			cloudTasks.startTask({
				id: taskId,
				sessionId,
				message: "正在准备所选片段...",
			});
			const retryCurrent = () =>
				runOutpaint({ request: normalizedRequest, existingTaskId: taskId });
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					cancel: async () => {
						await cancel();
						useCloudTaskStore.getState().cancelTask({ id: taskId });
					},
					retry: retryCurrent,
					open: () => openOutpaintTaskById({ taskId }),
				},
			});

			let preparedSource:
				| Awaited<ReturnType<typeof prepareMediaOutpaintSource>>
				| undefined;
			try {
				const sourcePath = await ensureMediaOutpaintLocalSource({
					mediaItem: currentMedia,
				});
				preparedSource = await prepareMediaOutpaintSource({
					element: currentElement,
					mediaItem: currentMedia,
					sourcePath,
					fps,
				});
				useCloudTaskStore.getState().updateProgress({
					id: taskId,
					progress: 10,
					message: "正在上传并生成扩图视频...",
				});
				const result = await generate({
					command: "create-video",
					args: buildMediaOutpaintArgs({
						request: normalizedRequest,
						videoPath: preparedSource.path,
					}),
					projectId,
					autoImport: true,
					sessionId,
				});
				const taskStatus = useCloudTaskStore
					.getState()
					.tasks.find((task) => task.id === taskId)?.status;
				if (taskStatus === "canceled") return false;
				if (!result.success) {
					throw new Error(result.error || "AI 扩图失败");
				}
				useCloudTaskStore.getState().updateProgress({
					id: taskId,
					progress: 96,
					message: "正在回填时间线...",
				});
				const generatedMedia = await resolveGeneratedMedia({
					result,
					projectId,
				});
				if (!generatedMedia || generatedMedia.type !== "video") {
					throw new Error("生成视频已完成，但无法导入素材库");
				}
				const latestTarget = findCurrentTarget({
					trackId,
					elementId: currentElement.id,
				});
				const sourceChanged =
					!latestTarget ||
					!clipMatchesSnapshot({
						element: latestTarget,
						snapshot: originalClip,
					});
				if (!sourceChanged) {
					const timeline = useTimelineStore.getState();
					timeline.updateMediaElement(
						trackId,
						currentElement.id,
						mediaOutpaintReplacementUpdates({
							generatedMedia,
							sourceDuration: sourceRange.duration,
						})
					);
					await timeline.saveImmediate();
				}
				useCloudTaskStore.getState().completeTask({
					id: taskId,
					message: sourceChanged
						? "生成完成；片段已更改，结果仅保留在素材库"
						: "扩图结果已替换到时间线",
					actualCostUsd: result.cost,
					output: {
						generatedMediaId: generatedMedia.id,
						outputPath: result.importedPath ?? result.outputPath ?? "",
						applied: !sourceChanged,
					},
				});
				const completedTask = useCloudTaskStore
					.getState()
					.tasks.find((task) => task.id === taskId);
				if (completedTask) {
					registerCloudTaskRuntimeActions({
						taskId,
						actions: {
							open: () => openOutpaintTarget({ task: completedTask }),
							retry: retryCurrent,
							undo: sourceChanged
								? undefined
								: () => restoreTaskResult({ task: completedTask }),
						},
					});
				}
				if (sourceChanged) {
					toast.info("扩图已生成到素材库；片段处理期间发生变化，未自动替换");
				} else {
					toast.success("AI 扩图已替换到时间线");
				}
				return true;
			} catch (error) {
				const status = useCloudTaskStore
					.getState()
					.tasks.find((task) => task.id === taskId)?.status;
				if (status === "canceled") return false;
				const message = error instanceof Error ? error.message : "AI 扩图失败";
				useCloudTaskStore.getState().failTask({ id: taskId, error: message });
				toast.error("AI 扩图失败", { description: message });
				return false;
			} finally {
				try {
					await preparedSource?.cleanup();
				} catch (error) {
					debugWarn("[AI Outpaint] Failed to clean up source export", error);
				}
				if (taskIdRef.current === taskId) taskIdRef.current = null;
			}
		},
		[
			cancel,
			element.id,
			fps,
			generate,
			isAvailable,
			projectId,
			restoreTaskResult,
			trackId,
		]
	);

	const cancelOutpaint = useCallback(async (): Promise<void> => {
		const taskId = taskIdRef.current ?? selectedTask?.id;
		await cancel();
		if (taskId) useCloudTaskStore.getState().cancelTask({ id: taskId });
	}, [cancel, selectedTask?.id]);

	const retryOutpaint = useCallback(async (): Promise<boolean> => {
		if (!selectedTask) return false;
		const request = mediaOutpaintRequestFromPayload({
			payload: selectedTask.payload,
		});
		if (!request) {
			toast.error("扩图任务参数不完整，无法重试");
			return false;
		}
		return runOutpaint({ request, existingTaskId: selectedTask.id });
	}, [runOutpaint, selectedTask]);

	useEffect(() => {
		if (!selectedTask) return;
		const request = mediaOutpaintRequestFromPayload({
			payload: selectedTask.payload,
		});
		const active =
			selectedTask.status === "queued" || selectedTask.status === "running";
		const retryable =
			selectedTask.status === "failed" ||
			selectedTask.status === "canceled" ||
			selectedTask.status === "interrupted";
		const applied = selectedTask.output?.applied === true;
		return registerCloudTaskRuntimeActions({
			taskId: selectedTask.id,
			actions: {
				open: () => openOutpaintTarget({ task: selectedTask }),
				cancel: active ? cancelOutpaint : undefined,
				retry:
					retryable && request
						? () =>
								runOutpaint({
									request,
									existingTaskId: selectedTask.id,
								})
						: undefined,
				undo: applied
					? () => restoreTaskResult({ task: selectedTask })
					: undefined,
			},
		});
	}, [cancelOutpaint, restoreTaskResult, runOutpaint, selectedTask]);

	return {
		isAvailable,
		isChecked,
		isGenerating,
		isRunning:
			isGenerating ||
			selectedTask?.status === "queued" ||
			selectedTask?.status === "running",
		mediaItem,
		sourceDuration: getMediaOutpaintSourceRange({ element }).duration,
		taskId: selectedTask?.id,
		taskRequest: selectedTask
			? mediaOutpaintRequestFromPayload({ payload: selectedTask.payload })
			: null,
		runOutpaint,
		cancelOutpaint,
		retryOutpaint,
	};
}
