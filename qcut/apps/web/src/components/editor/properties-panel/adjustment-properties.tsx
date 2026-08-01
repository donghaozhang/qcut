import { useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	buildLegacyColorAdjustments,
	DEFAULT_MEDIA_COLOR_SETTINGS,
	getColorPropertyValue,
	normalizeMediaColorSettings,
	resolveMediaColorAtTime,
	setColorPropertyValue,
	upsertColorKeyframe,
} from "@/lib/color/color-properties";
import {
	colorCurvePoints,
	setColorCurvePoints,
	upsertCurveShapeKeyframe,
} from "@/lib/color/color-curve-keyframes";
import { buildSecondaryCurve } from "@/lib/color/color-secondary-curves";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import {
	createColorPreset,
	loadColorPresets,
	persistColorPresets,
} from "@/lib/color/color-presets";
import { generateUUID } from "@/types/timeline";
import type {
	AdjustmentElement,
	ColorCurvePoint,
	ColorCurveShapeProperty,
	ColorKeyframeProperty,
	ColorPropertyKeyframe,
	MediaColorSettings,
} from "@/types/timeline";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { ColorSettingsEditorBindings } from "./color-properties-types";
import { ColorBasicSettings } from "./color-basic-settings";
import { ColorCurvesSettings } from "./color-curves-settings";
import { ColorHslSettings } from "./color-hsl-settings";
import { ColorLutSettings } from "./color-lut-settings";
import { ColorManagementSettingsPanel } from "./color-management-settings";
import { ColorMaskSettings } from "./color-mask-settings";
import { ColorSecondaryCurvesSettings } from "./color-secondary-curves-settings";
import { ColorWheelSettingsPanel } from "./color-wheel-settings";
import { MediaMaskProperties } from "./media-mask-properties";

function curveShapeSamples({
	property,
	points,
}: {
	property: ColorCurveShapeProperty;
	points: ColorCurvePoint[];
}): number[] | undefined {
	if (!property.startsWith("secondaryCurves.")) return;
	return buildSecondaryCurve({ points }).samples;
}

export function AdjustmentProperties({
	element,
	trackId,
}: {
	element: AdjustmentElement;
	trackId: string;
}) {
	const updateAdjustmentElement = useTimelineStore(
		(state) => state.updateAdjustmentElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const seek = usePlaybackStore((state) => state.seek);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const interactionActive = useRef(false);
	const [presets, setPresets] = useState(loadColorPresets);
	const [activeColorTab, setActiveColorTab] = useState("basic");

	const settings = normalizeMediaColorSettings({ element });
	const masks = element.masks ?? [];
	const resolvedSettings = resolveMediaColorAtTime({
		element,
		currentTime,
		fps,
	});
	const currentFrame = Math.min(
		Math.max(1, Math.round(element.duration * fps)),
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);

	const persistSettings = ({
		next,
		history = !interactionActive.current,
	}: {
		next: MediaColorSettings;
		history?: boolean;
	}) => {
		updateAdjustmentElement(
			trackId,
			element.id,
			{
				color: next,
				adjustments: buildLegacyColorAdjustments({ settings: next }),
			},
			history
		);
	};

	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const updateProperty = (property: ColorKeyframeProperty, value: number) => {
		const keyframes = settings.keyframes?.[property] ?? [];
		if (keyframes.length === 0) {
			persistSettings({
				next: setColorPropertyValue({ settings, property, value }),
			});
			return;
		}
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		persistSettings({
			next: {
				...settings,
				keyframes: {
					...settings.keyframes,
					[property]: upsertColorKeyframe({
						keyframes,
						keyframe: {
							id: existing?.id ?? `color-keyframe-${generateUUID()}`,
							frame: currentFrame,
							value,
							easing: existing?.easing ?? "linear",
						},
					}),
				},
			},
		});
	};
	const toggleKeyframe = (property: ColorKeyframeProperty) => {
		const keyframes = settings.keyframes?.[property] ?? [];
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const nextKeyframes: ColorPropertyKeyframe[] = existing
			? keyframes.filter((keyframe) => keyframe.id !== existing.id)
			: upsertColorKeyframe({
					keyframes,
					keyframe: {
						id: `color-keyframe-${generateUUID()}`,
						frame: currentFrame,
						value: getColorPropertyValue({
							settings: resolvedSettings,
							property,
						}),
						easing: "linear",
					},
				});
		persistSettings({
			next: {
				...settings,
				keyframes: { ...settings.keyframes, [property]: nextKeyframes },
			},
		});
	};
	const updateCurvePoints = (
		property: ColorCurveShapeProperty,
		points: ColorCurvePoint[]
	) => {
		const keyframes = settings.curveShapeKeyframes?.[property] ?? [];
		if (keyframes.length === 0) {
			persistSettings({
				next: setColorCurvePoints({ settings, property, points }),
			});
			return;
		}
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		persistSettings({
			next: {
				...settings,
				curveShapeKeyframes: {
					...settings.curveShapeKeyframes,
					[property]: upsertCurveShapeKeyframe({
						keyframes,
						keyframe: {
							id: existing?.id ?? `color-curve-keyframe-${generateUUID()}`,
							frame: currentFrame,
							points: points.map((point) => ({ ...point })),
							samples: curveShapeSamples({ property, points }),
							easing: existing?.easing ?? "linear",
						},
					}),
				},
			},
		});
	};
	const toggleCurveKeyframe = (property: ColorCurveShapeProperty) => {
		const keyframes = settings.curveShapeKeyframes?.[property] ?? [];
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const resolvedPoints = colorCurvePoints({
			settings: resolvedSettings,
			property,
		}).map((point) => ({ ...point }));
		const nextKeyframes = existing
			? keyframes.filter((keyframe) => keyframe.id !== existing.id)
			: upsertCurveShapeKeyframe({
					keyframes,
					keyframe: {
						id: `color-curve-keyframe-${generateUUID()}`,
						frame: currentFrame,
						points: resolvedPoints,
						samples: curveShapeSamples({
							property,
							points: resolvedPoints,
						}),
						easing: "linear",
					},
				});
		persistSettings({
			next: {
				...settings,
				curveShapeKeyframes: {
					...settings.curveShapeKeyframes,
					[property]: nextKeyframes,
				},
			},
		});
	};
	const saveColorPreset = (name?: string) => {
		const preset = createColorPreset({ settings, name });
		const next = [preset, ...presets];
		try {
			persistColorPresets({ presets: next });
			setPresets(next);
			toast.success("调色预设已保存");
		} catch {
			toast.error("无法保存调色预设");
		}
	};

	const bindings: ColorSettingsEditorBindings = {
		settings,
		resolvedSettings,
		currentFrame,
		onSettingsChange: (next) => persistSettings({ next }),
		onPropertyChange: updateProperty,
		onToggleKeyframe: toggleKeyframe,
		onCurvePointsChange: updateCurvePoints,
		onToggleCurveKeyframe: toggleCurveKeyframe,
		onSeekFrame: (frame) => seek(element.startTime + frame / fps),
		onApplyAll: () => toast.info("调节层已作用于下方轨道"),
		onSavePreset: saveColorPreset,
		onInteractionStart: beginInteraction,
		onInteractionEnd: endInteraction,
	};
	const createGradeMask = () => {
		const id = `color-grade-mask-${generateUUID()}`;
		const mask = createMediaMask({
			id,
			index: masks.length,
			name: `调色蒙版 ${masks.length + 1}`,
			type: "ellipse",
		});
		const nextSettings = {
			...settings,
			mask: {
				...settings.mask,
				enabled: true,
				maskIds: [...new Set([...settings.mask.maskIds, id])],
			},
		};
		updateAdjustmentElement(
			trackId,
			element.id,
			{
				color: nextSettings,
				adjustments: buildLegacyColorAdjustments({ settings: nextSettings }),
				masks: [...masks, mask],
			},
			true
		);
	};

	return (
		<div data-testid="adjustment-properties">
			<Tabs value={activeColorTab} onValueChange={setActiveColorTab}>
				<TabsList className="grid h-8 w-full grid-cols-5 gap-0.5 rounded-sm p-0.5">
					<TabsTrigger value="basic" className="px-1 text-xs">
						基础
					</TabsTrigger>
					<TabsTrigger value="hsl" className="px-1 text-xs">
						HSL
					</TabsTrigger>
					<TabsTrigger value="curves" className="px-1 text-xs">
						曲线
					</TabsTrigger>
					<TabsTrigger value="wheels" className="px-1 text-xs">
						色轮
					</TabsTrigger>
					<TabsTrigger value="mask" className="px-1 text-xs">
						蒙版
					</TabsTrigger>
				</TabsList>

				<div className="my-3 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
					<span className="text-xs font-medium">调节</span>
					<Switch
						aria-label="启用调节"
						checked={settings.enabled}
						onCheckedChange={(enabled) =>
							persistSettings({ next: { ...settings, enabled } })
						}
					/>
				</div>
				<div
					className={
						settings.enabled ? undefined : "pointer-events-none opacity-45"
					}
				>
					<TabsContent value="basic" className="mt-2">
						<ColorLutSettings bindings={bindings} />
						<ColorBasicSettings bindings={bindings} />
						<ColorManagementSettingsPanel bindings={bindings} />
					</TabsContent>
					<TabsContent value="hsl" className="mt-2">
						<ColorHslSettings bindings={bindings} />
					</TabsContent>
					<TabsContent value="curves" className="mt-2">
						<ColorCurvesSettings bindings={bindings} />
						<ColorSecondaryCurvesSettings bindings={bindings} />
					</TabsContent>
					<TabsContent value="wheels" className="mt-2">
						<ColorWheelSettingsPanel bindings={bindings} />
					</TabsContent>
					<TabsContent value="mask" className="mt-2">
						<MediaMaskProperties
							elementId={element.id}
							masks={masks}
							currentFrame={currentFrame}
							onChange={(nextMasks, history = true) =>
								updateAdjustmentElement(
									trackId,
									element.id,
									{ masks: nextMasks },
									history
								)
							}
							onInteractionStart={beginInteraction}
							onInteractionEnd={endInteraction}
						/>
						<ColorMaskSettings
							bindings={bindings}
							masks={masks}
							onCreateMask={createGradeMask}
						/>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}

export function defaultAdjustmentColorUpdates() {
	const color = normalizeMediaColorSettings({
		element: { color: DEFAULT_MEDIA_COLOR_SETTINGS, adjustments: undefined },
	});
	return {
		color,
		adjustments: buildLegacyColorAdjustments({ settings: color }),
	};
}
