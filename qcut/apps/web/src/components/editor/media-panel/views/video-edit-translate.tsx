/**
 * HeyGen Translate (Speed) Tab Component
 *
 * Translates video audio with lip-sync to 30+ languages.
 * $0.05 per second of output video.
 */

import { useState } from "react";
import { Loader2, Languages, Settings, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useVideoEditProcessing } from "./use-video-edit-processing";
import { useProjectStore } from "@/stores/project-store";
import {
	VIDEO_EDIT_UPLOAD_CONSTANTS,
	VIDEO_EDIT_HELPERS,
	VIDEO_EDIT_ERROR_MESSAGES,
} from "./video-edit-constants";
import type { HeyGenTranslateParams } from "./video-edit-types";
import { openInNewTab } from "@/lib/utils";
import { revokeObjectURL as revokeManagedObjectURL } from "@/lib/media/blob-manager";
import { HEYGEN_TRANSLATE_LANGUAGES } from "@/lib/ai-video/validation/validators/translate-validators";

const DEFAULT_ESTIMATED_DURATION_SECONDS = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES;

export function TranslateTab() {
	const [sourceVideo, setSourceVideo] = useState<File | null>(null);
	const [videoPreview, setVideoPreview] = useState<string | null>(null);
	const [outputLanguage, setOutputLanguage] = useState<string>("");
	const [audioOnly, setAudioOnly] = useState(false);
	const [speakerNum, setSpeakerNum] = useState<number | undefined>();
	const [dynamicDuration, setDynamicDuration] = useState(true);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [videoDuration, setVideoDuration] = useState<number | null>(null);

	const { activeProject } = useProjectStore();

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
		activeTab: "translate",
		activeProject,
		onSuccess: (result) => {
			console.log("Translation complete:", result);
		},
		onError: (error) => {
			setError(error);
		},
	});

	const getVideoDuration = ({ file }: { file: File }): Promise<number> => {
		return new Promise((resolve, reject) => {
			try {
				const video = document.createElement("video");
				video.preload = "metadata";
				video.onloadedmetadata = () => {
					revokeManagedObjectURL(
						video.src,
						"video-edit-translate:onloadedmetadata"
					);
					resolve(video.duration);
				};
				video.onerror = () => {
					revokeManagedObjectURL(video.src, "video-edit-translate:onerror");
					reject(new Error("Failed to load video metadata"));
				};
				video.src = window.URL.createObjectURL(file);
			} catch (metadataError: unknown) {
				reject(
					metadataError instanceof Error
						? metadataError
						: new Error("Failed to read video metadata")
				);
			}
		});
	};

	const handleVideoChange = async (
		file: File | null,
		preview: string | undefined | null
	) => {
		try {
			if (file) {
				const validation = VIDEO_EDIT_HELPERS.validateVideoFile(
					file,
					MAX_FILE_SIZE_BYTES
				);
				if (!validation.valid) {
					setError(validation.error!);
					return;
				}
			}

			setSourceVideo(file);
			setVideoPreview(preview ?? null);
			setVideoDuration(null);
			setError(null);
			reset();

			if (!file) return;

			const duration = await getVideoDuration({ file });
			if (Number.isFinite(duration) && duration > 0) {
				const MAX_DURATION_SECONDS = 5 * 60;
				if (duration > MAX_DURATION_SECONDS) {
					setError("Video is too long. Maximum duration is 5 minutes.");
					return;
				}
				setVideoDuration(duration);
			} else {
				setVideoDuration(null);
			}
		} catch (metadataError: unknown) {
			console.error(
				"TranslateTab: Failed to read video metadata",
				metadataError
			);
			setVideoDuration(null);
			setError("Unable to read video duration. Please try a different file.");
		}
	};

	const handleProcessClick = async () => {
		if (!sourceVideo) {
			setError(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			return;
		}

		if (!outputLanguage) {
			setError("Please select a target language");
			return;
		}

		const params: Partial<HeyGenTranslateParams> = {
			output_language: outputLanguage,
			translate_audio_only: audioOnly,
			enable_dynamic_duration: dynamicDuration,
			speaker_num: speakerNum,
		};

		await handleProcess(params);
	};

	const estimateCost = () => {
		const durationForEstimate =
			videoDuration && Number.isFinite(videoDuration) && videoDuration > 0
				? videoDuration
				: DEFAULT_ESTIMATED_DURATION_SECONDS;
		return VIDEO_EDIT_HELPERS.calculateTranslateCost(durationForEstimate);
	};

	return (
		<div className="space-y-4">
			{/* Model Info */}
			<Card className="p-3 bg-primary/5 border-primary/20">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-xs font-medium text-primary">
							HeyGen Translate (Speed)
						</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Translate audio + lip-sync to 30+ languages
						</p>
					</div>
					<div className="text-right">
						<p className="text-xs font-semibold">$0.05/sec</p>
						<p className="text-xs text-muted-foreground">~$0.50 for 10s</p>
					</div>
				</div>
			</Card>

			{/* Video Upload */}
			<FileUpload
				id="translate-video-input"
				label="Source Video"
				helperText="Up to 5 minutes, 500MB"
				fileType="video"
				acceptedTypes={VIDEO_EDIT_UPLOAD_CONSTANTS.ALLOWED_VIDEO_TYPES}
				maxSizeBytes={MAX_FILE_SIZE_BYTES}
				maxSizeLabel="500MB"
				formatsLabel={VIDEO_EDIT_UPLOAD_CONSTANTS.VIDEO_FORMATS_LABEL}
				file={sourceVideo}
				preview={videoPreview}
				onFileChange={handleVideoChange}
				onError={setError}
			/>

			{/* Language Selector */}
			<div className="space-y-2">
				<Label className="flex items-center text-xs">
					<Languages className="size-3 mr-1" />
					Target Language
				</Label>
				<Select
					value={outputLanguage}
					onValueChange={setOutputLanguage}
					disabled={isProcessing}
				>
					<SelectTrigger className="text-xs">
						<SelectValue placeholder="Select language..." />
					</SelectTrigger>
					<SelectContent>
						{HEYGEN_TRANSLATE_LANGUAGES.map((lang) => (
							<SelectItem key={lang} value={lang} className="text-xs">
								{lang}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Audio Only Toggle */}
			<div className="flex items-center justify-between">
				<div>
					<Label className="text-xs">Audio Only</Label>
					<p className="text-xs text-muted-foreground">
						Translate voice without lip-sync
					</p>
				</div>
				<Switch
					checked={audioOnly}
					onCheckedChange={setAudioOnly}
					disabled={isProcessing}
				/>
			</div>

			{/* Advanced Settings */}
			<Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
				<CollapsibleTrigger asChild>
					<Button variant="outline" size="sm" className="w-full">
						<Settings className="size-3 mr-1" />
						Advanced Settings
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="space-y-4 mt-4">
					{/* Speaker Count */}
					<div className="space-y-2">
						<Label className="text-xs">Speaker Count (Optional)</Label>
						<Input
							type="number"
							placeholder="Auto-detect"
							min={1}
							max={10}
							value={speakerNum ?? ""}
							onChange={(e) => {
								if (!e.target.value) {
									setSpeakerNum(undefined);
									return;
								}
								const parsed = parseInt(e.target.value, 10);
								if (Number.isInteger(parsed)) setSpeakerNum(parsed);
							}}
							disabled={isProcessing}
							className="text-xs"
						/>
						<p className="text-xs text-muted-foreground">
							Specify if the video has multiple speakers
						</p>
					</div>

					{/* Dynamic Duration */}
					<div className="flex items-center justify-between">
						<div>
							<Label className="text-xs">Dynamic Duration</Label>
							<p className="text-xs text-muted-foreground">
								Adjust duration for different speaking rates
							</p>
						</div>
						<Switch
							checked={dynamicDuration}
							onCheckedChange={setDynamicDuration}
							disabled={isProcessing}
						/>
					</div>
				</CollapsibleContent>
			</Collapsible>

			{/* Cost Estimate */}
			<Card className="p-3 bg-primary/5">
				<div className="flex items-center justify-between">
					<div className="flex items-center text-xs">
						<DollarSign className="size-3 mr-1" />
						<span>Estimated Cost:</span>
					</div>
					<span className="text-xs font-medium">
						{VIDEO_EDIT_HELPERS.formatCost(estimateCost())} ($0.05/sec)
					</span>
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
						<div className="flex justify-between items-center">
							<p className="text-xs font-medium text-primary">
								Translation complete!
							</p>
							{result.cost && (
								<span className="text-xs">
									Cost: {VIDEO_EDIT_HELPERS.formatCost(result.cost)}
								</span>
							)}
						</div>
						{result.videoUrl && (
							<video
								controls
								className="w-full rounded-md"
								src={result.videoUrl}
								aria-label={`Video translated to ${outputLanguage}`}
							/>
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
									Download Video
								</Button>
							)}
						</div>
					</div>
				</Card>
			)}

			{/* Process Button */}
			<Button
				onClick={handleProcessClick}
				disabled={!canProcess || !outputLanguage}
				className="w-full"
				size="sm"
			>
				{isProcessing ? (
					<>
						<Loader2 className="size-4 mr-2 animate-spin" />
						Translating... {progress}%
					</>
				) : (
					<>
						<Languages className="size-4 mr-2" />
						Translate Video
					</>
				)}
			</Button>

			{/* Info */}
			<div className="text-xs text-muted-foreground space-y-1">
				<p>• Videos up to 5 minutes supported</p>
				<p>• Includes lip-sync for natural-looking results</p>
				<p>• Use "Audio Only" for voice-only translation</p>
			</div>
		</div>
	);
}
