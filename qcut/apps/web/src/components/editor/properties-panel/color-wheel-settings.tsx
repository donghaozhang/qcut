import type { PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import type {
	ColorKeyframeProperty,
	ColorWheelSettings,
} from "@/types/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { wheelRgbOffset } from "@/lib/color/color-space-math";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import { ColorModuleSection } from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type WheelName = "shadows" | "midtones" | "highlights" | "offset";
type WheelChannel = "r" | "g" | "b";

const WHEEL_NAMES = ["shadows", "midtones", "highlights", "offset"] as const;
const WHEEL_CHANNELS = [
	{ key: "r", color: "bg-red-500", label: "红" },
	{ key: "g", color: "bg-green-500", label: "绿" },
	{ key: "b", color: "bg-blue-500", label: "蓝" },
] as const;

function clampWheelValue({ value }: { value: number }) {
	return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
}

function updateWheelChannel({
	value,
	channel,
	channelValue,
}: {
	value: ColorWheelSettings;
	channel: WheelChannel;
	channelValue: number;
}): ColorWheelSettings {
	const next = clampWheelValue({ value: channelValue });
	if (channel === "r") {
		return {
			...value,
			x: clampWheelValue({ value: (next + value.y * 0.25) / 0.8 }),
		};
	}
	if (channel === "g") {
		return {
			...value,
			x: clampWheelValue({ value: -(next + value.y * 0.25) / 0.45 }),
		};
	}
	return {
		...value,
		y: clampWheelValue({ value: (next + value.x * 0.15) / 0.8 }),
	};
}

function wheelChannelValue({
	value,
	channel,
}: {
	value: ColorWheelSettings;
	channel: WheelChannel;
}) {
	return wheelRgbOffset({ wheel: value })[channel];
}

const WHEEL_MODE_LABELS = {
	tonal: "一级色轮",
	"lift-gamma-gain": "log色轮",
} as const;

function wheelDisplayLabels({
	mode,
}: {
	mode: "tonal" | "lift-gamma-gain";
}): Record<WheelName, string> {
	if (mode === "lift-gamma-gain") {
		return {
			shadows: "暗部",
			midtones: "中灰",
			highlights: "亮部",
			offset: "偏移",
		};
	}
	return {
		shadows: "暗部",
		midtones: "中灰",
		highlights: "亮部",
		offset: "偏移",
	};
}

function ColorWheelPad({
	label,
	value,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: ColorWheelSettings;
	onChange: (value: ColorWheelSettings) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		const x = Math.min(
			1,
			Math.max(-1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)
		);
		const y = Math.min(
			1,
			Math.max(-1, (0.5 - (event.clientY - bounds.top) / bounds.height) * 2)
		);
		onChange({ ...value, x, y });
	};
	return (
		<div
			className="relative mx-auto aspect-square w-full max-w-20 touch-none rounded-full shadow-inner"
			style={{
				background:
					"radial-gradient(circle at center, rgba(21,21,24,0.98) 0 42%, rgba(21,21,24,0.82) 49%, transparent 54%), conic-gradient(#ef4444, #f97316, #facc15, #22c55e, #14b8a6, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
			}}
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuetext={`X ${value.x.toFixed(2)}, Y ${value.y.toFixed(2)}`}
			onPointerDown={(event) => {
				onInteractionStart();
				event.currentTarget.setPointerCapture(event.pointerId);
				updateFromPointer(event);
			}}
			onPointerMove={(event) => {
				if (event.currentTarget.hasPointerCapture(event.pointerId))
					updateFromPointer(event);
			}}
			onPointerUp={(event) => {
				event.currentTarget.releasePointerCapture(event.pointerId);
				onInteractionEnd();
			}}
			onPointerCancel={onInteractionEnd}
			onKeyDown={(event) => {
				if (
					!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(
						event.key
					)
				)
					return;
				event.preventDefault();
				if (event.key === "Home") {
					onChange({ ...value, x: 0, y: 0 });
					return;
				}
				onChange({
					...value,
					x: Math.min(
						1,
						Math.max(
							-1,
							value.x +
								(event.key === "ArrowRight"
									? 0.02
									: event.key === "ArrowLeft"
										? -0.02
										: 0)
						)
					),
					y: Math.min(
						1,
						Math.max(
							-1,
							value.y +
								(event.key === "ArrowUp"
									? 0.02
									: event.key === "ArrowDown"
										? -0.02
										: 0)
						)
					),
				});
			}}
		>
			<span className="pointer-events-none absolute -left-2 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-y-transparent border-r-[6px] border-r-white" />
			<span className="pointer-events-none absolute -right-2 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-y-transparent border-l-[6px] border-l-white" />
			<span className="pointer-events-none absolute -right-1 top-[7%] h-[42%] w-2 rounded-full border-r-[5px] border-slate-300/80" />
			<span
				className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow"
				style={{ left: `${50 + value.x * 45}%`, top: `${50 - value.y * 45}%` }}
			/>
		</div>
	);
}

const WHEEL_PROPERTIES = WHEEL_NAMES.flatMap((wheel) =>
	(["x", "y", "luminance"] as const).map(
		(parameter) => `wheels.${wheel}.${parameter}` as ColorKeyframeProperty
	)
);

export function ColorWheelSettingsPanel({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	const wheelLabels = wheelDisplayLabels({ mode: settings.wheels.mode });
	const updateWheel = (wheel: WheelName, value: ColorWheelSettings) =>
		onSettingsChange({
			...settings,
			wheels: { ...settings.wheels, [wheel]: value },
		});
	const resetWheel = (wheel: WheelName) =>
		updateWheel(wheel, { ...DEFAULT_MEDIA_COLOR_SETTINGS.wheels[wheel] });
	return (
		<ColorModuleSection
			title="色轮"
			enabled={settings.wheels.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					wheels: { ...settings.wheels, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeColorKeyframes({
						settings,
						properties: [
							...WHEEL_PROPERTIES,
							"wheels.strength",
							"wheels.balance",
						],
					}),
					wheels: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS.wheels),
				})
			}
			defaultExpanded
			testId="color-module-wheels"
		>
			<div>
				<Select
					value={settings.wheels.mode}
					onValueChange={(mode) => {
						if (mode !== "tonal" && mode !== "lift-gamma-gain") return;
						onSettingsChange({
							...settings,
							wheels: { ...settings.wheels, mode },
						});
					}}
				>
					<SelectTrigger
						aria-label="色轮模式"
						className="h-8 w-full justify-start rounded-md bg-foreground/10 px-3 text-xs"
					>
						<SelectValue>{WHEEL_MODE_LABELS[settings.wheels.mode]}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="tonal">一级色轮</SelectItem>
						<SelectItem value="lift-gamma-gain">log色轮</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="pb-1">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(70px,1fr))] gap-2">
					{WHEEL_NAMES.map((wheel) => (
						<div key={wheel} className="space-y-2">
							<div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
								<span>{wheelLabels[wheel]}</span>
								<Button
									type="button"
									variant="text"
									size="icon"
									className="size-5"
									aria-label={`重置${wheelLabels[wheel]}色轮`}
									title={`重置${wheelLabels[wheel]}色轮`}
									onClick={() => resetWheel(wheel)}
								>
									<RotateCcw className="size-3" />
								</Button>
							</div>
							<ColorWheelPad
								label={`${wheelLabels[wheel]}色轮`}
								value={settings.wheels[wheel]}
								onChange={(value) => updateWheel(wheel, value)}
								onInteractionStart={bindings.onInteractionStart}
								onInteractionEnd={bindings.onInteractionEnd}
							/>
							<div className="grid grid-cols-3 gap-1.5">
								{WHEEL_CHANNELS.map((channel) => (
									<label key={channel.key} className="space-y-1">
										<span
											className={`mx-auto block h-1 w-6 rounded-sm ${channel.color}`}
										/>
										<Input
											type="number"
											aria-label={`${wheelLabels[wheel]} ${channel.label}`}
											value={Number(
												wheelChannelValue({
													value: settings.wheels[wheel],
													channel: channel.key,
												}).toFixed(2)
											)}
											min={-1}
											max={1}
											step={0.01}
											onFocus={bindings.onInteractionStart}
											onBlur={bindings.onInteractionEnd}
											onChange={(event) => {
												const next = Number(event.target.value);
												if (!Number.isFinite(next)) return;
												updateWheel(
													wheel,
													updateWheelChannel({
														value: settings.wheels[wheel],
														channel: channel.key,
														channelValue: next,
													})
												);
											}}
											className="h-5 rounded-sm border-black bg-black px-1 text-center text-[10px] text-white"
										/>
									</label>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="flex justify-end border-t border-border/70 pt-3">
				<Button type="button" size="sm" onClick={() => bindings.onSavePreset()}>
					保存预设
				</Button>
			</div>
		</ColorModuleSection>
	);
}
