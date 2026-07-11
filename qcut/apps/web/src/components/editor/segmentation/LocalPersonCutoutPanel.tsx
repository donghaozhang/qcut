"use client";

import { Download, Loader2, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createObjectURL } from "@/lib/media/blob-manager";
import { exportPersonCutoutVideo } from "@/lib/segmentation/person-cutout-export";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import type { MediaStore } from "@/stores/media/media-store-types";
import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";
import { PersonCutoutPreview } from "./PersonCutoutPreview";
import { PersonCutoutSettings } from "./PersonCutoutSettings";

interface LocalPersonCutoutPanelProps {
	projectId: string;
	sourceFile: File;
	sourceUrl: string;
	addMediaItem?: MediaStore["addMediaItem"];
	onMaskReady?: ({
		sourceMediaId,
		trackingSamples,
	}: {
		sourceMediaId: string;
		trackingSamples: MediaMaskTrackingSample[];
	}) => boolean;
	onMaskError?: (message: string) => void;
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
	addMediaItem,
	onMaskReady,
	onMaskError,
}: LocalPersonCutoutPanelProps) {
	const {
		personCutoutSettings,
		updatePersonCutoutSettings,
		isProcessing,
		progress,
		statusMessage,
		setProcessingState,
		setSegmentedVideo,
		segmentedVideoUrl,
	} = useSegmentationStore();
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			abortControllerRef.current?.abort();
		},
		[]
	);

	const renderTransparentVideo = async () => {
		if (!addMediaItem) {
			toast.error("Media library is not ready");
			return;
		}
		const controller = new AbortController();
		abortControllerRef.current = controller;
		const startedAt = Date.now();
		setProcessingState({
			isProcessing: true,
			progress: 0,
			statusMessage: "Preparing local person cutout...",
			elapsedTime: 0,
		});

		try {
			const result = await exportPersonCutoutVideo({
				file: sourceFile,
				settings: personCutoutSettings,
				signal: controller.signal,
				onProgress: ({ progress: nextProgress, status }) => {
					setProcessingState({
						isProcessing: true,
						progress: nextProgress,
						statusMessage: status,
						elapsedTime: (Date.now() - startedAt) / 1000,
					});
				},
			});
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
			const attached =
				onMaskReady?.({
					sourceMediaId,
					trackingSamples: result.trackingSamples,
				}) ?? false;
			setSegmentedVideo(url);
			setProcessingState({
				isProcessing: false,
				progress: 100,
				statusMessage: attached
					? "Person mask attached to selected clip"
					: "Transparent video added to Media",
				elapsedTime: (Date.now() - startedAt) / 1000,
			});
			toast.success(
				attached
					? "Person mask attached to selected clip"
					: "Transparent person video added to Media"
			);
		} catch (error) {
			const canceled =
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === "AbortError");
			const failureMessage = canceled
				? "Person tracking canceled"
				: error instanceof Error
					? error.message
					: String(error);
			onMaskError?.(failureMessage);
			setProcessingState({
				isProcessing: false,
				progress: 0,
				statusMessage: canceled
					? "Person cutout canceled"
					: "Person cutout failed",
				elapsedTime: (Date.now() - startedAt) / 1000,
			});
			if (!canceled) {
				toast.error("Person cutout failed", { description: failureMessage });
			}
		} finally {
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
		}
	};

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
							Last transparent render
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
				{isProcessing && (
					<div className="space-y-1.5" data-testid="person-cutout-progress">
						<Progress value={progress} className="h-1.5" />
						<div className="text-xs text-muted-foreground">{statusMessage}</div>
					</div>
				)}
			</div>
			<div className="flex shrink-0 gap-2 border-t bg-background pt-2">
				<Button
					type="button"
					className="flex-1"
					disabled={isProcessing}
					onClick={() => void renderTransparentVideo()}
					data-testid="person-cutout-export"
				>
					{isProcessing ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Download className="size-4" />
					)}
					{onMaskReady ? "Render and attach mask" : "Render transparent WebM"}
				</Button>
				{isProcessing && (
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => abortControllerRef.current?.abort()}
						aria-label="Cancel person cutout"
						title="Cancel render"
					>
						<Square className="size-3.5" />
					</Button>
				)}
			</div>
		</div>
	);
}
