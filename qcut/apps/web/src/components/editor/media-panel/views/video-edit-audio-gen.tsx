/**
 * Kling Video to Audio Tab Component
 *
 * WHY this component:
 * - Generates audio for videos (3-20 seconds)
 * - Creates sound effects and background music
 * - Supports ASMR mode for enhanced audio
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Volume2, Music, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FileUpload } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { useVideoEditProcessing } from "./use-video-edit-processing";
import { useProjectStore } from "@/stores/project-store";
import {
	VIDEO_EDIT_UPLOAD_CONSTANTS,
	VIDEO_EDIT_HELPERS,
	VIDEO_EDIT_ERROR_MESSAGES,
} from "./video-edit-constants";
import type { KlingVideoToAudioParams } from "./video-edit-types";
import { openInNewTab } from "@/lib/utils";
import { getFFmpegUtils } from "@/lib/ffmpeg/ffmpeg-utils-loader";
import { createObjectURL } from "@/lib/media/blob-manager";
import { useVideoEditRequestStore } from "@/stores/video-edit-request-store";

export function AudioGenTab() {
	const audioGenerationRequest = useVideoEditRequestStore(
		(state) => state.audioGenerationRequest
	);
	const clearAudioGenerationRequest = useVideoEditRequestStore(
		(state) => state.clearAudioGenerationRequest
	);
	// State
	const [sourceVideo, setSourceVideo] = useState<File | null>(null);
	const [videoPreview, setVideoPreview] = useState<string | null>(null);
	const [soundEffectPrompt, setSoundEffectPrompt] = useState("");
	const [backgroundMusicPrompt, setBackgroundMusicPrompt] = useState("");
	const [asmrMode, setAsmrMode] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [targetElementId, setTargetElementId] = useState<string>();
	const [pendingAutoRequestId, setPendingAutoRequestId] = useState<string>();
	const processedRequestIdsRef = useRef(new Set<string>());

	// Store hooks
	const { activeProject } = useProjectStore();

	// Processing hook
	const {
		isProcessing,
		progress,
		statusMessage,
		elapsedTime,
		result,
		handleProcess,
		reset,
		canProcess,
	} = useVideoEditProcessing({
		sourceVideo,
		activeTab: "audio-gen",
		activeProject,
		targetElementId,
		onSuccess: (result) => {
			console.log("Audio generation complete:", result);
			// Could show success toast here
		},
		onError: (error) => {
			setError(error);
		},
	});

	useEffect(() => {
		if (!audioGenerationRequest) return;
		let disposed = false;
		const prepareRequest = async () => {
			try {
				const sourceStart = audioGenerationRequest.sourceStart ?? 0;
				const sourceEnd =
					audioGenerationRequest.sourceEnd ?? sourceStart + 20;
				const selectedDuration = sourceEnd - sourceStart;
				if (selectedDuration < 3 || selectedDuration > 20) {
					throw new Error("AI 音效支持 3 至 20 秒的所选片段");
				}
				let preparedFile = audioGenerationRequest.sourceVideo;
				let preparedPreview = audioGenerationRequest.previewUrl ?? null;
				if (sourceStart > 0.01 || selectedDuration > 0) {
					const { trimVideo } = await getFFmpegUtils();
					const trimmed = await trimVideo(
						audioGenerationRequest.sourceVideo,
						sourceStart,
						sourceEnd
					);
					preparedFile = new File(
						[trimmed],
						`audio-source-${audioGenerationRequest.sourceVideo.name}`,
						{ type: "video/mp4" }
					);
					preparedPreview = createObjectURL(trimmed, "ai-audio-trim-preview");
				}
				if (disposed) return;
				reset();
				setSourceVideo(preparedFile);
				setVideoPreview(preparedPreview);
				setTargetElementId(audioGenerationRequest.targetElementId);
				setSoundEffectPrompt(
					audioGenerationRequest.soundEffectPrompt ?? ""
				);
				setBackgroundMusicPrompt(
					audioGenerationRequest.backgroundMusicPrompt ?? ""
				);
				setError(null);
				if (audioGenerationRequest.autoStart) {
					setPendingAutoRequestId(audioGenerationRequest.id);
				}
			} catch (requestError) {
				if (disposed) return;
				setError(
					requestError instanceof Error
						? requestError.message
						: "所选片段准备失败"
				);
				clearAudioGenerationRequest({ id: audioGenerationRequest.id });
			}
		};
		void prepareRequest();
		return () => {
			disposed = true;
		};
	}, [audioGenerationRequest, clearAudioGenerationRequest, reset]);

	useEffect(() => {
		if (
			!pendingAutoRequestId ||
			!sourceVideo ||
			!canProcess ||
			processedRequestIdsRef.current.has(pendingAutoRequestId)
		) {
			return;
		}
		processedRequestIdsRef.current.add(pendingAutoRequestId);
		const requestId = pendingAutoRequestId;
		setPendingAutoRequestId(undefined);
		clearAudioGenerationRequest({ id: requestId });
		void handleProcess({
			sound_effect_prompt: soundEffectPrompt.trim() || undefined,
			background_music_prompt: backgroundMusicPrompt.trim() || undefined,
			asmr_mode: asmrMode,
		});
	}, [
		asmrMode,
		backgroundMusicPrompt,
		canProcess,
		clearAudioGenerationRequest,
		handleProcess,
		pendingAutoRequestId,
		soundEffectPrompt,
		sourceVideo,
	]);

	/**
	 * Handle video file change
	 * WHY: Validate and preview video before processing
	 */
	const handleVideoChange = (
		file: File | null,
		preview: string | undefined | null
	) => {
		if (file) {
			// Validate file
			const validation = VIDEO_EDIT_HELPERS.validateVideoFile(file);
			if (!validation.valid) {
				setError(validation.error!);
				return;
			}
		}

		setSourceVideo(file);
		setVideoPreview(preview ?? null); // Coerce undefined to null for type safety
		setTargetElementId(undefined);
		setPendingAutoRequestId(undefined);
		setError(null);
		reset(); // Reset processing state
	};

	/**
	 * Handle process click
	 * WHY: Start audio generation with optional prompts
	 */
	const handleProcessClick = async () => {
		if (!sourceVideo) {
			setError(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			return;
		}

		// Include optional prompts if provided
		const params: Partial<KlingVideoToAudioParams> = {
			sound_effect_prompt: soundEffectPrompt.trim() || undefined,
			background_music_prompt: backgroundMusicPrompt.trim() || undefined,
			asmr_mode: asmrMode,
		};

		await handleProcess(params);
	};

	return (
		<div className="space-y-4">
			{/* Model Info */}
			<Card className="p-3 bg-primary/5 border-primary/20">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-xs font-medium text-primary">
							Kling Video to Audio
						</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							根据视频画面生成音频
						</p>
					</div>
					<div className="text-right">
						<p className="text-xs font-semibold">$0.035</p>
						<p className="text-xs text-muted-foreground">每段视频</p>
					</div>
				</div>
			</Card>

			{/* Video Upload */}
			<FileUpload
				id="kling-video-input"
			label="源视频"
			helperText="3 至 20 秒"
				fileType="video"
				acceptedTypes={VIDEO_EDIT_UPLOAD_CONSTANTS.ALLOWED_VIDEO_TYPES}
				maxSizeBytes={VIDEO_EDIT_UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_BYTES}
				maxSizeLabel={VIDEO_EDIT_UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_LABEL}
				formatsLabel={VIDEO_EDIT_UPLOAD_CONSTANTS.VIDEO_FORMATS_LABEL}
				file={sourceVideo}
				preview={videoPreview}
				onFileChange={handleVideoChange}
				onError={setError}
			/>

			{/* Sound Effect Prompt */}
			<div className="space-y-2">
				<Label className="flex items-center text-xs">
					<Volume2 className="size-3 mr-1" />
					音效提示（可选）
				</Label>
				<Textarea
					placeholder="例如：碎石脚步、鸟鸣、风吹树叶（最多 200 字）"
					value={soundEffectPrompt}
					onChange={(e) => setSoundEffectPrompt(e.target.value)}
					className="min-h-[60px] text-xs"
					disabled={isProcessing}
					maxLength={200}
				/>
			</div>

			{/* Background Music Prompt */}
			<div className="space-y-2">
				<Label className="flex items-center text-xs">
					<Music className="size-3 mr-1" />
					背景音乐提示（可选）
				</Label>
				<Textarea
					placeholder="例如：欢快爵士钢琴、电影感管弦乐、Lo-fi（最多 200 字）"
					value={backgroundMusicPrompt}
					onChange={(e) => setBackgroundMusicPrompt(e.target.value)}
					className="min-h-[60px] text-xs"
					disabled={isProcessing}
					maxLength={200}
				/>
			</div>

			{/* ASMR Mode */}
			<Card className="p-3">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label className="flex items-center text-xs">
							<Sparkles className="size-3 mr-1" />
						ASMR 模式
						</Label>
						<p className="text-xs text-muted-foreground">
						增强细节音效，提升沉浸感
						</p>
					</div>
					<Switch
						checked={asmrMode}
						onCheckedChange={setAsmrMode}
						disabled={isProcessing}
					/>
				</div>
			</Card>

			{/* Error Display */}
			{error && (
				<div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
					<p className="text-xs text-destructive">{error}</p>
				</div>
			)}

			{/* Progress Display */}
			{isProcessing && (
				<div className="space-y-2">
					<Progress value={progress} className="h-2" />
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>{statusMessage}</span>
						<span>{elapsedTime}s</span>
					</div>
				</div>
			)}

			{/* Result Display */}
			{result && !isProcessing && (
				<Card className="p-3 bg-primary/5">
					<div className="space-y-2">
						<p className="text-xs font-medium text-primary">
							音频生成完成
						</p>
						{result.audioUrl && (
							<audio controls className="w-full h-8" src={result.audioUrl} />
						)}
						<div className="flex gap-2">
							{result.videoUrl && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => openInNewTab(result.videoUrl!)}
									className="text-xs"
								>
								打开视频
								</Button>
							)}
							{result.audioUrl && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => openInNewTab(result.audioUrl!)}
									className="text-xs"
								>
								打开音频
								</Button>
							)}
						</div>
					</div>
				</Card>
			)}

			{/* Process Button */}
			<Button
				onClick={handleProcessClick}
				disabled={!canProcess}
				className="w-full"
				size="sm"
			>
				{isProcessing ? (
					<>
						<Loader2 className="size-4 mr-2 animate-spin" />
						处理中... {progress}%
					</>
				) : (
					<>
						<Volume2 className="size-4 mr-2" />
						生成音频
					</>
				)}
			</Button>

			{/* Info */}
			<div className="text-xs text-muted-foreground space-y-1">
			<p>视频时长需为 3 至 20 秒</p>
			<p>提示词可选，每项最多 200 字</p>
			<p>可同时生成音效和背景音乐</p>
			</div>
		</div>
	);
}
