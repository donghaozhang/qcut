"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createObjectURL } from "@/lib/media/blob-manager";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { exportPersonCutoutVideo } from "@/lib/segmentation/person-cutout-export";
import {
	detachGeneratedMask,
	pauseGeneratedMaskTracking,
} from "@/lib/segmentation/generated-mask-attachment";
import { registerActiveMaskTrackingRuntime } from "@/lib/segmentation/mask-tracking-runtime";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import type { MediaStore } from "@/stores/media/media-store-types";
import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";
import { CutoutTaskStatus, type CutoutTaskPhase } from "./CutoutTaskStatus";
import { PersonCutoutPreview } from "./PersonCutoutPreview";
import { PersonCutoutSettings } from "./PersonCutoutSettings";

interface LocalPersonCutoutPanelProps {
	projectId: string;
	sourceFile: File;
	sourceUrl: string;
	autoStartRequestId?: string;
	addMediaItem?: MediaStore["addMediaItem"];
	onMaskReady?: ({
		sourceMediaId,
		trackingSamples,
		targetElementId,
		trackingRequestId,
	}: {
		sourceMediaId: string;
		trackingSamples: MediaMaskTrackingSample[];
		targetElementId?: string;
		trackingRequestId?: string;
	}) => boolean;
	onMaskError?: (message: string) => void;
	onProgress?: ({
		progress,
		status,
	}: {
		progress: number;
		status: string;
	}) => void;
}

function cutoutFilename(sourceName: string): string {
	const base = sourceName.replace(/\.[^.]+$/, "") || "video";
	return `${base}-person-cutout.webm`;
}

const checkerBackground = {
	backgroundColor: "#202020",
	backgroundImage:
		"linear-gradient(45deg, #303030 25%, transparent 25%), linear-gradient(-45deg, #303030 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #303030 75%), linear-gradient(-45deg, transparent 75%, #303030 75%)",
	backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
	backgroundSize: "16px 16px",
};

export function LocalPersonCutoutPanel({
	projectId,
	sourceFile,
	sourceUrl,
	autoStartRequestId,
	addMediaItem,
	onMaskReady,
	onMaskError,
	onProgress,
}: LocalPersonCutoutPanelProps) {
	const {
		personCutoutSettings,
		updatePersonCutoutSettings,
		isProcessing,
		progress,
		statusMessage,
		elapsedTime,
		setProcessingState,
		setSegmentedVideo,
		segmentedVideoUrl,
	} = useSegmentationStore();
	const abortControllerRef = useRef<AbortController | null>(null);
	const activeTaskIdRef = useRef<string | undefined>(undefined);
	const autoStartedRequestIdRef = useRef<string | undefined>(undefined);
	const renderTransparentVideoRef = useRef<
		(options?: { existingTaskId?: string }) => Promise<void>
	>(async () => {});
	const sourceFileRef = useRef(sourceFile);
	const [taskPhase, setTaskPhase] = useState<CutoutTaskPhase>("idle");
	const [taskError, setTaskError] = useState<string>();

	useEffect(() => {
		const sourceChanged = sourceFileRef.current !== sourceFile;
		sourceFileRef.current = sourceFile;
		abortControllerRef.current?.abort();
		if (activeTaskIdRef.current) {
			useCloudTaskStore.getState().cancelTask({ id: activeTaskIdRef.current });
		}
		abortControllerRef.current = null;
		if (sourceChanged) {
			setTaskPhase("idle");
			setTaskError(undefined);
		}

		return () => {
			abortControllerRef.current?.abort();
			if (activeTaskIdRef.current) {
				useCloudTaskStore
					.getState()
					.cancelTask({ id: activeTaskIdRef.current });
			}
			abortControllerRef.current = null;
		};
	}, [sourceFile]);

	const renderTransparentVideo = async ({
		existingTaskId,
	}: {
		existingTaskId?: string;
	} = {}) => {
		if (!addMediaItem) {
			toast.error("素材库尚未就绪");
			return;
		}
		const cloudTasks = useCloudTaskStore.getState();
		const taskId =
			existingTaskId ??
			cloudTasks.createTask({
				kind: "cutout",
				label: `人物抠像：${sourceFile.name}`,
				payload: { projectId, sourceName: sourceFile.name },
				message: "正在准备本地人物抠像",
			});
		const existingTask = cloudTasks.tasks.find(
			(candidate) => candidate.id === taskId
		);
		if (existingTask && !["queued", "running"].includes(existingTask.status)) {
			cloudTasks.retryTask({ id: taskId });
		}
		activeTaskIdRef.current = taskId;
		const controller = new AbortController();
		abortControllerRef.current = controller;
		const trackingRequest = useSegmentationStore.getState().trackingRequest;
		let unregisterMaskTrackingRuntime = () => {};
		const cancel = () => {
			controller.abort();
			useCloudTaskStore.getState().cancelTask({ id: taskId });
		};
		const retry = () => renderTransparentVideo({ existingTaskId: taskId });
		if (trackingRequest) {
			unregisterMaskTrackingRuntime = registerActiveMaskTrackingRuntime({
				runtime: {
					elementId: trackingRequest.elementId,
					maskId: trackingRequest.maskId,
					source: "mediapipe",
					direction: trackingRequest.direction,
					cancel,
					resume: retry,
				},
			});
		}
		const open = () =>
			useMediaPanelStore.getState().setActiveTab("segmentation");
		registerCloudTaskRuntimeActions({
			taskId,
			actions: { cancel, retry, open },
		});
		cloudTasks.startTask({ id: taskId, message: "正在准备本地人物抠像" });
		const startedAt = Date.now();
		setTaskPhase("processing");
		setTaskError(undefined);
		setProcessingState({
			isProcessing: true,
			progress: 0,
			statusMessage: "正在准备本地人物抠像...",
			elapsedTime: 0,
		});

		try {
			const result = await exportPersonCutoutVideo({
				file: sourceFile,
				settings: personCutoutSettings,
				signal: controller.signal,
				onProgress: ({ progress: nextProgress, status }) => {
					if (controller.signal.aborted) return;
					setProcessingState({
						isProcessing: true,
						progress: nextProgress,
						statusMessage: status,
						elapsedTime: (Date.now() - startedAt) / 1000,
					});
					onProgress?.({ progress: nextProgress, status });
					useCloudTaskStore.getState().updateProgress({
						id: taskId,
						progress: nextProgress,
						message: status,
					});
				},
			});
			if (
				controller.signal.aborted ||
				abortControllerRef.current !== controller
			) {
				throw new DOMException("人物抠像已取消", "AbortError");
			}
			const filename = cutoutFilename(sourceFile.name);
			const file = new File([result.blob], filename, {
				type: "video/webm",
				lastModified: Date.now(),
			});
			const url = createObjectURL(file, "mediapipe-person-cutout");
			const sourceMediaId = await addMediaItem(projectId, {
				name: filename,
				type: "video",
				file,
				url,
				duration: result.duration,
				width: result.width,
				height: result.height,
				fps: result.frameRate,
				metadata: {
					source: "mediapipe-person-cutout",
					hasAlpha: true,
					codec: result.codec,
					frameCount: result.frameCount,
					hasAudio: result.hasAudio,
				},
			});
			if (
				controller.signal.aborted ||
				abortControllerRef.current !== controller
			) {
				throw new DOMException("人物抠像已取消", "AbortError");
			}
			const attached =
				onMaskReady?.({
					sourceMediaId,
					trackingSamples: result.trackingSamples,
					targetElementId: trackingRequest?.elementId,
					trackingRequestId: trackingRequest?.requestId,
				}) ?? false;
			setSegmentedVideo(url);
			setTaskPhase("completed");
			setProcessingState({
				isProcessing: false,
				progress: 100,
				statusMessage: attached
					? "人物蒙版已应用到所选片段"
					: "透明人物视频已添加到素材库",
				elapsedTime: (Date.now() - startedAt) / 1000,
			});
			const completedMessage = attached
				? "人物蒙版已应用到所选片段"
				: "透明人物视频已添加到素材库";
			useCloudTaskStore.getState().completeTask({
				id: taskId,
				message: completedMessage,
				output: { sourceMediaId, attached },
			});
			const undo = async () => {
				detachGeneratedMask({ sourceMediaId });
				await useMediaStore
					.getState()
					.removeMediaItem(projectId, sourceMediaId);
				setSegmentedVideo(null);
				registerCloudTaskRuntimeActions({
					taskId,
					actions: { open, retry },
				});
				toast.success("已撤销人物抠像结果");
			};
			registerCloudTaskRuntimeActions({
				taskId,
				actions: { open, retry, undo },
			});
			toast.success(completedMessage);
		} catch (error) {
			const canceled =
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === "AbortError");
			if (abortControllerRef.current !== controller) {
				if (canceled) {
					useCloudTaskStore.getState().cancelTask({ id: taskId });
				}
				return;
			}
			const failureMessage = canceled
				? "人物跟踪已取消"
				: error instanceof Error
					? error.message
					: String(error);
			setTaskPhase(canceled ? "canceled" : "error");
			setTaskError(canceled ? undefined : failureMessage);
			if (!canceled) onMaskError?.(failureMessage);
			setProcessingState({
				isProcessing: false,
				progress: 0,
				statusMessage: canceled ? "人物抠像已取消" : "人物抠像失败",
				elapsedTime: (Date.now() - startedAt) / 1000,
			});
			if (canceled) {
				pauseGeneratedMaskTracking({ message: "人物跟踪已暂停" });
				useCloudTaskStore.getState().cancelTask({ id: taskId });
			} else {
				useCloudTaskStore.getState().failTask({
					id: taskId,
					error: failureMessage,
				});
				toast.error("人物抠像失败", { description: failureMessage });
			}
		} finally {
			unregisterMaskTrackingRuntime();
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
		}
	};
	renderTransparentVideoRef.current = renderTransparentVideo;

	useEffect(() => {
		if (
			!autoStartRequestId ||
			isProcessing ||
			autoStartedRequestIdRef.current === autoStartRequestId
		) {
			return;
		}
		autoStartedRequestIdRef.current = autoStartRequestId;
		void renderTransparentVideoRef.current();
	}, [autoStartRequestId, isProcessing]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 pr-1">
				<PersonCutoutPreview
					key={sourceUrl}
					sourceUrl={sourceUrl}
					settings={personCutoutSettings}
				/>
				<PersonCutoutSettings
					settings={personCutoutSettings}
					onChange={updatePersonCutoutSettings}
					disabled={isProcessing}
				/>
				{segmentedVideoUrl && (
					<div className="space-y-2" data-testid="person-cutout-result">
						<div className="text-xs font-medium text-muted-foreground">
							上次透明视频结果
						</div>
						<div
							className="flex min-h-32 items-center justify-center overflow-hidden rounded-sm border"
							style={checkerBackground}
						>
							<video
								controls
								playsInline
								src={segmentedVideoUrl}
								className="max-h-64 max-w-full"
							/>
						</div>
					</div>
				)}
				<CutoutTaskStatus
					phase={isProcessing ? "processing" : taskPhase}
					progress={progress}
					message={
						taskPhase === "canceled"
							? "人物抠像已取消"
							: taskPhase === "error"
								? "人物抠像失败"
								: statusMessage
					}
					elapsedTime={elapsedTime}
					error={taskError}
					onCancel={() => {
						abortControllerRef.current?.abort();
						if (activeTaskIdRef.current) {
							useCloudTaskStore
								.getState()
								.cancelTask({ id: activeTaskIdRef.current });
						}
					}}
					onRetry={() =>
						void renderTransparentVideo({
							existingTaskId: activeTaskIdRef.current,
						})
					}
				/>
			</div>
			<div className="flex shrink-0 gap-2 border-t bg-background pt-2">
				<Button
					type="button"
					className="flex-1"
					disabled={isProcessing}
					onClick={() => void renderTransparentVideo({})}
					data-testid="person-cutout-export"
				>
					{isProcessing ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Download className="size-4" />
					)}
					{onMaskReady ? "生成并应用人物蒙版" : "生成透明 WebM"}
				</Button>
			</div>
		</div>
	);
}
