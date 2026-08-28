"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createObjectURL } from "@/lib/media/blob-manager";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import {
	exportPersonCutoutVideo,
	type PersonCutoutQuality,
} from "@/lib/segmentation/person-cutout-export";
import {
	BASIC_PERSON_CUTOUT_SETTINGS,
	FINE_PERSON_CUTOUT_SETTINGS,
} from "@/lib/segmentation/person-cutout-presets";
import {
	detachGeneratedMask,
	pauseGeneratedMaskTracking,
} from "@/lib/segmentation/generated-mask-attachment";
import type { GeneratedMaskSource } from "@/lib/segmentation/generated-mask-attachment";
import { registerActiveMaskTrackingRuntime } from "@/lib/segmentation/mask-tracking-runtime";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import type { MediaStore } from "@/stores/media/media-store-types";
import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";
import { CutoutTaskStatus, type CutoutTaskPhase } from "./CutoutTaskStatus";
import { PersonCutoutSettings } from "./PersonCutoutSettings";

interface LocalPersonCutoutPanelProps {
	projectId: string;
	sourceFile: File;
	sourcePath?: string;
	sourceUrl: string;
	autoStartRequestId?: string;
	addMediaItem?: MediaStore["addMediaItem"];
	onMaskReady?: ({
		source,
		sourceMediaId,
		trackingSamples,
		targetElementId,
		trackingRequestId,
	}: {
		source: GeneratedMaskSource;
		sourceMediaId: string;
		trackingSamples: MediaMaskTrackingSample[];
		targetElementId?: string;
		trackingRequestId?: string;
	}) => boolean;
	onMaskError?: (message: string) => void;
	onProgress?: ({
		progress,
		source,
		status,
	}: {
		progress: number;
		source: GeneratedMaskSource;
		status: string;
	}) => void;
}

function cutoutFilename(sourceName: string): string {
	const base = sourceName.replace(/\.[^.]+$/, "") || "video";
	return `${base}-person-cutout.webm`;
}

export function LocalPersonCutoutPanel({
	projectId,
	sourceFile,
	sourcePath,
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
	const [quality, setQuality] = useState<PersonCutoutQuality>("basic");
	const qualitySettingsRef = useRef({
		basic: { ...personCutoutSettings },
		fine: { ...FINE_PERSON_CUTOUT_SETTINGS },
	});
	const [fineStatus, setFineStatus] = useState<string>();

	useEffect(() => {
		let active = true;
		void window.electronAPI?.jianyingPersonCutout
			?.inspect()
			.then((status) => {
				if (active) setFineStatus(status.message);
			})
			.catch(() => {
				if (active) setFineStatus("精细抠像暂不可用");
			});
		return () => {
			active = false;
		};
	}, []);

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
				message: "正在准备人物抠像",
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
		const cutoutSource: GeneratedMaskSource =
			quality === "fine" ? "jianying-gru" : "mediapipe";
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
					source: cutoutSource,
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
		cloudTasks.startTask({ id: taskId, message: "正在准备人物抠像" });
		const startedAt = Date.now();
		setTaskPhase("processing");
		setTaskError(undefined);
		setProcessingState({
			isProcessing: true,
			progress: 0,
			statusMessage: "正在准备人物抠像...",
			elapsedTime: 0,
		});

		try {
			const result = await exportPersonCutoutVideo({
				file: sourceFile,
				sourcePath,
				settings: personCutoutSettings,
				quality,
				signal: controller.signal,
				onProgress: ({ progress: nextProgress, status }) => {
					if (controller.signal.aborted) return;
					setProcessingState({
						isProcessing: true,
						progress: nextProgress,
						statusMessage: status,
						elapsedTime: (Date.now() - startedAt) / 1000,
					});
					onProgress?.({
						progress: nextProgress,
						source: cutoutSource,
						status,
					});
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
			const source =
				quality === "fine"
					? "jianying-gru-person-cutout"
					: "mediapipe-person-cutout";
			const url = createObjectURL(file, source);
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
					blendImplementation: result.blendImplementation,
					source,
					quality,
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
					source: cutoutSource,
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
				pauseGeneratedMaskTracking({
					message: "人物跟踪已暂停",
					trackingRequestId: trackingRequest?.requestId,
				});
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

	const selectQuality = (nextQuality: PersonCutoutQuality) => {
		if (nextQuality === quality) return;
		qualitySettingsRef.current[quality] = { ...personCutoutSettings };
		setQuality(nextQuality);
		updatePersonCutoutSettings(qualitySettingsRef.current[nextQuality]);
	};

	const updateQualitySettings = (
		updates: Partial<typeof personCutoutSettings>
	) => {
		const nextSettings = { ...personCutoutSettings, ...updates };
		qualitySettingsRef.current[quality] = nextSettings;
		updatePersonCutoutSettings(nextSettings);
	};

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
				<div className="space-y-2" data-testid="person-cutout-quality">
					<div className="grid grid-cols-2 rounded-sm bg-muted p-0.5">
						{(["basic", "fine"] as const).map((value) => (
							<Button
								type="button"
								key={value}
								variant={quality === value ? "secondary" : "text"}
								size="sm"
								className="h-7 text-xs"
								aria-pressed={quality === value}
								disabled={isProcessing}
								onClick={() => selectQuality(value)}
								data-testid={`person-cutout-quality-${value}`}
							>
								{value === "basic" ? "基础" : "精细"}
							</Button>
						))}
					</div>
					<p className="text-xs leading-5 text-muted-foreground">
						基础处理速度较快，精细效果更佳，但耗时较长
					</p>
				</div>
				<details className="group rounded-sm border px-3 py-2">
					<summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
						高级
						<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
					</summary>
					<div className="mt-3 space-y-3">
						<PersonCutoutSettings
							settings={personCutoutSettings}
							defaults={
								quality === "fine"
									? FINE_PERSON_CUTOUT_SETTINGS
									: BASIC_PERSON_CUTOUT_SETTINGS
							}
							onChange={updateQualitySettings}
							disabled={isProcessing}
						/>
						{quality === "fine" && fineStatus ? (
							<p className="text-xs text-muted-foreground">{fineStatus}</p>
						) : null}
					</div>
				</details>
				{segmentedVideoUrl && (
					<p
						className="rounded-sm border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
						data-testid="person-cutout-result"
					>
						人物抠像结果已生成并应用
					</p>
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
					{isProcessing ? <Loader2 className="size-4 animate-spin" /> : null}
					{onMaskReady ? "开始并应用" : "开始人物抠像"}
				</Button>
			</div>
		</div>
	);
}
