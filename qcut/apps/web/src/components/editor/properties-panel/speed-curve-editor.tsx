import { useRef } from "react";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import type { MediaPropertyKeyframe } from "@/types/timeline";

const MIN_RATE = 0.1;
const MAX_RATE = 8;
const PATH_SAMPLE_COUNT = 64;

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function curvePath({
	keyframes,
	durationInFrames,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
}): string {
	if (keyframes.length === 0) return "";
	const safeDuration = Math.max(1, durationInFrames);
	return Array.from({ length: PATH_SAMPLE_COUNT + 1 }, (_, index) => {
		const frame = (index / PATH_SAMPLE_COUNT) * safeDuration;
		const rate = interpolateNumber(keyframes as Keyframe[], frame);
		const x = (frame / safeDuration) * 100;
		const y =
			100 -
			((clamp({ value: rate, min: MIN_RATE, max: MAX_RATE }) - MIN_RATE) /
				(MAX_RATE - MIN_RATE)) *
				100;
		return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
	}).join(" ");
}

export function SpeedCurveEditor({
	keyframes,
	durationInFrames,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
	onChange: (keyframes: MediaPropertyKeyframe[]) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const editorRef = useRef<HTMLDivElement>(null);
	const safeDuration = Math.max(1, durationInFrames);
	const sorted = [...keyframes].sort((left, right) => left.frame - right.frame);

	const updatePoint = ({
		id,
		clientX,
		clientY,
	}: {
		id: string;
		clientX: number;
		clientY: number;
	}) => {
		const bounds = editorRef.current?.getBoundingClientRect();
		const index = sorted.findIndex((keyframe) => keyframe.id === id);
		if (!bounds || index < 0 || bounds.width <= 0 || bounds.height <= 0) return;
		const previousFrame = sorted[index - 1]?.frame ?? -1;
		const nextFrame = sorted[index + 1]?.frame ?? safeDuration + 1;
		const frame = clamp({
			value: Math.round(
				((clientX - bounds.left) / bounds.width) * safeDuration
			),
			min: previousFrame + 1,
			max: nextFrame - 1,
		});
		const normalizedY = clamp({
			value: (clientY - bounds.top) / bounds.height,
			min: 0,
			max: 1,
		});
		const value = MAX_RATE - normalizedY * (MAX_RATE - MIN_RATE);
		onChange(
			sorted.map((keyframe) =>
				keyframe.id === id ? { ...keyframe, frame, value } : keyframe
			)
		);
	};

	const nudgePoint = ({
		id,
		frameDelta,
		rateDelta,
	}: {
		id: string;
		frameDelta: number;
		rateDelta: number;
	}) => {
		const index = sorted.findIndex((keyframe) => keyframe.id === id);
		const keyframe = sorted[index];
		if (!keyframe) return;
		const previousFrame = sorted[index - 1]?.frame ?? -1;
		const nextFrame = sorted[index + 1]?.frame ?? safeDuration + 1;
		onChange(
			sorted.map((candidate) =>
				candidate.id === id
					? {
							...candidate,
							frame: clamp({
								value: candidate.frame + frameDelta,
								min: previousFrame + 1,
								max: nextFrame - 1,
							}),
							value: clamp({
								value: candidate.value + rateDelta,
								min: MIN_RATE,
								max: MAX_RATE,
							}),
						}
					: candidate
			)
		);
	};

	return (
		<div
			ref={editorRef}
			className="relative h-36 w-full overflow-hidden rounded-md border border-border bg-background"
			data-testid="speed-curve-editor"
			style={{
				backgroundImage:
					"linear-gradient(to right, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 45%, transparent) 1px, transparent 1px)",
				backgroundSize: "25% 100%, 100% 25%",
			}}
		>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 size-full"
				preserveAspectRatio="none"
				viewBox="0 0 100 100"
			>
				<path
					d={curvePath({ keyframes: sorted, durationInFrames: safeDuration })}
					fill="none"
					stroke="var(--primary)"
					strokeWidth="2"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			{sorted.map((keyframe) => {
				const left = (keyframe.frame / safeDuration) * 100;
				const top =
					100 -
					((clamp({
						value: keyframe.value,
						min: MIN_RATE,
						max: MAX_RATE,
					}) -
						MIN_RATE) /
						(MAX_RATE - MIN_RATE)) *
						100;
				return (
					<button
						key={keyframe.id}
						type="button"
						title={`${keyframe.value.toFixed(2)}x`}
						aria-label={`${keyframe.value.toFixed(2)}x`}
						className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style={{ left: `${left}%`, top: `${top}%` }}
						onPointerDown={(event) => {
							event.preventDefault();
							event.currentTarget.setPointerCapture(event.pointerId);
							onInteractionStart();
						}}
						onPointerMove={(event) => {
							if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
								return;
							}
							updatePoint({
								id: keyframe.id,
								clientX: event.clientX,
								clientY: event.clientY,
							});
						}}
						onPointerUp={(event) => {
							event.currentTarget.releasePointerCapture(event.pointerId);
							onInteractionEnd();
						}}
						onPointerCancel={onInteractionEnd}
						onKeyDown={(event) => {
							const frameDelta =
								event.key === "ArrowLeft"
									? -1
									: event.key === "ArrowRight"
										? 1
										: 0;
							const rateDelta =
								event.key === "ArrowDown"
									? -0.1
									: event.key === "ArrowUp"
										? 0.1
										: 0;
							if (frameDelta === 0 && rateDelta === 0) return;
							event.preventDefault();
							onInteractionStart();
							nudgePoint({ id: keyframe.id, frameDelta, rateDelta });
							onInteractionEnd();
						}}
					/>
				);
			})}
		</div>
	);
}
