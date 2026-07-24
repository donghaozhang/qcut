"use client";

import { PlatformCapability, platform } from "@qcut/platform-core";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { HyperframesElement } from "@/types/timeline";

interface HyperframesPreviewProps {
	element: HyperframesElement;
	trackId: string;
	currentTime: number;
	isPlaying: boolean;
	muted: boolean;
	width: number;
	height: number;
	className?: string;
}

interface HyperframesRuntimeMessage {
	source: "qcut-hyperframes-runtime";
	type: "ready" | "seeked" | "ack" | "error";
	message?: string;
	duration?: number;
}

function isRuntimeMessage(value: unknown): value is HyperframesRuntimeMessage {
	if (!value || typeof value !== "object") return false;
	const message = value as Partial<HyperframesRuntimeMessage>;
	return (
		message.source === "qcut-hyperframes-runtime" &&
		["ready", "seeked", "ack", "error"].includes(message.type ?? "")
	);
}

function clampCompositionTime({
	element,
	currentTime,
}: {
	element: HyperframesElement;
	currentTime: number;
}): number {
	const sourceEnd = Math.max(0, element.duration - element.trimEnd);
	const localTime = currentTime - element.startTime + element.trimStart;
	return Math.min(sourceEnd, Math.max(element.trimStart, localTime));
}

/** Sandboxed, timeline-controlled preview for a local HyperFrames composition. */
export function HyperframesPreview({
	element,
	trackId,
	currentTime,
	isPlaying,
	muted,
	width,
	height,
	className,
}: HyperframesPreviewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const requestIdRef = useRef(0);
	const [url, setUrl] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const updateHyperframesElement = useTimelineStore(
		(state) => state.updateHyperframesElement
	);

	useEffect(() => {
		let disposed = false;
		let token: string | undefined;

		setUrl(null);
		setIsReady(false);
		setError(null);

		const register = async () => {
			if (!platform().hasCapability(PlatformCapability.Hyperframes)) {
				setError("HyperFrames preview is available in the desktop app.");
				return;
			}

			const result = await platform().hyperframes.registerPreview({
				sourcePath: element.sourcePath,
				variables: element.variableValues,
			});
			if (!result.success || !result.url || !result.token) {
				throw new Error(
					result.error || "Could not prepare HyperFrames preview."
				);
			}

			token = result.token;
			if (disposed) {
				await platform().hyperframes.releasePreview(token);
				return;
			}
			setUrl(result.url);
		};

		register().catch((reason: unknown) => {
			if (!disposed) {
				setError(reason instanceof Error ? reason.message : String(reason));
			}
		});

		return () => {
			disposed = true;
			if (token) {
				void platform().hyperframes.releasePreview(token);
			}
		};
	}, [element.sourcePath, element.variableValues]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent<unknown>) => {
			if (event.source !== iframeRef.current?.contentWindow) return;
			if (!isRuntimeMessage(event.data)) return;

			if (event.data.type === "ready") {
				setIsReady(true);
				setError(null);
				if (
					element.durationIsEstimated &&
					typeof event.data.duration === "number" &&
					Number.isFinite(event.data.duration) &&
					event.data.duration > 0
				) {
					const trimStart = Math.min(
						Math.max(0, element.trimStart),
						event.data.duration
					);
					const trimEnd = Math.min(
						Math.max(0, element.trimEnd),
						Math.max(0, event.data.duration - trimStart)
					);
					updateHyperframesElement(
						trackId,
						element.id,
						{
							duration: event.data.duration,
							durationIsEstimated: false,
							trimStart,
							trimEnd,
						},
						false
					);
				}
				return;
			}
			if (event.data.type === "error") {
				setError(event.data.message || "HyperFrames preview failed.");
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [
		element.durationIsEstimated,
		element.id,
		element.trimEnd,
		element.trimStart,
		trackId,
		updateHyperframesElement,
	]);

	useEffect(() => {
		if (!isReady) return;
		const target = iframeRef.current?.contentWindow;
		if (!target) return;

		requestIdRef.current += 1;
		target.postMessage(
			{
				source: "qcut-hyperframes",
				type: "seek",
				time: clampCompositionTime({ element, currentTime }),
				requestId: requestIdRef.current,
			},
			"*"
		);
	}, [currentTime, element, isReady]);

	useEffect(() => {
		if (!isReady) return;
		const target = iframeRef.current?.contentWindow;
		if (!target) return;

		requestIdRef.current += 1;
		target.postMessage(
			{
				source: "qcut-hyperframes",
				type: isPlaying ? "play" : "pause",
				requestId: requestIdRef.current,
			},
			"*"
		);
	}, [isPlaying, isReady]);

	useEffect(() => {
		if (!isReady) return;
		const target = iframeRef.current?.contentWindow;
		if (!target) return;

		requestIdRef.current += 1;
		target.postMessage(
			{
				source: "qcut-hyperframes",
				type: "set-muted",
				muted,
				requestId: requestIdRef.current,
			},
			"*"
		);
	}, [isReady, muted]);

	const viewportWidth = Math.max(1, width);
	const viewportHeight = Math.max(1, height);
	const compositionWidth = Math.max(1, element.compositionWidth);
	const compositionHeight = Math.max(1, element.compositionHeight);
	const fitScale = Math.min(
		viewportWidth / compositionWidth,
		viewportHeight / compositionHeight
	);
	const elementScale = Math.max(0.01, element.scale ?? 1);

	return (
		<div
			className={cn(
				"relative h-full w-full overflow-hidden bg-transparent",
				className
			)}
			style={{ opacity: element.opacity ?? 1 }}
			data-testid={`hyperframes-preview-${element.id}`}
		>
			{url ? (
				<iframe
					ref={iframeRef}
					src={url}
					title={`${element.name} HyperFrames preview`}
					sandbox="allow-scripts"
					allow="autoplay"
					className="pointer-events-none absolute border-0 bg-transparent"
					style={{
						width: compositionWidth,
						height: compositionHeight,
						left: "50%",
						top: "50%",
						transform: `translate(-50%, -50%) scale(${fitScale * elementScale})`,
						transformOrigin: "center",
					}}
				/>
			) : null}

			{!isReady && !error ? (
				<div className="absolute inset-0 flex items-center justify-center bg-black/20">
					<LoaderCircle className="size-5 animate-spin text-white/80" />
				</div>
			) : null}

			{error ? (
				<div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center">
					<div className="max-w-xs text-xs text-red-200">
						<AlertCircle className="mx-auto mb-2 size-5" />
						{error}
					</div>
				</div>
			) : null}
		</div>
	);
}
