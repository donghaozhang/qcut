import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useJianyingTransitionPreview } from "./use-jianying-transition-preview";

export function JianyingLocalTransitionPreview({
	presetId,
	packageHash,
	localizedName,
	available,
	isPlaying,
	fallback,
}: {
	presetId: string;
	packageHash: string;
	localizedName: string;
	available: boolean;
	isPlaying: boolean;
	fallback: ReactNode;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [nearViewport, setNearViewport] = useState(false);
	const [videoFailed, setVideoFailed] = useState(false);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		if (typeof IntersectionObserver === "undefined") {
			setNearViewport(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => setNearViewport(Boolean(entries[0]?.isIntersecting)),
			{ rootMargin: "160px" }
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const preview = useJianyingTransitionPreview({
		presetId,
		packageHash,
		enabled: available && (nearViewport || isPlaying),
	});

	useEffect(() => {
		if (preview.status !== "ready") return;
		setVideoFailed(false);
	}, [preview]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || preview.status !== "ready") return;
		if (isPlaying) {
			video.currentTime = 0;
			void video.play().catch(() => {});
			return;
		}
		video.pause();
		if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
			video.currentTime = preview.result.posterTime;
		}
	}, [isPlaying, preview]);

	const showVideo = preview.status === "ready" && !videoFailed;
	return (
		<div ref={containerRef} className="relative h-full w-full overflow-hidden">
			{showVideo ? (
				<video
					ref={videoRef}
					src={preview.result.previewUrl}
					className="h-full w-full object-cover"
					muted
					loop
					playsInline
					preload="auto"
					aria-label={`${localizedName}本机动画预览`}
					onLoadedMetadata={(event) => {
						if (!isPlaying)
							event.currentTarget.currentTime = preview.result.posterTime;
					}}
					onError={() => setVideoFailed(true)}
				/>
			) : (
				fallback
			)}
			{preview.status === "loading" ? (
				<div className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-sm bg-background/80 text-foreground">
					<LoaderCircleIcon className="size-3 animate-spin">
						<title>正在生成本机转场预览</title>
					</LoaderCircleIcon>
				</div>
			) : null}
			{preview.status === "error" || videoFailed ? (
				<div className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-sm bg-background/80 text-muted-foreground">
					<AlertCircleIcon className="size-3">
						<title>本机转场预览暂不可用</title>
					</AlertCircleIcon>
				</div>
			) : null}
		</div>
	);
}
