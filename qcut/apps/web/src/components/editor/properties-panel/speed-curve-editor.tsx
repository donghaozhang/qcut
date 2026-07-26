import { type KeyboardEvent, useRef } from "react";
import { ArrowRight, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	buildSpeedCurvePath,
	speedRateToY,
	speedYToRate,
} from "@/lib/video/speed-curve-path";
import {
	MAX_PLAYBACK_RATE,
	MIN_PLAYBACK_RATE,
} from "@/lib/video/video-speed-constants";
import type { MediaPropertyKeyframe } from "@/types/timeline";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

export function SpeedCurveEditor({
	keyframes,
	durationInFrames,
	sourceDurationLabel,
	timelineDurationLabel,
	durationLabel,
	resetLabel,
	onChange,
	onInteractionStart,
	onInteractionEnd,
	onReset,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
	sourceDurationLabel: string;
	timelineDurationLabel: string;
	durationLabel: string;
	resetLabel: string;
	onChange: (keyframes: MediaPropertyKeyframe[]) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
	onReset: () => void;
}) {
	const plotRef = useRef<HTMLDivElement>(null);
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
		const bounds = plotRef.current?.getBoundingClientRect();
		const index = sorted.findIndex((keyframe) => keyframe.id === id);
		if (!bounds || index < 0 || bounds.width <= 0 || bounds.height <= 0) return;
		const keyframe = sorted[index];
		const isBoundary = index === 0 || index === sorted.length - 1;
		const previousFrame = sorted[index - 1]?.frame ?? -1;
		const nextFrame = sorted[index + 1]?.frame ?? safeDuration + 1;
		const pointerFrame = Math.round(
			((clientX - bounds.left) / bounds.width) * safeDuration
		);
		const frame = isBoundary
			? keyframe.frame
			: clamp({
					value: pointerFrame,
					min: previousFrame + 1,
					max: nextFrame - 1,
				});
		const normalizedY = clamp({
			value: (clientY - bounds.top) / bounds.height,
			min: 0,
			max: 1,
		});
		const value = Number(speedYToRate({ y: normalizedY }).toFixed(2));
		onChange(
			sorted.map((candidate) =>
				candidate.id === id ? { ...candidate, frame, value } : candidate
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
		const isBoundary = index === 0 || index === sorted.length - 1;
		const previousFrame = sorted[index - 1]?.frame ?? -1;
		const nextFrame = sorted[index + 1]?.frame ?? safeDuration + 1;
		onChange(
			sorted.map((candidate) =>
				candidate.id === id
					? {
							...candidate,
							frame: isBoundary
								? candidate.frame
								: clamp({
										value: candidate.frame + frameDelta,
										min: previousFrame + 1,
										max: nextFrame - 1,
									}),
							value: clamp({
								value: candidate.value + rateDelta,
								min: MIN_PLAYBACK_RATE,
								max: MAX_PLAYBACK_RATE,
							}),
						}
					: candidate
			)
		);
	};

	const resetFromKeyboard = ({
		key,
		preventDefault,
	}: KeyboardEvent<HTMLButtonElement>) => {
		if (key !== "Enter" && key !== " ") return;
		preventDefault();
		onReset();
	};

	return (
		<div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-zinc-200">
			<div className="flex items-center gap-2 text-[11px]">
				<span className="font-medium text-zinc-100">{durationLabel}</span>
				<output
					className="tabular-nums text-zinc-500"
					data-testid="speed-curve-source-duration"
				>
					{sourceDurationLabel}
				</output>
				<div className="flex min-w-8 flex-1 items-center">
					<div className="h-px flex-1 border-t border-dashed border-zinc-700" />
					<ArrowRight
						className="-ml-1 size-3.5 text-zinc-700"
						aria-hidden="true"
					/>
				</div>
				<output
					className="tabular-nums text-zinc-100"
					data-testid="speed-curve-output-duration"
				>
					{timelineDurationLabel}
				</output>
			</div>

			<div className="relative mt-3 h-40">
				<span className="absolute left-0 top-0 -translate-y-1/2 text-[10px] text-zinc-500">
					{MAX_PLAYBACK_RATE}x
				</span>
				<span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
					1x
				</span>
				<span className="absolute bottom-0 left-0 translate-y-1/2 text-[10px] text-zinc-500">
					{MIN_PLAYBACK_RATE}x
				</span>
				<div
					ref={plotRef}
					className="absolute inset-y-0 left-8 right-0"
					data-testid="speed-curve-editor"
				>
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 size-full"
						preserveAspectRatio="none"
						viewBox="0 0 100 100"
					>
						<path
							d="M 0 0 H 100 M 0 25 H 100 M 0 50 H 100 M 0 75 H 100 M 0 100 H 100"
							fill="none"
							stroke="#3f3f46"
							strokeDasharray="3 3"
							strokeWidth="0.75"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={buildSpeedCurvePath({
								keyframes: sorted,
								durationInFrames: safeDuration,
							})}
							fill="none"
							stroke="#e4e4e7"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
					{sorted.map((keyframe, index) => {
						const left = (keyframe.frame / safeDuration) * 100;
						const top = speedRateToY({ rate: keyframe.value });
						return (
							<button
								key={keyframe.id}
								type="button"
								title={`${keyframe.value.toFixed(2)}x`}
								aria-label={`${keyframe.value.toFixed(2)}x`}
								data-testid={`speed-curve-point-${index}`}
								className="absolute flex h-5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-[3px] border border-zinc-500 bg-zinc-800 text-zinc-400 shadow-sm active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
									if (event.currentTarget.hasPointerCapture(event.pointerId)) {
										event.currentTarget.releasePointerCapture(event.pointerId);
									}
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
							>
								<GripVertical className="size-2.5" aria-hidden="true" />
							</button>
						);
					})}
				</div>
			</div>

			<div className="mt-3 flex justify-end">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-7 gap-1.5 px-3 text-[11px]"
					data-testid="speed-curve-reset"
					onClick={onReset}
					onKeyDown={resetFromKeyboard}
				>
					<RotateCcw className="size-3" aria-hidden="true" />
					{resetLabel}
				</Button>
			</div>
		</div>
	);
}
