"use client";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useAsyncMediaStoreActions } from "@/hooks/media/use-async-media-store";
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
import {
	segmentVideoWithText,
	segmentWithText,
} from "@/lib/ai-clients/sam3-client";
import { uploadVideoToFal } from "@/lib/ai-video/core/fal-upload";
import { getFalApiKeyAsync } from "@/lib/ai-video/core/fal-request";
import { debugLog } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
	} = useSegmentationStore();

	const {
		loading: mediaStoreLoading,
		error: mediaStoreError,
		addMediaItem,
	} = useAsyncMediaStoreActions();

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
			alert("Please enter a text prompt describing what to segment.");
			return;
		}

		if (mode === "image" && (!sourceImageFile || !sourceImageUrl)) {
			alert("Please upload an image first.");
			return;
		}
		if (mode === "video" && (!sourceVideoFile || !sourceVideoUrl)) {
			alert("Please upload a video first.");
			return;
		}

		try {
			const startTime = Date.now();

			setProcessingState({
				isProcessing: true,
				progress: 0,
				statusMessage: "Uploading image...",
				elapsedTime: 0,
			});

			if (mode === "video") {
				const apiKey = await getFalApiKeyAsync();
				if (!apiKey)
					throw new Error("FAL API key is required for video tracking");
				const uploadedVideoUrl = await uploadVideoToFal(
					sourceVideoFile!,
					apiKey
				);
				const result = await segmentVideoWithText(
					uploadedVideoUrl,
					currentTextPrompt.trim(),
					{ apply_mask: true, detection_threshold: 0.5 }
				);
				if (result.video?.url) {
					setSegmentedVideo(result.video.url);
					if (addMediaItem) {
						const response = await fetch(result.video.url);
						if (!response.ok)
							throw new Error("Failed to download tracked video");
						const blob = await response.blob();
						const file = new File([blob], `sam3-tracked-${Date.now()}.mp4`, {
							type: "video/mp4",
						});
						await addMediaItem(projectId, {
							name: `Tracked: ${currentTextPrompt.trim()}`,
							type: "video",
							file,
							url: result.video.url,
							duration: 10,
							width: 1920,
							height: 1080,
						});
					}
				}
				setProcessingState({
					isProcessing: false,
					progress: 100,
					statusMessage: "Video tracking complete",
					elapsedTime: (Date.now() - startTime) / 1000,
				});
				return;
			}

			debugLog("Uploading image to FAL for segmentation...");
			const { uploadImageToFAL } = await import(
				"@/lib/ai-clients/image-edit-client"
			);
			const uploadedImageUrl = await uploadImageToFAL(sourceImageFile!);

			setProcessingState({
				isProcessing: true,
				progress: 25,
				statusMessage: "Detecting objects...",
				elapsedTime: (Date.now() - startTime) / 1000,
			});

			// Call SAM-3 API
			const result = await segmentWithText(
				uploadedImageUrl,
				currentTextPrompt.trim(),
				{
					return_multiple_masks: true,
					max_masks: 10,
					include_scores: true,
					include_boxes: true,
					apply_mask: true,
				}
			);

			// Process results
			if (result.image?.url) {
				setCompositeImage(result.image.url);
			}

			const newMasks = result.masks ?? [];
			if (newMasks.length > 0) {
				setMasks(newMasks);

				// Create objects for each mask
				newMasks.forEach((mask, index) => {
					addObject({
						name: `${currentTextPrompt} ${index + 1}`,
						maskUrl: mask.url,
						score: result.scores?.[index]?.[0],
						boundingBox: result.boxes?.[index]?.[0],
						pointPrompts: [],
						boxPrompts: [],
						textPrompt: currentTextPrompt,
						visible: true,
					});
				});
			}

			const totalTime = (Date.now() - startTime) / 1000;

			setProcessingState({
				isProcessing: false,
				progress: 100,
				statusMessage: `Found ${result.masks?.length || 0} objects`,
				elapsedTime: totalTime,
			});

			clearCurrentPrompts();
		} catch (error) {
			console.error("Segmentation failed:", error);

			setProcessingState({
				isProcessing: false,
				progress: 0,
				statusMessage: "Segmentation failed",
				elapsedTime: 0,
			});

			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";
			alert(`Segmentation failed: ${errorMessage}`);
		}
	};

	const canSegment =
		(mode === "image" ? sourceImageUrl : sourceVideoUrl) &&
		currentTextPrompt.trim() &&
		!isProcessing;
	const isLocalPersonVideo =
		mode === "video" && videoBackend === "local-person";

	// Handle media store loading/error states
	if (mediaStoreError) {
		return (
			<div className="h-full flex flex-col gap-4 p-4">
				<div className="flex items-center justify-center flex-1">
					<div className="text-center">
						<div className="text-red-500 mb-2">Failed to load media store</div>
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
						<span>Loading segmentation panel...</span>
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
						Image
					</TabsTrigger>
					<TabsTrigger value="video" className="flex items-center gap-2">
						<Video className="w-4 h-4" />
						Video
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
							Local person
						</TabsTrigger>
						<TabsTrigger value="sam3" className="flex items-center gap-2">
							<ScanSearch className="size-4" />
							Cloud object
						</TabsTrigger>
					</TabsList>
				</Tabs>
			)}

			{/* Segment Button */}
			{!isLocalPersonVideo && (
				<div className="flex-shrink-0">
					<Button
						onClick={handleSegment}
						disabled={!canSegment}
						className="w-full"
						size="lg"
					>
						{isProcessing ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Segmenting...
							</>
						) : (
							<>
								<Wand2 className="w-4 h-4 mr-2" />
								Segment Objects
							</>
						)}
					</Button>
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
					addMediaItem={addMediaItem}
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
