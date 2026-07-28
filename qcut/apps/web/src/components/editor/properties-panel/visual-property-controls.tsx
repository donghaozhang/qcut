import type { ReactNode } from "react";
import { Diamond } from "lucide-react";
import type { MediaPerspective } from "@/types/timeline";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { MaskIconButton } from "./media-mask-controls";

interface NumberControlProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	onChange: (value: number) => void;
	keyframed?: boolean;
	onToggleKeyframe?: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
	allowInputOverflow?: boolean;
}

export function NumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	onChange,
	keyframed = false,
	onToggleKeyframe,
	onInteractionStart,
	onInteractionEnd,
	allowInputOverflow = false,
}: NumberControlProps) {
	const { t } = useTranslation();
	const keyframeLabel = onToggleKeyframe
		? t(
				keyframed
					? "mediaProperties.removeKeyframe"
					: "mediaProperties.addKeyframe",
				{ label }
			)
		: "";
	return (
		<PropertyItem direction="column">
			<div className="flex items-center justify-between gap-3">
				<PropertyItemLabel>{label}</PropertyItemLabel>
				<div className="flex items-center gap-1">
					{onToggleKeyframe ? (
						<MaskIconButton
							label={keyframeLabel}
							onClick={onToggleKeyframe}
							active={keyframed}
						>
							<Diamond
								className={`size-3 ${
									keyframed ? "fill-primary text-primary" : ""
								}`}
							>
								<title>{keyframeLabel}</title>
							</Diamond>
						</MaskIconButton>
					) : null}
					<Input
						type="number"
						aria-label={t("mediaProperties.value", { label })}
						value={Number(value.toFixed(step < 1 ? 2 : 0))}
						min={allowInputOverflow ? undefined : min}
						max={allowInputOverflow ? undefined : max}
						step={step}
						onFocus={onInteractionStart}
						onBlur={onInteractionEnd}
						onChange={(event) => {
							const next = Number(event.target.value);
							if (Number.isFinite(next)) onChange(next);
						}}
						className="h-8 w-24 text-right text-xs"
					/>
					{suffix ? (
						<span className="w-4 text-[10px] text-muted-foreground">
							{suffix}
						</span>
					) : null}
				</div>
			</div>
			<PropertyItemValue>
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
			</PropertyItemValue>
		</PropertyItem>
	);
}

export function IconButton({
	label,
	children,
	onClick,
	active = false,
}: {
	label: string;
	children: ReactNode;
	onClick: () => void;
	active?: boolean;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={active ? "default" : "outline"}
						size="icon"
						className="size-8"
						onClick={onClick}
						onKeyDown={(event) => event.stopPropagation()}
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

export const PERSPECTIVE_FIELDS: Array<{
	x: keyof MediaPerspective;
	y: keyof MediaPerspective;
	labelKey: TranslationKey;
}> = [
	{
		x: "topLeftX",
		y: "topLeftY",
		labelKey: "mediaProperties.corner.topLeft",
	},
	{
		x: "topRightX",
		y: "topRightY",
		labelKey: "mediaProperties.corner.topRight",
	},
	{
		x: "bottomLeftX",
		y: "bottomLeftY",
		labelKey: "mediaProperties.corner.bottomLeft",
	},
	{
		x: "bottomRightX",
		y: "bottomRightY",
		labelKey: "mediaProperties.corner.bottomRight",
	},
];

export const CLIP_ANIMATION_OPTIONS = [
	["none", "mediaProperties.animation.none"],
	["fade", "mediaProperties.animation.fade"],
	["slide-left", "mediaProperties.animation.slideLeft"],
	["slide-right", "mediaProperties.animation.slideRight"],
	["slide-up", "mediaProperties.animation.slideUp"],
	["slide-down", "mediaProperties.animation.slideDown"],
	["zoom-in", "mediaProperties.animation.zoomIn"],
	["zoom-out", "mediaProperties.animation.zoomOut"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;
