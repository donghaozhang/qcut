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
	/** Bar width/gap in CSS px; 1/1 gives the fine JianYing-style rendering. */
	barWidth?: number;
	barGap?: number;
	color?: string;
	/** "center" mirrors bars around the midline; "bottom" grows them from a solid baseline (JianYing style). */
	anchor?: "center" | "bottom";
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
	barWidth,
	barGap,
	color,
	anchor,
}: {
	canvas: HTMLCanvasElement;
	waveform: AudioWaveformPeaks;
	height: number;
	width: number;
	sourceStart?: number;
	sourceEnd?: number;
	barWidth: number;
	barGap: number;
	color: string;
	anchor: "center" | "bottom";
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
	const barCount = Math.max(1, Math.floor(width / (barWidth + barGap)));
	const bars = sampleAudioWaveformBars({
		waveform,
		startTime: sourceStart,
		endTime: sourceEnd,
		barCount,
	});
	const gain = audioWaveformDisplayGain({ bars });
	context.fillStyle = color;
	for (const [index, bar] of bars.entries()) {
		const amplitude = Math.min(1, bar * gain);
		const barHeight = Math.max(1, amplitude * (height - 2));
		context.fillRect(
			index * (barWidth + barGap),
			anchor === "bottom" ? height - barHeight : (height - barHeight) / 2,
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
	barWidth = 2,
	barGap = 1,
	color = "rgba(255, 255, 255, 0.9)",
	anchor = "center",
}: AudioWaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [waveform, setWaveform] = useState<AudioWaveformPeaks | null>(null);
	const [error, setError] = useState<string>();

	useEffect(() => {
		let active = true;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
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
		// Decodes can fail transiently (memory pressure while a whole library
		// panel decodes at once); the cache evicts failed promises, so a retry
		// re-runs the loader instead of pinning the error until remount.
		const load = ({ attempt }: { attempt: number }) => {
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
					if (!active) return;
					if (attempt < 2) {
						retryTimer = setTimeout(
							() => load({ attempt: attempt + 1 }),
							1500 * (attempt + 1)
						);
						return;
					}
					setError(errorLabel);
				});
		};
		load({ attempt: 0 });
		return () => {
			active = false;
			clearTimeout(retryTimer);
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
				barWidth,
				barGap,
				color,
				anchor,
			});
		};
		render();
		const observer = new ResizeObserver(render);
		observer.observe(container);
		return () => observer.disconnect();
	}, [
		height,
		sourceEnd,
		sourceStart,
		waveform,
		barWidth,
		barGap,
		color,
		anchor,
	]);

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
