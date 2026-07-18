import type { MediaItem } from "@/stores/media/media-store-types";
import { useEffect, useState } from "react";
import { Image, Loader2, Music, Video } from "lucide-react";
import AudioWaveform from "@/components/editor/audio-waveform";

/** Format seconds as mm:ss */
function formatDuration(duration: number) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface MediaPreviewProps {
	item: MediaItem;
}

function VideoPreview({ item }: MediaPreviewProps) {
	const previewUrl = item.thumbnailUrl;
	const [isLoading, setIsLoading] = useState(Boolean(item.thumbnailUrl));
	const [hasError, setHasError] = useState(false);
	const isGenerating =
		item.thumbnailStatus === "pending" || item.thumbnailStatus === "loading";

	useEffect(() => {
		setHasError(false);
		setIsLoading(Boolean(item.thumbnailUrl));
	}, [item.thumbnailUrl]);

	if (!previewUrl || hasError) {
		return (
			<div className="w-full h-full bg-linear-to-br from-blue-500/20 to-cyan-500/20 flex flex-col items-center justify-center text-muted-foreground rounded border border-blue-500/20">
				{isGenerating ? (
					<Loader2 className="h-6 w-6 mb-1 animate-spin" />
				) : (
					<Video className="h-6 w-6 mb-1" />
				)}
				<span className="text-xs">
					{isGenerating ? "Generating..." : "Video"}
				</span>
				{item.duration && (
					<span className="text-xs opacity-70">
						{formatDuration(item.duration)}
					</span>
				)}
			</div>
		);
	}

	return (
		<div className="w-full h-full relative flex items-center justify-center overflow-hidden rounded">
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-muted/20">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			)}
			<img
				src={previewUrl}
				alt={item.name}
				className="max-w-full max-h-full object-cover"
				loading="lazy"
				onLoad={() => setIsLoading(false)}
				onError={() => {
					setHasError(true);
					setIsLoading(false);
				}}
			/>
			<div className="absolute bottom-1 right-1 bg-black/65 text-white text-[10px] px-1 py-0.5 rounded">
				{item.duration ? formatDuration(item.duration) : "Video"}
			</div>
		</div>
	);
}

/** Renders a preview thumbnail for a single media item based on its type. */
export function MediaPreview({ item }: MediaPreviewProps) {
	if (item.type === "image") {
		const imageUrl = item.url || item.thumbnailUrl;

		if (!imageUrl) {
			return (
				<div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
					<Image className="h-6 w-6" />
					<span className="text-xs mt-1">Image</span>
				</div>
			);
		}

		return (
			<div className="w-full h-full flex items-center justify-center">
				<img
					src={imageUrl}
					alt={item.name}
					className="max-w-full max-h-full object-contain"
					loading="lazy"
				/>
			</div>
		);
	}

	if (item.type === "video") {
		return <VideoPreview item={item} />;
	}

	if (item.type === "audio") {
		return (
			<div className="relative h-full w-full overflow-hidden rounded border border-[#3D7EBF]/40 bg-[#1E3A5F]">
				<div className="absolute inset-x-1 inset-y-2">
					<AudioWaveform
						audioUrl={item.url || ""}
						sourcePath={item.localPath}
						sourceDuration={item.duration}
						cacheKey={
							item.file
								? `media:${item.id}:${item.file.size}:${item.file.lastModified}`
								: `media:${item.id}`
						}
						className="h-full w-full"
						showStatus={false}
						barWidth={1}
						barGap={1}
						color="rgba(126, 196, 255, 0.95)"
						anchor="bottom"
					/>
				</div>
				<Music className="absolute left-1 top-1 h-3.5 w-3.5 text-[#7EC4FF]/80" />
				{item.duration ? (
					<div className="absolute bottom-1 right-1 rounded bg-black/65 px-1 py-0.5 text-[10px] text-white">
						{formatDuration(item.duration)}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
			<Image className="h-6 w-6" />
			<span className="text-xs mt-1">Unknown</span>
		</div>
	);
}
