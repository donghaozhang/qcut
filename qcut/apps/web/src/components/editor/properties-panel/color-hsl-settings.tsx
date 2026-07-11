import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
	ColorHslRangeName,
	ColorKeyframeProperty,
} from "@/types/timeline";
import {
	COLOR_HSL_RANGES,
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

const RANGE_COLORS: Record<ColorHslRangeName, string> = {
	red: "#ef4444",
	orange: "#f97316",
	yellow: "#eab308",
	green: "#22c55e",
	cyan: "#06b6d4",
	blue: "#3b82f6",
	purple: "#8b5cf6",
	magenta: "#d946ef",
};

const HSL_PROPERTIES = COLOR_HSL_RANGES.flatMap((range) =>
	(["hue", "saturation", "luminance"] as const).map(
		(parameter) => `hsl.${range}.${parameter}` as ColorKeyframeProperty
	)
);

export function ColorHslSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const [range, setRange] = useState<ColorHslRangeName>("red");
	const { settings, onSettingsChange } = bindings;
	return (
		<ColorModuleSection
			title="HSL secondary"
			enabled={settings.hsl.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					hsl: { ...settings.hsl, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeColorKeyframes({ settings, properties: HSL_PROPERTIES }),
					hsl: {
						...DEFAULT_MEDIA_COLOR_SETTINGS.hsl,
						ranges: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS.hsl.ranges),
					},
				})
			}
			defaultExpanded
			testId="color-module-hsl"
		>
			<ToggleGroup
				type="single"
				value={range}
				onValueChange={(value) => {
					if (COLOR_HSL_RANGES.includes(value as ColorHslRangeName)) {
						setRange(value as ColorHslRangeName);
					}
				}}
				className="grid grid-cols-8 gap-1"
			>
				{COLOR_HSL_RANGES.map((name) => (
					<ToggleGroupItem
						key={name}
						value={name}
						aria-label={name}
						title={name}
						className="size-7 p-0"
					>
						<span
							className="size-3 rounded-full border border-white/30"
							style={{ backgroundColor: RANGE_COLORS[name] }}
						/>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<ColorKeyframedControl
				property={`hsl.${range}.hue`}
				bindings={bindings}
			/>
			<ColorKeyframedControl
				property={`hsl.${range}.saturation`}
				bindings={bindings}
			/>
			<ColorKeyframedControl
				property={`hsl.${range}.luminance`}
				bindings={bindings}
			/>
		</ColorModuleSection>
	);
}
