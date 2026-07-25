"use client";
import { useEffect, useRef } from "react";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useAsyncMediaStoreActions } from "@/hooks/media/use-async-media-store";
import { usePersistentAiTask } from "@/hooks/use-persistent-ai-task";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Wand2,
	Loader2,
	ImagePlus,
	Video,
	UserRound,
	ScanSearch,
} from "lucide-react";
import { segmentWithText } from "@/lib/ai-clients/sam3-client";
import { debugLog } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	attachGeneratedMask,
	detachGeneratedMask,
	failGeneratedMaskTracking,
	pauseGeneratedMaskTracking,
	updateGeneratedMaskTrackingProgress,
} from "@/lib/segmentation/generated-mask-attachment";
import { registerActiveMaskTrackingRuntime } from "@/lib/segmentation/mask-tracking-runtime";
import { generateSam3VideoMask } from "@/lib/segmentation/sam3-video-mask";
import { useMediaStore } from "@/stores/media/media-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";

// Export individual components
export { ObjectList } from "./ObjectList";
export { PromptToolbar } from "./PromptToolbar";
export { SegmentationCanvas } from "./SegmentationCanvas";
export { MaskOverlay } from "./MaskOverlay";
export { ImageUploader } from "./ImageUploader";
export { SegmentationControls } from "./SegmentationControls";

// Import components for main panel
import { ObjectList } from "./ObjectList";
import { PromptToolbar } from "./PromptToolbar";
import { SegmentationCanvas } from "./SegmentationCanvas";
import { ImageUploader } from "./ImageUploader";
import { LocalPersonCutoutPanel } from "./LocalPersonCutoutPanel";

type SegmentationTaskResult =
	| {
			mode: "video";
			sourceMediaId: string;
			attached: boolean;
			objectCount: number;
	  }
	| { mode: "image"; objectCount: number };

/**
 * SegmentationPanel
 *
 * Main panel for SAM-3 image and video segmentation.
 * Provides text, point, and box prompt interfaces.
 */
export function SegmentationPanel() {
	const params = useParams({ from: "/editor/$project_id" });
	const projectId = params.project_id;

	const {
		mode,
		setMode,
		sourceImageUrl,
		sourceImageFile,
		sourceVideoUrl,
		sourceVideoFile,
		setSourceImage,
		setSourceVideo,
		objects,
		currentTextPrompt,
		isProcessing,
		setProcessingState,
		addObject,
		setCompositeImage,
		setMasks,
		setSegmentedVideo,
		segmentedVideoUrl,
		clearCurrentPrompts,
		showObjectList,
		videoBackend,
		setVideoBackend,
		trackingRequest,
	} = useSegmentationStore();

	const {
		loading: mediaStoreLoading,
		error: mediaStoreError,
		addMediaItem,
	} = useAsyncMediaStoreActions();
	const {
		runTask: runSegmentationTask,
		isRunning: segmentationTaskRunning,
		error: segmentationTaskError,
	} = usePersistentAiTask();

	const handleImageSelect = (file: File) => {
		const url = createObjectURL(file, "segmentation-image-select");
		setSourceImage(file, url);
	};
	const handleVideoSelect = (file: File) => {
		const url = createObjectURL(file, "segmentation-video-select");
		setSourceVideo(file, url);
	};

	const handleSegment = async () => {
		if (!currentTextPrompt.trim()) {
			toast.error("请输入要分割的对象描述。");
			return;
		}

		if (mode === "image" && (!sourceImageFile || !sourceImageUrl)) {
			toast.error("请先上传图片。");
			return;
		}
		if (mode === "video" && (!sourceVideoFile || !sourceVideoUrl)) {
			toast.error("请先上传视频。");
			return;
		}
		const prompt = currentTextPrompt.trim();
		const segmentationState = useSegmentationStore.getState();
		const snapshot = {
			objects: structuredClone(segmentationState.objects),
			masks: structuredClone(segmentationState.masks),
			compositeImageUrl: segmentationState.compositeImageUrl,
			segmentedVideoUrl: segmentationState.segmentedVideoUrl,
		};
		await runSegmentationTask<SegmentationTaskResult>({
			kind: "sam3",
			label: `${mode === "video" ? "视频跟踪" : "图片分割"}：${prompt}`,
			payload: { mode, prompt, projectId },
			startMessage: mode === "video" ? "正在上传视频" : "正在上传图片",
			completeMessage: (result) =>
				result.mode === "video"
					? result.attached
						? "视频蒙版已应用到所选片段"
						: "视频蒙版已添加到素材库"
					: `图片分割完成，找到 ${result.objectCount} 个对象`,
			open: () => useMediaPanelStore.getState().setActiveTab("segmentation"),
			onCancel: () => {
				pauseGeneratedMaskTracking({ message: "蒙版跟踪已暂停" });
				setProcessingState({
					isProcessing: false,
					progress: 0,
					statusMessage: "分割任务已取消",
					elapsedTime: 0,
				});
			},
			onError: (error) => {
				failGeneratedMaskTracking({ message: error.message });
				setProcessingState({
					isProcessing: false,
					progress: 0,
					statusMessage: "分割失败",
					elapsedTime: 0,
				});
				toast.error("分割失败", { description: error.message });
			},
			onRuntimeReady: ({ cancel }) => {
				const request = useSegmentationStore.getState().trackingRequest;
				if (!request || mode !== "video") return;
				return registerActiveMaskTrackingRuntime({
					runtime: {
						elementId: request.elementId,
						maskId: request.maskId,
						source: "sam3",
						direction: request.direction,
						cancel,
					},
				});
			},
			execute: async ({ signal, updateProgress }) => {
				const startTime = Date.now();
				const trackingRequest = useSegmentationStore.getState().trackingRequest;

				setProcessingState({
					isProcessing: true,
					progress: 0,
					statusMessage:
						mode === "video" ? "正在上传视频..." : "正在上传图片...",
					elapsedTime: 0,
				});

				if (mode === "video") {
					if (!addMediaItem) throw new Error("素材库尚未就绪");
					const result = await generateSam3VideoMask({
						sourceFile: sourceVideoFile as File,
						prompt,
						signal,
						onProgress: (progress) => {
							if (signal.aborted) return;
							updateProgress({
								progress: progress.progress,
								message: progress.message,
							});
							setProcessingState({
								isProcessing: true,
								progress: progress.progress,
								statusMessage: progress.message,
								elapsedTime: progress.elapsedTime,
							});
							updateGeneratedMaskTrackingProgress({
								progress: progress.progress,
								source: "sam3",
							});
						},
					});
					if (signal.aborted) throw new DOMException("已取消", "AbortError");
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
					if (signal.aborted) {
						await useMediaStore
							.getState()
							.removeMediaItem(projectId, sourceMediaId);
						throw new DOMException("已取消", "AbortError");
					}
					const attached = attachGeneratedMask({
						sourceMediaId,
						type: "object",
						source: "sam3",
						name: `SAM3: ${prompt}`,
						trackingSamples: result.trackingSamples,
						targetElementId: trackingRequest?.elementId,
						trackingRequestId: trackingRequest?.requestId,
					});
					setSegmentedVideo(result.url);
					setProcessingState({
						isProcessing: false,
						progress: 100,
						statusMessage: "视频蒙版跟踪完成",
						elapsedTime: (Date.now() - startTime) / 1000,
					});
					return {
						mode: "video" as const,
						sourceMediaId,
						attached,
						objectCount: 1,
					};
				}

				debugLog("Uploading image to FAL for segmentation...");
				const { uploadImageToFAL } = await import(
					"@/lib/ai-clients/image-edit-client"
				);
				const uploadedImageUrl = await uploadImageToFAL(
					sourceImageFile as File
				);
				if (signal.aborted) throw new DOMException("已取消", "AbortError");

				setProcessingState({
					isProcessing: true,
					progress: 25,
					statusMessage: "正在检测对象...",
					elapsedTime: (Date.now() - startTime) / 1000,
				});
				updateProgress({ progress: 25, message: "正在检测对象" });

				const result = await segmentWithText(uploadedImageUrl, prompt, {
					return_multiple_masks: true,
					max_masks: 10,
					include_scores: true,
					include_boxes: true,
					apply_mask: true,
				});
				if (signal.aborted) throw new DOMException("已取消", "AbortError");

				if (result.image?.url) {
					setCompositeImage(result.image.url);
				}

				const newMasks = result.masks ?? [];
				if (newMasks.length > 0) {
					setMasks(newMasks);

					for (const [index, mask] of newMasks.entries()) {
						addObject({
							name: `${prompt} ${index + 1}`,
							maskUrl: mask.url,
							score: result.scores?.[index]?.[0],
							boundingBox: result.boxes?.[index]?.[0],
							pointPrompts: [],
							boxPrompts: [],
							textPrompt: prompt,
							visible: true,
						});
					}
				}

				const totalTime = (Date.now() - startTime) / 1000;

				setProcessingState({
					isProcessing: false,
					progress: 100,
					statusMessage: `找到 ${result.masks?.length || 0} 个对象`,
					elapsedTime: totalTime,
				});

				clearCurrentPrompts();
				return {
					mode: "image" as const,
					objectCount: result.masks?.length ?? 0,
				};
			},
			onUndo: async (result) => {
				useSegmentationStore.setState(snapshot);
				if (result.mode === "video") {
					detachGeneratedMask({ sourceMediaId: result.sourceMediaId });
					await useMediaStore
						.getState()
						.removeMediaItem(projectId, result.sourceMediaId);
				}
				toast.success("已撤销分割结果");
			},
			output: (result) => ({
				mode: result.mode,
				objectCount: result.objectCount,
				...(result.mode === "video" && {
					sourceMediaId: result.sourceMediaId,
					attached: result.attached,
				}),
			}),
		});
	};

	const canSegment =
		(mode === "image" ? sourceImageUrl : sourceVideoUrl) &&
		currentTextPrompt.trim() &&
		!isProcessing &&
		!segmentationTaskRunning;
	const isLocalPersonVideo =
		mode === "video" && videoBackend === "local-person";
	const autoStartedTrackingRequestRef = useRef<string | undefined>(undefined);
	const handleSegmentRef = useRef(handleSegment);
	handleSegmentRef.current = handleSegment;

	useEffect(() => {
		const requestId = trackingRequest?.requestId;
		if (
			!requestId ||
			mode !== "video" ||
			videoBackend !== "sam3" ||
			!canSegment ||
			autoStartedTrackingRequestRef.current === requestId
		) {
			return;
		}
		autoStartedTrackingRequestRef.current = requestId;
		void handleSegmentRef.current();
	}, [canSegment, mode, trackingRequest?.requestId, videoBackend]);

	// Handle media store loading/error states
	if (mediaStoreError) {
		return (
			<div className="h-full flex flex-col gap-4 p-4">
				<div className="flex items-center justify-center flex-1">
					<div className="text-center">
						<div className="text-red-500 mb-2">素材库加载失败</div>
						<div className="text-sm text-muted-foreground">
							{mediaStoreError.message}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (mediaStoreLoading) {
		return (
			<div className="h-full flex flex-col gap-4 p-4">
				<div className="flex items-center justify-center flex-1">
					<div className="flex items-center space-x-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>正在加载分割面板...</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col gap-4 p-4">
			{/* Mode Tabs */}
			<Tabs value={mode} onValueChange={(v) => setMode(v as "image" | "video")}>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="image" className="flex items-center gap-2">
						<ImagePlus className="w-4 h-4" />
						图片
					</TabsTrigger>
					<TabsTrigger value="video" className="flex items-center gap-2">
						<Video className="w-4 h-4" />
						视频
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{mode === "video" && (
				<Tabs
					value={videoBackend}
					onValueChange={(value) =>
						setVideoBackend(value as "local-person" | "sam3")
					}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger
							value="local-person"
							className="flex items-center gap-2"
						>
							<UserRound className="size-4" />
							本地人物
						</TabsTrigger>
						<TabsTrigger value="sam3" className="flex items-center gap-2">
							<ScanSearch className="size-4" />
							云端物体
						</TabsTrigger>
					</TabsList>
				</Tabs>
			)}

			{/* Segment Button */}
			{!isLocalPersonVideo && (
				<div className="flex-shrink-0">
					<Button
						type="button"
						onClick={handleSegment}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
						disabled={!canSegment}
						className="w-full"
						size="lg"
					>
						{isProcessing || segmentationTaskRunning ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								正在分割...
							</>
						) : (
							<>
								<Wand2 className="w-4 h-4 mr-2" />
								分割对象
							</>
						)}
					</Button>
					{segmentationTaskError ? (
						<p className="mt-2 text-xs text-destructive">
							{segmentationTaskError}
						</p>
					) : null}
				</div>
			)}

			{/* Prompt Toolbar */}
			{!isLocalPersonVideo && (
				<div className="flex-shrink-0">
					<PromptToolbar />
				</div>
			)}

			{/* Source Upload Section */}
			<div className="flex-shrink-0">
				{mode === "image" ? (
					<ImageUploader onImageSelect={handleImageSelect} />
				) : (
					<Input
						type="file"
						accept="video/*"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) handleVideoSelect(file);
						}}
					/>
				)}
			</div>

			{/* Main Content Area */}
			{isLocalPersonVideo && sourceVideoFile && sourceVideoUrl ? (
				<LocalPersonCutoutPanel
					projectId={projectId}
					sourceFile={sourceVideoFile}
					sourceUrl={sourceVideoUrl}
					autoStartRequestId={trackingRequest?.requestId}
					addMediaItem={addMediaItem}
					onProgress={({ progress }) =>
						updateGeneratedMaskTrackingProgress({
							progress,
							source: "mediapipe",
						})
					}
					onMaskReady={({
						sourceMediaId,
						trackingSamples,
						targetElementId,
						trackingRequestId,
					}) =>
						attachGeneratedMask({
							sourceMediaId,
							type: "person",
							source: "mediapipe",
							name: "MediaPipe person",
							trackingSamples,
							targetElementId,
							trackingRequestId,
						})
					}
					onMaskError={(message) => failGeneratedMaskTracking({ message })}
				/>
			) : mode === "video" && (segmentedVideoUrl || sourceVideoUrl) ? (
				<div className="flex-1 min-h-0">
					<video
						controls
						className="size-full object-contain"
						src={segmentedVideoUrl || sourceVideoUrl || undefined}
					/>
				</div>
			) : sourceImageUrl ? (
				<div className="flex-1 flex gap-4 min-h-0">
					{/* Canvas */}
					<div className="flex-1 min-w-0">
						<SegmentationCanvas />
					</div>

					{/* Object List Sidebar */}
					{showObjectList && objects.length > 0 && (
						<div className="w-64 flex-shrink-0">
							<ObjectList />
						</div>
					)}
				</div>
			) : (
				/* Empty state */
				<div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
					<div>
						<div className="text-6xl mb-4">&#9986;</div>
						<h3 className="text-lg font-medium mb-2">
							{isLocalPersonVideo
								? "Local Person Cutout"
								: "AI Object Segmentation"}
						</h3>
						<p className="text-sm">
							{isLocalPersonVideo
								? "Choose a video to remove its background"
								: "Upload an image and describe what to segment"}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
