import { ChevronLeft, ChevronRight, Diamond, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
	ColorCurveShapeProperty,
	ColorKeyframeProperty,
} from "@/types/timeline";
import {
	COLOR_KEYFRAME_DEFINITIONS,
	getColorPropertyValue,
} from "@/lib/color/color-properties";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

export function ColorIconButton({
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

export function ColorCurveKeyframeControls({
	property,
	bindings,
}: {
	property: ColorCurveShapeProperty;
	bindings: ColorSettingsEditorBindings;
}) {
	const frames = (bindings.settings.curveShapeKeyframes?.[property] ?? [])
		.map((keyframe) => keyframe.frame)
		.sort((left, right) => left - right);
	const previousFrame = [...frames]
		.reverse()
		.find((frame) => frame < bindings.currentFrame);
	const nextFrame = frames.find((frame) => frame > bindings.currentFrame);
	const keyframedHere = frames.includes(bindings.currentFrame);
	return (
		<div
			className="flex items-center justify-end"
			data-testid={`curve-keyframes-${property}`}
		>
			<span className="mr-1 text-[10px] text-muted-foreground">形状</span>
			<ColorIconButton
				label="上一个曲线形状关键帧"
				onClick={() => {
					if (previousFrame !== undefined) bindings.onSeekFrame(previousFrame);
				}}
				disabled={previousFrame === undefined}
			>
				<ChevronLeft className="size-3" />
			</ColorIconButton>
			<ColorIconButton
				label={keyframedHere ? "删除曲线形状关键帧" : "添加曲线形状关键帧"}
				onClick={() => bindings.onToggleCurveKeyframe(property)}
				active={keyframedHere}
			>
				<Diamond
					className={cn("size-3", keyframedHere && "fill-primary text-primary")}
				/>
			</ColorIconButton>
			<ColorIconButton
				label="下一个曲线形状关键帧"
				onClick={() => {
					if (nextFrame !== undefined) bindings.onSeekFrame(nextFrame);
				}}
				disabled={nextFrame === undefined}
			>
				<ChevronRight className="size-3" />
			</ColorIconButton>
		</div>
	);
}

export function ColorModuleSection({
	title,
	enabled,
	onEnabledChange,
	onReset,
	children,
	defaultExpanded = false,
	testId,
}: {
	title: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	onReset: () => void;
	children: ReactNode;
	defaultExpanded?: boolean;
	testId?: string;
}) {
	return (
		<details
			open={defaultExpanded}
			className="group border-b border-border/70 py-3 last:border-b-0"
			data-testid={testId}
		>
			<summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
				<Checkbox
					aria-label={`启用${title}`}
					checked={enabled}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
					onCheckedChange={(checked) => onEnabledChange(checked === true)}
					className="size-3.5 border-none bg-muted-foreground/50 data-[state=checked]:bg-primary [&_svg]:size-3"
				/>
				<span
					className={cn(
						"min-w-0 flex-1 text-xs",
						!enabled && "text-muted-foreground"
					)}
				>
					{title}
				</span>
				<ColorIconButton
					label={`重置${title}`}
					onClick={onReset}
					stopPropagation
				>
					<RotateCcw className="size-3" />
				</ColorIconButton>
				<ChevronRight className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
			</summary>
			<div
				className={cn(
					"space-y-3 pt-3",
					!enabled && "pointer-events-none opacity-45"
				)}
			>
				{children}
			</div>
		</details>
	);
}

export function ColorToggleRow({
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

export function ColorNumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
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
			className="py-0.5"
			data-testid={`color-control-${label.toLowerCase().replaceAll(" ", "-")}`}
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="w-14 shrink-0 truncate text-xs" title={label}>
					{label}
				</span>
				<div
					className="min-w-0 flex-1"
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
				<div className="flex w-[70px] shrink-0 items-center gap-1">
					<Input
						type="number"
						aria-label={`${label}数值`}
						value={Number(value.toFixed(step < 1 ? 2 : 0))}
						min={min}
						max={max}
						step={step}
						onFocus={onInteractionStart}
						onBlur={onInteractionEnd}
						onChange={(event) => {
							const next = Number(event.target.value);
							if (Number.isFinite(next)) onChange(next);
						}}
						className="h-7 w-14 rounded-sm px-2 text-right text-xs"
					/>
					{suffix ? (
						<span className="w-3 text-[10px] text-muted-foreground">
							{suffix}
						</span>
					) : (
						<span className="w-3" />
					)}
				</div>
				{supportsKeyframes ? (
					<div className="flex items-center">
						<ColorIconButton
							label={`上一个${label}关键帧`}
							onClick={onPreviousKeyframe ?? (() => {})}
							disabled={!hasPreviousKeyframe}
						>
							<ChevronLeft className="size-3" />
						</ColorIconButton>
						<ColorIconButton
							label={
								keyframedHere ? `删除${label}关键帧` : `添加${label}关键帧`
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
						</ColorIconButton>
						<ColorIconButton
							label={`下一个${label}关键帧`}
							onClick={onNextKeyframe ?? (() => {})}
							disabled={!hasNextKeyframe}
						>
							<ChevronRight className="size-3" />
						</ColorIconButton>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function ColorKeyframedControl({
	property,
	bindings,
	label,
}: {
	property: ColorKeyframeProperty;
	bindings: ColorSettingsEditorBindings;
	label?: string;
}) {
	const definition = COLOR_KEYFRAME_DEFINITIONS[property];
	if (!definition) return null;
	const frames = (bindings.settings.keyframes?.[property] ?? [])
		.map((keyframe) => keyframe.frame)
		.sort((left, right) => left - right);
	const previousFrame = [...frames]
		.reverse()
		.find((frame) => frame < bindings.currentFrame);
	const nextFrame = frames.find((frame) => frame > bindings.currentFrame);
	return (
		<ColorNumberControl
			label={label ?? definition.label}
			value={getColorPropertyValue({
				settings: bindings.resolvedSettings,
				property,
			})}
			min={definition.min}
			max={definition.max}
			step={definition.step}
			suffix={definition.suffix}
			keyframedHere={frames.includes(bindings.currentFrame)}
			hasPreviousKeyframe={previousFrame !== undefined}
			hasNextKeyframe={nextFrame !== undefined}
			onChange={(value) => bindings.onPropertyChange(property, value)}
			onToggleKeyframe={() => bindings.onToggleKeyframe(property)}
			onPreviousKeyframe={() => {
				if (previousFrame !== undefined) bindings.onSeekFrame(previousFrame);
			}}
			onNextKeyframe={() => {
				if (nextFrame !== undefined) bindings.onSeekFrame(nextFrame);
			}}
			onInteractionStart={bindings.onInteractionStart}
			onInteractionEnd={bindings.onInteractionEnd}
		/>
	);
}
