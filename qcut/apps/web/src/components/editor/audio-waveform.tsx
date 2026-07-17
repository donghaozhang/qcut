import { useEffect, useRef, useState } from "react";
import {
	audioWaveformCache,
	audioWaveformDisplayGain,
	sampleAudioWaveformBars,
	type AudioWaveformLoader,
	type AudioWaveformPeaks,
} from "@/lib/audio/audio-waveform-cache";
import {
	canDecodeNativeAudioWaveform,
	decodeNativeAudioWaveform,
} from "@/lib/audio/native-audio-waveform";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
	audioUrl: string;
	/** Fixed pixel height; omit to fill the container (size it via className). */
	height?: number;
	className?: string;
	sourceStart?: number;
	sourceEnd?: number;
	sourcePath?: string;
	sourceDuration?: number;
	cacheKey?: string;
	ariaLabel?: string;
	showStatus?: boolean;
	loadingLabel?: string;
	errorLabel?: string;
}

function nativeWaveformLoader({
	sourcePath,
	sourceDuration,
}: {
	sourcePath?: string;
	sourceDuration?: number;
}): AudioWaveformLoader | undefined {
	if (
		!sourcePath ||
		!sourceDuration ||
		sourceDuration <= 0 ||
		!canDecodeNativeAudioWaveform()
	) {
		return;
	}
	return () =>
		decodeNativeAudioWaveform({
			sourcePath,
			duration: sourceDuration,
		});
}

function drawWaveform({
	canvas,
	waveform,
	height,
	width,
	sourceStart,
	sourceEnd,
}: {
	canvas: HTMLCanvasElement;
	waveform: AudioWaveformPeaks;
	height: number;
	width: number;
	sourceStart?: number;
	sourceEnd?: number;
}) {
	const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.max(1, Math.round(width * pixelRatio));
	canvas.height = Math.max(1, Math.round(height * pixelRatio));
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	const context = canvas.getContext("2d");
	if (!context) return;
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	context.clearRect(0, 0, width, height);
	const barWidth = 2;
	const barGap = 1;
	const barCount = Math.max(1, Math.floor(width / (barWidth + barGap)));
	const bars = sampleAudioWaveformBars({
		waveform,
		startTime: sourceStart,
		endTime: sourceEnd,
		barCount,
	});
	const gain = audioWaveformDisplayGain({ bars });
	context.fillStyle = "rgba(255, 255, 255, 0.9)";
	for (const [index, bar] of bars.entries()) {
		const amplitude = Math.min(1, bar * gain);
		const barHeight = Math.max(1, amplitude * (height - 2));
		context.fillRect(
			index * (barWidth + barGap),
			(height - barHeight) / 2,
			barWidth,
			barHeight
		);
	}
}

export default function AudioWaveform({
	audioUrl,
	height,
	className = "",
	sourceStart,
	sourceEnd,
	sourcePath,
	sourceDuration,
	cacheKey,
	ariaLabel = "Audio waveform",
	showStatus = true,
	loadingLabel = "Loading waveform...",
	errorLabel = "Audio unavailable",
}: AudioWaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [waveform, setWaveform] = useState<AudioWaveformPeaks | null>(null);
	const [error, setError] = useState<string>();

	useEffect(() => {
		let active = true;
		setWaveform(null);
		setError(undefined);
		const nativeLoader = nativeWaveformLoader({ sourcePath, sourceDuration });
		const useNativeDecoder = Boolean(nativeLoader);
		if (!audioUrl && !useNativeDecoder) {
			setError(errorLabel);
			return () => {
				active = false;
			};
		}
		void audioWaveformCache
			.get({
				audioUrl,
				cacheKey:
					cacheKey ??
					(useNativeDecoder
						? `native:${sourcePath}:${sourceDuration}`
						: audioUrl),
				loader: nativeLoader,
			})
			.then((result) => {
				if (active) setWaveform(result);
			})
			.catch(() => {
				if (active) setError(errorLabel);
			});
		return () => {
			active = false;
		};
	}, [audioUrl, cacheKey, errorLabel, sourceDuration, sourcePath]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas || !waveform) return;
		const render = () => {
			const rect = container.getBoundingClientRect();
			drawWaveform({
				canvas,
				waveform,
				height: height ?? Math.max(1, rect.height),
				width: Math.max(1, rect.width),
				sourceStart,
				sourceEnd,
			});
		};
		render();
		const observer = new ResizeObserver(render);
		observer.observe(container);
		return () => observer.disconnect();
	}, [height, sourceEnd, sourceStart, waveform]);

	return (
		<div
			ref={containerRef}
			className={cn("relative overflow-hidden", className)}
			style={height === undefined ? undefined : { height }}
			data-testid="audio-waveform"
		>
			<canvas
				ref={canvasRef}
				className={cn(
					"block transition-opacity duration-150",
					waveform ? "opacity-100" : "opacity-0"
				)}
				aria-label={ariaLabel}
			/>
			{waveform || !showStatus ? null : (
				<div className="absolute inset-0 flex items-center justify-center">
					<span className="truncate px-1 text-[10px] text-foreground/60">
						{error ?? loadingLabel}
					</span>
				</div>
			)}
		</div>
	);
}
