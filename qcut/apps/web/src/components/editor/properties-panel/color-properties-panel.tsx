import { useRef } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	ColorKeyframeProperty,
	ColorPropertyKeyframe,
	MediaColorSettings,
	MediaElement,
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
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import { ColorBasicSettings } from "./color-basic-settings";
import { ColorCurvesSettings } from "./color-curves-settings";
import { ColorHslSettings } from "./color-hsl-settings";
import { ColorLutSettings } from "./color-lut-settings";
import { ColorManagementSettingsPanel } from "./color-management-settings";
import { ColorMaskSettings } from "./color-mask-settings";
import { ColorScopesPanel } from "./color-scopes-panel";
import { ColorSmartSettingsPanel } from "./color-smart-settings";
import { ColorWheelSettingsPanel } from "./color-wheel-settings";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

export function ColorPropertiesPanel({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
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
		toast.success(
			`Applied color grade to ${applied} clip${applied === 1 ? "" : "s"}`
		);
	};
	const saveColorPreset = () => {
		const key = "qcut-color-presets";
		const preset = {
			id: `color-preset-${generateUUID()}`,
			name: `Color preset ${new Date().toLocaleString()}`,
			createdAt: new Date().toISOString(),
			color: structuredClone(settings),
		};
		try {
			const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
			const presets = Array.isArray(stored) ? stored : [];
			localStorage.setItem(key, JSON.stringify([preset, ...presets]));
			toast.success("Saved color preset");
		} catch {
			localStorage.setItem(key, JSON.stringify([preset]));
			toast.success("Saved color preset");
		}
	};
	const bindings: ColorSettingsEditorBindings = {
		settings,
		resolvedSettings,
		currentFrame,
		onSettingsChange: (next) => persistSettings({ next }),
		onPropertyChange: updateProperty,
		onToggleKeyframe: toggleKeyframe,
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
			name: `Grade mask ${masks.length + 1}`,
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

	return (
		<div data-testid="color-properties-panel">
			<div className="mb-3 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
				<span className="text-xs font-medium">Color pipeline</span>
				<Switch
					aria-label="Enable color pipeline"
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
				<Tabs defaultValue="basic">
					<TabsList className="grid h-auto w-full grid-cols-6 gap-1">
						<TabsTrigger value="basic">Basic</TabsTrigger>
						<TabsTrigger value="hsl">HSL</TabsTrigger>
						<TabsTrigger value="curves">Curves</TabsTrigger>
						<TabsTrigger value="wheels">Wheels</TabsTrigger>
						<TabsTrigger value="mask">Mask</TabsTrigger>
						<TabsTrigger value="scopes">Scopes</TabsTrigger>
					</TabsList>
					<TabsContent value="basic" className="mt-2">
						<ColorSmartSettingsPanel
							bindings={bindings}
							mediaItem={mediaItem}
							sourceTime={sourceTime}
						/>
						<ColorLutSettings bindings={bindings} />
						<ColorBasicSettings bindings={bindings} />
						<ColorManagementSettingsPanel bindings={bindings} />
					</TabsContent>
					<TabsContent value="hsl" className="mt-2">
						<ColorHslSettings bindings={bindings} />
					</TabsContent>
					<TabsContent value="curves" className="mt-2">
						<ColorCurvesSettings bindings={bindings} />
					</TabsContent>
					<TabsContent value="wheels" className="mt-2">
						<ColorWheelSettingsPanel bindings={bindings} />
					</TabsContent>
					<TabsContent value="mask" className="mt-2">
						<ColorMaskSettings
							bindings={bindings}
							masks={masks}
							onCreateMask={createGradeMask}
						/>
					</TabsContent>
					<TabsContent value="scopes" className="mt-3">
						<ColorScopesPanel
							mediaItem={mediaItem}
							sourceTime={sourceTime}
							settings={resolvedSettings}
							frameSeed={currentFrame}
						/>
					</TabsContent>
				</Tabs>
			</div>
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
