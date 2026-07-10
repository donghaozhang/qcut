"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { drawPersonCutoutFrame } from "@/lib/segmentation/person-cutout-canvas";
import { PersonCutoutClient } from "@/lib/segmentation/person-cutout-client";
import type { PersonCutoutMaskOptions } from "@/lib/segmentation/person-cutout-mask";

interface PersonCutoutPreviewProps {
	sourceUrl: string;
	settings: PersonCutoutMaskOptions;
}

const checkerBackground = {
	backgroundColor: "#202020",
	backgroundImage:
		"linear-gradient(45deg, #303030 25%, transparent 25%), linear-gradient(-45deg, #303030 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #303030 75%), linear-gradient(-45deg, transparent 75%, #303030 75%)",
	backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
	backgroundSize: "16px 16px",
};

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return "0:00";
	const whole = Math.max(0, Math.floor(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function PersonCutoutPreview({
	sourceUrl,
	settings,
}: PersonCutoutPreviewProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const clientRef = useRef<PersonCutoutClient | null>(null);
	const processingRef = useRef(false);
	const rerenderRequestedRef = useRef(false);
	const resetRequestedRef = useRef(true);
	const frameCallbackRef = useRef<number | null>(null);
	const loadedFrameCallbackRef = useRef<number | null>(null);
	const mountedRef = useRef(true);
	const settingsRef = useRef(settings);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const processCurrentFrame = useCallback(async () => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (
			!video ||
			!canvas ||
			video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
		) {
			return;
		}
		if (processingRef.current) {
			rerenderRequestedRef.current = true;
			return;
		}

		do {
			rerenderRequestedRef.current = false;
			processingRef.current = true;
			try {
				const client = clientRef.current ?? new PersonCutoutClient();
				clientRef.current = client;
				if (resetRequestedRef.current) {
					client.reset();
					resetRequestedRef.current = false;
				}
				const maxPreviewWidth = 960;
				const scale = Math.min(1, maxPreviewWidth / video.videoWidth);
				const previewWidth = Math.max(1, Math.round(video.videoWidth * scale));
				const previewHeight = Math.max(
					1,
					Math.round(video.videoHeight * scale)
				);
				sourceCanvasRef.current ??= document.createElement("canvas");
				const sourceCanvas = sourceCanvasRef.current;
				sourceCanvas.width = previewWidth;
				sourceCanvas.height = previewHeight;
				const sourceContext = sourceCanvas.getContext("2d");
				if (!sourceContext) {
					throw new Error("Unable to create preview frame canvas");
				}
				sourceContext.drawImage(video, 0, 0, previewWidth, previewHeight);
				const frame = await createImageBitmap(sourceCanvas);
				const result = await client.segment({
					frame,
					sourceTimestampMs: video.currentTime * 1000,
					options: settingsRef.current,
				});
				if (!mountedRef.current) return;
				canvas.width = previewWidth;
				canvas.height = previewHeight;
				maskCanvasRef.current ??= document.createElement("canvas");
				drawPersonCutoutFrame({
					outputCanvas: canvas,
					maskCanvas: maskCanvasRef.current,
					source: sourceCanvas,
					mask: result,
				});
				setError(null);
			} catch (caught) {
				if (!mountedRef.current) return;
				setError(caught instanceof Error ? caught.message : String(caught));
			} finally {
				processingRef.current = false;
			}
		} while (mountedRef.current && rerenderRequestedRef.current);
	}, []);

	const scheduleNextFrame = useCallback(() => {
		const video = videoRef.current;
		if (!video || video.paused || video.ended) return;
		frameCallbackRef.current = video.requestVideoFrameCallback(async () => {
			setCurrentTime(video.currentTime);
			await processCurrentFrame();
			scheduleNextFrame();
		});
	}, [processCurrentFrame]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			const video = videoRef.current;
			if (video && frameCallbackRef.current !== null) {
				video.cancelVideoFrameCallback(frameCallbackRef.current);
			}
			if (video && loadedFrameCallbackRef.current !== null) {
				video.cancelVideoFrameCallback(loadedFrameCallbackRef.current);
			}
			clientRef.current?.dispose();
		};
	}, []);

	useEffect(() => {
		settingsRef.current = settings;
		resetRequestedRef.current = true;
		rerenderRequestedRef.current = true;
		void processCurrentFrame();
	}, [settings, processCurrentFrame]);

	const togglePlayback = async () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			await video.play();
			setIsPlaying(true);
			scheduleNextFrame();
		} else {
			video.pause();
			setIsPlaying(false);
		}
	};

	return (
		<div className="space-y-2" data-testid="person-cutout-preview">
			<div
				className="relative flex h-32 items-center justify-center overflow-hidden rounded-sm border"
				style={checkerBackground}
			>
				<canvas ref={canvasRef} className="max-h-full max-w-full" />
				<video
					ref={videoRef}
					src={sourceUrl}
					muted
					playsInline
					className="pointer-events-none absolute size-px opacity-0"
					onLoadedMetadata={(event) => {
						const video = event.currentTarget;
						setDuration(video.duration);
						setCurrentTime(video.currentTime);
					}}
					onLoadedData={(event) => {
						const video = event.currentTarget;
						if (loadedFrameCallbackRef.current !== null) {
							video.cancelVideoFrameCallback(loadedFrameCallbackRef.current);
						}
						loadedFrameCallbackRef.current = video.requestVideoFrameCallback(
							() => {
								loadedFrameCallbackRef.current = null;
								void processCurrentFrame();
							}
						);
					}}
					onSeeked={() => void processCurrentFrame()}
					onEnded={() => setIsPlaying(false)}
				/>
			</div>
			<div className="flex items-center gap-3">
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					onClick={() => void togglePlayback()}
					aria-label={isPlaying ? "Pause preview" : "Play preview"}
				>
					{isPlaying ? (
						<Pause className="size-4" />
					) : (
						<Play className="size-4" />
					)}
				</Button>
				<Slider
					aria-label="Person cutout preview time"
					value={[currentTime]}
					min={0}
					max={Math.max(0.01, duration)}
					step={0.01}
					onValueChange={([value]) => {
						const video = videoRef.current;
						if (!video) return;
						video.currentTime = value;
						setCurrentTime(value);
					}}
				/>
				<span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
					{formatTime(currentTime)} / {formatTime(duration)}
				</span>
			</div>
			{error && <div className="text-xs text-destructive">{error}</div>}
		</div>
	);
}
