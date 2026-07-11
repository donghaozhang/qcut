import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
	ColorCurvePoint,
	ColorCurveShapeProperty,
	ColorKeyframeProperty,
} from "@/types/timeline";
import { removeCurveShapeKeyframes } from "@/lib/color/color-curve-keyframes";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	ColorCurveEditor,
	type ColorCurveBackground,
} from "./color-curve-editor";
import {
	ColorCurveKeyframeControls,
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type CurveChannel = "master" | "red" | "green" | "blue";

const CURVE_COLORS: Record<CurveChannel, string> = {
	master: "#f4f4f5",
	red: "#ef4444",
	green: "#22c55e",
	blue: "#3b82f6",
};

export function ColorCurvesSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const [channel, setChannel] = useState<CurveChannel>("master");
	const [selectedPoint, setSelectedPoint] = useState<string>();
	const { settings, onSettingsChange } = bindings;
	const shapeProperty = `curves.${channel}` as ColorCurveShapeProperty;
	const hasShapeKeyframes =
		(settings.curveShapeKeyframes?.[shapeProperty]?.length ?? 0) > 0;
	const points = hasShapeKeyframes
		? bindings.resolvedSettings.curves[channel]
		: settings.curves[channel];
	const setPoints = (points: ColorCurvePoint[]) =>
		bindings.onCurvePointsChange(shapeProperty, points);
	return (
		<ColorModuleSection
			title="RGB curves"
			enabled={settings.curves.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					curves: { ...settings.curves, enabled },
				})
			}
			onReset={() => {
				setSelectedPoint(undefined);
				onSettingsChange({
					...removeCurveShapeKeyframes({
						settings: removeColorKeyframes({
							settings,
							properties: ["curves.mix" as ColorKeyframeProperty],
						}),
						properties: [
							"curves.master",
							"curves.red",
							"curves.green",
							"curves.blue",
						],
					}),
					curves: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS.curves),
				});
			}}
			defaultExpanded
			testId="color-module-curves"
		>
			<ToggleGroup
				type="single"
				value={channel}
				onValueChange={(value) => {
					if (!["master", "red", "green", "blue"].includes(value)) return;
					setChannel(value as CurveChannel);
					setSelectedPoint(undefined);
				}}
				className="grid grid-cols-4"
			>
				{(["master", "red", "green", "blue"] as const).map((name) => (
					<ToggleGroupItem key={name} value={name} aria-label={`${name} curve`}>
						<span
							className="size-2 rounded-full"
							style={{ backgroundColor: CURVE_COLORS[name] }}
						/>
						{name === "master" ? "Y" : name[0].toUpperCase()}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<ColorCurveEditor
				label={channel}
				points={points}
				selectedPointId={selectedPoint}
				stroke={CURVE_COLORS[channel]}
				background={channel as ColorCurveBackground}
				onPointsChange={setPoints}
				onSelectedPointChange={setSelectedPoint}
				onInteractionStart={bindings.onInteractionStart}
				onInteractionEnd={bindings.onInteractionEnd}
			/>
			<ColorCurveKeyframeControls
				property={shapeProperty}
				bindings={bindings}
			/>
			<ColorKeyframedControl property="curves.mix" bindings={bindings} />
		</ColorModuleSection>
	);
}
