/**
 * Gap Generation Hook
 *
 * Listens for "gap:generate" events dispatched from the GapGenerationModal,
 * orchestrates AI video generation via FAL.ai, handles chained generation
 * for long gaps, and inserts completed clips into the timeline.
 *
 * @module hooks/timeline/use-gap-generation
 */

import { useEffect, useCallback, useRef } from "react";
import { useGapStore } from "@/stores/timeline/gap-store";
import {
	planGapSegments,
	getModelMaxDuration,
} from "@/stores/timeline/gap-store";
import type {
	TimelineGap,
	GapGenerateMode,
	GapSegment,
} from "@/stores/timeline/gap-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { getMediaStore } from "@/stores/media/media-store-loader";
import { useProjectStore } from "@/stores/project-store";
import { generateVideo } from "@/lib/ai-video/generators/text-to-video/generate-video";
import type { VideoGenerationResponse } from "@/lib/ai-video/generators/text-to-video/shared";

// ---------------------------------------------------------------------------
// Frame extraction helper (same as modal, but standalone for chaining)
// ---------------------------------------------------------------------------

async function extractLastFrameDataUrl(
	videoSrc: string,
	duration: number
): Promise<string | null> {
	return new Promise((resolve) => {
		const video = document.createElement("video");
		video.crossOrigin = "anonymous";
		video.muted = true;
		video.preload = "auto";

		const timeout = setTimeout(() => {
			video.src = "";
			resolve(null);
		}, 8000);

		video.addEventListener(
			"seeked",
			() => {
				clearTimeout(timeout);
				const canvas = document.createElement("canvas");
				const scale = Math.min(1, 512 / video.videoWidth);
				canvas.width = Math.round(video.videoWidth * scale);
				canvas.height = Math.round(video.videoHeight * scale);
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					resolve(canvas.toDataURL("image/jpeg", 0.85));
				} else {
					resolve(null);
				}
				video.src = "";
			},
			{ once: true }
		);

		video.addEventListener("error", () => {
			clearTimeout(timeout);
			resolve(null);
		});

		video.src = videoSrc;
		video.currentTime = Math.max(0, duration - 0.1);
	});
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface GenerateEventDetail {
	gap: TimelineGap;
	mode: GapGenerateMode;
	prompt: string;
	model: string;
}

export function useGapGeneration() {
	const cancelledRef = useRef(false);

	const handleGenerate = useCallback(async (detail: GenerateEventDetail) => {
		const { gap, mode, prompt, model } = detail;
		const gapDuration = gap.endTime - gap.startTime;

		const gapStore = useGapStore.getState();
		const beforeFrameUrl = gapStore.beforeFrameUrl;

		// Close modal, keep gap store tracking generation
		gapStore.setGapGenerateMode(null);

		// Plan segments
		const maxDuration = getModelMaxDuration(model);
		const segments = planGapSegments(
			gapDuration,
			maxDuration,
			gap.startTime,
			!!beforeFrameUrl
		);

		// Set generating state
		gapStore.setGeneratingGap({
			trackId: gap.trackId,
			startTime: gap.startTime,
			endTime: gap.endTime,
			mode,
			prompt,
			model,
			segments,
			currentSegmentIndex: 0,
			overallProgress: 0,
		});

		cancelledRef.current = false;

		let conditioningFrame = beforeFrameUrl;

		for (let i = 0; i < segments.length; i++) {
			if (cancelledRef.current) break;

			const segment = segments[i];
			gapStore.updateSegmentStatus(i, "generating");
			gapStore.updateGenerationProgress(i, i / segments.length);

			try {
				// Generate video via FAL.ai
				const result: VideoGenerationResponse = await generateVideo(
					{
						prompt,
						model,
						duration: Math.round(segment.duration),
						// Note: image-to-video conditioning would need imagePath
						// For now, all segments use text-to-video
					},
					(progress) => {
						if (cancelledRef.current) return;
						const segmentFraction = (progress.progress || 0) / 100;
						const overall = (i + segmentFraction) / segments.length;
						gapStore.updateGenerationProgress(i, overall);
					}
				);

				if (cancelledRef.current) break;

				const videoUrl = result.video_url;
				if (!videoUrl) {
					gapStore.updateSegmentStatus(i, "failed");
					continue;
				}

				// Save video to disk and add to media store
				const mediaId = await saveAndInsert(
					videoUrl,
					segment,
					gap.trackId,
					prompt
				);

				if (mediaId) {
					gapStore.updateSegmentStatus(i, "complete", mediaId);

					// Extract last frame for next segment conditioning
					if (i < segments.length - 1) {
						conditioningFrame = await extractLastFrameDataUrl(
							videoUrl,
							segment.duration
						);
					}
				} else {
					gapStore.updateSegmentStatus(i, "failed");
				}
			} catch (error) {
				console.error(`[GapGen] Segment ${i} failed:`, error);
				gapStore.updateSegmentStatus(i, "failed");
				// Continue with next segment — partial fill is better than nothing
			}
		}

		// Final progress
		gapStore.updateGenerationProgress(segments.length - 1, 1);

		// Clear generating state after a brief delay so user sees 100%
		setTimeout(() => {
			gapStore.setGeneratingGap(null);
			gapStore.clearGapSelection();
		}, 1500);
	}, []);

	// Listen for gap:generate events
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<GenerateEventDetail>).detail;
			if (detail) handleGenerate(detail);
		};
		window.addEventListener("gap:generate", handler);
		return () => window.removeEventListener("gap:generate", handler);
	}, [handleGenerate]);
}

// ---------------------------------------------------------------------------
// Save generated video + insert into timeline
// ---------------------------------------------------------------------------

async function saveAndInsert(
	videoUrl: string,
	segment: GapSegment,
	trackId: string,
	prompt: string
): Promise<string | null> {
	try {
		const projectStore = useProjectStore.getState();
		const projectId = projectStore.activeProject?.id;
		if (!projectId) return null;

		// Create a File object from the video URL for the media store
		const response = await fetch(videoUrl);
		const blob = await response.blob();
		const file = new File([blob], `gap-fill-${Date.now()}.mp4`, {
			type: "video/mp4",
		});

		// Add to media store via dynamic loader (non-React context)
		const mediaModule = await getMediaStore();
		const addMediaItem = mediaModule.useMediaStore.getState().addMediaItem;
		if (!addMediaItem) return null;

		const mediaId = await addMediaItem(projectId, {
			name: `Gap Fill (${segment.duration.toFixed(1)}s)`,
			type: "video" as const,
			file,
			url: URL.createObjectURL(blob),
			duration: segment.duration,
			metadata: {
				source: "gap-generation",
				prompt,
			},
		});

		// Insert element into timeline
		const timelineStore = useTimelineStore.getState();
		timelineStore.pushHistory();
		timelineStore.addElementToTrack(
			trackId,
			{
				type: "media",
				mediaId,
				name: `Gap Fill (${segment.duration.toFixed(1)}s)`,
				startTime: segment.startTime,
				duration: segment.duration,
				trimStart: 0,
				trimEnd: 0,
			},
			{ pushHistory: false, selectElement: false }
		);

		return mediaId;
	} catch (error) {
		console.error("[GapGen] Save and insert failed:", error);
		return null;
	}
}
