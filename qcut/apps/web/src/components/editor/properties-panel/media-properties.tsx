import { useRef, useState } from "react";
import {
	AlignHorizontalJustifyCenter,
	AlignHorizontalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyEnd,
	AlignVerticalJustifyStart,
	FlipHorizontal2,
	FlipVertical2,
	Link2,
	RotateCcw,
	Unlink2,
} from "lucide-react";
import type {
	MediaElement,
	MediaKeyframeProperty,
	MediaMaskType,
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
	DEFAULT_MEDIA_ADJUSTMENTS,
	DEFAULT_MEDIA_CHROMA_KEY,
	DEFAULT_MEDIA_CROP,
	DEFAULT_MEDIA_ENHANCEMENTS,
	DEFAULT_MEDIA_MASK,
	DEFAULT_MEDIA_PERSPECTIVE,
	MEDIA_KEYFRAME_PROPERTIES,
	getMediaPropertyValue,
	resolveMediaVisualProperties,
	upsertMediaKeyframe,
} from "@/lib/video/video-properties";
import {
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
	resolveSpeedAtSourceTime,
} from "@/lib/video/video-timing";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { VolumeControl } from "./volume-control";
import { KeyframeEditor } from "./keyframe-editor";

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
	onInteractionStart,
	onInteractionEnd,
}: NumberControlProps) {
	return (
		<PropertyItem direction="column">
			<div className="flex items-center justify-between gap-3">
				<PropertyItemLabel>{label}</PropertyItemLabel>
				<div className="flex items-center gap-1">
					<Input
						type="number"
						aria-label={`${label} value`}
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
	label: string;
}> = [
	{ x: "topLeftX", y: "topLeftY", label: "Top left" },
	{ x: "topRightX", y: "topRightY", label: "Top right" },
	{ x: "bottomLeftX", y: "bottomLeftY", label: "Bottom left" },
	{ x: "bottomRightX", y: "bottomRightY", label: "Bottom right" },
];

export function MediaProperties({
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
	const [keyframeProperty, setKeyframeProperty] =
		useState<MediaKeyframeProperty>("x");
	const interactionActive = useRef(false);
	const visual = resolveMediaVisualProperties(element);
	const timelineDuration = getMediaTimelineDuration(element, fps);

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

	const setScale = (axis: "x" | "y", percent: number) => {
		const value = Math.max(0.01, percent / 100);
		if (visual.maintainAspectRatio) {
			updateLive({ scaleX: value, scaleY: value });
		} else {
			updateLive(axis === "x" ? { scaleX: value } : { scaleY: value });
		}
	};

	const alignX = (alignment: "left" | "center" | "right") => {
		const offset = ((visual.scaleX - 1) * canvasSize.width) / 2;
		update({
			x: alignment === "left" ? offset : alignment === "right" ? -offset : 0,
		});
	};
	const alignY = (alignment: "top" | "center" | "bottom") => {
		const offset = ((visual.scaleY - 1) * canvasSize.height) / 2;
		update({
			y: alignment === "top" ? offset : alignment === "bottom" ? -offset : 0,
		});
	};

	const resetTransform = () =>
		update({
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
			maintainAspectRatio: true,
			flipHorizontal: false,
			flipVertical: false,
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
			adjustments: { ...DEFAULT_MEDIA_ADJUSTMENTS },
			mask: { ...DEFAULT_MEDIA_MASK },
			chromaKey: { ...DEFAULT_MEDIA_CHROMA_KEY },
			enhancements: { ...DEFAULT_MEDIA_ENHANCEMENTS },
			audioFadeIn: 0,
			audioFadeOut: 0,
			audioNormalize: false,
			audioDenoise: 0,
			audioPan: 0,
			playbackRate: 1,
			speedKeyframes: [],
			reverse: false,
			freezeFrameTime: undefined,
			freezeFrameDuration: 0,
			keyframes: {},
		});
	const updateAdjustment = (
		property: keyof typeof DEFAULT_MEDIA_ADJUSTMENTS,
		value: number
	) =>
		updateLive({
			adjustments: { ...visual.adjustments, [property]: value },
		});
	const openSegmentation = (prompt: string) => {
		if (mediaItem?.file) {
			const sourceUrl =
				mediaItem.url || createObjectURL(mediaItem.file, "media-properties-ai");
			setSegmentationSource(mediaItem.file, sourceUrl);
			setSegmentationMode("video");
			setSegmentationPrompt(prompt);
		}
		setActiveMediaTab("segmentation");
	};

	const propertyKeyframes = element.keyframes?.[keyframeProperty] ?? [];
	const sourceDuration = getMediaSourceDuration(element);
	const sourceDurationInFrames = Math.max(1, Math.round(sourceDuration * fps));
	const playbackTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: currentTime - element.startTime,
		fps,
	});
	const currentSpeedFrame = Math.min(
		sourceDurationInFrames,
		Math.max(0, Math.round(playbackTiming.sourceTime * fps))
	);
	const speedKeyframes = element.speedKeyframes ?? [];
	const durationInFrames = Math.max(1, Math.round(timelineDuration * fps));
	const currentFrame = Math.min(
		durationInFrames,
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);
	const setPropertyKeyframes = (keyframes: MediaPropertyKeyframe[]) =>
		update({
			keyframes: {
				...element.keyframes,
				[keyframeProperty]: keyframes,
			},
		});
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
	const setSpeedKeyframes = (keyframes: MediaPropertyKeyframe[]) =>
		update({ speedKeyframes: keyframes });
	const addSpeedKeyframe = (frame: number, value: unknown) => {
		const existing = speedKeyframes.find((item) => item.frame === frame);
		setSpeedKeyframes(
			upsertMediaKeyframe({
				keyframes: speedKeyframes,
				keyframe: {
					id:
						existing?.id ??
						(typeof crypto !== "undefined" && "randomUUID" in crypto
							? crypto.randomUUID()
							: `speed-keyframe-${Date.now()}`),
					frame,
					value: Math.min(8, Math.max(0.1, Number(value))),
					easing: existing?.easing ?? "linear",
				},
			})
		);
	};

	return (
		<div className="space-y-4 p-5" data-testid="media-properties">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">{element.name}</p>
					<p className="text-[11px] text-muted-foreground">
						{timelineDuration.toFixed(2)}s
					</p>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={resetAll}>
					<RotateCcw className="mr-2 size-3.5" /> Reset all
				</Button>
			</div>

			<Tabs defaultValue="basic">
				<TabsList className="grid h-auto w-full grid-cols-3 gap-1">
					<TabsTrigger value="basic">Basic</TabsTrigger>
					<TabsTrigger value="crop">Crop</TabsTrigger>
					<TabsTrigger value="perspective">Perspective</TabsTrigger>
					<TabsTrigger value="animation">Animation</TabsTrigger>
					<TabsTrigger value="adjustments">Adjust</TabsTrigger>
					<TabsTrigger value="audio">Audio</TabsTrigger>
					<TabsTrigger value="speed">Speed</TabsTrigger>
					<TabsTrigger value="advanced">Advanced</TabsTrigger>
				</TabsList>

				<TabsContent value="basic" className="mt-4 space-y-4">
					<PropertyGroup title="Position and size" defaultExpanded>
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<PropertyItemLabel>Lock proportions</PropertyItemLabel>
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
								label={visual.maintainAspectRatio ? "Scale" : "Scale X"}
								value={visual.scaleX * 100}
								min={1}
								max={400}
								suffix="%"
								onChange={(value) => setScale("x", value)}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							{visual.maintainAspectRatio ? null : (
								<NumberControl
									label="Scale Y"
									value={visual.scaleY * 100}
									min={1}
									max={400}
									suffix="%"
									onChange={(value) => setScale("y", value)}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							)}
							<NumberControl
								label="X position"
								value={visual.x}
								min={-canvasSize.width}
								max={canvasSize.width}
								onChange={(x) => updateLive({ x })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label="Y position"
								value={visual.y}
								min={-canvasSize.height}
								max={canvasSize.height}
								onChange={(y) => updateLive({ y })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label="Rotation"
								value={visual.rotation}
								min={-180}
								max={180}
								suffix="°"
								onChange={(rotation) => updateLive({ rotation })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>

							<div className="flex items-center justify-between gap-2">
								<div className="flex gap-1">
									<IconButton label="Align left" onClick={() => alignX("left")}>
										<AlignHorizontalJustifyStart className="size-4" />
									</IconButton>
									<IconButton
										label="Center horizontally"
										onClick={() => alignX("center")}
									>
										<AlignHorizontalJustifyCenter className="size-4" />
									</IconButton>
									<IconButton
										label="Align right"
										onClick={() => alignX("right")}
									>
										<AlignHorizontalJustifyEnd className="size-4" />
									</IconButton>
								</div>
								<div className="flex gap-1">
									<IconButton label="Align top" onClick={() => alignY("top")}>
										<AlignVerticalJustifyStart className="size-4" />
									</IconButton>
									<IconButton
										label="Center vertically"
										onClick={() => alignY("center")}
									>
										<AlignVerticalJustifyCenter className="size-4" />
									</IconButton>
									<IconButton
										label="Align bottom"
										onClick={() => alignY("bottom")}
									>
										<AlignVerticalJustifyEnd className="size-4" />
									</IconButton>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<IconButton
									label="Flip horizontally"
									active={visual.flipHorizontal}
									onClick={() =>
										update({ flipHorizontal: !visual.flipHorizontal })
									}
								>
									<FlipHorizontal2 className="size-4" />
								</IconButton>
								<IconButton
									label="Flip vertically"
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
									<RotateCcw className="mr-2 size-3.5" /> Reset transform
								</Button>
							</div>
						</div>
					</PropertyGroup>

					<PropertyGroup title="Compositing" defaultExpanded>
						<div className="space-y-4">
							<NumberControl
								label="Opacity"
								value={visual.opacity * 100}
								min={0}
								max={100}
								suffix="%"
								onChange={(opacity) => updateLive({ opacity: opacity / 100 })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<PropertyItem>
								<PropertyItemLabel>Blend mode</PropertyItemLabel>
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
											aria-label="Blend mode"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[
												"normal",
												"multiply",
												"screen",
												"overlay",
												"darken",
												"lighten",
											].map((mode) => (
												<SelectItem key={mode} value={mode}>
													{mode}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="crop" className="mt-4 space-y-4">
					<PropertyGroup title="Fit and crop" defaultExpanded>
						<div className="space-y-4">
							<div className="grid grid-cols-3 gap-1">
								{(["cover", "contain", "fill"] as const).map((mode) => (
									<Button
										key={mode}
										type="button"
										variant={visual.fitMode === mode ? "default" : "outline"}
										size="sm"
										onClick={() => update({ fitMode: mode })}
									>
										{mode[0].toUpperCase() + mode.slice(1)}
									</Button>
								))}
							</div>
							{(["top", "right", "bottom", "left"] as const).map((side) => (
								<NumberControl
									key={side}
									label={`Crop ${side}`}
									value={visual.crop[side] * 100}
									min={0}
									max={95}
									suffix="%"
									onChange={(value) =>
										updateLive({
											crop: { ...visual.crop, [side]: value / 100 },
										})
									}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => update({ crop: { ...DEFAULT_MEDIA_CROP } })}
							>
								<RotateCcw className="mr-2 size-3.5" /> Reset crop
							</Button>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="perspective" className="mt-4 space-y-4">
					<PropertyGroup title="Corner pin" defaultExpanded>
						<div className="space-y-3">
							{PERSPECTIVE_FIELDS.map((field) => (
								<div key={field.label} className="space-y-1">
									<p className="text-[11px] text-muted-foreground">
										{field.label}
									</p>
									<div className="grid grid-cols-2 gap-2">
										{([field.x, field.y] as const).map((key, index) => (
											<div key={key} className="flex items-center gap-1">
												<span className="w-3 text-[10px] text-muted-foreground">
													{index === 0 ? "X" : "Y"}
												</span>
												<Input
													type="number"
													aria-label={`${field.label} ${index === 0 ? "X" : "Y"} value`}
													value={Math.round(visual.perspective[key] * 100)}
													min={0}
													max={100}
													onFocus={beginInteraction}
													onBlur={endInteraction}
													onChange={(event) => {
														const value = Number(event.target.value);
														if (!Number.isFinite(value)) return;
														updateLive({
															perspective: {
																...visual.perspective,
																[key]: value / 100,
															},
														});
													}}
													className="h-8 text-xs"
												/>
											</div>
										))}
									</div>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									update({ perspective: { ...DEFAULT_MEDIA_PERSPECTIVE } })
								}
							>
								<RotateCcw className="mr-2 size-3.5" /> Reset perspective
							</Button>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="animation" className="mt-4 space-y-4">
					<PropertyGroup title="Clip animation" defaultExpanded>
						<div className="space-y-4">
							{(
								[
									["In", "animationInType", "animationInDuration"],
									["Out", "animationOutType", "animationOutDuration"],
								] as const
							).map(([label, typeKey, durationKey]) => (
								<div key={label} className="space-y-3">
									<PropertyItem>
										<PropertyItemLabel>{label} animation</PropertyItemLabel>
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
													{[
														["none", "None"],
														["fade", "Fade"],
														["slide-left", "Slide left"],
														["slide-right", "Slide right"],
														["slide-up", "Slide up"],
														["slide-down", "Slide down"],
														["zoom-in", "Zoom in"],
														["zoom-out", "Zoom out"],
													].map(([value, optionLabel]) => (
														<SelectItem key={value} value={value}>
															{optionLabel}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</PropertyItemValue>
									</PropertyItem>
									{visual[typeKey] === "none" ? null : (
										<NumberControl
											label={`${label} duration`}
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

					<PropertyGroup title="Combination" defaultExpanded>
						<div className="space-y-4">
							<PropertyItem>
								<PropertyItemLabel>Motion</PropertyItemLabel>
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
											<SelectItem value="none">None</SelectItem>
											<SelectItem value="pulse">Pulse</SelectItem>
											<SelectItem value="drift">Drift</SelectItem>
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
							{visual.comboAnimationType === "none" ? null : (
								<NumberControl
									label="Intensity"
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

				<TabsContent value="adjustments" className="mt-4 space-y-4">
					<PropertyGroup title="Color adjustments" defaultExpanded>
						<div className="space-y-4">
							{(
								[
									["brightness", "Brightness", -100, 100],
									["contrast", "Contrast", -100, 100],
									["saturation", "Saturation", -100, 100],
									["temperature", "Temperature", -100, 100],
									["tint", "Tint", -100, 100],
									["sharpness", "Sharpness", 0, 100],
									["fade", "Fade", 0, 100],
									["vignette", "Vignette", 0, 100],
								] as const
							).map(([property, label, min, max]) => (
								<NumberControl
									key={property}
									label={label}
									value={visual.adjustments[property]}
									min={min}
									max={max}
									onChange={(value) => updateAdjustment(property, value)}
									onInteractionStart={beginInteraction}
									onInteractionEnd={endInteraction}
								/>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									update({ adjustments: { ...DEFAULT_MEDIA_ADJUSTMENTS } })
								}
							>
								<RotateCcw className="mr-2 size-3.5" /> Reset adjustments
							</Button>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="audio" className="mt-4 space-y-4">
					<VolumeControl element={element} trackId={trackId} />
					<PropertyGroup title="Audio processing" defaultExpanded>
						<div className="space-y-4">
							<NumberControl
								label="Fade in"
								value={element.audioFadeIn ?? 0}
								min={0}
								max={Math.max(
									0.1,
									(element.duration - element.trimStart - element.trimEnd) / 2
								)}
								step={0.1}
								suffix="s"
								onChange={(audioFadeIn) => updateLive({ audioFadeIn })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label="Fade out"
								value={element.audioFadeOut ?? 0}
								min={0}
								max={Math.max(
									0.1,
									(element.duration - element.trimStart - element.trimEnd) / 2
								)}
								step={0.1}
								suffix="s"
								onChange={(audioFadeOut) => updateLive({ audioFadeOut })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>Normalize loudness</PropertyItemLabel>
								<Switch
									checked={element.audioNormalize ?? false}
									onCheckedChange={(audioNormalize) =>
										update({ audioNormalize })
									}
								/>
							</div>
							<NumberControl
								label="Noise reduction"
								value={element.audioDenoise ?? 0}
								min={0}
								max={100}
								suffix="%"
								onChange={(audioDenoise) => updateLive({ audioDenoise })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<NumberControl
								label="Balance"
								value={(element.audioPan ?? 0) * 100}
								min={-100}
								max={100}
								suffix="%"
								onChange={(value) => updateLive({ audioPan: value / 100 })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									update({
										audioFadeIn: 0,
										audioFadeOut: 0,
										audioNormalize: false,
										audioDenoise: 0,
										audioPan: 0,
									})
								}
							>
								<RotateCcw className="mr-2 size-3.5" /> Reset audio
							</Button>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="speed" className="mt-4 space-y-4">
					<PropertyGroup title="Playback" defaultExpanded>
						<div className="space-y-4">
							<NumberControl
								label="Speed"
								value={element.playbackRate ?? 1}
								min={0.1}
								max={8}
								step={0.1}
								suffix="x"
								onChange={(playbackRate) => updateLive({ playbackRate })}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>Reverse</PropertyItemLabel>
								<Switch
									checked={element.reverse ?? false}
									onCheckedChange={(reverse) => update({ reverse })}
								/>
							</div>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>Freeze frame</PropertyItemLabel>
								<Switch
									checked={(element.freezeFrameDuration ?? 0) > 0}
									onCheckedChange={(checked) =>
										update(
											checked
												? {
														freezeFrameTime: playbackTiming.sourceTime,
														freezeFrameDuration: 1,
													}
												: { freezeFrameDuration: 0 }
										)
									}
								/>
							</div>
							{(element.freezeFrameDuration ?? 0) > 0 ? (
								<>
									<NumberControl
										label="Freeze at"
										value={element.freezeFrameTime ?? 0}
										min={0}
										max={Math.max(0.1, sourceDuration)}
										step={0.1}
										suffix="s"
										onChange={(freezeFrameTime) =>
											updateLive({ freezeFrameTime })
										}
										onInteractionStart={beginInteraction}
										onInteractionEnd={endInteraction}
									/>
									<NumberControl
										label="Freeze duration"
										value={element.freezeFrameDuration ?? 0}
										min={0.1}
										max={10}
										step={0.1}
										suffix="s"
										onChange={(freezeFrameDuration) =>
											updateLive({ freezeFrameDuration })
										}
										onInteractionStart={beginInteraction}
										onInteractionEnd={endInteraction}
									/>
								</>
							) : null}
						</div>
					</PropertyGroup>

					<PropertyGroup title="Speed curve" defaultExpanded>
						<KeyframeEditor
							propName="playbackRate"
							propLabel="Speed"
							propType="number"
							keyframes={speedKeyframes as Keyframe[]}
							durationInFrames={sourceDurationInFrames}
							fps={fps}
							currentFrame={currentSpeedFrame}
							currentValueWhenEmpty={resolveSpeedAtSourceTime({
								baseRate: element.playbackRate ?? 1,
								keyframes: speedKeyframes,
								sourceTime: playbackTiming.sourceTime,
								fps,
							})}
							onKeyframeAdd={addSpeedKeyframe}
							onKeyframeUpdate={(id, frame, value, easing = "linear") =>
								setSpeedKeyframes(
									upsertMediaKeyframe({
										keyframes: speedKeyframes,
										keyframe: {
											id,
											frame,
											value: Math.min(8, Math.max(0.1, Number(value))),
											easing,
										},
									})
								)
							}
							onKeyframeDelete={(id) =>
								setSpeedKeyframes(
									speedKeyframes.filter((item) => item.id !== id)
								)
							}
						/>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="advanced" className="mt-4 space-y-4">
					<PropertyGroup title="Mask" defaultExpanded>
						<div className="space-y-4">
							<PropertyItem>
								<PropertyItemLabel>Shape</PropertyItemLabel>
								<PropertyItemValue>
									<Select
										value={visual.mask.type}
										onValueChange={(type) =>
											update({
												mask: {
													...visual.mask,
													type: type as MediaMaskType,
												},
											})
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">None</SelectItem>
											<SelectItem value="rectangle">Rectangle</SelectItem>
											<SelectItem value="ellipse">Ellipse</SelectItem>
											<SelectItem value="linear">Linear</SelectItem>
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
							{visual.mask.type === "none" ? null : (
								<>
									{visual.mask.type === "linear"
										? null
										: (
												[
													["centerX", "Center X"],
													["centerY", "Center Y"],
													["width", "Width"],
													["height", "Height"],
												] as const
											).map(([property, label]) => (
												<NumberControl
													key={property}
													label={label}
													value={visual.mask[property] * 100}
													min={property.startsWith("center") ? 0 : 1}
													max={100}
													suffix="%"
													onChange={(value) =>
														updateLive({
															mask: {
																...visual.mask,
																[property]: value / 100,
															},
														})
													}
													onInteractionStart={beginInteraction}
													onInteractionEnd={endInteraction}
												/>
											))}
									<NumberControl
										label="Rotation"
										value={visual.mask.rotation}
										min={-180}
										max={180}
										suffix="°"
										onChange={(rotation) =>
											updateLive({ mask: { ...visual.mask, rotation } })
										}
										onInteractionStart={beginInteraction}
										onInteractionEnd={endInteraction}
									/>
									<NumberControl
										label="Feather"
										value={visual.mask.feather * 100}
										min={0}
										max={50}
										suffix="%"
										onChange={(value) =>
											updateLive({
												mask: { ...visual.mask, feather: value / 100 },
											})
										}
										onInteractionStart={beginInteraction}
										onInteractionEnd={endInteraction}
									/>
									<div className="flex items-center justify-between gap-3">
										<PropertyItemLabel>Invert</PropertyItemLabel>
										<Switch
											checked={visual.mask.invert}
											onCheckedChange={(invert) =>
												update({ mask: { ...visual.mask, invert } })
											}
										/>
									</div>
								</>
							)}
						</div>
					</PropertyGroup>

					<PropertyGroup title="Chroma key" defaultExpanded>
						<div className="space-y-4">
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>Enable</PropertyItemLabel>
								<Switch
									checked={visual.chromaKey.enabled}
									onCheckedChange={(enabled) =>
										update({
											chromaKey: { ...visual.chromaKey, enabled },
										})
									}
								/>
							</div>
							{visual.chromaKey.enabled ? (
								<>
									<Input
										type="color"
										aria-label="Chroma key color"
										value={visual.chromaKey.color}
										onChange={(event) =>
											update({
												chromaKey: {
													...visual.chromaKey,
													color: event.target.value,
												},
											})
										}
										className="h-8 w-14 p-1"
									/>
									{(
										[
											["similarity", "Similarity"],
											["blend", "Edge blend"],
										] as const
									).map(([property, label]) => (
										<NumberControl
											key={property}
											label={label}
											value={visual.chromaKey[property] * 100}
											min={property === "similarity" ? 1 : 0}
											max={100}
											suffix="%"
											onChange={(value) =>
												updateLive({
													chromaKey: {
														...visual.chromaKey,
														[property]: value / 100,
													},
												})
											}
											onInteractionStart={beginInteraction}
											onInteractionEnd={endInteraction}
										/>
									))}
								</>
							) : null}
						</div>
					</PropertyGroup>

					<PropertyGroup title="Enhance" defaultExpanded>
						<div className="space-y-4">
							{(
								[
									["stabilization", "Stabilization", 0, 100],
									["denoise", "Video denoise", 0, 100],
									["clarity", "Clarity", 0, 100],
									["relight", "Relight", -100, 100],
									["beauty", "Beauty", 0, 100],
								] as const
							).map(([property, label, min, max]) => (
								<NumberControl
									key={property}
									label={label}
									value={visual.enhancements[property]}
									min={min}
									max={max}
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
								<PropertyItemLabel>Local upscale</PropertyItemLabel>
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
											<SelectItem value="1">Off</SelectItem>
											<SelectItem value="2">2x</SelectItem>
											<SelectItem value="4">4x</SelectItem>
										</SelectContent>
									</Select>
								</PropertyItemValue>
							</PropertyItem>
						</div>
					</PropertyGroup>

					<PropertyGroup title="AI processing" defaultExpanded>
						<div className="grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => openSegmentation("person")}
							>
								Auto cutout
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => openSegmentation("")}
							>
								Object tracking
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setActiveMediaTab("upscale")}
							>
								AI upscale
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setActiveMediaTab("ai")}
							>
								AI reshape
							</Button>
						</div>
					</PropertyGroup>
				</TabsContent>
			</Tabs>

			<PropertyGroup title="Keyframes" defaultExpanded={false}>
				<div className="space-y-4">
					<PropertyItem>
						<PropertyItemLabel>Property</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={keyframeProperty}
								onValueChange={(value) =>
									setKeyframeProperty(value as MediaKeyframeProperty)
								}
							>
								<SelectTrigger
									className="h-8 text-xs"
									aria-label="Keyframe property"
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
		</div>
	);
}
