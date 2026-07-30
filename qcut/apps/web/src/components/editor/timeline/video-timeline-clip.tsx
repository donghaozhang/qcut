import { useEffect, useRef, useState } from "react";
import { useFilmstripThumbnails } from "@/hooks/timeline/use-filmstrip-thumbnails";
import type { MediaItem } from "@/stores/media/media-store-types";
import AudioWaveform from "../audio-waveform";
import { getVideoClipLaneHeights } from "./video-timeline-clip-layout";

interface VideoTimelineClipProps {
	clipWidthPx: number;
	displayName: string;
	duration: number;
	mediaId: string;
	mediaDuration?: number;
	mediaFile: File;
	mediaUrl?: string;
	sourcePath?: string;
	thumbnailStatus?: MediaItem["thumbnailStatus"];
	thumbnailUrl?: string;
	trackHeight: number;
	trimEnd: number;
	trimStart: number;
	zoomLevel: number;
}

export function VideoTimelineClip({
	clipWidthPx,
	displayName,
	duration,
	mediaId,
	mediaDuration,
	mediaFile,
	mediaUrl,
	sourcePath,
	thumbnailStatus,
	thumbnailUrl,
	trackHeight,
	trimEnd,
	trimStart,
	zoomLevel,
}: VideoTimelineClipProps) {
	const clipRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(true);
	const [renderHeight, setRenderHeight] = useState(trackHeight);
	const { filmstripHeight, headerHeight, waveformHeight } =
		getVideoClipLaneHeights({ trackHeight: renderHeight });

	useEffect(() => {
		const clip = clipRef.current;
		if (!clip || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0 }
		);
		observer.observe(clip);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const clip = clipRef.current;
		if (!clip) return;
		const measure = () => {
			const nextHeight = Math.floor(clip.getBoundingClientRect().height);
			if (nextHeight <= 0) return;
			setRenderHeight((currentHeight) =>
				currentHeight === nextHeight ? currentHeight : nextHeight
			);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(clip);
		return () => observer.disconnect();
	}, []);

	const { frames, tileWidth } = useFilmstripThumbnails({
		mediaId,
		file: mediaFile,
		duration,
		trimStart,
		trimEnd,
		zoomLevel,
		// The hook reserves eight pixels around a tile. Offset that here so its
		// 16:9 tile calculation uses the actual filmstrip lane height.
		trackHeight: filmstripHeight + 8,
		clipWidthPx,
		enabled: thumbnailStatus === "ready" && clipWidthPx >= 12 && isVisible,
	});
	const hasFilmstrip = frames.length > 0;
	const sourceDuration =
		mediaDuration && mediaDuration > 0 ? mediaDuration : duration;

	return (
		<div
			ref={clipRef}
			className="relative h-full w-full overflow-hidden bg-[var(--color-timeline-video-clip)]"
			data-testid="timeline-video-clip"
		>
			<div
				className="absolute inset-x-0 top-0 z-10 flex items-center bg-black/25 px-1.5"
				style={{ height: `${headerHeight}px` }}
				data-testid="timeline-video-name"
			>
				<span
					className="truncate text-[10px] font-medium leading-none text-white/95"
					title={displayName}
				>
					{displayName}
				</span>
			</div>

			<div
				className="pointer-events-none absolute inset-x-0 flex overflow-hidden bg-black/10"
				style={{
					top: `${headerHeight}px`,
					height: `${filmstripHeight}px`,
				}}
				aria-label={`Filmstrip thumbnails of ${displayName}`}
				data-testid="timeline-video-filmstrip"
			>
				{hasFilmstrip
					? frames.map((frame, index) => (
							<div
								key={`${frame.time}-${index}`}
								className="h-full shrink-0 bg-cover bg-center"
								style={{
									width: `${tileWidth}px`,
									backgroundImage:
										frame.url || thumbnailUrl
											? `url(${frame.url ?? thumbnailUrl})`
											: undefined,
									borderRight:
										index < frames.length - 1
											? "1px solid rgba(255, 255, 255, 0.24)"
											: undefined,
								}}
							/>
						))
					: thumbnailUrl && (
							<div
								className="h-full w-full"
								style={{
									backgroundImage: `url(${thumbnailUrl})`,
									backgroundPosition: "left center",
									backgroundRepeat: "repeat-x",
									backgroundSize: `${tileWidth}px 100%`,
								}}
							/>
						)}
			</div>

			<div
				className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/25 bg-black/20"
				style={{ height: `${waveformHeight}px` }}
				data-testid="timeline-video-waveform"
			>
				<AudioWaveform
					audioUrl={mediaUrl ?? ""}
					sourcePath={sourcePath}
					sourceDuration={sourceDuration}
					cacheKey={`media:${mediaId}:${mediaFile.size}:${mediaFile.lastModified}`}
					className="h-full w-full"
					sourceStart={trimStart}
					sourceEnd={duration - trimEnd}
					ariaLabel={`Audio waveform for ${displayName}`}
					showStatus={false}
					barWidth={0.5}
					barGap={0.5}
					color="rgba(123, 224, 231, 0.95)"
					anchor="center"
				/>
				<div
					className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-white/30"
					data-testid="timeline-video-waveform-centerline"
				/>
			</div>
		</div>
	);
}
