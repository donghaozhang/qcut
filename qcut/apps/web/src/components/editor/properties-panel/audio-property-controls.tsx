import { ChevronLeft, ChevronRight, Diamond, RotateCcw } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
} from "@/types/timeline";
import { AUDIO_KEYFRAME_DEFINITIONS } from "@/lib/audio/audio-properties";
import { getAudioKeyframePropertyValue } from "@/lib/audio/audio-keyframe-properties";

export function activateButtonFromKeyboard({
	event,
}: {
	event: KeyboardEvent<HTMLButtonElement>;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	event.currentTarget.click();
}

function AudioIconButton({
	label,
	onClick,
	disabled,
	active,
	stopPropagation = false,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	stopPropagation?: boolean;
	children: ReactNode;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={active ? "secondary" : "text"}
						size="icon"
						className="size-6 rounded-sm"
						onClick={(event) => {
							if (stopPropagation) event.stopPropagation();
							onClick();
						}}
						onKeyDown={(event) => {
							if (stopPropagation) event.stopPropagation();
						}}
						disabled={disabled}
						aria-label={label}
					>
						{children}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function AudioModuleSection({
	title,
	enabled,
	onEnabledChange,
	onReset,
	children,
	defaultExpanded = false,
	disableChildrenWhenOff = true,
	testId,
}: {
	title: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	onReset: () => void;
	children: ReactNode;
	defaultExpanded?: boolean;
	disableChildrenWhenOff?: boolean;
	testId?: string;
}) {
	return (
		<details
			open={defaultExpanded}
			className="group border-b border-border/70 py-3 last:border-b-0"
			data-testid={testId}
		>
			<summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
				<Switch
					aria-label={`Enable ${title}`}
					checked={enabled}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
					onCheckedChange={onEnabledChange}
				/>
				<span
					className={cn(
						"min-w-0 flex-1 text-xs",
						!enabled && "text-muted-foreground"
					)}
				>
					{title}
				</span>
				<AudioIconButton
					label={`Reset ${title}`}
					onClick={onReset}
					stopPropagation
				>
					<RotateCcw className="size-3" />
				</AudioIconButton>
				<ChevronRight className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
			</summary>
			<div
				className={cn(
					"space-y-3 pt-3",
					!enabled && disableChildrenWhenOff && "pointer-events-none opacity-45"
				)}
			>
				{children}
			</div>
		</details>
	);
}

export function AudioToggleRow({
	label,
	checked,
	onCheckedChange,
}: {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs">{label}</span>
			<Switch
				aria-label={label}
				checked={checked}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

export function AudioNumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	mixed = false,
	keyframedHere,
	hasPreviousKeyframe,
	hasNextKeyframe,
	onChange,
	onToggleKeyframe,
	onPreviousKeyframe,
	onNextKeyframe,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	mixed?: boolean;
	keyframedHere?: boolean;
	hasPreviousKeyframe?: boolean;
	hasNextKeyframe?: boolean;
	onChange: (value: number) => void;
	onToggleKeyframe?: () => void;
	onPreviousKeyframe?: () => void;
	onNextKeyframe?: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const supportsKeyframes = Boolean(onToggleKeyframe);
	return (
		<div
			className="flex min-h-8 items-center gap-1.5"
			data-testid={`audio-control-${label.toLowerCase().replaceAll(" ", "-")}`}
		>
			<span className="w-[4.5rem] shrink-0 truncate text-[11px]">{label}</span>
			<div
				className="min-w-10 flex-1"
				onPointerDown={onInteractionStart}
				onPointerUp={onInteractionEnd}
				onPointerCancel={onInteractionEnd}
			>
				<Slider
					aria-label={label}
					value={[Math.min(max, Math.max(min, value))]}
					min={min}
					max={max}
					step={step}
					onValueChange={([next]) => onChange(next)}
				/>
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
				<Input
					type="number"
					aria-label={`${label} value`}
					value={mixed ? "" : Number(value.toFixed(step < 1 ? 2 : 0))}
					placeholder={mixed ? "Mixed" : undefined}
					min={min}
					max={max}
					step={step}
					onFocus={onInteractionStart}
					onBlur={onInteractionEnd}
					onChange={(event) => {
						const next = Number(event.target.value);
						if (Number.isFinite(next)) onChange(next);
					}}
					className="h-7 w-16 rounded-sm px-1.5 text-right text-[11px]"
				/>
				{suffix ? (
					<span className="w-5 text-[9px] text-muted-foreground">{suffix}</span>
				) : null}
				{supportsKeyframes ? (
					<div className="flex items-center">
						<AudioIconButton
							label={`Previous ${label} keyframe`}
							onClick={onPreviousKeyframe ?? (() => {})}
							disabled={!hasPreviousKeyframe}
						>
							<ChevronLeft className="size-3" />
						</AudioIconButton>
						<AudioIconButton
							label={
								keyframedHere
									? `Remove ${label} keyframe`
									: `Add ${label} keyframe`
							}
							onClick={onToggleKeyframe ?? (() => {})}
							active={keyframedHere}
						>
							<Diamond
								className={cn(
									"size-3",
									keyframedHere && "fill-primary text-primary"
								)}
							/>
						</AudioIconButton>
						<AudioIconButton
							label={`Next ${label} keyframe`}
							onClick={onNextKeyframe ?? (() => {})}
							disabled={!hasNextKeyframe}
						>
							<ChevronRight className="size-3" />
						</AudioIconButton>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function AudioKeyframedControl({
	property,
	settings,
	resolvedSettings,
	currentFrame,
	max,
	onChange,
	onToggleKeyframe,
	onSeekFrame,
	onInteractionStart,
	onInteractionEnd,
}: {
	property: AudioKeyframeProperty;
	settings: MediaAudioSettings;
	resolvedSettings: MediaAudioSettings;
	currentFrame: number;
	max?: number;
	onChange: (property: AudioKeyframeProperty, value: number) => void;
	onToggleKeyframe: (property: AudioKeyframeProperty) => void;
	onSeekFrame: (frame: number) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const definition = AUDIO_KEYFRAME_DEFINITIONS[property];
	const frames = (settings.keyframes?.[property] ?? [])
		.map((keyframe) => keyframe.frame)
		.sort((left, right) => left - right);
	const previousFrame = [...frames]
		.reverse()
		.find((frame) => frame < currentFrame);
	const nextFrame = frames.find((frame) => frame > currentFrame);
	return (
		<AudioNumberControl
			label={definition.label}
			value={getAudioKeyframePropertyValue({
				settings: resolvedSettings,
				property,
			})}
			min={definition.min}
			max={max ?? definition.max}
			step={definition.step}
			suffix={definition.suffix}
			keyframedHere={frames.includes(currentFrame)}
			hasPreviousKeyframe={previousFrame !== undefined}
			hasNextKeyframe={nextFrame !== undefined}
			onChange={(value) => onChange(property, value)}
			onToggleKeyframe={() => onToggleKeyframe(property)}
			onPreviousKeyframe={() => {
				if (previousFrame !== undefined) onSeekFrame(previousFrame);
			}}
			onNextKeyframe={() => {
				if (nextFrame !== undefined) onSeekFrame(nextFrame);
			}}
			onInteractionStart={onInteractionStart}
			onInteractionEnd={onInteractionEnd}
		/>
	);
}
