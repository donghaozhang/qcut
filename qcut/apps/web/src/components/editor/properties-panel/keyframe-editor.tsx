/**
 * Keyframe Editor Component
 *
 * Visual editor for animating Remotion props over time with keyframes.
 * Supports numeric and color values with multiple easing functions.
 *
 * @module components/editor/properties-panel/keyframe-editor
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Plus, Trash2, Diamond, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	type Keyframe,
	type EasingType,
	createKeyframe,
	sortKeyframes,
	interpolateNumber,
	interpolateColor,
} from "@/lib/remotion/keyframe-converter";

// ============================================================================
// Types
// ============================================================================

export interface KeyframeEditorProps {
	/** Name of the prop being animated */
	propName: string;
	/** Display label for the prop */
	propLabel: string;
	/** Type of value being animated */
	propType: "number" | "color";
	/** Current keyframes */
	keyframes: Keyframe[];
	/** Total duration in frames */
	durationInFrames: number;
	/** FPS of the composition */
	fps?: number;
	/** Current frame for preview */
	currentFrame?: number;
	/** Called when a keyframe is added */
	onKeyframeAdd: (frame: number, value: unknown) => void;
	/** Called when a keyframe is updated */
	onKeyframeUpdate: (
		id: string,
		frame: number,
		value: unknown,
		easing?: EasingType
	) => void;
	/** Called when a keyframe is deleted */
	onKeyframeDelete: (id: string) => void;
	/** Whether the editor is disabled */
	disabled?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
	{ value: "linear", label: "Linear" },
	{ value: "easeIn", label: "Ease In" },
	{ value: "easeOut", label: "Ease Out" },
	{ value: "easeInOut", label: "Ease In Out" },
	{ value: "spring", label: "Spring" },
];

// ============================================================================
// Keyframe Diamond
// ============================================================================

interface KeyframeDiamondProps {
	keyframe: Keyframe;
	position: number; // 0-100 percentage
	isSelected: boolean;
	onClick: () => void;
	onDelete: () => void;
	disabled?: boolean;
}

function KeyframeDiamond({
	keyframe,
	position,
	isSelected,
	onClick,
	onDelete,
	disabled,
}: KeyframeDiamondProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
						"w-3 h-3 transform rotate-45",
						"border-2 transition-colors",
						isSelected
							? "bg-violet-500 border-violet-400"
							: "bg-violet-500/60 border-violet-500/40",
						!disabled &&
							"hover:bg-violet-400 hover:border-violet-300 cursor-pointer",
						disabled && "opacity-50 cursor-not-allowed"
					)}
					style={{ left: `${position}%` }}
					onClick={onClick}
					onKeyDown={(e) => {
						if ((e.key === "Delete" || e.key === "Backspace") && !disabled) {
							e.preventDefault();
							onDelete();
						}
					}}
					disabled={disabled}
					aria-label={`Keyframe at frame ${keyframe.frame}. Press Delete to remove.`}
				/>
			</TooltipTrigger>
			<TooltipContent side="top" className="text-xs">
				<div>Frame {keyframe.frame}</div>
				<div className="text-muted-foreground">
					Value: {String(keyframe.value)}
				</div>
				<div className="text-muted-foreground">Easing: {keyframe.easing}</div>
			</TooltipContent>
		</Tooltip>
	);
}

// ============================================================================
// Keyframe Editor Panel
// ============================================================================

interface KeyframeEditPanelProps {
	keyframe: Keyframe;
	propType: "number" | "color";
	durationInFrames: number;
	onUpdate: (frame: number, value: unknown, easing: EasingType) => void;
	onDelete: () => void;
	disabled?: boolean;
}

function KeyframeEditPanel({
	keyframe,
	propType,
	durationInFrames,
	onUpdate,
	onDelete,
	disabled,
}: KeyframeEditPanelProps) {
	const [localFrame, setLocalFrame] = useState(keyframe.frame);
	const [localValue, setLocalValue] = useState(
		propType === "number" ? String(keyframe.value) : (keyframe.value as string)
	);
	const [localEasing, setLocalEasing] = useState(keyframe.easing);

	const handleFrameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const frame = parseInt(e.target.value, 10);
		if (!isNaN(frame) && frame >= 0 && frame <= durationInFrames) {
			setLocalFrame(frame);
			onUpdate(
				frame,
				propType === "number"
					? parseFloat(localValue as string) || 0
					: localValue,
				localEasing
			);
		}
	};

	const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setLocalValue(val);
		if (propType === "number") {
			const num = parseFloat(val);
			if (!isNaN(num)) {
				onUpdate(localFrame, num, localEasing);
			}
		} else {
			onUpdate(localFrame, val, localEasing);
		}
	};

	const handleEasingChange = (easing: EasingType) => {
		setLocalEasing(easing);
		onUpdate(
			localFrame,
			propType === "number"
				? parseFloat(localValue as string) || 0
				: localValue,
			easing
		);
	};

	return (
		<div className="space-y-3 p-1">
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label className="text-[10px] text-muted-foreground">Frame</Label>
					<Input
						type="number"
						value={localFrame}
						onChange={handleFrameChange}
						min={0}
						max={durationInFrames}
						className="h-7 text-xs"
						disabled={disabled}
					/>
				</div>
				<div>
					<Label className="text-[10px] text-muted-foreground">Value</Label>
					{propType === "color" ? (
						<div className="flex gap-1">
							<input
								type="color"
								value={localValue as string}
								onChange={handleValueChange}
								className="w-7 h-7 rounded border cursor-pointer"
								disabled={disabled}
							/>
							<Input
								type="text"
								value={localValue as string}
								onChange={handleValueChange}
								className="h-7 text-xs flex-1"
								disabled={disabled}
							/>
						</div>
					) : (
						<Input
							type="number"
							value={localValue as string}
							onChange={handleValueChange}
							className="h-7 text-xs"
							disabled={disabled}
						/>
					)}
				</div>
			</div>

			<div>
				<Label className="text-[10px] text-muted-foreground">Easing</Label>
				<Select
					value={localEasing}
					onValueChange={handleEasingChange}
					disabled={disabled}
				>
					<SelectTrigger className="h-7 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EASING_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value} className="text-xs">
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Button
				type="button"
				variant="destructive"
				size="sm"
				className="w-full h-7 text-xs"
				onClick={onDelete}
				disabled={disabled}
			>
				<Trash2 className="w-3 h-3 mr-1" />
				Delete Keyframe
			</Button>
		</div>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function KeyframeEditor({
	propName,
	propLabel,
	propType,
	keyframes,
	durationInFrames,
	fps = 30,
	currentFrame = 0,
	onKeyframeAdd,
	onKeyframeUpdate,
	onKeyframeDelete,
	disabled,
}: KeyframeEditorProps) {
	const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(
		null
	);
	const [isExpanded, setIsExpanded] = useState(true);

	// Sort keyframes for display
	const sortedKeyframes = useMemo(() => sortKeyframes(keyframes), [keyframes]);

	// Calculate current interpolated value
	const currentValue = useMemo(() => {
		if (keyframes.length === 0) return propType === "color" ? "#000000" : 0;
		if (propType === "color") {
			return interpolateColor(keyframes, currentFrame);
		}
		return interpolateNumber(keyframes, currentFrame);
	}, [keyframes, currentFrame, propType]);

	// Selected keyframe
	const selectedKeyframe = useMemo(
		() => keyframes.find((kf) => kf.id === selectedKeyframeId),
		[keyframes, selectedKeyframeId]
	);

	// Handle adding a keyframe at current frame
	const handleAddKeyframe = useCallback(() => {
		const value = propType === "color" ? "#ffffff" : 0;
		onKeyframeAdd(currentFrame, value);
	}, [currentFrame, propType, onKeyframeAdd]);

	// Handle updating a keyframe
	const handleUpdateKeyframe = useCallback(
		(frame: number, value: unknown, easing: EasingType) => {
			if (selectedKeyframeId) {
				onKeyframeUpdate(selectedKeyframeId, frame, value, easing);
			}
		},
		[selectedKeyframeId, onKeyframeUpdate]
	);

	// Handle deleting a keyframe
	const handleDeleteKeyframe = useCallback(() => {
		if (selectedKeyframeId) {
			onKeyframeDelete(selectedKeyframeId);
			setSelectedKeyframeId(null);
		}
	}, [selectedKeyframeId, onKeyframeDelete]);

	// Handle clicking on the track to add a keyframe
	const handleTrackClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (disabled) return;

			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const percentage = x / rect.width;
			const frame =
				durationInFrames > 0 ? Math.round(percentage * durationInFrames) : 0;

			// Check if clicking near an existing keyframe
			const nearbyKeyframe = keyframes.find((kf) => {
				const kfPercentage =
					durationInFrames > 0 ? kf.frame / durationInFrames : 0;
				return Math.abs(kfPercentage - percentage) < 0.02; // 2% tolerance
			});

			if (nearbyKeyframe) {
				setSelectedKeyframeId(nearbyKeyframe.id);
			} else {
				const value =
					propType === "color"
						? interpolateColor(keyframes, frame)
						: interpolateNumber(keyframes, frame);
				onKeyframeAdd(frame, value);
			}
		},
		[disabled, durationInFrames, keyframes, propType, onKeyframeAdd]
	);

	// Current playhead position percentage (guard against division by zero)
	const playheadPosition =
		durationInFrames > 0 ? (currentFrame / durationInFrames) * 100 : 0;

	return (
		<div className="space-y-2">
			{/* Header */}
			<button
				type="button"
				className="flex items-center justify-between w-full text-left hover:bg-accent/50 rounded px-1 py-0.5 -mx-1"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					<ChevronDown
						className={cn(
							"w-3 h-3 transition-transform",
							!isExpanded && "-rotate-90"
						)}
					/>
					<Diamond className="w-3 h-3 text-violet-400" />
					<span className="text-xs font-medium">{propLabel}</span>
					<span className="text-[10px] text-muted-foreground">
						({keyframes.length} keyframe{keyframes.length !== 1 ? "s" : ""})
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-muted-foreground">
						{propType === "color" ? (
							<span
								className="inline-block w-3 h-3 rounded-sm border"
								style={{ backgroundColor: currentValue as string }}
							/>
						) : (
							(currentValue as number).toFixed(2)
						)}
					</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-5 w-5"
								onClick={(e) => {
									e.stopPropagation();
									handleAddKeyframe();
								}}
								disabled={disabled}
							>
								<Plus className="w-3 h-3" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add keyframe at current frame</TooltipContent>
					</Tooltip>
				</div>
			</button>

			{/* Timeline Track */}
			{isExpanded && (
				<div className="pl-5 space-y-2">
					{/* Track visualization */}
					<div
						className={cn(
							"relative h-6 bg-muted/30 rounded border",
							!disabled && "cursor-crosshair"
						)}
						onClick={handleTrackClick}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								if (!disabled) {
									const value =
										propType === "color"
											? interpolateColor(keyframes, currentFrame)
											: interpolateNumber(keyframes, currentFrame);
									onKeyframeAdd(currentFrame, value);
								}
							}
						}}
						role="button"
						tabIndex={disabled ? -1 : 0}
						aria-label={`Keyframe track for ${propLabel}. Press Enter or Space to add keyframe at current frame.`}
					>
						{/* Playhead */}
						<div
							className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
							style={{ left: `${playheadPosition}%` }}
						/>

						{/* Keyframe markers */}
						{sortedKeyframes.map((kf) => (
							<KeyframeDiamond
								key={kf.id}
								keyframe={kf}
								position={
									durationInFrames > 0 ? (kf.frame / durationInFrames) * 100 : 0
								}
								isSelected={kf.id === selectedKeyframeId}
								onClick={() => setSelectedKeyframeId(kf.id)}
								onDelete={() => onKeyframeDelete(kf.id)}
								disabled={disabled}
							/>
						))}

						{/* Interpolation preview line */}
						{sortedKeyframes.length >= 2 && propType === "number" && (
							<svg
								className="absolute inset-0 w-full h-full pointer-events-none"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								<polyline
									points={sortedKeyframes
										.map((kf) => {
											const x =
												durationInFrames > 0
													? (kf.frame / durationInFrames) * 100
													: 0;
											// Normalize value for display (0-100%)
											const minVal = Math.min(
												...sortedKeyframes.map((k) => k.value as number)
											);
											const maxVal = Math.max(
												...sortedKeyframes.map((k) => k.value as number)
											);
											const range = maxVal - minVal || 1;
											const y =
												100 -
												(((kf.value as number) - minVal) / range) * 80 -
												10;
											return `${x}%,${y}%`;
										})
										.join(" ")}
									fill="none"
									stroke="rgba(139, 92, 246, 0.5)"
									strokeWidth="1"
								/>
							</svg>
						)}
					</div>

					{/* Selected keyframe editor */}
					{selectedKeyframe && (
						<Popover
							open={true}
							onOpenChange={(open) => !open && setSelectedKeyframeId(null)}
						>
							<PopoverTrigger asChild>
								<div />
							</PopoverTrigger>
							<PopoverContent side="bottom" align="start" className="w-64 p-2">
								<KeyframeEditPanel
									key={selectedKeyframe.id}
									keyframe={selectedKeyframe}
									propType={propType}
									durationInFrames={durationInFrames}
									onUpdate={handleUpdateKeyframe}
									onDelete={handleDeleteKeyframe}
									disabled={disabled}
								/>
							</PopoverContent>
						</Popover>
					)}

					{/* Empty state */}
					{keyframes.length === 0 && (
						<div className="text-center text-[10px] text-muted-foreground py-2">
							Click the track or + button to add keyframes
						</div>
					)}
				</div>
			)}
		</div>
	);
}
