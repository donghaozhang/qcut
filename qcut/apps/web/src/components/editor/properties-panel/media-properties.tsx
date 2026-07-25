import { useEffect, useRef, useState } from "react";
import {
	AlignHorizontalJustifyCenter,
	AlignHorizontalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyEnd,
	AlignVerticalJustifyStart,
	Diamond,
	FlipHorizontal2,
	FlipVertical2,
	Link2,
	RotateCcw,
	Unlink2,
} from "lucide-react";
import type {
	MediaElement,
	MediaKeyframeProperty,
	MediaMask,
	MediaMaskTrackingDirection,
	MediaPerspective,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { createObjectURL } from "@/lib/media/blob-manager";
import { requestSelectedVideoUpscale } from "@/lib/ai-video/selected-upscale-source";
import { useTranslation } from "@/lib/i18n";
import { useMediaKeyframeShortcuts } from "@/hooks/keyboard/use-media-keyframe-shortcuts";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EasingType, Keyframe } from "@/lib/remotion/keyframe-converter";
import {
	DEFAULT_MEDIA_CHROMA_KEY,
	DEFAULT_MEDIA_CROP,
	DEFAULT_MEDIA_ENHANCEMENTS,
	DEFAULT_MEDIA_MASK,
	DEFAULT_MEDIA_PERSPECTIVE,
	MEDIA_KEYFRAME_PROPERTIES,
	getMediaKeyframeValue,
	getMediaPropertyValue,
	resolveMediaVisualProperties,
	upsertMediaKeyframe,
} from "@/lib/video/video-properties";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { DEFAULT_MEDIA_CUSTOM_CUTOUT } from "@/lib/video/media-custom-cutout";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { KeyframeEditor } from "./keyframe-editor";
import { MediaMaskProperties } from "./media-mask-properties";
import { MaskIconButton } from "./media-mask-controls";
import { MediaAutomaticCutoutProperties } from "./media-automatic-cutout-properties";
import { MediaChromaKeyProperties } from "./media-chroma-key-properties";
import { MediaCustomCutoutProperties } from "./media-custom-cutout-properties";
import {
	AudioPropertiesPanel,
	defaultAudioUpdates,
} from "./audio-properties-panel";
import { MediaSpeedProperties } from "./media-speed-properties";
import {
	ColorPropertiesPanel,
	defaultColorUpdates,
} from "./color-properties-panel";
import { MediaTrackingProperties } from "./media-tracking-properties";
import { MediaAIProperties } from "./media-ai-properties";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

interface NumberControlProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	onChange: (value: number) => void;
	keyframed?: boolean;
	onToggleKeyframe?: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}

function NumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	onChange,
	keyframed = false,
	onToggleKeyframe,
	onInteractionStart,
	onInteractionEnd,
}: NumberControlProps) {
	const { t } = useTranslation();
	return (
		<PropertyItem direction="column">
			<div className="flex items-center justify-between gap-3">
				<PropertyItemLabel>{label}</PropertyItemLabel>
				<div className="flex items-center gap-1">
					{onToggleKeyframe ? (
						<MaskIconButton
							label={t(
								keyframed
									? "mediaProperties.removeKeyframe"
									: "mediaProperties.addKeyframe",
								{ label }
							)}
							onClick={onToggleKeyframe}
							active={keyframed}
						>
							<Diamond
								className={`size-3 ${
									keyframed ? "fill-primary text-primary" : ""
								}`}
							/>
						</MaskIconButton>
					) : null}
					<Input
						type="number"
						aria-label={t("mediaProperties.value", { label })}
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
						className="h-8 w-24 text-right text-xs"
					/>
					{suffix ? (
						<span className="w-4 text-[10px] text-muted-foreground">
							{suffix}
						</span>
					) : null}
				</div>
			</div>
			<PropertyItemValue>
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
			</PropertyItemValue>
		</PropertyItem>
	);
}

function IconButton({
	label,
	children,
	onClick,
	active = false,
}: {
	label: string;
	children: React.ReactNode;
	onClick: () => void;
	active?: boolean;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={active ? "default" : "outline"}
						size="icon"
						className="size-8"
						onClick={onClick}
						aria-label={label}
					>
						{children}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

const PERSPECTIVE_FIELDS: Array<{
	x: keyof MediaPerspective;
	y: keyof MediaPerspective;
	labelKey: TranslationKey;
}> = [
	{
		x: "topLeftX",
		y: "topLeftY",
		labelKey: "mediaProperties.corner.topLeft",
	},
	{
		x: "topRightX",
		y: "topRightY",
		labelKey: "mediaProperties.corner.topRight",
	},
	{
		x: "bottomLeftX",
		y: "bottomLeftY",
		labelKey: "mediaProperties.corner.bottomLeft",
	},
	{
		x: "bottomRightX",
		y: "bottomRightY",
		labelKey: "mediaProperties.corner.bottomRight",
	},
];

const BLEND_MODE_OPTIONS = [
	["normal", "mediaProperties.blend.normal"],
	["multiply", "mediaProperties.blend.multiply"],
	["screen", "mediaProperties.blend.screen"],
	["overlay", "mediaProperties.blend.overlay"],
	["darken", "mediaProperties.blend.darken"],
	["lighten", "mediaProperties.blend.lighten"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

const FIT_MODE_OPTIONS = [
	["cover", "mediaProperties.fit.cover"],
	["contain", "mediaProperties.fit.contain"],
	["fill", "mediaProperties.fit.fill"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

const CROP_SIDE_LABELS = {
	top: "mediaProperties.crop.top",
	right: "mediaProperties.crop.right",
	bottom: "mediaProperties.crop.bottom",
	left: "mediaProperties.crop.left",
} as const satisfies Record<string, TranslationKey>;

const CLIP_ANIMATION_OPTIONS = [
	["none", "mediaProperties.animation.none"],
	["fade", "mediaProperties.animation.fade"],
	["slide-left", "mediaProperties.animation.slideLeft"],
	["slide-right", "mediaProperties.animation.slideRight"],
	["slide-up", "mediaProperties.animation.slideUp"],
	["slide-down", "mediaProperties.animation.slideDown"],
	["zoom-in", "mediaProperties.animation.zoomIn"],
	["zoom-out", "mediaProperties.animation.zoomOut"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

const CROP_KEYFRAME_PROPERTY = {
	top: "cropTop",
	right: "cropRight",
	bottom: "cropBottom",
	left: "cropLeft",
} as const satisfies Record<string, MediaKeyframeProperty>;

const VISUAL_PROPERTY_TABS = ["basic", "cutout", "mask", "portrait"] as const;
type VisualPropertyTab = (typeof VISUAL_PROPERTY_TABS)[number];
type MediaPropertiesTab =
	| VisualPropertyTab
	| "audio"
	| "speed"
	| "animation"
	| "tracking"
	| "adjustments"
	| "ai";

function requestedPropertiesTab({ tab }: { tab: string }): MediaPropertiesTab {
	if (tab === "crop" || tab === "perspective") return "basic";
	if (tab === "advanced") return "mask";
	if (tab === "beauty") return "portrait";
	if (
		[
			...VISUAL_PROPERTY_TABS,
			"audio",
			"speed",
			"animation",
			"tracking",
			"adjustments",
			"ai",
		].includes(tab as MediaPropertiesTab)
	) {
		return tab as MediaPropertiesTab;
	}
	return "basic";
}

export function MediaProperties({
	element,
	trackId,
}: {
	element: MediaElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const setActiveMediaTab = useMediaPanelStore((state) => state.setActiveTab);
	const setSegmentationMode = useSegmentationStore((state) => state.setMode);
	const setSegmentationSource = useSegmentationStore(
		(state) => state.setSourceVideo
	);
	const setSegmentationPrompt = useSegmentationStore(
		(state) => state.setTextPrompt
	);
	const setSegmentationBackend = useSegmentationStore(
		(state) => state.setVideoBackend
	);
	const setMaskTrackingRequest = useSegmentationStore(
		(state) => state.setTrackingRequest
	);
	const [keyframeProperty, setKeyframeProperty] =
		useState<MediaKeyframeProperty>("x");
	const [activePropertiesTab, setActivePropertiesTab] =
		useState<MediaPropertiesTab>("basic");
	const [cropExpanded, setCropExpanded] = useState(false);
	const [keyframesExpanded, setKeyframesExpanded] = useState(false);
	const interactionActive = useRef(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const visual = resolveMediaVisualProperties(element);
	const timelineDuration = getMediaTimelineDuration(element, fps);

	useEffect(() => {
		const handleOpenPropertiesTab = (event: Event) => {
			const detail = (event as CustomEvent).detail as
				| {
						elementId?: string;
						tab?: string;
						scrollTo?: string;
				  }
				| undefined;
			if (detail?.elementId !== element.id || !detail.tab) return;
			setActivePropertiesTab(requestedPropertiesTab({ tab: detail.tab }));
			if (detail.scrollTo === "crop") {
				setCropExpanded(true);
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						panelRef.current
							?.querySelector('[data-testid="media-crop-controls"]')
							?.scrollIntoView({ block: "center", behavior: "smooth" });
					});
				});
			}
			if (detail.scrollTo === "lut") {
				requestAnimationFrame(() => {
					document
						.querySelector('[data-testid="color-module-lut"]')
						?.scrollIntoView({ block: "center", behavior: "smooth" });
				});
			}
		};
		window.addEventListener(
			"qcut:open-media-properties-tab",
			handleOpenPropertiesTab
		);
		return () =>
			window.removeEventListener(
				"qcut:open-media-properties-tab",
				handleOpenPropertiesTab
			);
	}, [element.id]);

	useEffect(() => {
		if (!activePropertiesTab || !element.id) return;
		panelRef.current
			?.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
			?.scrollTo({ top: 0, behavior: "auto" });
	}, [activePropertiesTab, element.id]);

	const update = (updates: MediaUpdates, history = true) =>
		updateMediaElement(trackId, element.id, updates, history);
	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const updateLive = (updates: MediaUpdates) => update(updates, false);
	const keyframesFor = ({ property }: { property: MediaKeyframeProperty }) =>
		element.keyframes?.[property] ?? [];
	const currentPropertyValue = ({
		property,
	}: {
		property: MediaKeyframeProperty;
	}) => getMediaKeyframeValue({ element, property, currentTime, fps });
	const setPropertyKeyframesFor = ({
		property,
		keyframes,
	}: {
		property: MediaKeyframeProperty;
		keyframes: MediaPropertyKeyframe[];
	}) =>
		update({
			keyframes: {
				...element.keyframes,
				[property]: keyframes,
			},
		});
	const updateNumericProperties = ({
		updates,
		values,
		history = false,
	}: {
		updates: MediaUpdates;
		values: Partial<Record<MediaKeyframeProperty, number>>;
		history?: boolean;
	}) => {
		let nextKeyframes = element.keyframes;
		let keyframesChanged = false;
		for (const [property, value] of Object.entries(values) as Array<
			[MediaKeyframeProperty, number]
		>) {
			const keyframes = keyframesFor({ property });
			if (keyframes.length === 0) continue;
			const existing = keyframes.find((item) => item.frame === currentFrame);
			nextKeyframes = {
				...nextKeyframes,
				[property]: upsertMediaKeyframe({
					keyframes,
					keyframe: {
						id: existing?.id ?? `media-keyframe-${property}-${Date.now()}`,
						frame: currentFrame,
						value,
						easing: existing?.easing ?? "linear",
					},
				}),
			};
			keyframesChanged = true;
		}
		update(
			keyframesChanged ? { ...updates, keyframes: nextKeyframes } : updates,
			history
		);
	};
	const isKeyframedHere = ({ property }: { property: MediaKeyframeProperty }) =>
		keyframesFor({ property }).some((item) => item.frame === currentFrame);
	const togglePropertyKeyframes = ({
		values,
	}: {
		values: Partial<Record<MediaKeyframeProperty, number>>;
	}) => {
		const properties = Object.keys(values) as MediaKeyframeProperty[];
		if (properties.length === 0) return;
		const removeCurrentFrame = properties.every((property) =>
			isKeyframedHere({ property })
		);
		const nextKeyframes = { ...element.keyframes };
		for (const property of properties) {
			const keyframes = keyframesFor({ property });
			const existing = keyframes.find((item) => item.frame === currentFrame);
			nextKeyframes[property] = removeCurrentFrame
				? keyframes.filter((item) => item.frame !== currentFrame)
				: upsertMediaKeyframe({
						keyframes,
						keyframe: {
							id: existing?.id ?? `media-keyframe-${property}-${Date.now()}`,
							frame: currentFrame,
							value: values[property]!,
							easing: existing?.easing ?? "linear",
						},
					});
		}
		setKeyframeProperty(properties[0]);
		update({ keyframes: nextKeyframes });
	};
	const resetNumericProperties = ({
		updates,
		properties,
	}: {
		updates: MediaUpdates;
		properties: MediaKeyframeProperty[];
	}) => {
		const keyframes = { ...element.keyframes };
		for (const property of properties) keyframes[property] = [];
		update({ ...updates, keyframes });
	};

	const setScale = (axis: "x" | "y", percent: number) => {
		const value = Math.max(0.01, percent / 100);
		if (visual.maintainAspectRatio) {
			updateNumericProperties({
				updates: { scaleX: value, scaleY: value },
				values: { scaleX: value, scaleY: value },
			});
			return;
		}
		updateNumericProperties({
			updates: axis === "x" ? { scaleX: value } : { scaleY: value },
			values: axis === "x" ? { scaleX: value } : { scaleY: value },
		});
	};

	const alignX = (alignment: "left" | "center" | "right") => {
		const offset =
			((currentPropertyValue({ property: "scaleX" }) - 1) * canvasSize.width) /
			2;
		const x =
			alignment === "left" ? offset : alignment === "right" ? -offset : 0;
		updateNumericProperties({
			updates: { x },
			values: { x },
			history: true,
		});
	};
	const alignY = (alignment: "top" | "center" | "bottom") => {
		const offset =
			((currentPropertyValue({ property: "scaleY" }) - 1) * canvasSize.height) /
			2;
		const y =
			alignment === "top" ? offset : alignment === "bottom" ? -offset : 0;
		updateNumericProperties({
			updates: { y },
			values: { y },
			history: true,
		});
	};

	const resetTransform = () =>
		resetNumericProperties({
			updates: {
				x: 0,
				y: 0,
				rotation: 0,
				scaleX: 1,
				scaleY: 1,
				maintainAspectRatio: true,
				flipHorizontal: false,
				flipVertical: false,
			},
			properties: ["x", "y", "scaleX", "scaleY", "rotation"],
		});
	const resetAll = () =>
		update({
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
			maintainAspectRatio: true,
			flipHorizontal: false,
			flipVertical: false,
			opacity: 1,
			blendMode: "normal",
			fitMode: "cover",
			crop: { ...DEFAULT_MEDIA_CROP },
			perspective: { ...DEFAULT_MEDIA_PERSPECTIVE },
			animationInType: "none",
			animationInDuration: 0.5,
			animationOutType: "none",
			animationOutDuration: 0.5,
			comboAnimationType: "none",
			comboAnimationIntensity: 0.5,
			...defaultColorUpdates(),
			mask: { ...DEFAULT_MEDIA_MASK },
			customCutout: { ...DEFAULT_MEDIA_CUSTOM_CUTOUT, strokes: [] },
			chromaKey: { ...DEFAULT_MEDIA_CHROMA_KEY },
			enhancements: { ...DEFAULT_MEDIA_ENHANCEMENTS },
			...defaultAudioUpdates(),
			playbackRate: 1,
			speedKeyframes: [],
			reverse: false,
			freezeFrameTime: undefined,
			freezeFrameDuration: 0,
			preservePitch: true,
			frameInterpolation: "none",
			keyframes: {},
		});
	const openSegmentation = ({
		backend,
		prompt,
	}: {
		backend: "local-person" | "sam3";
		prompt: string;
	}) => {
		if (mediaItem?.file) {
			const sourceUrl =
				mediaItem.url || createObjectURL(mediaItem.file, "media-properties-ai");
			setSegmentationSource(mediaItem.file, sourceUrl);
			setSegmentationMode("video");
			setSegmentationBackend(backend);
			setSegmentationPrompt(prompt);
		}
		setActiveMediaTab("segmentation");
	};
	const openAIUpscale = () => {
		if (mediaItem?.file) requestSelectedVideoUpscale({ file: mediaItem.file });
		setActiveMediaTab("upscale");
	};

	const propertyKeyframes = element.keyframes?.[keyframeProperty] ?? [];
	const durationInFrames = Math.max(1, Math.round(timelineDuration * fps));
	const currentFrame = Math.min(
		durationInFrames,
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);
	useMediaKeyframeShortcuts({
		currentTime,
		currentFrame,
		element,
		fps,
		keyframeProperty,
		onExpandKeyframes: () => setKeyframesExpanded(true),
		onOpenBasic: () => setActivePropertiesTab("basic"),
		trackId,
	});
	const setPropertyKeyframes = (keyframes: MediaPropertyKeyframe[]) =>
		setPropertyKeyframesFor({ property: keyframeProperty, keyframes });
	const addKeyframe = (frame: number, value: unknown) => {
		const existing = propertyKeyframes.find((item) => item.frame === frame);
		setPropertyKeyframes(
			upsertMediaKeyframe({
				keyframes: propertyKeyframes,
				keyframe: {
					id:
						existing?.id ??
						(typeof crypto !== "undefined" && "randomUUID" in crypto
							? crypto.randomUUID()
							: `media-keyframe-${Date.now()}`),
					frame,
					value: Number(value),
					easing: existing?.easing ?? "linear",
				},
			})
		);
	};
	const updateKeyframe = (
		id: string,
		frame: number,
		value: unknown,
		easing: EasingType = "linear"
	) =>
		setPropertyKeyframes(
			upsertMediaKeyframe({
				keyframes: propertyKeyframes,
				keyframe: { id, frame, value: Number(value), easing },
			})
		);
	const deleteKeyframe = (id: string) =>
		setPropertyKeyframes(propertyKeyframes.filter((item) => item.id !== id));
	const startMaskTracking = ({
		mask,
		direction,
	}: {
		mask: MediaMask;
		direction: MediaMaskTrackingDirection;
	}) => {
		if (!mask.id) return;
		setMaskTrackingRequest({
			elementId: element.id,
			maskId: mask.id,
			direction,
			anchorFrame: currentFrame,
		});
		openSegmentation({
			backend: mask.type === "person" ? "local-person" : "sam3",
			prompt: mask.type === "person" ? "" : (mask.name ?? "object"),
		});
	};
	const isVisualTab = VISUAL_PROPERTY_TABS.includes(
		activePropertiesTab as VisualPropertyTab
	);
	return (
		<div
			ref={panelRef}
			className="w-full min-w-0 space-y-4 overflow-x-hidden"
			data-testid="media-properties"
		>
			<div className="sticky top-0 z-20 space-y-2 bg-background pb-2">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">{element.name}</p>
						<p className="text-[11px] text-muted-foreground">
							{timelineDuration.toFixed(2)}s
						</p>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={resetAll}>
						<RotateCcw className="mr-2 size-3.5" />
						{t("mediaProperties.resetAll")}
					</Button>
				</div>

				<Tabs
					value={isVisualTab ? "visual" : activePropertiesTab}
					onValueChange={(value) =>
						setActivePropertiesTab(
							value === "visual" ? "basic" : (value as MediaPropertiesTab)
						)
					}
				>
					<TabsList
						className="grid h-8 w-full grid-cols-7 gap-0.5 rounded-sm p-0.5"
						data-testid="media-properties-primary-tabs"
					>
						<TabsTrigger value="visual" className="min-w-0 px-1 text-[10px]">
							{t("mediaProperties.tab.visual")}
						</TabsTrigger>
						<TabsTrigger value="audio" className="min-w-0 px-1 text-[10px]">
							{t("mediaProperties.tab.audio")}
						</TabsTrigger>
						<TabsTrigger value="speed" className="min-w-0 px-1 text-[10px]">
							{t("mediaProperties.tab.speed")}
						</TabsTrigger>
						<TabsTrigger
							value="animation"
							className="min-w-0 px-1 text-[10px]"
							aria-label={t("mediaProperties.tab.animation")}
							title={t("mediaProperties.tab.animation")}
						>
							{t("mediaProperties.tab.animationShort")}
						</TabsTrigger>
						<TabsTrigger value="tracking" className="min-w-0 px-1 text-[10px]">
							{t("mediaProperties.tab.tracking")}
						</TabsTrigger>
						<TabsTrigger
							value="adjustments"
							className="min-w-0 px-1 text-[10px]"
						>
							{t("mediaProperties.tab.adjustments")}
						</TabsTrigger>
						<TabsTrigger
							value="ai"
							className="min-w-0 px-1 text-[10px]"
							aria-label={t("mediaProperties.tab.ai")}
							title={t("mediaProperties.tab.ai")}
						>
							{t("mediaProperties.tab.aiShort")}
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{isVisualTab ? (
					<Tabs
						value={activePropertiesTab}
						onValueChange={(value) =>
							setActivePropertiesTab(value as VisualPropertyTab)
						}
					>
						<TabsList
							className="grid h-8 w-full grid-cols-4 gap-0.5 rounded-sm p-0.5"
							data-testid="media-properties-visual-tabs"
						>
							<TabsTrigger value="basic" className="px-1 text-xs">
								{t("mediaProperties.tab.basic")}
							</TabsTrigger>
							<TabsTrigger value="cutout" className="px-1 text-xs">
								{t("mediaProperties.tab.cutout")}
							</TabsTrigger>
							<TabsTrigger value="mask" className="px-1 text-xs">
								{t("mediaProperties.tab.mask")}
							</TabsTrigger>
							<TabsTrigger value="portrait" className="px-1 text-xs">
								{t("mediaProperties.tab.portrait")}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				) : null}
			</div>

			<Tabs value={activePropertiesTab}>
				<TabsContent value="basic" className="mt-4 space-y-4">
					<PropertyGroup
						title={t("mediaProperties.positionAndSize")}
						defaultExpanded
					>
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<PropertyItemLabel>
									{t("mediaProperties.maintainAspectRatio")}
								</PropertyItemLabel>
								<div className="flex items-center gap-2">
									{visual.maintainAspectRatio ? (
										<Link2 className="size-3.5 text-primary" />
									) : (
										<Unlink2 className="size-3.5 text-muted-foreground" />
									)}
									<Switch
										checked={visual.maintainAspectRatio}
										onCheckedChange={(checked) =>
											update({
												maintainAspectRatio: checked,
												...(checked ? { scaleY: visual.scaleX } : {}),
											})
										}
									/>
								</div>
							</div>
							<NumberControl
								label={t(
									visual.maintainAspectRatio
										? "mediaProperties.scale"
										: "mediaProperties.horizontalScale"
								)}
								value={currentPropertyValue({ property: "scaleX" }) * 100}
								min={1}
								max={400}
								suffix="%"
								onChange={(value) => setScale("x", value)}
								keyframed={
									visual.maintainAspectRatio
										? isKeyframedHere({ property: "scaleX" }) &&
											isKeyframedHere({ property: "scaleY" })
										: isKeyframedHere({ property: "scaleX" })
								}
								onToggleKeyframe={() =>
									togglePropertyKeyframes({
										values: visual.maintainAspectRatio
											? {
													scaleX: currentPropertyValue({
														property: "scaleX",
													}),
													scaleY: currentPropertyValue({
														property: "scaleY",
													}),
												}
											: {
													scaleX: currentPropertyValue({
														property: "scaleX",
													}),
												},
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							{visual.maintainAspectRatio ? null : (
								<NumberControl
									label={t("mediaProperties.verticalScale")}
									value={currentPropertyValue({ property: "scaleY" }) * 100}
									min={1}
									max={400}
									suffix="%"
									onChange={(value) => setScale("y", value)}
									keyframed={isKeyframedHere({ property: "scaleY" })}
									onToggleKeyframe={() =>
										togglePropertyKeyframes({
											values: {
												scaleY: currentPropertyValue({
													property: "scaleY",
												}),
											},
										})
									}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							)}
							<NumberControl
								label={t("mediaProperties.positionX")}
								value={currentPropertyValue({ property: "x" })}
								min={-canvasSize.width}
								max={canvasSize.width}
								onChange={(x) =>
									updateNumericProperties({ updates: { x }, values: { x } })
								}
								keyframed={isKeyframedHere({ property: "x" })}
								onToggleKeyframe={() =>
									togglePropertyKeyframes({
										values: { x: currentPropertyValue({ property: "x" }) },
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label={t("mediaProperties.positionY")}
								value={currentPropertyValue({ property: "y" })}
								min={-canvasSize.height}
								max={canvasSize.height}
								onChange={(y) =>
									updateNumericProperties({ updates: { y }, values: { y } })
								}
								keyframed={isKeyframedHere({ property: "y" })}
								onToggleKeyframe={() =>
									togglePropertyKeyframes({
										values: { y: currentPropertyValue({ property: "y" }) },
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label={t("mediaProperties.rotation")}
								value={currentPropertyValue({ property: "rotation" })}
								min={-180}
								max={180}
								suffix="°"
								onChange={(rotation) =>
									updateNumericProperties({
										updates: { rotation },
										values: { rotation },
									})
								}
								keyframed={isKeyframedHere({ property: "rotation" })}
								onToggleKeyframe={() =>
									togglePropertyKeyframes({
										values: {
											rotation: currentPropertyValue({ property: "rotation" }),
										},
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>

							<div className="flex items-center justify-between gap-2">
								<div className="flex gap-1">
									<IconButton
										label={t("mediaProperties.alignLeft")}
										onClick={() => alignX("left")}
									>
										<AlignHorizontalJustifyStart className="size-4" />
									</IconButton>
									<IconButton
										label={t("mediaProperties.alignCenter")}
										onClick={() => alignX("center")}
									>
										<AlignHorizontalJustifyCenter className="size-4" />
									</IconButton>
									<IconButton
										label={t("mediaProperties.alignRight")}
										onClick={() => alignX("right")}
									>
										<AlignHorizontalJustifyEnd className="size-4" />
									</IconButton>
								</div>
								<div className="flex gap-1">
									<IconButton
										label={t("mediaProperties.alignTop")}
										onClick={() => alignY("top")}
									>
										<AlignVerticalJustifyStart className="size-4" />
									</IconButton>
									<IconButton
										label={t("mediaProperties.alignMiddle")}
										onClick={() => alignY("center")}
									>
										<AlignVerticalJustifyCenter className="size-4" />
									</IconButton>
									<IconButton
										label={t("mediaProperties.alignBottom")}
										onClick={() => alignY("bottom")}
									>
										<AlignVerticalJustifyEnd className="size-4" />
									</IconButton>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<IconButton
									label={t("mediaProperties.flipHorizontal")}
									active={visual.flipHorizontal}
									onClick={() =>
										update({ flipHorizontal: !visual.flipHorizontal })
									}
								>
									<FlipHorizontal2 className="size-4" />
								</IconButton>
								<IconButton
									label={t("mediaProperties.flipVertical")}
									active={visual.flipVertical}
									onClick={() => update({ flipVertical: !visual.flipVertical })}
								>
									<FlipVertical2 className="size-4" />
								</IconButton>
								<Button
									type="button"
									variant="text"
									size="sm"
									className="ml-auto"
									onClick={resetTransform}
								>
									<RotateCcw className="mr-2 size-3.5" />
									{t("mediaProperties.resetTransform")}
								</Button>
							</div>
						</div>
					</PropertyGroup>

					<PropertyGroup title={t("mediaProperties.blend")} defaultExpanded>
						<div className="space-y-4">
							<NumberControl
								label={t("mediaProperties.opacity")}
								value={currentPropertyValue({ property: "opacity" }) * 100}
								min={0}
								max={100}
								suffix="%"
								onChange={(percent) => {
									const opacity = percent / 100;
									updateNumericProperties({
										updates: { opacity },
										values: { opacity },
									});
								}}
								keyframed={isKeyframedHere({ property: "opacity" })}
								onToggleKeyframe={() =>
									togglePropertyKeyframes({
										values: {
											opacity: currentPropertyValue({ property: "opacity" }),
										},
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<PropertyItem>
								<PropertyItemLabel>
									{t("mediaProperties.blendMode")}
								</PropertyItemLabel>
								<PropertyItemValue>
									<Select
										value={visual.blendMode}
										onValueChange={(blendMode) =>
											update({
												blendMode: blendMode as MediaElement["blendMode"],
											})
										}
									>
										<SelectTrigger
											className="h-8 text-xs"
											aria-label={t("mediaProperties.blendMode")}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{BLEND_MODE_OPTIONS.map(([mode, labelKey]) => (
												<SelectItem key={mode} value={mode}>
													{t(labelKey)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
						</div>
					</PropertyGroup>

					<PropertyGroup
						title={t("mediaProperties.cropAndFit")}
						defaultExpanded={false}
						expanded={cropExpanded}
						onExpandedChange={setCropExpanded}
					>
						<div className="space-y-4" data-testid="media-crop-controls">
							<div className="grid grid-cols-3 gap-1">
								{FIT_MODE_OPTIONS.map(([mode, labelKey]) => (
									<Button
										key={mode}
										type="button"
										variant={visual.fitMode === mode ? "default" : "outline"}
										size="sm"
										onClick={() => update({ fitMode: mode })}
									>
										{t(labelKey)}
									</Button>
								))}
							</div>
							{(["top", "right", "bottom", "left"] as const).map((side) => {
								const property = CROP_KEYFRAME_PROPERTY[side];
								return (
									<NumberControl
										key={side}
										label={t(CROP_SIDE_LABELS[side])}
										value={currentPropertyValue({ property }) * 100}
										min={0}
										max={95}
										suffix="%"
										onChange={(percent) => {
											const value = percent / 100;
											updateNumericProperties({
												updates: {
													crop: { ...visual.crop, [side]: value },
												},
												values: { [property]: value },
											});
										}}
										keyframed={isKeyframedHere({ property })}
										onToggleKeyframe={() =>
											togglePropertyKeyframes({
												values: {
													[property]: currentPropertyValue({ property }),
												},
											})
										}
										onInteractionStart={beginInteraction}
										onInteractionEnd={endInteraction}
									/>
								);
							})}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									resetNumericProperties({
										updates: { crop: { ...DEFAULT_MEDIA_CROP } },
										properties: Object.values(CROP_KEYFRAME_PROPERTY),
									})
								}
							>
								<RotateCcw className="mr-2 size-3.5" />
								{t("mediaProperties.resetCrop")}
							</Button>
						</div>
					</PropertyGroup>

					<PropertyGroup
						title={t("mediaProperties.perspective")}
						defaultExpanded={false}
					>
						<div className="space-y-3">
							{PERSPECTIVE_FIELDS.map((field) => (
								<div key={field.labelKey} className="space-y-1">
									<p className="text-[11px] text-muted-foreground">
										{t(field.labelKey)}
									</p>
									<div className="grid grid-cols-2 gap-2">
										{([field.x, field.y] as const).map((key, index) => {
											const property = key as MediaKeyframeProperty;
											const axis = index === 0 ? "X" : "Y";
											return (
												<div key={key} className="flex items-center gap-1">
													<span className="w-3 text-[10px] text-muted-foreground">
														{axis}
													</span>
													<MaskIconButton
														label={
															isKeyframedHere({ property })
																? t("mediaProperties.removeKeyframe", {
																		label: `${t(field.labelKey)} ${axis}`,
																	})
																: t("mediaProperties.addKeyframe", {
																		label: `${t(field.labelKey)} ${axis}`,
																	})
														}
														active={isKeyframedHere({ property })}
														onClick={() =>
															togglePropertyKeyframes({
																values: {
																	[property]: currentPropertyValue({
																		property,
																	}),
																},
															})
														}
													>
														<Diamond
															className={`size-3 ${
																isKeyframedHere({ property })
																	? "fill-primary text-primary"
																	: ""
															}`}
														/>
													</MaskIconButton>
													<Input
														type="number"
														aria-label={t("mediaProperties.value", {
															label: `${t(field.labelKey)} ${axis}`,
														})}
														value={Math.round(
															currentPropertyValue({ property }) * 100
														)}
														min={0}
														max={100}
														onFocus={beginInteraction}
														onBlur={endInteraction}
														onChange={(event) => {
															const percent = Number(event.target.value);
															if (!Number.isFinite(percent)) return;
															const value = percent / 100;
															updateNumericProperties({
																updates: {
																	perspective: {
																		...visual.perspective,
																		[key]: value,
																	},
																},
																values: { [property]: value },
															});
														}}
														className="h-8 min-w-0 text-xs"
													/>
												</div>
											);
										})}
									</div>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									resetNumericProperties({
										updates: {
											perspective: { ...DEFAULT_MEDIA_PERSPECTIVE },
										},
										properties: PERSPECTIVE_FIELDS.flatMap(({ x, y }) => [
											x,
											y,
										]),
									})
								}
							>
								<RotateCcw className="mr-2 size-3.5" />
								{t("mediaProperties.resetPerspective")}
							</Button>
						</div>
					</PropertyGroup>

					<PropertyGroup
						title={t("mediaProperties.stabilization")}
						defaultExpanded={false}
					>
						<NumberControl
							label={t("mediaProperties.localStabilization")}
							value={visual.enhancements.stabilization}
							min={0}
							max={100}
							onChange={(stabilization) =>
								updateLive({
									enhancements: { ...visual.enhancements, stabilization },
								})
							}
							onInteractionStart={beginInteraction}
							onInteractionEnd={endInteraction}
						/>
					</PropertyGroup>

					<PropertyGroup
						title={t("mediaProperties.qualityEnhancement")}
						defaultExpanded={false}
					>
						<div className="space-y-4">
							{(
								[
									["denoise", "mediaProperties.denoise"],
									["clarity", "mediaProperties.clarity"],
								] as const
							).map(([property, labelKey]) => (
								<NumberControl
									key={property}
									label={t(labelKey)}
									value={visual.enhancements[property]}
									min={0}
									max={100}
									onChange={(value) =>
										updateLive({
											enhancements: {
												...visual.enhancements,
												[property]: value,
											},
										})
									}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							))}
							<PropertyItem>
								<PropertyItemLabel>
									{t("mediaProperties.localUpscale")}
								</PropertyItemLabel>
								<PropertyItemValue>
									<Select
										value={String(visual.enhancements.upscale)}
										onValueChange={(value) =>
											update({
												enhancements: {
													...visual.enhancements,
													upscale: Number(value) as 1 | 2 | 4,
												},
											})
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="1">
												{t("mediaProperties.off")}
											</SelectItem>
											<SelectItem value="2">2x</SelectItem>
											<SelectItem value="4">4x</SelectItem>
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="animation" className="mt-4 space-y-4">
					<PropertyGroup
						title={t("mediaProperties.clipAnimation")}
						defaultExpanded
					>
						<div className="space-y-4">
							{(
								[
									[
										"mediaProperties.animation.in",
										"animationInType",
										"animationInDuration",
									],
									[
										"mediaProperties.animation.out",
										"animationOutType",
										"animationOutDuration",
									],
								] as const
							).map(([labelKey, typeKey, durationKey]) => (
								<div key={labelKey} className="space-y-3">
									<PropertyItem>
										<PropertyItemLabel>
											{t("mediaProperties.animation.label", {
												name: t(labelKey),
											})}
										</PropertyItemLabel>
										<PropertyItemValue>
											<Select
												value={visual[typeKey]}
												onValueChange={(value) =>
													update({ [typeKey]: value } as MediaUpdates)
												}
											>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{CLIP_ANIMATION_OPTIONS.map(
														([value, optionLabelKey]) => (
															<SelectItem key={value} value={value}>
																{t(optionLabelKey)}
															</SelectItem>
														)
													)}
												</SelectContent>
											</Select>
										</PropertyItemValue>
									</PropertyItem>
									{visual[typeKey] === "none" ? null : (
										<NumberControl
											label={t("mediaProperties.animation.duration", {
												name: t(labelKey),
											})}
											value={visual[durationKey]}
											min={0.1}
											max={5}
											step={0.1}
											suffix="s"
											onChange={(value) =>
												updateLive({ [durationKey]: value } as MediaUpdates)
											}
											onInteractionStart={beginInteraction}
											onInteractionEnd={endInteraction}
										/>
									)}
								</div>
							))}
						</div>
					</PropertyGroup>

					<PropertyGroup
						title={t("mediaProperties.comboAnimation")}
						defaultExpanded
					>
						<div className="space-y-4">
							<PropertyItem>
								<PropertyItemLabel>
									{t("mediaProperties.motion")}
								</PropertyItemLabel>
								<PropertyItemValue>
									<Select
										value={visual.comboAnimationType}
										onValueChange={(value) =>
											update({
												comboAnimationType:
													value as MediaElement["comboAnimationType"],
											})
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												{t("mediaProperties.animation.none")}
											</SelectItem>
											<SelectItem value="pulse">
												{t("mediaProperties.motion.pulse")}
											</SelectItem>
											<SelectItem value="drift">
												{t("mediaProperties.motion.drift")}
											</SelectItem>
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
							{visual.comboAnimationType === "none" ? null : (
								<NumberControl
									label={t("mediaProperties.intensity")}
									value={visual.comboAnimationIntensity * 100}
									min={0}
									max={100}
									suffix="%"
									onChange={(value) =>
										updateLive({ comboAnimationIntensity: value / 100 })
									}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							)}
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="adjustments" className="mt-4">
					<ColorPropertiesPanel element={element} trackId={trackId} />
				</TabsContent>

				<TabsContent value="audio" className="mt-4">
					<AudioPropertiesPanel element={element} trackId={trackId} />
				</TabsContent>

				<TabsContent value="speed" className="mt-4">
					<MediaSpeedProperties element={element} trackId={trackId} />
				</TabsContent>

				<TabsContent value="tracking" className="mt-4">
					<MediaTrackingProperties
						masks={visual.masks}
						onTrack={startMaskTracking}
						onOpenMasks={() => setActivePropertiesTab("mask")}
					/>
				</TabsContent>

				<TabsContent value="mask" className="mt-4">
					<MediaMaskProperties
						elementId={element.id}
						masks={visual.masks}
						currentFrame={currentFrame}
						onChange={(masks, history = true) => update({ masks }, history)}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
						onTrack={startMaskTracking}
					/>
				</TabsContent>

				<TabsContent value="cutout" className="mt-4 space-y-4">
					<MediaAutomaticCutoutProperties element={element} />
					<MediaCustomCutoutProperties element={element} trackId={trackId} />
					<MediaChromaKeyProperties element={element} trackId={trackId} />
				</TabsContent>

				<TabsContent value="portrait" className="mt-4">
					<PropertyGroup
						title={t("mediaProperties.tab.portrait")}
						defaultExpanded
					>
						<div className="space-y-4">
							<NumberControl
								label={t("mediaProperties.relight")}
								value={visual.enhancements.relight}
								min={-100}
								max={100}
								onChange={(relight) =>
									updateLive({
										enhancements: { ...visual.enhancements, relight },
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label={t("mediaProperties.beauty")}
								value={visual.enhancements.beauty}
								min={0}
								max={100}
								onChange={(beauty) =>
									updateLive({
										enhancements: { ...visual.enhancements, beauty },
									})
								}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="ai" className="mt-4">
					<MediaAIProperties
						element={element}
						trackId={trackId}
						onOpenUpscale={openAIUpscale}
						onOpenVideoTools={() => setActiveMediaTab("ai")}
					/>
				</TabsContent>
			</Tabs>

			{activePropertiesTab === "basic" ? (
				<PropertyGroup
					title={t("mediaProperties.keyframes")}
					defaultExpanded={false}
					expanded={keyframesExpanded}
					onExpandedChange={setKeyframesExpanded}
				>
					<div className="space-y-4">
						<PropertyItem>
							<PropertyItemLabel>
								{t("mediaProperties.property")}
							</PropertyItemLabel>
							<PropertyItemValue>
								<Select
									value={keyframeProperty}
									onValueChange={(value) =>
										setKeyframeProperty(value as MediaKeyframeProperty)
									}
								>
									<SelectTrigger
										className="h-8 text-xs"
										aria-label={t("mediaProperties.keyframeProperty")}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{MEDIA_KEYFRAME_PROPERTIES.map((property) => (
											<SelectItem key={property.value} value={property.value}>
												{property.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</PropertyItemValue>
						</PropertyItem>
						<KeyframeEditor
							propName={keyframeProperty}
							propLabel={
								MEDIA_KEYFRAME_PROPERTIES.find(
									(property) => property.value === keyframeProperty
								)?.label ?? keyframeProperty
							}
							propType="number"
							keyframes={propertyKeyframes as Keyframe[]}
							durationInFrames={durationInFrames}
							fps={fps}
							currentFrame={currentFrame}
							currentValueWhenEmpty={getMediaPropertyValue(
								element,
								keyframeProperty
							)}
							onKeyframeAdd={addKeyframe}
							onKeyframeUpdate={updateKeyframe}
							onKeyframeDelete={deleteKeyframe}
						/>
					</div>
				</PropertyGroup>
			) : null}
		</div>
	);
}
