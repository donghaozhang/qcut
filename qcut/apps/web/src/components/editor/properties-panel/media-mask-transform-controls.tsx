import { useEffect, useState } from "react";
import { Diamond, Link2, RotateCw, Unlink2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { MediaMask, MediaMaskKeyframeProperty } from "@/types/timeline";
import { MaskIconButton } from "./media-mask-controls";
import { PropertyItemLabel } from "./property-item";

function formatNumericDraft({
	value,
	precision,
}: {
	value: number;
	precision: number;
}): string {
	return String(Number(value.toFixed(precision)));
}

function KeyframeButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<MaskIconButton
			label={active ? `移除${label}关键帧` : `添加${label}关键帧`}
			active={active}
			onClick={onClick}
		>
			<Diamond
				className={cn("size-3", active && "fill-cyan-400 text-cyan-400")}
			/>
		</MaskIconButton>
	);
}

function CompactNumericInput({
	label,
	prefix,
	suffix,
	value,
	min,
	max,
	step,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	prefix?: string;
	suffix?: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (options: { value: number }) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const precision = step < 1 ? 2 : 0;
	const [draft, setDraft] = useState(() =>
		formatNumericDraft({ value, precision })
	);

	useEffect(() => {
		setDraft(formatNumericDraft({ value, precision }));
	}, [precision, value]);

	return (
		<div className="relative h-7 w-[76px] shrink-0">
			{prefix ? (
				<span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-[10px] text-muted-foreground">
					{prefix}
				</span>
			) : null}
			<Input
				type="number"
				aria-label={`${label}数值`}
				value={draft}
				min={min}
				max={max}
				step={step}
				onFocus={onInteractionStart}
				onBlur={() => {
					const next = Number(draft);
					if (!Number.isFinite(next) || draft === "") {
						setDraft(formatNumericDraft({ value, precision }));
					}
					onInteractionEnd();
				}}
				onChange={(event) => {
					const raw = event.target.value;
					setDraft(raw);
					if (raw === "" || raw === "-") return;
					const next = Number(raw);
					if (!Number.isFinite(next)) return;
					onChange({ value: Math.min(max, Math.max(min, next)) });
				}}
				className={cn(
					"h-7 w-full bg-muted/45 text-right text-xs tabular-nums shadow-none",
					prefix ? "pl-6" : "pl-2",
					suffix ? "pr-6" : "pr-2"
				)}
			/>
			{suffix ? (
				<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
					{suffix}
				</span>
			) : null}
		</div>
	);
}

function CompactSliderRow({
	label,
	property,
	value,
	min,
	max,
	step,
	suffix,
	keyframed,
	onChange,
	onToggleKeyframes,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	property: MediaMaskKeyframeProperty;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix?: string;
	keyframed: boolean;
	onChange: (options: { value: number }) => void;
	onToggleKeyframes: (options: {
		properties: MediaMaskKeyframeProperty[];
	}) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	return (
		<div className="flex h-9 items-center gap-2">
			<PropertyItemLabel className="w-12 shrink-0">{label}</PropertyItemLabel>
			<div
				className="min-w-16 flex-1"
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
					onValueChange={([next]) => onChange({ value: next })}
				/>
			</div>
			<CompactNumericInput
				label={label}
				suffix={suffix}
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={onChange}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<KeyframeButton
				label={label}
				active={keyframed}
				onClick={() => onToggleKeyframes({ properties: [property] })}
			/>
		</div>
	);
}

export function MediaMaskTransformControls({
	mask,
	isKeyframed,
	onNumericChange,
	onSizeChange,
	onToggleKeyframes,
	onAspectRatioChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	mask: MediaMask;
	isKeyframed: (options: { property: MediaMaskKeyframeProperty }) => boolean;
	onNumericChange: (options: {
		updates: Partial<Record<MediaMaskKeyframeProperty, number>>;
	}) => void;
	onSizeChange: (options: {
		property: "width" | "height";
		value: number;
	}) => void;
	onToggleKeyframes: (options: {
		properties: MediaMaskKeyframeProperty[];
	}) => void;
	onAspectRatioChange: (options: { maintainAspectRatio: boolean }) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const positionProperties: MediaMaskKeyframeProperty[] = [
		"centerX",
		"centerY",
	];
	const sizeProperties: MediaMaskKeyframeProperty[] =
		mask.type === "mirror" ? ["width"] : ["width", "height"];
	const hasSize = mask.type !== "linear";
	const hasHeight = mask.type !== "linear" && mask.type !== "mirror";

	return (
		<div className="space-y-1" data-testid="media-mask-transform-controls">
			<div className="flex h-9 items-center gap-2">
				<PropertyItemLabel className="w-12 shrink-0">位置</PropertyItemLabel>
				<div className="flex min-w-0 flex-1 gap-2">
					<CompactNumericInput
						label="X 位置"
						prefix="X"
						value={(mask.centerX - 0.5) * 100}
						min={-150}
						max={150}
						step={0.1}
						onChange={({ value }) =>
							onNumericChange({ updates: { centerX: value / 100 + 0.5 } })
						}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					<CompactNumericInput
						label="Y 位置"
						prefix="Y"
						value={(mask.centerY - 0.5) * 100}
						min={-150}
						max={150}
						step={0.1}
						onChange={({ value }) =>
							onNumericChange({ updates: { centerY: value / 100 + 0.5 } })
						}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
				</div>
				<KeyframeButton
					label="位置"
					active={positionProperties.some((property) =>
						isKeyframed({ property })
					)}
					onClick={() => onToggleKeyframes({ properties: positionProperties })}
				/>
			</div>

			<div className="flex h-9 items-center gap-2">
				<PropertyItemLabel className="w-12 shrink-0">旋转</PropertyItemLabel>
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<CompactNumericInput
						label="旋转"
						suffix="°"
						value={mask.rotation}
						min={-180}
						max={180}
						step={0.1}
						onChange={({ value }) =>
							onNumericChange({ updates: { rotation: value } })
						}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					<div className="flex size-7 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground">
						<RotateCw className="size-3.5" />
					</div>
				</div>
				<KeyframeButton
					label="旋转"
					active={isKeyframed({ property: "rotation" })}
					onClick={() => onToggleKeyframes({ properties: ["rotation"] })}
				/>
			</div>

			{hasSize ? (
				<div className="flex h-9 items-center gap-2">
					<PropertyItemLabel className="w-12 shrink-0">大小</PropertyItemLabel>
					<div className="flex min-w-0 flex-1 gap-2">
						<CompactNumericInput
							label="宽度"
							prefix="W"
							value={mask.width * 100}
							min={0.1}
							max={300}
							step={0.1}
							onChange={({ value }) =>
								onSizeChange({ property: "width", value: value / 100 })
							}
							onInteractionStart={onInteractionStart}
							onInteractionEnd={onInteractionEnd}
						/>
						{hasHeight ? (
							<CompactNumericInput
								label="高度"
								prefix="H"
								value={mask.height * 100}
								min={0.1}
								max={300}
								step={0.1}
								onChange={({ value }) =>
									onSizeChange({ property: "height", value: value / 100 })
								}
								onInteractionStart={onInteractionStart}
								onInteractionEnd={onInteractionEnd}
							/>
						) : null}
						<MaskIconButton
							label={mask.maintainAspectRatio ? "取消锁定比例" : "锁定比例"}
							active={mask.maintainAspectRatio}
							onClick={() =>
								onAspectRatioChange({
									maintainAspectRatio: !mask.maintainAspectRatio,
								})
							}
						>
							{mask.maintainAspectRatio ? (
								<Link2 className="size-3.5" />
							) : (
								<Unlink2 className="size-3.5" />
							)}
						</MaskIconButton>
					</div>
					<KeyframeButton
						label="大小"
						active={sizeProperties.some((property) =>
							isKeyframed({ property })
						)}
						onClick={() => onToggleKeyframes({ properties: sizeProperties })}
					/>
				</div>
			) : null}

			<CompactSliderRow
				label="羽化"
				property="feather"
				value={mask.feather * 100}
				min={0}
				max={100}
				step={0.1}
				keyframed={isKeyframed({ property: "feather" })}
				onChange={({ value }) =>
					onNumericChange({ updates: { feather: value / 100 } })
				}
				onToggleKeyframes={onToggleKeyframes}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>

			{mask.type === "rectangle" || mask.type === "text" ? (
				<CompactSliderRow
					label="圆角"
					property="roundness"
					value={(mask.roundness ?? 0) * 100}
					min={0}
					max={100}
					step={1}
					keyframed={isKeyframed({ property: "roundness" })}
					onChange={({ value }) =>
						onNumericChange({ updates: { roundness: value / 100 } })
					}
					onToggleKeyframes={onToggleKeyframes}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
			) : null}
		</div>
	);
}
