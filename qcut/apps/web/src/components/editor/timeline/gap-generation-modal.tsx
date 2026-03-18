/**
 * Gap Generation Modal
 *
 * Full-screen modal for configuring and launching AI video/image generation
 * to fill a timeline gap. Shows before/after frames from neighboring clips,
 * AI prompt suggestion, model selector, and generation progress.
 *
 * Frame extraction uses HTML5 <video> + <canvas> (same approach as filmstrip).
 *
 * @module components/editor/timeline/gap-generation-modal
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { useGapStore } from "@/stores/timeline/gap-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { Loader2, Sparkles, RefreshCw, Video, Image } from "lucide-react";
import type { TimelineElement as TimelineElementType } from "@/types/timeline";
import { CAMERA_MOTION_PRESETS } from "@/types/generation";
import { pausePlaybackForGapInteraction } from "./gap-actions";

// ---------------------------------------------------------------------------
// Frame extraction (renderer-side, using canvas)
// ---------------------------------------------------------------------------

async function extractFrameAsDataUrl(
	videoSrc: string,
	seekTime: number,
	maxWidth = 256
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
				const scale = Math.min(1, maxWidth / video.videoWidth);
				canvas.width = Math.round(video.videoWidth * scale);
				canvas.height = Math.round(video.videoHeight * scale);
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					resolve(canvas.toDataURL("image/jpeg", 0.8));
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
		video.currentTime = Math.max(0, seekTime);
	});
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GapGenerationModal() {
	const selectedGap = useGapStore((s) => s.selectedGap);
	const mode = useGapStore((s) => s.gapGenerateMode);
	const setMode = useGapStore((s) => s.setGapGenerateMode);
	const prompt = useGapStore((s) => s.gapPrompt);
	const setPrompt = useGapStore((s) => s.setGapPrompt);
	const suggestion = useGapStore((s) => s.gapSuggestion);
	const suggesting = useGapStore((s) => s.gapSuggesting);
	const suggestionError = useGapStore((s) => s.gapSuggestionError);
	const beforeFrameUrl = useGapStore((s) => s.beforeFrameUrl);
	const afterFrameUrl = useGapStore((s) => s.afterFrameUrl);
	const setBeforeFrameUrl = useGapStore((s) => s.setBeforeFrameUrl);
	const setAfterFrameUrl = useGapStore((s) => s.setAfterFrameUrl);
	const gapModel = useGapStore((s) => s.gapModel);
	const setGapModel = useGapStore((s) => s.setGapModel);
	const cameraMotion = useGapStore((s) => s.gapCameraMotion);
	const setCameraMotion = useGapStore((s) => s.setGapCameraMotion);
	const setSuggesting = useGapStore((s) => s.setGapSuggesting);
	const setSuggestion = useGapStore((s) => s.setGapSuggestion);
	const setSuggestionError = useGapStore((s) => s.setGapSuggestionError);
	const generatingGap = useGapStore((s) => s.generatingGap);
	const clearGapSelection = useGapStore((s) => s.clearGapSelection);

	const tracks = useTimelineStore((s) => s.tracks);
	const { mediaItems } = useAsyncMediaItems();

	const isOpen = !!selectedGap && !!mode;
	const isVideoMode = mode === "text-to-video" || mode === "image-to-video";
	const gapDuration = selectedGap
		? selectedGap.endTime - selectedGap.startTime
		: 0;

	useEffect(() => {
		if (!isOpen) return;
		pausePlaybackForGapInteraction();
	}, [isOpen]);

	// Extract frames from neighboring clips when modal opens
	const frameExtractionRef = useRef(false);
	useEffect(() => {
		if (!isOpen || !selectedGap || frameExtractionRef.current) return;
		frameExtractionRef.current = true;

		const track = tracks.find((t) => t.id === selectedGap.trackId);
		if (!track) return;

		const sorted = [...track.elements]
			.filter((e) => e.type === "media")
			.sort((a, b) => a.startTime - b.startTime);

		// Find clip before gap
		const clipBefore = sorted.find((c) => {
			const clipEnd = c.startTime + c.duration - c.trimStart - c.trimEnd;
			return Math.abs(clipEnd - selectedGap.startTime) < 0.1;
		});

		// Find clip after gap
		const clipAfter = sorted.find((c) => {
			return Math.abs(c.startTime - selectedGap.endTime) < 0.1;
		});

		const extractFrames = async () => {
			if (clipBefore && "mediaId" in clipBefore) {
				const media = mediaItems.find(
					(m) =>
						m.id ===
						(clipBefore as TimelineElementType & { mediaId: string }).mediaId
				);
				if (media?.url && media.type === "video") {
					const seekTime =
						clipBefore.trimStart +
						(clipBefore.duration - clipBefore.trimStart - clipBefore.trimEnd) -
						0.1;
					const frame = await extractFrameAsDataUrl(
						media.url,
						Math.max(0, seekTime)
					);
					if (frame) setBeforeFrameUrl(frame);
				} else if (media?.url && media.type === "image") {
					setBeforeFrameUrl(media.url);
				}
			}

			if (clipAfter && "mediaId" in clipAfter) {
				const media = mediaItems.find(
					(m) =>
						m.id ===
						(clipAfter as TimelineElementType & { mediaId: string }).mediaId
				);
				if (media?.url && media.type === "video") {
					const frame = await extractFrameAsDataUrl(
						media.url,
						clipAfter.trimStart + 0.1
					);
					if (frame) setAfterFrameUrl(frame);
				} else if (media?.url && media.type === "image") {
					setAfterFrameUrl(media.url);
				}
			}

			// Auto-trigger prompt suggestion
			triggerSuggestion();
		};

		extractFrames();

		return () => {
			frameExtractionRef.current = false;
		};
	}, [isOpen, selectedGap, tracks, mediaItems]); // biome-ignore lint/correctness/useExhaustiveDependencies: intentional

	// Prompt suggestion via Gemini
	const triggerSuggestion = useCallback(async () => {
		if (!window.electronAPI?.geminiChat?.suggestGapPrompt) {
			// No Gemini handler available — skip silently
			return;
		}
		if (!selectedGap) return;

		setSuggesting(true);
		setSuggestion(null);
		setSuggestionError(false);

		try {
			const result = await window.electronAPI.geminiChat.suggestGapPrompt({
				gapDuration,
				mode: mode || "text-to-video",
				beforeFrameUrl: useGapStore.getState().beforeFrameUrl,
				afterFrameUrl: useGapStore.getState().afterFrameUrl,
			});

			if (result.suggestedPrompt) {
				setSuggestion(result.suggestedPrompt);
				if (!useGapStore.getState().gapPrompt.trim()) {
					setPrompt(result.suggestedPrompt);
				}
			}
		} catch {
			setSuggestionError(true);
		} finally {
			setSuggesting(false);
		}
	}, [
		selectedGap,
		gapDuration,
		mode,
		setSuggesting,
		setSuggestion,
		setSuggestionError,
		setPrompt,
	]);

	const handleClose = () => {
		setMode(null);
	};

	const isGenerating = !!generatingGap;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isVideoMode ? (
							<Video className="h-4 w-4 text-blue-400" />
						) : (
							<Image className="h-4 w-4 text-emerald-400" />
						)}
						{isVideoMode ? "Generate Video" : "Generate Image"}
					</DialogTitle>
					<DialogDescription>
						Fill {gapDuration.toFixed(1)}s gap with AI-generated{" "}
						{isVideoMode ? "video" : "image"}
					</DialogDescription>
				</DialogHeader>

				{/* Frame strip */}
				<FrameStrip
					beforeFrameUrl={beforeFrameUrl}
					afterFrameUrl={afterFrameUrl}
					isVideoMode={isVideoMode}
				/>

				{/* Prompt */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<label className="text-xs text-muted-foreground uppercase font-semibold">
							Prompt
						</label>
						<div className="flex items-center gap-2">
							{suggesting && (
								<div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
									<Loader2 className="h-3 w-3 animate-spin" />
									<span>Analyzing...</span>
								</div>
							)}
							{!suggesting && suggestion && prompt === suggestion && (
								<div className="flex items-center gap-1 text-[10px] text-emerald-400/70">
									<Sparkles className="h-3 w-3" />
									<span>AI-suggested</span>
								</div>
							)}
							{!suggesting && (
								<button
									type="button"
									onClick={triggerSuggestion}
									className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
								>
									<RefreshCw className="h-3 w-3" />
									<span>Re-analyze</span>
								</button>
							)}
						</div>
					</div>
					<div className="relative">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => e.stopPropagation()}
							placeholder={
								suggesting
									? "Analyzing surrounding shots..."
									: isVideoMode
										? "Describe the video to generate..."
										: "Describe the image to generate..."
							}
							className={`w-full bg-muted border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-1 placeholder-muted-foreground/50 ${
								suggesting
									? "border-amber-600/40 focus:ring-amber-500/30 animate-pulse"
									: "border-border focus:ring-ring"
							}`}
							rows={3}
						/>
						{suggestion && prompt !== suggestion && !suggesting && (
							<button
								type="button"
								onClick={() => setPrompt(suggestion)}
								className="absolute top-1.5 right-1.5 px-2 py-1 rounded-md bg-amber-900/40 border border-amber-700/30 text-amber-300 text-[10px] hover:bg-amber-900/60 transition-colors flex items-center gap-1"
							>
								<Sparkles className="h-2.5 w-2.5" />
								Use suggestion
							</button>
						)}
					</div>
					{suggestionError && !suggesting && !suggestion && (
						<p className="text-[10px] text-muted-foreground">
							Could not suggest a prompt. Type your own or try again.
						</p>
					)}
				</div>

				{/* Model selector */}
				<div className="space-y-1.5">
					<label className="text-xs text-muted-foreground uppercase font-semibold">
						Model
					</label>
					<select
						value={gapModel}
						onChange={(e) => setGapModel(e.target.value)}
						className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
					>
						<option value="fal-ai/ltx-video/v0.2.3">LTX 2.3</option>
						<option value="fal-ai/ltx-video-v02">LTX V2</option>
						<option value="fal-ai/wan/v2.6/text-to-video">WAN 2.6</option>
						<option value="fal-ai/vidu/q3/text-to-video">Vidu Q3</option>
						<option value="fal-ai/kling-video/v2.1/standard/text-to-video">
							Kling 2.1
						</option>
					</select>
				</div>

				{/* Camera motion (video modes only) */}
				{isVideoMode && (
					<div className="space-y-1.5">
						<label
							htmlFor="gap-camera-motion"
							className="text-xs text-muted-foreground uppercase font-semibold"
						>
							Camera Motion
						</label>
						<select
							id="gap-camera-motion"
							value={cameraMotion}
							onChange={(e) => setCameraMotion(e.target.value)}
							className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
						>
							{CAMERA_MOTION_PRESETS.map((preset) => (
								<option key={preset.value} value={preset.value}>
									{preset.label}
								</option>
							))}
						</select>
					</div>
				)}

				{/* Generation progress */}
				{isGenerating && generatingGap && (
					<div className="bg-muted rounded-lg p-3 border border-border">
						<div className="flex items-center gap-2 mb-2">
							<Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
							<span className="text-xs text-foreground">
								{generatingGap.segments.length > 1
									? `Generating segment ${generatingGap.currentSegmentIndex + 1}/${generatingGap.segments.length}...`
									: "Generating..."}
							</span>
						</div>
						<div className="h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
							<div
								className="h-full bg-blue-500 rounded-full transition-all duration-300"
								style={{
									width: `${generatingGap.overallProgress * 100}%`,
								}}
							/>
						</div>
					</div>
				)}

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 pt-2">
					<button
						type="button"
						onClick={handleClose}
						className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-sm hover:bg-accent transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							// Dispatch custom event that the generation hook listens to
							window.dispatchEvent(
								new CustomEvent("gap:generate", {
									detail: {
										gap: selectedGap,
										mode,
										prompt,
										model: gapModel,
										cameraMotion,
									},
								})
							);
						}}
						disabled={isGenerating || !prompt.trim()}
						className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
					>
						{isGenerating ? (
							<>
								<Loader2 className="h-3 w-3 animate-spin" />
								Generating...
							</>
						) : (
							"Generate"
						)}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Frame Strip Sub-component
// ---------------------------------------------------------------------------

function FrameStrip({
	beforeFrameUrl,
	afterFrameUrl,
	isVideoMode,
}: {
	beforeFrameUrl: string | null;
	afterFrameUrl: string | null;
	isVideoMode: boolean;
}) {
	return (
		<div className="flex h-[80px] rounded-lg overflow-hidden bg-muted/50 border border-border">
			{/* Before frame */}
			{beforeFrameUrl ? (
				<div className="relative w-[38%] h-full flex-shrink-0 overflow-hidden">
					<img
						src={beforeFrameUrl}
						alt="Before clip"
						className="w-full h-full object-cover"
					/>
					<div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent py-0.5 px-1.5">
						<span className="text-[8px] text-white/70">Before</span>
					</div>
				</div>
			) : (
				<div className="w-[38%] h-full flex-shrink-0 bg-muted flex items-center justify-center">
					<span className="text-muted-foreground text-[9px]">No clip</span>
				</div>
			)}

			{/* Center gap */}
			<div className="flex-1 relative overflow-hidden">
				<div className="absolute inset-0 bg-muted/70" />
				<div className="absolute inset-0 border border-dashed border-muted-foreground/30" />
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
					<Sparkles className="h-3 w-3 text-blue-400/40" />
					<span className="text-[9px] text-muted-foreground font-medium">
						{isVideoMode ? "AI video" : "AI image"}
					</span>
				</div>
			</div>

			{/* After frame */}
			{afterFrameUrl ? (
				<div className="relative w-[38%] h-full flex-shrink-0 overflow-hidden">
					<img
						src={afterFrameUrl}
						alt="After clip"
						className="w-full h-full object-cover"
					/>
					<div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent py-0.5 px-1.5">
						<span className="text-[8px] text-white/70">After</span>
					</div>
				</div>
			) : (
				<div className="w-[38%] h-full flex-shrink-0 bg-muted flex items-center justify-center">
					<span className="text-muted-foreground text-[9px]">No clip</span>
				</div>
			)}
		</div>
	);
}
