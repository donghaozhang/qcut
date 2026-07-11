import { Pipette, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
	ColorCurvePoint,
	ColorCurveShapeProperty,
	ColorSecondaryCurveName,
} from "@/types/timeline";
import {
	COLOR_SECONDARY_CURVE_NAMES,
	createDefaultSecondaryCurve,
} from "@/lib/color/color-secondary-curves";
import {
	removeCurveShapeKeyframes,
	setColorCurvePoints,
} from "@/lib/color/color-curve-keyframes";
import { removeColorKeyframes } from "@/lib/color/color-properties";
import { rgbToHsl } from "@/lib/color/color-space-math";
import { requestPreviewColor } from "@/stores/editor/color-picker-store";
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

type CurveInput = "hue" | "luminance" | "saturation";

interface SecondaryCurveDefinition {
	name: ColorSecondaryCurveName;
	label: string;
	input: CurveInput;
	background: ColorCurveBackground;
}

const CURVE_DEFINITIONS: SecondaryCurveDefinition[] = [
	{
		name: "hueVsSaturation",
		label: "Hue vs Saturation",
		input: "hue",
		background: "hue-saturation",
	},
	{
		name: "hueVsHue",
		label: "Hue vs Hue",
		input: "hue",
		background: "hue-hue",
	},
	{
		name: "hueVsLuminance",
		label: "Hue vs Luminance",
		input: "hue",
		background: "hue-luminance",
	},
	{
		name: "luminanceVsSaturation",
		label: "Luminance vs Saturation",
		input: "luminance",
		background: "luminance-saturation",
	},
	{
		name: "saturationVsSaturation",
		label: "Saturation vs Saturation",
		input: "saturation",
		background: "saturation-saturation",
	},
];

const HUE_ANCHORS = [
	{ label: "Red", value: 0, color: "#ef4444" },
	{ label: "Yellow", value: 60 / 360, color: "#facc15" },
	{ label: "Green", value: 120 / 360, color: "#22c55e" },
	{ label: "Cyan", value: 180 / 360, color: "#22d3ee" },
	{ label: "Blue", value: 240 / 360, color: "#3b82f6" },
	{ label: "Purple", value: 285 / 360, color: "#8b5cf6" },
];

const ANCHOR_GUARD_DISTANCE = 18 / 360;
const EXISTING_POINT_DISTANCE = 0.012;

function circularPosition(value: number): number {
	return ((value % 1) + 1) % 1;
}

function addPointUnlessPresent({
	points,
	x,
	id,
}: {
	points: ColorCurvePoint[];
	x: number;
	id: string;
}): ColorCurvePoint[] {
	if (points.some((point) => Math.abs(point.x - x) < EXISTING_POINT_DISTANCE)) {
		return points;
	}
	return [...points, { id, x, y: 0.5 }].sort((left, right) => left.x - right.x);
}

function addProtectedAnchor({
	points,
	position,
	periodic,
}: {
	points: ColorCurvePoint[];
	position: number;
	periodic: boolean;
}): { points: ColorCurvePoint[]; selectedPointId: string } {
	const nearHueBoundary = periodic && (position < 0.015 || position > 0.985);
	const center = nearHueBoundary ? 0 : Math.min(0.99, Math.max(0.01, position));
	const existingCenter = points.find(
		(point) => Math.abs(point.x - center) < EXISTING_POINT_DISTANCE
	);
	const selectedPointId = existingCenter?.id ?? `curve-${crypto.randomUUID()}`;
	let next = points;
	for (const guard of [
		position - ANCHOR_GUARD_DISTANCE,
		position + ANCHOR_GUARD_DISTANCE,
	]) {
		const guardPosition = periodic
			? circularPosition(guard)
			: Math.min(0.99, Math.max(0.01, guard));
		next = addPointUnlessPresent({
			points: next,
			x: guardPosition,
			id: `curve-guard-${crypto.randomUUID()}`,
		});
	}
	if (!nearHueBoundary) {
		next = addPointUnlessPresent({
			points: next,
			x: center,
			id: selectedPointId,
		});
	}
	return {
		points: next,
		selectedPointId: nearHueBoundary
			? (points[0]?.id ?? "start")
			: selectedPointId,
	};
}

function sampledInput({
	input,
	color,
}: {
	input: CurveInput;
	color: { r: number; g: number; b: number };
}): number {
	const hsl = rgbToHsl(color);
	if (input === "hue") return hsl.h;
	if (input === "luminance") return hsl.l;
	return hsl.s;
}

export function ColorSecondaryCurvesSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	const [selectedPoints, setSelectedPoints] = useState<
		Partial<Record<ColorSecondaryCurveName, string>>
	>({});
	const setCurvePoints = ({
		name,
		points,
	}: {
		name: ColorSecondaryCurveName;
		points: ColorCurvePoint[];
	}) =>
		bindings.onCurvePointsChange(
			`secondaryCurves.${name}` as ColorCurveShapeProperty,
			points
		);
	const addAnchor = ({
		definition,
		position,
	}: {
		definition: SecondaryCurveDefinition;
		position: number;
	}) => {
		const shapeProperty =
			`secondaryCurves.${definition.name}` as ColorCurveShapeProperty;
		const hasShapeKeyframes =
			(settings.curveShapeKeyframes?.[shapeProperty]?.length ?? 0) > 0;
		const result = addProtectedAnchor({
			points: hasShapeKeyframes
				? bindings.resolvedSettings.secondaryCurves[definition.name].points
				: settings.secondaryCurves[definition.name].points,
			position,
			periodic: definition.input === "hue",
		});
		bindings.onInteractionStart();
		setCurvePoints({ name: definition.name, points: result.points });
		bindings.onInteractionEnd();
		setSelectedPoints((current) => ({
			...current,
			[definition.name]: result.selectedPointId,
		}));
	};
	const pickColor = async ({
		definition,
	}: {
		definition: SecondaryCurveDefinition;
	}) => {
		toast.message("Click a color in the preview");
		const color = await requestPreviewColor();
		if (!color) return;
		addAnchor({
			definition,
			position: sampledInput({ input: definition.input, color }),
		});
	};
	return (
		<ColorModuleSection
			title="Secondary curves"
			enabled={settings.secondaryCurves.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					secondaryCurves: { ...settings.secondaryCurves, enabled },
				})
			}
			onReset={() => {
				setSelectedPoints({});
				onSettingsChange({
					...removeCurveShapeKeyframes({
						settings: removeColorKeyframes({
							settings,
							properties: ["secondaryCurves.mix"],
						}),
						properties: COLOR_SECONDARY_CURVE_NAMES.map(
							(name) => `secondaryCurves.${name}` as ColorCurveShapeProperty
						),
					}),
					secondaryCurves: {
						enabled: false,
						mix: 100,
						hueVsSaturation: createDefaultSecondaryCurve(),
						hueVsHue: createDefaultSecondaryCurve(),
						hueVsLuminance: createDefaultSecondaryCurve(),
						luminanceVsSaturation: createDefaultSecondaryCurve(),
						saturationVsSaturation: createDefaultSecondaryCurve(),
					},
				});
			}}
			defaultExpanded
			testId="color-module-secondary-curves"
		>
			{CURVE_DEFINITIONS.map((definition) => {
				const shapeProperty =
					`secondaryCurves.${definition.name}` as ColorCurveShapeProperty;
				const hasShapeKeyframes =
					(settings.curveShapeKeyframes?.[shapeProperty]?.length ?? 0) > 0;
				const curve = hasShapeKeyframes
					? bindings.resolvedSettings.secondaryCurves[definition.name]
					: settings.secondaryCurves[definition.name];
				return (
					<section
						key={definition.name}
						className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0"
					>
						<div className="flex min-h-7 items-center gap-1">
							<span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
								{definition.label}
							</span>
							{definition.input === "hue"
								? HUE_ANCHORS.map((anchor) => (
										<Button
											type="button"
											key={anchor.label}
											variant="text"
											size="icon"
											className="size-5"
											aria-label={`${definition.label} ${anchor.label} anchor`}
											title={`${anchor.label} anchor`}
											onClick={() =>
												addAnchor({ definition, position: anchor.value })
											}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.currentTarget.click();
												}
											}}
										>
											<span
												className="size-2.5 rounded-full border border-white/20"
												style={{ backgroundColor: anchor.color }}
											/>
										</Button>
									))
								: null}
							<Button
								type="button"
								variant="text"
								size="icon"
								className="size-6"
								aria-label={`Pick ${definition.label} color`}
								title={`Pick ${definition.label} color`}
								onClick={() => void pickColor({ definition })}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.currentTarget.click();
									}
								}}
							>
								<Pipette className="size-3.5" />
							</Button>
							<Button
								type="button"
								variant="text"
								size="icon"
								className="size-6"
								aria-label={`Reset ${definition.label}`}
								title={`Reset ${definition.label}`}
								onClick={() => {
									bindings.onInteractionStart();
									const withoutKeyframes = removeCurveShapeKeyframes({
										settings,
										properties: [shapeProperty],
									});
									onSettingsChange(
										setColorCurvePoints({
											settings: withoutKeyframes,
											property: shapeProperty,
											points: createDefaultSecondaryCurve().points,
										})
									);
									bindings.onInteractionEnd();
									setSelectedPoints((current) => ({
										...current,
										[definition.name]: undefined,
									}));
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.currentTarget.click();
									}
								}}
							>
								<RotateCcw className="size-3.5" />
							</Button>
						</div>
						<ColorCurveEditor
							label={definition.label}
							points={curve.points}
							selectedPointId={selectedPoints[definition.name]}
							stroke="#f4f4f5"
							background={definition.background}
							wide
							centeredOutput
							linkEndpoints={definition.input === "hue"}
							onPointsChange={(points) =>
								setCurvePoints({ name: definition.name, points })
							}
							onSelectedPointChange={(id) =>
								setSelectedPoints((current) => ({
									...current,
									[definition.name]: id,
								}))
							}
							onInteractionStart={bindings.onInteractionStart}
							onInteractionEnd={bindings.onInteractionEnd}
						/>
						<ColorCurveKeyframeControls
							property={shapeProperty}
							bindings={bindings}
						/>
					</section>
				);
			})}
			<ColorKeyframedControl
				property="secondaryCurves.mix"
				bindings={bindings}
			/>
		</ColorModuleSection>
	);
}
