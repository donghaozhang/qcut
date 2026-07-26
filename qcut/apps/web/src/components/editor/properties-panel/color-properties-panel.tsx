import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useColorPreviewStore } from "@/stores/editor/color-preview-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	ColorCurvePoint,
	ColorCurveShapeProperty,
	ColorKeyframeProperty,
	ColorPropertyKeyframe,
	MediaColorSettings,
	MediaElement,
	MediaMask,
	MediaMaskTrackingDirection,
} from "@/types/timeline";
import { generateUUID } from "@/types/timeline";
import {
	DEFAULT_MEDIA_MASK,
	resolveMediaMasks,
} from "@/lib/video/video-properties";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	buildLegacyColorAdjustments,
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
import {
	createColorPreset,
	loadColorPresets,
	persistColorPresets,
} from "@/lib/color/color-presets";
import {
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import { ColorBasicSettings } from "./color-basic-settings";
import { ColorCurvesSettings } from "./color-curves-settings";
import { ColorSecondaryCurvesSettings } from "./color-secondary-curves-settings";
import { ColorHslSettings } from "./color-hsl-settings";
import { ColorLutSettings } from "./color-lut-settings";
import { ColorManagementSettingsPanel } from "./color-management-settings";
import { ColorMaskSettings } from "./color-mask-settings";
import { ColorPresetControls } from "./color-preset-controls";
import { ColorScopesPanel } from "./color-scopes-panel";
import { ColorSmartSettingsPanel } from "./color-smart-settings";
import { ColorWheelSettingsPanel } from "./color-wheel-settings";
import { MediaMaskProperties } from "./media-mask-properties";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

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

export function ColorPropertiesPanel({
	element,
	trackId,
	onTrack,
}: {
	element: MediaElement;
	trackId: string;
	onTrack?: (options: {
		mask: MediaMask;
		direction: MediaMaskTrackingDirection;
	}) => void;
}) {
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const tracks = useTimelineStore((state) => state.tracks);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const seek = usePlaybackStore((state) => state.seek);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const interactionActive = useRef(false);
	const [presets, setPresets] = useState(loadColorPresets);
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	const [activeColorTab, setActiveColorTab] = useState("basic");
	const previewBypassed = useColorPreviewStore((state) => state.bypassed);
	const setPreviewBypassed = useColorPreviewStore((state) => state.setBypassed);
	useEffect(
		() => () => {
			useColorPreviewStore.getState().setBypassed(false);
		},
		[]
	);
	const settings = normalizeMediaColorSettings({ element });
	const masks = resolveMediaMasks(element);
	const resolvedSettings = resolveMediaColorAtTime({
		element,
		currentTime,
		fps,
	});
	const duration = getMediaTimelineDuration(element, fps);
	const sourceTime =
		(element.trimStart ?? 0) +
		mapMediaTimelineTime({
			element,
			localTimelineTime: currentTime - element.startTime,
			fps,
		}).sourceTime;
	const currentFrame = Math.min(
		Math.max(1, Math.round(duration * fps)),
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);

	const persistSettings = ({
		next,
		history = !interactionActive.current,
	}: {
		next: MediaColorSettings;
		history?: boolean;
	}) => {
		const updates: MediaUpdates = {
			color: next,
			adjustments: buildLegacyColorAdjustments({ settings: next }),
		};
		updateMediaElement(trackId, element.id, updates, history);
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
	const applySettingsToAllMedia = () => {
		const color = structuredClone(settings);
		const adjustments = buildLegacyColorAdjustments({ settings: color });
		let applied = 0;
		pushHistory();
		for (const track of tracks) {
			for (const candidate of track.elements) {
				if (candidate.type !== "media" || candidate.id === element.id) continue;
				updateMediaElement(
					track.id,
					candidate.id,
					{ color: structuredClone(color), adjustments },
					false
				);
				applied += 1;
			}
		}
		toast.success(`已将调色应用到 ${applied} 个片段`);
	};
	const saveColorPreset = (name?: string) => {
		const preset = createColorPreset({ settings, name });
		const next = [preset, ...presets];
		try {
			persistColorPresets({ presets: next });
			setPresets(next);
			setSelectedPresetId(preset.id);
			toast.success("调色预设已保存");
		} catch {
			toast.error("无法保存调色预设");
		}
	};
	const applySelectedPreset = () => {
		const preset = presets.find(
			(candidate) => candidate.id === selectedPresetId
		);
		if (!preset) return;
		const normalized = normalizeMediaColorSettings({
			element: { color: preset.color, adjustments: undefined },
		});
		persistSettings({
			next: {
				...normalized,
				mask: structuredClone(settings.mask),
				keyframes: structuredClone(settings.keyframes ?? {}),
				curveShapeKeyframes: structuredClone(
					settings.curveShapeKeyframes ?? {}
				),
			},
		});
		toast.success(`已应用 ${preset.name}`);
	};
	const deleteSelectedPreset = () => {
		if (!selectedPresetId) return;
		const next = presets.filter((preset) => preset.id !== selectedPresetId);
		try {
			persistColorPresets({ presets: next });
			setPresets(next);
			setSelectedPresetId(undefined);
			toast.success("调色预设已删除");
		} catch {
			toast.error("无法删除调色预设");
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
		onApplyAll: applySettingsToAllMedia,
		onSavePreset: saveColorPreset,
		onInteractionStart: beginInteraction,
		onInteractionEnd: endInteraction,
	};
	const createGradeMask = () => {
		const id = `color-grade-mask-${generateUUID()}`;
		const mask = {
			...structuredClone(DEFAULT_MEDIA_MASK),
			id,
			name: `调色蒙版 ${masks.length + 1}`,
			type: "ellipse" as const,
			width: 0.65,
			height: 0.65,
			feather: 0.12,
		};
		const next = {
			...settings,
			mask: {
				...settings.mask,
				enabled: true,
				maskIds: [...settings.mask.maskIds, id],
			},
		};
		updateMediaElement(
			trackId,
			element.id,
			{
				color: next,
				adjustments: buildLegacyColorAdjustments({ settings: next }),
				masks: [...masks, mask],
				mask: masks[0] ?? mask,
			},
			true
		);
	};
	const updateMasks = (nextMasks: MediaMask[], history = true) => {
		updateMediaElement(
			trackId,
			element.id,
			{ masks: nextMasks, mask: nextMasks[0] },
			history
		);
	};

	return (
		<div data-testid="color-properties-panel">
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

				{activeColorTab === "mask" ? null : (
					<>
						<div className="my-3 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
							<span className="text-xs font-medium">调色管线</span>
							<Switch
								aria-label="启用调色管线"
								checked={settings.enabled}
								onCheckedChange={(enabled) =>
									persistSettings({ next: { ...settings, enabled } })
								}
							/>
						</div>
						<ColorPresetControls
							presets={presets}
							selectedPresetId={selectedPresetId}
							bypassed={previewBypassed}
							onSelectedPresetChange={setSelectedPresetId}
							onApplyPreset={applySelectedPreset}
							onDeletePreset={deleteSelectedPreset}
							onSavePreset={saveColorPreset}
							onBypassedChange={setPreviewBypassed}
						/>
					</>
				)}

				<div
					className={
						settings.enabled || activeColorTab === "mask"
							? undefined
							: "pointer-events-none opacity-45"
					}
				>
					<TabsContent value="basic" className="mt-2">
						<ColorSmartSettingsPanel
							bindings={bindings}
							mediaItem={mediaItem}
							sourceTime={sourceTime}
						/>
						<ColorLutSettings bindings={bindings} />
						<ColorBasicSettings bindings={bindings} />
						<ColorManagementSettingsPanel bindings={bindings} />
						<details className="mt-4 border-t border-border/70 pt-3">
							<summary className="cursor-pointer select-none text-xs text-muted-foreground">
								示波器
							</summary>
							<div className="mt-3">
								<ColorScopesPanel
									mediaItem={mediaItem}
									sourceTime={sourceTime}
									settings={resolvedSettings}
									frameSeed={currentFrame}
								/>
							</div>
						</details>
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
					<TabsContent value="mask" className="mt-3">
						<MediaMaskProperties
							elementId={element.id}
							masks={masks}
							currentFrame={currentFrame}
							onChange={updateMasks}
							onInteractionStart={beginInteraction}
							onInteractionEnd={endInteraction}
							onTrack={onTrack}
						/>
						<details className="mt-4 border-t border-border/70 pt-3">
							<summary className="cursor-pointer select-none text-xs text-muted-foreground">
								调色作用范围
							</summary>
							<div className="mt-3">
								<ColorMaskSettings
									bindings={bindings}
									masks={masks}
									onCreateMask={createGradeMask}
								/>
							</div>
						</details>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}

export function defaultColorUpdates(): MediaUpdates {
	const color = normalizeMediaColorSettings({
		element: { color: DEFAULT_MEDIA_COLOR_SETTINGS, adjustments: undefined },
	});
	return {
		color,
		adjustments: buildLegacyColorAdjustments({ settings: color }),
	};
}
