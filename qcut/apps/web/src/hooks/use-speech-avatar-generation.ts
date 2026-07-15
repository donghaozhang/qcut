import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useAIPipeline } from "@/hooks/use-ai-pipeline";
import {
	generatedMediaUrl,
	resolveGeneratedMedia,
} from "@/lib/ai-video/generated-media";
import { estimateAlignedAvatarCostUsd } from "@/lib/cloud-tasks/task-costs";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import {
	insertAlignedGeneratedMediaToEditor,
	rollbackAlignedGeneratedMediaTracks,
} from "@/lib/timeline/aligned-generated-media";
import { type MediaItem, useMediaStore } from "@/stores/media/media-store";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { AIPipelineProgress, AIPipelineResult } from "@/types/electron";

type GenerationKind = "speech" | "avatar" | "pair";
type PairPhase = "speech" | "avatar";

export function useSpeechAvatarGeneration({
	captionElementId,
	text,
	startTime,
	duration,
}: {
	captionElementId: string;
	text: string;
	startTime: number;
	duration: number;
}) {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const [speechModel, setSpeechModel] = useState("chatterbox_tts");
	const [avatarImageId, setAvatarImageId] = useState("");
	const [generationKind, setGenerationKind] = useState<GenerationKind | null>(
		null
	);
	const [activeAlignedTask, setActiveAlignedTask] = useState<{
		captionElementId: string;
		taskId: string;
	}>();
	const pairPhaseRef = useRef<PairPhase | null>(null);
	const alignedTaskRef = useRef<string | null>(null);
	const handlePipelineProgress = useCallback((update: AIPipelineProgress) => {
		const taskId = alignedTaskRef.current;
		const phase = pairPhaseRef.current;
		if (!taskId || !phase) return;
		const base = phase === "speech" ? 5 : 48;
		const span = phase === "speech" ? 38 : 47;
		useCloudTaskStore.getState().updateProgress({
			id: taskId,
			progress:
				base + (Math.max(0, Math.min(100, update.percent)) / 100) * span,
			message: update.message,
		});
	}, []);
	const { generate, cancel, isAvailable, isGenerating, progress } =
		useAIPipeline({
			onProgress: handlePipelineProgress,
			persistTasks: false,
		});
	const avatarImages = mediaItems.filter(
		(item) =>
			item.type === "image" &&
			Boolean(item.localPath || item.originalUrl || item.url)
	);
	const resumableAlignedTask = useCloudTaskStore((state) =>
		state.tasks.find(
			(task) =>
				task.kind === "avatar" &&
				task.payload.operation === "aligned-caption-avatar" &&
				task.payload.captionElementId === captionElementId &&
				(task.status === "interrupted" || task.status === "failed")
		)
	);
	const alignedTaskId =
		activeAlignedTask?.captionElementId === captionElementId
			? activeAlignedTask.taskId
			: resumableAlignedTask?.id;

	const addGeneratedMedia = async ({
		result,
		kind,
	}: {
		result: AIPipelineResult;
		kind: "speech" | "avatar";
	}): Promise<MediaItem | undefined> => {
		if (!projectId) return undefined;
		const mediaItem = await resolveGeneratedMedia({ result, projectId });
		if (!mediaItem) {
			toast.success("生成素材已添加到素材库");
			return undefined;
		}
		await insertAlignedGeneratedMediaToEditor({
			speechMedia: kind === "speech" ? mediaItem : undefined,
			avatarMedia: kind === "avatar" ? mediaItem : undefined,
			startTime,
			duration,
		});
		toast.success(
			kind === "speech" ? "语音已与字幕对齐" : "数字人已与字幕对齐"
		);
		return mediaItem;
	};

	const createSpeech = async () => {
		if (!projectId || !text.trim() || isGenerating) return;
		setGenerationKind("speech");
		try {
			const result = await generate({
				command: "generate-speech",
				args: { model: speechModel, text },
				projectId,
				autoImport: true,
			});
			if (!result.success) {
				toast.error(result.error || "语音生成失败");
				return;
			}
			await addGeneratedMedia({ result, kind: "speech" });
		} finally {
			setGenerationKind(null);
		}
	};

	const createAvatar = async () => {
		if (!projectId || !avatarImageId || !text.trim() || isGenerating) return;
		const image = avatarImages.find((item) => item.id === avatarImageId);
		const imageUrl = image?.localPath || image?.originalUrl || image?.url;
		if (!imageUrl) return;

		setGenerationKind("avatar");
		try {
			const result = await generate({
				command: "generate-avatar",
				args: {
					model: "fabric_1_0_text",
					text,
					"image-url": imageUrl,
					resolution: "720p",
					duration,
				},
				projectId,
				autoImport: true,
			});
			if (!result.success) {
				toast.error(result.error || "数字人生成失败");
				return;
			}
			await addGeneratedMedia({ result, kind: "avatar" });
		} finally {
			setGenerationKind(null);
		}
	};

	const createAlignedPair = async ({
		existingTaskId,
		avatarImageIdOverride,
		speechModelOverride,
	}: {
		existingTaskId?: string;
		avatarImageIdOverride?: string;
		speechModelOverride?: string;
	} = {}): Promise<void> => {
		const selectedAvatarId = avatarImageIdOverride ?? avatarImageId;
		const selectedSpeechModel = speechModelOverride ?? speechModel;
		if (!projectId || !selectedAvatarId || !text.trim() || isGenerating) {
			return;
		}
		const image = avatarImages.find((item) => item.id === selectedAvatarId);
		const imageUrl = image?.localPath || image?.originalUrl || image?.url;
		if (!imageUrl) return;

		const cloudTasks = useCloudTaskStore.getState();
		const taskId =
			existingTaskId ??
			cloudTasks.createTask({
				kind: "avatar",
				label: "配音与数字人对齐",
				payload: {
					operation: "aligned-caption-avatar",
					captionElementId,
					text,
					startTime,
					duration,
					avatarImageId: selectedAvatarId,
					speechModel: selectedSpeechModel,
				},
				estimatedCostUsd: estimateAlignedAvatarCostUsd({ text, duration }),
			});
		setActiveAlignedTask({ captionElementId, taskId });
		alignedTaskRef.current = taskId;
		setGenerationKind("pair");
		cloudTasks.startTask({
			id: taskId,
			message: "正在生成对齐配音...",
		});
		const open = () => {
			const timeline = useTimelineStore.getState();
			const captionTrack = timeline._tracks.find((track) =>
				track.elements.some((candidate) => candidate.id === captionElementId)
			);
			if (captionTrack) {
				timeline.selectElement(captionTrack.id, captionElementId);
			}
		};
		const retryCurrent = () =>
			createAlignedPair({
				existingTaskId: taskId,
				avatarImageIdOverride: selectedAvatarId,
				speechModelOverride: selectedSpeechModel,
			});
		registerCloudTaskRuntimeActions({
			taskId,
			actions: {
				cancel: async () => {
					await cancel();
					useCloudTaskStore.getState().cancelTask({ id: taskId });
				},
				retry: retryCurrent,
				open,
			},
		});

		try {
			pairPhaseRef.current = "speech";
			const speechResult = await generate({
				command: "generate-speech",
				args: { model: selectedSpeechModel, text },
				projectId,
				autoImport: true,
			});
			if (!speechResult.success) {
				throw new Error(speechResult.error || "语音生成失败");
			}
			const speechMedia = await resolveGeneratedMedia({
				result: speechResult,
				projectId,
			});
			if (!speechMedia || speechMedia.type !== "audio") {
				throw new Error("生成语音无法作为音频导入");
			}
			const speechUrl = generatedMediaUrl({
				media: speechMedia,
				result: speechResult,
			});
			if (!speechUrl) throw new Error("生成语音路径不可用");
			if (
				useCloudTaskStore.getState().tasks.find((task) => task.id === taskId)
					?.status === "canceled"
			) {
				return;
			}

			pairPhaseRef.current = "avatar";
			useCloudTaskStore.getState().updateProgress({
				id: taskId,
				progress: 48,
				message: "正在生成口型同步数字人...",
			});
			const avatarResult = await generate({
				command: "generate-avatar",
				args: {
					model: "fabric_1_0",
					"image-url": imageUrl,
					"audio-url": speechUrl,
					resolution: "720p",
					duration,
				},
				projectId,
				autoImport: true,
			});
			if (!avatarResult.success) {
				throw new Error(avatarResult.error || "数字人生成失败");
			}
			const avatarMedia = await resolveGeneratedMedia({
				result: avatarResult,
				projectId,
			});
			if (!avatarMedia || avatarMedia.type === "audio") {
				throw new Error("生成数字人无法作为视频导入");
			}

			const inserted = await insertAlignedGeneratedMediaToEditor({
				speechMedia,
				avatarMedia,
				startTime,
				duration,
			});
			useCloudTaskStore.getState().completeTask({
				id: taskId,
				message: "配音与数字人已添加到时间线",
				actualCostUsd:
					(speechResult.cost ?? 0) + (avatarResult.cost ?? 0) || undefined,
				output: {
					speechMediaId: speechMedia.id,
					avatarMediaId: avatarMedia.id,
					groupId: inserted.groupId,
					createdTrackIds: inserted.createdTrackIds,
				},
			});
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					open,
					retry: retryCurrent,
					undo: async () => {
						const timeline = useTimelineStore.getState();
						timeline.pushHistory();
						timeline.restoreTracks(
							rollbackAlignedGeneratedMediaTracks({
								tracks: timeline._tracks,
								groupId: inserted.groupId,
								createdTrackIds: inserted.createdTrackIds,
							})
						);
						await timeline.saveImmediate();
						useCloudTaskStore.getState().completeTask({
							id: taskId,
							message: "配音与数字人结果已撤销",
							output: { groupId: inserted.groupId, undone: true },
						});
						registerCloudTaskRuntimeActions({
							taskId,
							actions: { open, retry: retryCurrent },
						});
						toast.success("已撤销配音与数字人结果");
					},
				},
			});
			toast.success("配音与数字人已与字幕对齐");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const status = useCloudTaskStore
				.getState()
				.tasks.find((task) => task.id === taskId)?.status;
			if (status !== "canceled") {
				useCloudTaskStore.getState().failTask({ id: taskId, error: message });
				toast.error("数字人对齐失败", { description: message });
			}
		} finally {
			pairPhaseRef.current = null;
			alignedTaskRef.current = null;
			setGenerationKind(null);
		}
	};

	const cancelAlignedPair = async () => {
		await cancel();
		if (alignedTaskId) {
			useCloudTaskStore.getState().cancelTask({ id: alignedTaskId });
		}
	};

	const retryAlignedPair = () => {
		if (!alignedTaskId) return;
		const task = useCloudTaskStore
			.getState()
			.tasks.find((candidate) => candidate.id === alignedTaskId);
		if (!task) return;
		const storedAvatarId = task.payload.avatarImageId;
		const storedSpeechModel = task.payload.speechModel;
		if (typeof storedAvatarId !== "string") return;
		setAvatarImageId(storedAvatarId);
		if (typeof storedSpeechModel === "string") {
			setSpeechModel(storedSpeechModel);
		}
		void createAlignedPair({
			existingTaskId: task.id,
			avatarImageIdOverride: storedAvatarId,
			speechModelOverride:
				typeof storedSpeechModel === "string" ? storedSpeechModel : speechModel,
		});
	};

	return {
		alignedTaskId,
		avatarImageId,
		avatarImages,
		canGenerateAlignedPair:
			Boolean(projectId) &&
			isAvailable &&
			!isGenerating &&
			Boolean(avatarImageId) &&
			Boolean(text.trim()),
		canGenerateAvatar:
			Boolean(projectId) &&
			isAvailable &&
			!isGenerating &&
			Boolean(avatarImageId) &&
			Boolean(text.trim()),
		canGenerateSpeech:
			Boolean(projectId) &&
			isAvailable &&
			!isGenerating &&
			Boolean(text.trim()),
		cancelAlignedPair,
		createAlignedPair,
		createAvatar,
		createSpeech,
		generationKind,
		isAvailable,
		isGenerating,
		progress,
		retryAlignedPair,
		setAvatarImageId,
		setSpeechModel,
		speechModel,
	};
}
