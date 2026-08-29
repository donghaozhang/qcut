import { useEffect, useMemo, useRef, useState } from "react";
import {
	evaluateStickerRuntime,
	type StickerRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { cn } from "@/lib/utils";
import {
	createBrowserStickerRuntimeAssetResolver,
	createBrowserStickerRuntimeCanvas,
} from "@/lib/stickers/sticker-runtime-browser-assets";
import { renderStickerRuntimeFrame } from "@/lib/stickers/sticker-runtime-renderer";
import { getStickerRuntimeTimelineWindow } from "@/lib/stickers/sticker-runtime-timeline";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useMediaStore } from "@/stores/media-store";
import type { StickerElement } from "@/types/timeline";

function frameLabel({
	state,
}: {
	state: Exclude<
		Awaited<ReturnType<typeof renderStickerRuntimeFrame>>,
		{ active: false }
	>["state"];
}): string {
	return "frameIndex" in state
		? String(state.frameIndex)
		: state.sourceTimeInVideoSeconds.toFixed(6);
}

function runtimeFrameKey({
	descriptor,
	element,
	timelineTimeSeconds,
}: {
	descriptor: StickerRuntimeDescriptor;
	element: StickerElement;
	timelineTimeSeconds: number;
}): string {
	const state = evaluateStickerRuntime({
		descriptor,
		timeline: getStickerRuntimeTimelineWindow({ element }),
		timelineTimeSeconds,
	});
	if (!state.active) return `inactive:${state.reason}`;
	if ("frameIndex" in state) return `${state.kind}:${state.frameIndex}`;
	return `${state.kind}:${state.sourceTimeInVideoSeconds}`;
}

interface RuntimeRenderRequest {
	generation: number;
	key: string;
	time: number;
}

interface RuntimeRenderRequestInput {
	supersede: boolean;
	time: number;
}

export function StickerRuntimeCanvas({
	className,
	currentTime,
	descriptor,
	element,
	mediaItem,
}: {
	className?: string;
	currentTime: number;
	descriptor: StickerRuntimeDescriptor;
	element: StickerElement;
	mediaItem: MediaItem;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const currentTimeRef = useRef(currentTime);
	const requestRenderRef = useRef<(request: RuntimeRenderRequestInput) => void>(
		() => undefined
	);
	const [renderedFrame, setRenderedFrame] = useState<string | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const mediaItemsById = useMemo(() => {
		const itemsById = new Map<string, MediaItem>(
			mediaItems.map((item) => [item.id, item])
		);
		itemsById.set(mediaItem.id, mediaItem);
		return itemsById;
	}, [mediaItem, mediaItems]);
	const assets = useMemo(
		() =>
			createBrowserStickerRuntimeAssetResolver({ mediaItem, mediaItemsById }),
		[mediaItem, mediaItemsById]
	);
	currentTimeRef.current = currentTime;

	useEffect(() => {
		let disposed = false;
		let generation = 0;
		let rendering = false;
		let activeRequest: RuntimeRenderRequest | null = null;
		let renderedKey: string | null = null;
		let pendingRender: RuntimeRenderRequest | null = null;
		const timeline = getStickerRuntimeTimelineWindow({ element });
		const readPendingRender = (): RuntimeRenderRequest | null => pendingRender;
		const renderPending = async () => {
			if (rendering) return;
			rendering = true;
			while (!disposed && pendingRender !== null) {
				const request = pendingRender;
				pendingRender = null;
				if (request.key === renderedKey) continue;
				activeRequest = request;
				try {
					const frame = await renderStickerRuntimeFrame({
						assets,
						createCanvas: createBrowserStickerRuntimeCanvas,
						descriptor,
						timeline,
						timelineTimeSeconds: request.time,
					});
					if (disposed) return;
					activeRequest = null;
					if (request.generation !== generation) continue;
					const newerRequest = readPendingRender();
					const hasNewerDiscreteFrame =
						descriptor.kind !== "alpha-video" &&
						newerRequest?.generation === generation &&
						newerRequest.key !== request.key;
					if (hasNewerDiscreteFrame) continue;
					const canvas = canvasRef.current;
					if (!canvas) continue;
					if (!frame.active) {
						if (canvas.width !== 1) canvas.width = 1;
						if (canvas.height !== 1) canvas.height = 1;
						setRenderedFrame(null);
						setRenderError(null);
						renderedKey = request.key;
						continue;
					}
					if (canvas.width !== frame.width) canvas.width = frame.width;
					if (canvas.height !== frame.height) canvas.height = frame.height;
					const context = canvas.getContext("2d");
					if (!context) {
						throw new Error("Unable to render sticker runtime frame");
					}
					context.clearRect(0, 0, frame.width, frame.height);
					context.drawImage(frame.image, 0, 0, frame.width, frame.height);
					setRenderedFrame(frameLabel({ state: frame.state }));
					setRenderError(null);
					renderedKey = request.key;
				} catch (error) {
					if (disposed) return;
					activeRequest = null;
					if (request.generation !== generation) continue;
					const newerRequest = readPendingRender();
					if (
						newerRequest?.generation === generation &&
						newerRequest.key !== request.key
					) {
						continue;
					}
					setRenderedFrame(null);
					setRenderError(
						error instanceof Error ? error.message : String(error)
					);
				}
			}
			rendering = false;
		};
		const requestRender = ({ supersede, time }: RuntimeRenderRequestInput) => {
			let key: string;
			try {
				key = runtimeFrameKey({
					descriptor,
					element,
					timelineTimeSeconds: time,
				});
			} catch {
				key = `invalid:${descriptor.kind}`;
			}
			if (!supersede) {
				if (!rendering && pendingRender === null && key === renderedKey) return;
				if (rendering) {
					pendingRender =
						activeRequest?.generation === generation &&
						activeRequest.key === key
							? null
							: { generation, key, time };
					return;
				}
				pendingRender = { generation, key, time };
				void renderPending();
				return;
			}
			const activeRequestKey =
				activeRequest?.generation === generation ? activeRequest.key : null;
			const activeRequestMatches = activeRequestKey === key;
			const pendingRequestMatches =
				pendingRender?.generation === generation && pendingRender.key === key;
			if (
				(pendingRequestMatches &&
					(activeRequestKey === null || activeRequestMatches)) ||
				(activeRequestMatches && pendingRender === null) ||
				(!rendering && pendingRender === null && key === renderedKey)
			) {
				return;
			}
			generation += 1;
			pendingRender = { generation, key, time };
			void renderPending();
		};
		const handlePlaybackUpdate = (event: Event) => {
			const time = (event as CustomEvent<{ time?: unknown }>).detail?.time;
			if (typeof time !== "number" || !Number.isFinite(time)) return;
			requestRender({ supersede: false, time });
		};
		const handlePlaybackSeek = (event: Event) => {
			const time = (event as CustomEvent<{ time?: unknown }>).detail?.time;
			if (typeof time !== "number" || !Number.isFinite(time)) return;
			requestRender({ supersede: true, time });
		};
		requestRenderRef.current = requestRender;
		window.addEventListener("playback-update", handlePlaybackUpdate);
		window.addEventListener("playback-seek", handlePlaybackSeek);
		requestRender({ supersede: true, time: currentTimeRef.current });
		return () => {
			disposed = true;
			window.removeEventListener("playback-update", handlePlaybackUpdate);
			window.removeEventListener("playback-seek", handlePlaybackSeek);
			if (requestRenderRef.current === requestRender) {
				requestRenderRef.current = () => undefined;
			}
		};
	}, [assets, descriptor, element]);

	useEffect(() => {
		requestRenderRef.current({
			supersede: !usePlaybackStore.getState().isPlaying,
			time: currentTime,
		});
	}, [currentTime]);

	return (
		<canvas
			ref={canvasRef}
			className={cn("h-full w-full select-none", className)}
			data-sticker-runtime-kind={descriptor.kind}
			data-sticker-runtime-frame={renderedFrame ?? undefined}
			data-sticker-runtime-error={renderError ?? undefined}
			role="img"
			aria-label={mediaItem.name}
			style={{ pointerEvents: "none", imageRendering: "crisp-edges" }}
		/>
	);
}
