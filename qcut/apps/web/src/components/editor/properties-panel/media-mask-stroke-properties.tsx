import type { MediaMaskStroke, MediaMaskStrokeStyle } from "@/types/timeline";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PropertyItemLabel } from "./property-item";

const STROKE_PRESETS: Array<{
	style: MediaMaskStrokeStyle;
	label: string;
	defaults: Partial<MediaMaskStroke>;
}> = [
	{ style: "none", label: "无", defaults: { width: 0 } },
	{ style: "solid", label: "单层", defaults: { width: 4 } },
	{ style: "glow", label: "发光", defaults: { width: 4, glow: 12 } },
	{
		style: "offset",
		label: "偏移",
		defaults: { width: 5, offsetX: 8, offsetY: 8 },
	},
	{ style: "triple", label: "三层", defaults: { width: 3 } },
	{ style: "sketch", label: "手绘", defaults: { width: 3 } },
	{ style: "dashed", label: "虚线", defaults: { width: 4 } },
];

const DEFAULT_STROKE: MediaMaskStroke = {
	style: "none",
	color: "#ffffff",
	width: 0,
	opacity: 1,
	glow: 0,
	offsetX: 0,
	offsetY: 0,
};

function StrokeNumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<PropertyItemLabel className="min-w-0 flex-1">
					{label}
				</PropertyItemLabel>
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

export function MediaMaskStrokeProperties({
	stroke: inputStroke,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	stroke?: MediaMaskStroke;
	onChange: (stroke: MediaMaskStroke, history?: boolean) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const stroke = { ...DEFAULT_STROKE, ...inputStroke };
	const patchStroke = (updates: Partial<MediaMaskStroke>, history = true) =>
		onChange({ ...stroke, ...updates }, history);

	return (
		<div
			className="space-y-3 border-t border-border pt-4"
			data-testid="media-mask-stroke-properties"
		>
			<PropertyItemLabel>蒙版描边</PropertyItemLabel>
			<div className="grid grid-cols-4 gap-1.5">
				{STROKE_PRESETS.map((preset) => {
					const selected = stroke.style === preset.style;
					return (
						<button
							type="button"
							key={preset.style}
							className={cn(
								"flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-sm border text-[10px] transition-colors",
								selected
									? "border-primary bg-primary/10 text-primary"
									: "border-border hover:bg-accent"
							)}
							onClick={() =>
								patchStroke({ style: preset.style, ...preset.defaults })
							}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								patchStroke({ style: preset.style, ...preset.defaults });
							}}
							aria-label={`${preset.label}描边`}
							aria-pressed={selected}
						>
							<span
								aria-hidden="true"
								className={cn(
									"block h-2 w-7 border-t-2 border-current",
									preset.style === "dashed" && "border-dashed",
									preset.style === "glow" &&
										"drop-shadow-[0_0_3px_currentColor]",
									preset.style === "offset" && "translate-x-1",
									preset.style === "none" && "border-muted-foreground/30"
								)}
							/>
							<span className="truncate">{preset.label}</span>
						</button>
					);
				})}
			</div>

			{stroke.style !== "none" ? (
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-2">
						<PropertyItemLabel>颜色</PropertyItemLabel>
						<div className="flex items-center gap-2">
							<Input
								type="color"
								aria-label="描边颜色"
								value={stroke.color}
								onChange={(event) =>
									patchStroke({ color: event.target.value }, false)
								}
								className="size-7 cursor-pointer border-0 p-0"
							/>
							<Input
								aria-label="描边颜色值"
								value={stroke.color}
								onChange={(event) =>
									patchStroke({ color: event.target.value }, false)
								}
								className="h-7 w-24 font-mono text-xs"
							/>
						</div>
					</div>
					<StrokeNumberControl
						label="粗细"
						value={stroke.width}
						min={1}
						max={32}
						onChange={(width) => patchStroke({ width }, false)}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					<StrokeNumberControl
						label="不透明度"
						value={stroke.opacity * 100}
						min={0}
						max={100}
						onChange={(opacity) =>
							patchStroke({ opacity: opacity / 100 }, false)
						}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					{stroke.style === "glow" ? (
						<StrokeNumberControl
							label="发光范围"
							value={stroke.glow}
							min={0}
							max={64}
							onChange={(glow) => patchStroke({ glow }, false)}
							onInteractionStart={onInteractionStart}
							onInteractionEnd={onInteractionEnd}
						/>
					) : null}
					{stroke.style === "offset" ? (
						<>
							<StrokeNumberControl
								label="水平偏移"
								value={stroke.offsetX}
								min={-64}
								max={64}
								onChange={(offsetX) => patchStroke({ offsetX }, false)}
								onInteractionStart={onInteractionStart}
								onInteractionEnd={onInteractionEnd}
							/>
							<StrokeNumberControl
								label="垂直偏移"
								value={stroke.offsetY}
								min={-64}
								max={64}
								onChange={(offsetY) => patchStroke({ offsetY }, false)}
								onInteractionStart={onInteractionStart}
								onInteractionEnd={onInteractionEnd}
							/>
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}
