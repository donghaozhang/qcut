import { Diamond } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PropertyItemLabel } from "./property-item";

export function MaskIconButton({
	label,
	onClick,
	disabled,
	active,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
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
						className="size-7 rounded-sm"
						onClick={onClick}
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

export function MaskNumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	keyframed,
	onChange,
	onToggleKeyframe,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	keyframed: boolean;
	onChange: (value: number) => void;
	onToggleKeyframe: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<PropertyItemLabel className="min-w-0 flex-1">
					{label}
				</PropertyItemLabel>
				<MaskIconButton
					label={keyframed ? `移除${label}关键帧` : `添加${label}关键帧`}
					onClick={onToggleKeyframe}
					active={keyframed}
				>
					<Diamond
						className={cn("size-3", keyframed && "fill-primary text-primary")}
					/>
				</MaskIconButton>
				<div className="flex items-center gap-1">
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
						className="h-7 w-20 text-right text-xs"
					/>
					{suffix ? (
						<span className="w-4 text-[10px] text-muted-foreground">
							{suffix}
						</span>
					) : null}
				</div>
			</div>
			<div
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
		</div>
	);
}
