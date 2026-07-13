import { useEffect, useRef, useState } from "react";
import {
	audioWaveformCache,
	sampleAudioWaveformBars,
	type AudioWaveformPeaks,
} from "@/lib/audio/audio-waveform-cache";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
	audioUrl: string;
	height?: number;
	className?: string;
	sourceStart?: number;
	sourceEnd?: number;
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
	context.fillStyle = "rgba(255, 255, 255, 0.72)";
	for (let index = 0; index < bars.length; index++) {
		const barHeight = Math.max(1, bars[index] * (height - 2));
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
	height = 32,
	className = "",
	sourceStart,
	sourceEnd,
}: AudioWaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [waveform, setWaveform] = useState<AudioWaveformPeaks | null>(null);
	const [error, setError] = useState<string>();

	useEffect(() => {
		let active = true;
		setWaveform(null);
		setError(undefined);
		if (!audioUrl) {
			setError("Audio unavailable");
			return () => {
				active = false;
			};
		}
		void audioWaveformCache
			.get({ audioUrl })
			.then((result) => {
				if (active) setWaveform(result);
			})
			.catch(() => {
				if (active) setError("Audio unavailable");
			});
		return () => {
			active = false;
		};
	}, [audioUrl]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas || !waveform) return;
		const render = () => {
			const width = Math.max(1, container.getBoundingClientRect().width);
			drawWaveform({
				canvas,
				waveform,
				height,
				width,
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
			style={{ height }}
			data-testid="audio-waveform"
		>
			<canvas
				ref={canvasRef}
				className={cn(
					"block transition-opacity duration-150",
					waveform ? "opacity-100" : "opacity-0"
				)}
				aria-label="Audio waveform"
			/>
			{waveform ? null : (
				<div className="absolute inset-0 flex items-center justify-center">
					<span className="truncate px-1 text-[10px] text-foreground/60">
						{error ?? "Loading waveform..."}
					</span>
				</div>
			)}
		</div>
	);
}
