import { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { resolveTextStyle } from "@/lib/text/text-style";
import {
	createJianyingTextRenderEntry,
	type JianyingTextRenderEntry,
	resolveJianyingTextRenderContentBounds,
	validateJianyingTextRenderResult,
} from "@/lib/preview/jianying-text-render-entry";
import type { TextOverlayBounds } from "@/lib/text/text-overlay-bounds";
import type { JianyingTextRuntimeRenderResult } from "@/types/electron/api-jianying-text-runtime";
import type { TextElement } from "@/types/timeline";
import type { ActiveElement } from "./types";

const MAXIMUM_PLAYBACK_DRIFT_SECONDS = 0.1;
let playbackRequestSequence = 0;
export type JianyingTextPlaybackStatus = "idle" | "loading" | "ready" | "error";

interface ReadyPlaybackLayer {
	entry: JianyingTextRenderEntry;
	result: JianyingTextRuntimeRenderResult;
}

function JianyingTextPlaybackLayer({
	element,
	zIndex,
	canvasWidth,
	canvasHeight,
	fps,
	currentTime,
	isPlaying,
	onStatusChange,
	onBoundsChange,
}: {
	element: TextElement;
	zIndex: number;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	currentTime: number;
	isPlaying: boolean;
	onStatusChange: ({
		elementId,
		status,
	}: {
		elementId: string;
		status: JianyingTextPlaybackStatus;
	}) => void;
	onBoundsChange: ({
		elementId,
		bounds,
	}: {
		elementId: string;
		bounds: TextOverlayBounds | null;
	}) => void;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [readyLayer, setReadyLayer] = useState<ReadyPlaybackLayer | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const api = window.electronAPI?.jianyingTextRuntime;
		if (!api) {
			setReadyLayer(null);
			setError("剪映原版动态花字渲染服务不可用");
			onBoundsChange({ elementId: element.id, bounds: null });
			onStatusChange({ elementId: element.id, status: "error" });
			return;
		}
		const requestId = `playback:${++playbackRequestSequence}`;
		const entry = createJianyingTextRenderEntry({
			element,
			requestId,
			trackOrder: 0,
			elementOrder: zIndex,
			canvasWidth,
			canvasHeight,
			fps,
			mode: "sequence",
		});
		if (!entry) {
			setReadyLayer(null);
			setError("剪映花字没有可播放的时间范围");
			onBoundsChange({ elementId: element.id, bounds: null });
			onStatusChange({ elementId: element.id, status: "error" });
			return;
		}
		let cancelled = false;
		setReadyLayer(null);
		setError(null);
		onBoundsChange({ elementId: element.id, bounds: null });
		onStatusChange({ elementId: element.id, status: "loading" });
		void api
			.render(entry.renderRequest)
			.then((result) => {
				if (cancelled) return;
				const validated = validateJianyingTextRenderResult({ entry, result });
				if (!validated.previewUrl) {
					throw new Error("剪映花字播放预览没有透明视频缓存");
				}
				setReadyLayer({ entry, result: validated });
				onBoundsChange({
					elementId: element.id,
					bounds: resolveJianyingTextRenderContentBounds({
						entry,
						result: validated,
					}),
				});
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				onBoundsChange({ elementId: element.id, bounds: null });
				onStatusChange({ elementId: element.id, status: "error" });
			});
		return () => {
			cancelled = true;
			onBoundsChange({ elementId: element.id, bounds: null });
			onStatusChange({ elementId: element.id, status: "idle" });
			void api.cancel({ requestId });
		};
	}, [
		canvasHeight,
		canvasWidth,
		element,
		fps,
		onBoundsChange,
		onStatusChange,
		zIndex,
	]);

	const syncPlayback = useCallback(() => {
		const video = videoRef.current;
		if (!video || !readyLayer) return;
		const localTime = Math.max(0, currentTime - readyLayer.entry.startTime);
		const maximumTime = Number.isFinite(video.duration)
			? Math.max(0, video.duration - 1 / fps)
			: readyLayer.entry.endTime - readyLayer.entry.startTime;
		const targetTime = Math.min(localTime, maximumTime);
		if (
			!isPlaying ||
			Math.abs(video.currentTime - targetTime) > MAXIMUM_PLAYBACK_DRIFT_SECONDS
		) {
			video.currentTime = targetTime;
		}
		if (isPlaying) {
			if (video.paused) void video.play().catch(() => {});
			return;
		}
		video.pause();
	}, [currentTime, fps, isPlaying, readyLayer]);

	useEffect(() => {
		syncPlayback();
	}, [syncPlayback]);

	if (!readyLayer?.result.previewUrl) {
		return error ? (
			<div
				className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm bg-destructive/90 text-destructive-foreground shadow-sm"
				style={{
					left: `${50 + (element.x / canvasWidth) * 100}%`,
					top: `${50 + (element.y / canvasHeight) * 100}%`,
					zIndex,
				}}
				title={error}
				data-jianying-text-playback="error"
				data-element-id={element.id}
			>
				<TriangleAlert aria-hidden="true" className="size-4" />
			</div>
		) : null;
	}
	const { result } = readyLayer;
	return (
		<video
			ref={videoRef}
			src={result.previewUrl}
			className="pointer-events-none absolute object-fill"
			style={{
				left: `${(result.x / canvasWidth) * 100}%`,
				top: `${(result.y / canvasHeight) * 100}%`,
				width: `${(result.width / canvasWidth) * 100}%`,
				height: `${(result.height / canvasHeight) * 100}%`,
				mixBlendMode: resolveTextStyle(element).blendMode,
				zIndex,
			}}
			muted
			playsInline
			preload="auto"
			aria-label="剪映原版动态花字播放预览"
			data-jianying-text-playback="ready"
			data-element-id={element.id}
			onLoadedData={() => {
				onStatusChange({ elementId: element.id, status: "ready" });
				syncPlayback();
			}}
			onLoadedMetadata={syncPlayback}
			onCanPlay={syncPlayback}
			onError={() => {
				onStatusChange({ elementId: element.id, status: "error" });
				onBoundsChange({ elementId: element.id, bounds: null });
				setReadyLayer(null);
				setError("剪映花字透明播放缓存无法解码");
			}}
		/>
	);
}

export function JianyingTextPlaybackOverlay({
	enabled,
	activeElements,
	canvasWidth,
	canvasHeight,
	fps,
	currentTime,
	isPlaying,
	onStatusChange,
	onBoundsChange,
}: {
	enabled: boolean;
	activeElements: ActiveElement[];
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	currentTime: number;
	isPlaying: boolean;
	onStatusChange: ({
		elementId,
		status,
	}: {
		elementId: string;
		status: JianyingTextPlaybackStatus;
	}) => void;
	onBoundsChange: ({
		elementId,
		bounds,
	}: {
		elementId: string;
		bounds: TextOverlayBounds | null;
	}) => void;
}) {
	if (!enabled) return null;
	return activeElements.map(({ element }, index) =>
		element.type === "text" && element.jianyingTextStyle ? (
			<JianyingTextPlaybackLayer
				key={element.id}
				element={element}
				zIndex={index + 1}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
				fps={fps}
				currentTime={currentTime}
				isPlaying={isPlaying}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		) : null
	);
}
