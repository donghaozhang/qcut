import { type KeyboardEvent, useRef } from "react";
import {
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	Minus,
	Plus,
	RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import { generateUUID } from "@/lib/utils";
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

const SPEED_CURVE_KEY_DELTAS: Record<
	string,
	{ frameDelta: number; rateDelta: number }
> = {
	ArrowLeft: { frameDelta: -1, rateDelta: 0 },
	ArrowRight: { frameDelta: 1, rateDelta: 0 },
	ArrowDown: { frameDelta: 0, rateDelta: -0.1 },
	ArrowUp: { frameDelta: 0, rateDelta: 0.1 },
};

const SPEED_CURVE_SEEK_DELTAS: Record<string, number> = {
	ArrowLeft: -1,
	ArrowRight: 1,
	PageDown: -10,
	PageUp: 10,
};

// Playhead counts as "on a point" within this fraction of the source duration,
// capped so a long source keeps a tight radius instead of a multi-second one.
const POINT_HIT_RATIO = 0.02;
const POINT_HIT_MAX_FRAMES = 6;

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
	playheadFrame = null,
	sourceDurationLabel,
	timelineDurationLabel,
	durationLabel,
	resetLabel,
	addPointLabel,
	removePointLabel,
	seekLabel,
	onChange,
	onInteractionStart,
	onInteractionEnd,
	onReset,
	onSeekToFrame,
}: {
	keyframes: MediaPropertyKeyframe[];
	durationInFrames: number;
	playheadFrame?: number | null;
	sourceDurationLabel: string;
	timelineDurationLabel: string;
	durationLabel: string;
	resetLabel: string;
	addPointLabel: string;
	removePointLabel: string;
	seekLabel: string;
	onChange: (keyframes: MediaPropertyKeyframe[]) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
	onReset: () => void;
	onSeekToFrame?: (frame: number) => void;
}) {
	const plotRef = useRef<HTMLDivElement>(null);
	const safeDuration = Math.max(1, durationInFrames);
	const sorted = [...keyframes].sort((left, right) => left.frame - right.frame);
	const hitThreshold = Math.min(
		POINT_HIT_MAX_FRAMES,
		Math.max(1, Math.round(safeDuration * POINT_HIT_RATIO))
	);
	const playheadHitIndex =
		playheadFrame == null
			? -1
			: sorted.reduce((best, keyframe, index) => {
					const distance = Math.abs(keyframe.frame - playheadFrame);
					if (distance > hitThreshold) return best;
					const bestDistance =
						best < 0
							? Number.POSITIVE_INFINITY
							: Math.abs(sorted[best].frame - playheadFrame);
					return distance < bestDistance ? index : best;
				}, -1);
	const canRemovePoint =
		playheadHitIndex > 0 && playheadHitIndex < sorted.length - 1;
	const canAddPoint =
		playheadFrame != null && playheadHitIndex < 0 && sorted.length >= 2;

	const removePointAt = ({ index }: { index: number }) => {
		if (index <= 0 || index >= sorted.length - 1) return;
		onInteractionStart();
		onChange(sorted.filter((_, candidate) => candidate !== index));
		onInteractionEnd();
	};

	const seekToPointer = ({ clientX }: { clientX: number }) => {
		const bounds = plotRef.current?.getBoundingClientRect();
		if (!onSeekToFrame || !bounds || bounds.width <= 0) return;
		onSeekToFrame(
			clamp({
				value: Math.round(
					((clientX - bounds.left) / bounds.width) * safeDuration
				),
				min: 0,
				max: safeDuration,
			})
		);
	};

	const togglePointAtPlayhead = () => {
		if (playheadFrame == null) return;
		if (canRemovePoint) {
			removePointAt({ index: playheadHitIndex });
			return;
		}
		if (!canAddPoint) return;
		const frame = clamp({
			value: Math.round(playheadFrame),
			min: 1,
			max: safeDuration - 1,
		});
		const value = Number(
			interpolateNumber(sorted as Keyframe[], frame).toFixed(2)
		);
		onInteractionStart();
		onChange(
			[
				...sorted,
				{ id: generateUUID(), frame, value, easing: "easeInOut" as const },
			].sort((left, right) => left.frame - right.frame)
		);
		onInteractionEnd();
	};

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
					{onSeekToFrame ? (
						<button
							type="button"
							aria-label={seekLabel}
							data-testid="speed-curve-seek-surface"
							className="absolute inset-0 cursor-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
							onClick={(event) => seekToPointer({ clientX: event.clientX })}
							onKeyDown={(event) => {
								const seekDelta = SPEED_CURVE_SEEK_DELTAS[event.key];
								if (seekDelta === undefined || playheadFrame == null) return;
								event.preventDefault();
								onSeekToFrame(
									clamp({
										value: playheadFrame + seekDelta,
										min: 0,
										max: safeDuration,
									})
								);
							}}
						/>
					) : null}
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 size-full"
						preserveAspectRatio="none"
						viewBox="0 0 100 100"
					>
						<path
							d="M 0 0 H 100 M 0 100 H 100"
							fill="none"
							stroke="#3f3f46"
							strokeDasharray="3 3"
							strokeWidth="0.75"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d="M 0 50 H 100"
							fill="none"
							stroke="#52525b"
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
					{playheadFrame != null ? (
						<div
							aria-hidden="true"
							data-testid="speed-curve-playhead"
							className="pointer-events-none absolute inset-y-0 w-px bg-zinc-100/80"
							style={{
								left: `${
									(clamp({
										value: playheadFrame,
										min: 0,
										max: safeDuration,
									}) /
										safeDuration) *
									100
								}%`,
							}}
						/>
					) : null}
					{sorted.map((keyframe, index) => {
						const left = (keyframe.frame / safeDuration) * 100;
						const top = speedRateToY({ rate: keyframe.value }) * 100;
						return (
							<button
								key={keyframe.id}
								type="button"
								title={`${keyframe.value.toFixed(2)}x`}
								aria-label={`${keyframe.value.toFixed(2)}x`}
								data-testid={`speed-curve-point-${index}`}
								className="absolute flex h-5 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-zinc-500 bg-zinc-800 text-zinc-400 shadow-sm active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
									if (event.key === "Delete" || event.key === "Backspace") {
										event.preventDefault();
										removePointAt({ index });
										return;
									}
									const delta = SPEED_CURVE_KEY_DELTAS[event.key];
									if (!delta) return;
									event.preventDefault();
									onInteractionStart();
									nudgePoint({ id: keyframe.id, ...delta });
									onInteractionEnd();
								}}
							>
								<span className="flex items-center" aria-hidden="true">
									<ChevronLeft className="size-2" />
									<ChevronRight className="-ml-0.5 size-2" />
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="mt-3 flex items-center justify-end gap-1.5">
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
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="size-7 p-0"
					data-testid="speed-curve-point-toggle"
					disabled={!canRemovePoint && !canAddPoint}
					aria-label={canRemovePoint ? removePointLabel : addPointLabel}
					title={canRemovePoint ? removePointLabel : addPointLabel}
					onClick={togglePointAtPlayhead}
				>
					{playheadHitIndex >= 0 ? (
						<Minus className="size-3.5" aria-hidden="true" />
					) : (
						<Plus className="size-3.5" aria-hidden="true" />
					)}
				</Button>
			</div>
		</div>
	);
}
