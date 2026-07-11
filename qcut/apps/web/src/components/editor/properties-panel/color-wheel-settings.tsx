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
import {
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type WheelName = "shadows" | "midtones" | "highlights" | "offset";
type WheelChannel = "r" | "g" | "b";

const WHEEL_NAMES = ["shadows", "midtones", "highlights", "offset"] as const;
const WHEEL_CHANNELS = [
	{ key: "r", color: "bg-red-500", label: "Red" },
	{ key: "g", color: "bg-green-500", label: "Green" },
	{ key: "b", color: "bg-blue-500", label: "Blue" },
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
			className="relative mx-auto aspect-square w-full max-w-44 touch-none rounded-full border border-border shadow-inner"
			style={{
				background:
					"radial-gradient(circle, rgba(255,255,255,0.95) 0%, transparent 68%), conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #d946ef, #ef4444)",
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
			<span
				className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow"
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
	const wheelLabels =
		settings.wheels.mode === "lift-gamma-gain"
			? {
					shadows: "Lift",
					midtones: "Gamma",
					highlights: "Gain",
					offset: "Offset",
				}
			: {
					shadows: "Shadows",
					midtones: "Midtones",
					highlights: "Highlights",
					offset: "Offset",
				};
	const updateWheel = (wheel: WheelName, value: ColorWheelSettings) =>
		onSettingsChange({
			...settings,
			wheels: { ...settings.wheels, [wheel]: value },
		});
	const resetWheel = (wheel: WheelName) =>
		updateWheel(wheel, { ...DEFAULT_MEDIA_COLOR_SETTINGS.wheels[wheel] });
	return (
		<ColorModuleSection
			title="Color wheels"
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
			<div className="space-y-2">
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
					<SelectTrigger aria-label="Color wheel mode" className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="tonal">Primary wheels</SelectItem>
						<SelectItem value="lift-gamma-gain">Lift / Gamma / Gain</SelectItem>
					</SelectContent>
				</Select>
				<ColorKeyframedControl property="wheels.strength" bindings={bindings} />
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-3">
				{WHEEL_NAMES.map((wheel) => (
					<div
						key={wheel}
						className="space-y-2 border-b border-border/60 pb-3 last:border-b-0"
					>
						<div className="flex items-center justify-center gap-1">
							<p className="text-center text-xs">{wheelLabels[wheel]}</p>
							<Button
								type="button"
								variant="text"
								size="icon"
								className="size-6"
								aria-label={`Reset ${wheelLabels[wheel]} wheel`}
								title={`Reset ${wheelLabels[wheel]} wheel`}
								onClick={() => resetWheel(wheel)}
							>
								<RotateCcw className="size-3" />
							</Button>
						</div>
						<ColorWheelPad
							label={`${wheelLabels[wheel].toLowerCase()} color wheel`}
							value={settings.wheels[wheel]}
							onChange={(value) => updateWheel(wheel, value)}
							onInteractionStart={bindings.onInteractionStart}
							onInteractionEnd={bindings.onInteractionEnd}
						/>
						<div className="grid grid-cols-3 gap-1">
							{WHEEL_CHANNELS.map((channel) => (
								<label key={channel.key} className="space-y-1">
									<span className={`block h-1 rounded-sm ${channel.color}`} />
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
										className="h-6 px-1 text-center text-[10px]"
									/>
								</label>
							))}
						</div>
						<ColorKeyframedControl
							property={`wheels.${wheel}.x`}
							bindings={bindings}
							label={`${wheelLabels[wheel]} X`}
						/>
						<ColorKeyframedControl
							property={`wheels.${wheel}.y`}
							bindings={bindings}
							label={`${wheelLabels[wheel]} Y`}
						/>
						<ColorKeyframedControl
							property={`wheels.${wheel}.luminance`}
							bindings={bindings}
							label={`${wheelLabels[wheel]} luminance`}
						/>
					</div>
				))}
			</div>
			{settings.wheels.mode === "tonal" ? (
				<ColorKeyframedControl property="wheels.balance" bindings={bindings} />
			) : null}
			<div className="flex justify-end gap-2 border-t border-border/70 pt-3">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={bindings.onApplyAll}
				>
					Apply all
				</Button>
				<Button type="button" size="sm" onClick={bindings.onSavePreset}>
					Save preset
				</Button>
			</div>
		</ColorModuleSection>
	);
}
