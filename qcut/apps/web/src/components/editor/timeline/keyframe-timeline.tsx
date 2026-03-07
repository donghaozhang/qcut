"use client";

import { useState, useRef, useCallback } from "react";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { cn } from "@/lib/utils";
import {
	Diamond,
	Plus,
	Trash2,
	Play,
	Pause,
	SkipBack,
	SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	AnimatedParameter,
	EffectKeyframe,
	EffectParameters,
} from "@/types/effects";
import {
	addKeyframe,
	removeKeyframe,
	updateKeyframe,
	createTransition,
} from "@/lib/effects/effects-keyframes";

interface KeyframeTimelineProps {
	elementId: string;
	effectId: string;
	duration: number;
	className?: string;
}

export function KeyframeTimeline({
	elementId,
	effectId,
	duration,
	className,
}: KeyframeTimelineProps) {
	const { getElementEffects, updateEffectAnimations } = useEffectsStore();
	const { currentTime, isPlaying, toggle, setCurrentTime } = usePlaybackStore();
	const timelineRef = useRef<HTMLDivElement>(null);

	const [selectedParameter, setSelectedParameter] =
		useState<keyof EffectParameters>("brightness");
	const [selectedKeyframe, setSelectedKeyframe] =
		useState<EffectKeyframe | null>(null);
	const [zoom, setZoom] = useState(100);
	const [isDragging, setIsDragging] = useState(false);

	const effects = getElementEffects(elementId);
	const effect = effects.find((e) => e.id === effectId);

	// Calculate values needed by hooks (using optional chaining for safety)
	const animation = effect?.animations?.find(
		(a) => a.parameter === selectedParameter
	);
	const pixelsPerSecond = (zoom / 100) * 50;
	const timelineWidth = duration * pixelsPerSecond;

	// Add keyframe at current time
	const handleAddKeyframe = useCallback(() => {
		const value = effect?.parameters[selectedParameter] || 0;

		if (animation) {
			const updatedAnimation = addKeyframe(
				animation,
				currentTime,
				value as number
			);
			updateEffectAnimations(elementId, effectId, updatedAnimation);
		} else {
			// Create new animation
			const newAnimation: AnimatedParameter = {
				parameter: selectedParameter,
				keyframes: [{ time: currentTime, value: value as number }],
				interpolation: "linear",
			};
			updateEffectAnimations(elementId, effectId, newAnimation);
		}
	}, [
		animation,
		currentTime,
		effect?.parameters,
		selectedParameter,
		elementId,
		effectId,
		updateEffectAnimations,
	]);

	// Remove selected keyframe
	const handleRemoveKeyframe = useCallback(() => {
		if (!selectedKeyframe || !animation) return;

		const updatedAnimation = removeKeyframe(animation, selectedKeyframe.time);
		if (updatedAnimation.keyframes.length > 0) {
			updateEffectAnimations(elementId, effectId, updatedAnimation);
		} else {
			// Remove animation if no keyframes left
			updateEffectAnimations(elementId, effectId, null);
		}
		setSelectedKeyframe(null);
	}, [
		selectedKeyframe,
		animation,
		elementId,
		effectId,
		updateEffectAnimations,
	]);

	// Update keyframe value
	const handleUpdateKeyframe = useCallback(
		(value: number) => {
			if (!selectedKeyframe || !animation) return;

			const updatedAnimation = updateKeyframe(
				animation,
				selectedKeyframe.time,
				value
			);
			updateEffectAnimations(elementId, effectId, updatedAnimation);
			setSelectedKeyframe({ ...selectedKeyframe, value });
		},
		[selectedKeyframe, animation, elementId, effectId, updateEffectAnimations]
	);

	// Apply preset transition
	const handleApplyTransition = useCallback(
		(type: "fade-in" | "fade-out" | "pulse" | "bounce") => {
			const transition = createTransition(selectedParameter, type, duration);
			updateEffectAnimations(elementId, effectId, transition);
		},
		[selectedParameter, duration, elementId, effectId, updateEffectAnimations]
	);

	// Helper function to find nearest valid position when collision occurs
	const findNearestValidPosition = useCallback(
		(
			targetTime: number,
			keyframes: EffectKeyframe[],
			currentKeyframe: EffectKeyframe
		): number | null => {
			const minSeparation = 0.01; // Minimum 10ms separation
			const sortedKeyframes = keyframes
				.filter((kf) => kf !== currentKeyframe)
				.sort((a, b) => a.time - b.time);

			// Find the nearest gap that can fit our keyframe
			let bestPosition: number | null = null;
			let minDistance = Infinity;

			// Check position before first keyframe
			if (
				sortedKeyframes.length === 0 ||
				targetTime < sortedKeyframes[0].time - minSeparation
			) {
				bestPosition = Math.max(0, targetTime);
			} else {
				// Check gaps between keyframes
				for (let i = 0; i < sortedKeyframes.length - 1; i++) {
					const gapStart = sortedKeyframes[i].time + minSeparation;
					const gapEnd = sortedKeyframes[i + 1].time - minSeparation;

					if (gapEnd > gapStart) {
						const clampedTime = Math.max(
							gapStart,
							Math.min(gapEnd, targetTime)
						);
						const distance = Math.abs(clampedTime - targetTime);

						if (distance < minDistance) {
							minDistance = distance;
							bestPosition = clampedTime;
						}
					}
				}

				// Check position after last keyframe
				const lastKeyframe = sortedKeyframes[sortedKeyframes.length - 1];
				if (targetTime > lastKeyframe.time + minSeparation) {
					const clampedTime = Math.min(duration, targetTime);
					const distance = Math.abs(clampedTime - targetTime);

					if (distance < minDistance) {
						bestPosition = clampedTime;
					}
				}
			}

			return bestPosition;
		},
		[duration]
	);

	// Handle keyframe dragging
	const handleKeyframeDrag = useCallback(
		(keyframe: EffectKeyframe, e: React.MouseEvent) => {
			e.preventDefault();
			setIsDragging(true);
			setSelectedKeyframe(keyframe);

			const startX = e.clientX;
			const startTime = keyframe.time;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				if (!timelineRef.current) return;

				const deltaX = moveEvent.clientX - startX;
				const deltaTime = deltaX / pixelsPerSecond;
				const newTime = Math.max(0, Math.min(duration, startTime + deltaTime));

				if (animation) {
					// Check for collision with existing keyframes (minimum 0.01s separation)
					const hasCollision = animation.keyframes.some(
						(kf) => kf !== keyframe && Math.abs(kf.time - newTime) < 0.01
					);

					// Only update if no collision detected
					if (hasCollision) {
						// Optional: Provide visual feedback for collision
						// Could show a temporary red border or snap to nearest valid position
						const nearestValidTime = findNearestValidPosition(
							newTime,
							animation.keyframes,
							keyframe
						);
						if (nearestValidTime !== null) {
							const updatedKeyframes = animation.keyframes.map((kf) =>
								kf === keyframe ? { ...kf, time: nearestValidTime } : kf
							);
							const updatedAnimation = {
								...animation,
								keyframes: updatedKeyframes,
							};
							updateEffectAnimations(elementId, effectId, updatedAnimation);
						}
					} else {
						// Update keyframe time
						const updatedKeyframes = animation.keyframes.map((kf) =>
							kf === keyframe ? { ...kf, time: newTime } : kf
						);
						const updatedAnimation = {
							...animation,
							keyframes: updatedKeyframes,
						};
						updateEffectAnimations(elementId, effectId, updatedAnimation);
					}
				}
			};

			const handleMouseUp = () => {
				setIsDragging(false);
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[
			animation,
			duration,
			pixelsPerSecond,
			elementId,
			effectId,
			updateEffectAnimations,
			findNearestValidPosition,
		]
	);

	// Navigate between keyframes
	const navigateToKeyframe = useCallback(
		(direction: "prev" | "next") => {
			if (!animation) return;

			const sortedKeyframes = [...animation.keyframes].sort(
				(a, b) => a.time - b.time
			);
			let targetKeyframe: EffectKeyframe | null = null;

			if (direction === "prev") {
				targetKeyframe =
					sortedKeyframes.reverse().find((kf) => kf.time < currentTime) ||
					sortedKeyframes[sortedKeyframes.length - 1];
			} else {
				targetKeyframe =
					sortedKeyframes.find((kf) => kf.time > currentTime) ||
					sortedKeyframes[0];
			}

			if (targetKeyframe) {
				setCurrentTime(targetKeyframe.time);
				setSelectedKeyframe(targetKeyframe);
			}
		},
		[animation, currentTime, setCurrentTime]
	);

	// Get appropriate range for parameter type
	const getParameterRange = (param: keyof EffectParameters) => {
		switch (param) {
			case "opacity":
				return { min: 0, max: 1, step: 0.01 };
			case "blur":
			case "sharpen":
			case "grain":
			case "vignette":
			case "edge":
				return { min: 0, max: 100, step: 1 };
			case "brightness":
			case "contrast":
			case "saturation":
				return { min: 0, max: 200, step: 1 };
			case "hue":
				return { min: -180, max: 180, step: 1 };
			case "warm":
			case "cool":
			case "vintage":
			case "sepia":
			case "grayscale":
				return { min: 0, max: 100, step: 1 };
			case "gamma":
				return { min: 0.1, max: 3, step: 0.1 };
			case "scale":
				return { min: 0, max: 300, step: 1 };
			case "rotate":
				return { min: -360, max: 360, step: 1 };
			case "skewX":
			case "skewY":
				return { min: -45, max: 45, step: 1 };
			case "wave":
			case "ripple":
			case "swirl":
			case "bulge":
			case "fisheye":
				return { min: 0, max: 100, step: 1 };
			default:
				return { min: -100, max: 100, step: 1 };
		}
	};

	const parameterRange = getParameterRange(selectedParameter);

	// Early return after all hooks are defined
	if (!effect) return null;

	return (
		<div
			className={cn("space-y-4 p-4 bg-background border rounded", className)}
		>
			{/* Controls */}
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-2">
					{/* Parameter selector */}
					<Select
						value={selectedParameter}
						onValueChange={(value) =>
							setSelectedParameter(value as keyof EffectParameters)
						}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(effect.parameters).map((param) => (
								<SelectItem key={param} value={param}>
									{param.charAt(0).toUpperCase() + param.slice(1)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{/* Playback controls */}
					<Button
						type="button"
						size="icon"
						variant="text"
						onClick={() => navigateToKeyframe("prev")}
						aria-label="Previous keyframe"
					>
						<SkipBack className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="text"
						onClick={toggle}
						aria-label={isPlaying ? "Pause" : "Play"}
					>
						{isPlaying ? (
							<Pause className="h-4 w-4" />
						) : (
							<Play className="h-4 w-4" />
						)}
					</Button>
					<Button
						type="button"
						size="icon"
						variant="text"
						onClick={() => navigateToKeyframe("next")}
						aria-label="Next keyframe"
					>
						<SkipForward className="h-4 w-4" />
					</Button>

					{/* Keyframe actions */}
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={handleAddKeyframe}
					>
						<Plus className="h-4 w-4 mr-1" />
						Add Keyframe
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={handleRemoveKeyframe}
						disabled={!selectedKeyframe}
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Remove
					</Button>
				</div>

				{/* Zoom control */}
				<div className="flex items-center space-x-2">
					<span className="text-sm">Zoom:</span>
					<Slider
						value={[zoom]}
						onValueChange={([value]) => setZoom(value)}
						min={50}
						max={200}
						step={10}
						className="w-32"
					/>
					<span className="text-sm">{zoom}%</span>
				</div>
			</div>

			{/* Transition presets */}
			<div className="flex space-x-2">
				<span className="text-sm">Quick Transitions:</span>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => handleApplyTransition("fade-in")}
				>
					Fade In
				</Button>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => handleApplyTransition("fade-out")}
				>
					Fade Out
				</Button>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => handleApplyTransition("pulse")}
				>
					Pulse
				</Button>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => handleApplyTransition("bounce")}
				>
					Bounce
				</Button>
			</div>

			{/* Timeline */}
			<div className="relative overflow-x-auto">
				<div
					ref={timelineRef}
					className="relative h-16 bg-muted rounded"
					style={{ width: `${timelineWidth}px` }}
				>
					{/* Time ruler */}
					<div className="absolute top-0 left-0 right-0 h-4 border-b">
						{Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
							<div
								key={i}
								className="absolute top-0 text-xs text-muted-foreground"
								style={{ left: `${i * pixelsPerSecond}px` }}
							>
								{i}s
							</div>
						))}
					</div>

					{/* Keyframes */}
					{animation?.keyframes.map((keyframe, index) => (
						<Tooltip key={index}>
							<TooltipTrigger asChild>
								<button
									type="button"
									className={cn(
										"absolute top-6 w-4 h-4 -ml-2 cursor-pointer p-0 border-0 bg-transparent",
										selectedKeyframe?.time === keyframe.time &&
											"ring-2 ring-primary"
									)}
									style={{ left: `${keyframe.time * pixelsPerSecond}px` }}
									onMouseDown={(e) => handleKeyframeDrag(keyframe, e)}
									onClick={() => setSelectedKeyframe(keyframe)}
									aria-label={`Keyframe at ${keyframe.time.toFixed(2)} seconds`}
								>
									<Diamond
										className={cn(
											"w-4 h-4",
											selectedKeyframe?.time === keyframe.time
												? "text-primary fill-primary"
												: "text-foreground fill-foreground"
										)}
										aria-hidden="true"
										focusable="false"
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent>
								<div className="text-xs">
									<div>Time: {keyframe.time.toFixed(2)}s</div>
									<div>Value: {keyframe.value}</div>
									{keyframe.easing && <div>Easing: {keyframe.easing}</div>}
								</div>
							</TooltipContent>
						</Tooltip>
					))}

					{/* Playhead */}
					<div
						className="absolute top-4 bottom-0 w-0.5 bg-primary pointer-events-none"
						style={{ left: `${currentTime * pixelsPerSecond}px` }}
					/>
				</div>
			</div>

			{/* Selected keyframe editor */}
			{selectedKeyframe && (
				<div className="p-3 bg-muted rounded space-y-2">
					<div className="text-sm font-medium">
						Keyframe at {selectedKeyframe.time.toFixed(2)}s
					</div>
					<div className="flex items-center space-x-2">
						<span className="text-sm">Value:</span>
						<Slider
							value={[selectedKeyframe.value]}
							onValueChange={([value]) => handleUpdateKeyframe(value)}
							min={parameterRange.min}
							max={parameterRange.max}
							step={parameterRange.step}
							className="flex-1"
						/>
						<span className="text-sm w-12">{selectedKeyframe.value}</span>
					</div>
					<div className="flex items-center space-x-2">
						<span className="text-sm">Easing:</span>
						<Select
							value={selectedKeyframe.easing || "linear"}
							onValueChange={(value) => {
								const updatedKeyframe = {
									...selectedKeyframe,
									easing: value as EffectKeyframe["easing"],
								};
								if (animation) {
									const updatedKeyframes = animation.keyframes.map((kf) =>
										kf === selectedKeyframe ? updatedKeyframe : kf
									);
									updateEffectAnimations(elementId, effectId, {
										...animation,
										keyframes: updatedKeyframes,
									});
								}
								setSelectedKeyframe(updatedKeyframe);
							}}
						>
							<SelectTrigger className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="linear">Linear</SelectItem>
								<SelectItem value="ease-in">Ease In</SelectItem>
								<SelectItem value="ease-out">Ease Out</SelectItem>
								<SelectItem value="ease-in-out">Ease In-Out</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			)}
		</div>
	);
}
