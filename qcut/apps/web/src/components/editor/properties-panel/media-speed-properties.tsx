import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateUUID } from "@/lib/utils";
import {
	clampPlaybackRate,
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";
import { SpeedCurveEditor } from "./speed-curve-editor";
import { SpeedCurvePresetCard } from "./speed-curve-preset-card";
import {
	createSpeedPresetKeyframes,
	getSpeedCurvePreset,
	identifySpeedCurvePreset,
	SPEED_CURVE_PRESETS,
	SPEED_POINT_PRESETS,
	type SpeedCurveSelectionId,
	type SpeedPointPreset,
} from "@/lib/video/speed-presets";
import { MAX_PLAYBACK_RATE } from "@/lib/video/video-speed-constants";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { useTranslation } from "@/lib/i18n";
import { getEffectPresetById } from "@/lib/effects/effect-catalog";

const SPEED_PRESETS = [0.5, 1, 1.5, 2] as const;

function formatDurationDraft({ duration }: { duration: number }): string {
	return String(Number(duration.toFixed(2)));
}

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaTiming"]
>[2];

interface SpeedNumberControlProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix: string;
	onChange: (value: number) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}

function SpeedNumberControl({
	label,
	value,
	min,
	max,
	step,
	suffix,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: SpeedNumberControlProps) {
	const { t } = useTranslation();
	return (
		<PropertyItem direction="column">
			<div className="flex items-center justify-between gap-3">
				<PropertyItemLabel>{label}</PropertyItemLabel>
				<div className="flex items-center gap-1">
					<Input
						type="number"
						aria-label={t("audioProperties.control.value", { name: label })}
						value={Number(value.toFixed(2))}
						min={min}
						max={max}
						step={step}
						onFocus={onInteractionStart}
						onBlur={onInteractionEnd}
						onChange={(event) => {
							const nextValue = Number(event.target.value);
							if (Number.isFinite(nextValue)) onChange(nextValue);
						}}
						className="h-8 w-24 text-right text-xs"
					/>
					<span className="w-4 text-[10px] text-muted-foreground">
						{suffix}
					</span>
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
						onValueChange={([nextValue]) => onChange(nextValue)}
					/>
				</div>
			</PropertyItemValue>
		</PropertyItem>
	);
}

function formatDuration({ seconds }: { seconds: number }): string {
	const safeSeconds = Math.max(0, seconds);
	if (safeSeconds < 60) return `${safeSeconds.toFixed(1)}s`;
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = (safeSeconds % 60).toFixed(1).padStart(4, "0");
	return `${minutes}:${remainingSeconds}`;
}

function createFlatSpeedCurve({
	element,
	fps,
}: {
	element: MediaElement;
	fps: number;
}): MediaPropertyKeyframe[] {
	const playbackRate = clampPlaybackRate(element.playbackRate);
	const endFrame = Math.max(
		1,
		Math.round(getMediaSourceDuration(element) * fps)
	);
	return [
		{
			id: generateUUID(),
			frame: 0,
			value: playbackRate,
			easing: "linear",
		},
		{
			id: generateUUID(),
			frame: endFrame,
			value: playbackRate,
			easing: "linear",
		},
	];
}

export function MediaSpeedProperties({
	element,
	trackId,
	mediaKind = "video",
}: {
	element: MediaElement;
	trackId: string;
	mediaKind?: "audio" | "video";
}) {
	const { t } = useTranslation();
	const updateMediaTiming = useTimelineStore(
		(state) => state.updateMediaTiming
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const interactionActive = useRef(false);

	const speedKeyframes = element.speedKeyframes ?? [];
	const sourceDuration = getMediaSourceDuration(element);
	const timelineDuration = getMediaTimelineDuration(element, fps);
	const sourceDurationInFrames = Math.max(1, Math.round(sourceDuration * fps));
	const [speedMode, setSpeedMode] = useState<"normal" | "curve" | "beat">(
		speedKeyframes.length > 0 ? "curve" : "normal"
	);
	const [curveSelection, setCurveSelection] = useState<SpeedCurveSelectionId>(
		() =>
			identifySpeedCurvePreset({
				keyframes: speedKeyframes,
				durationInFrames: sourceDurationInFrames,
			})
	);
	const [durationDraft, setDurationDraft] = useState(() =>
		formatDurationDraft({ duration: timelineDuration })
	);
	const playbackTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: currentTime - element.startTime,
		fps,
	});

	const update = (updates: MediaUpdates, history = true) =>
		updateMediaTiming(trackId, element.id, updates, history);
	const updateLive = (updates: MediaUpdates) => update(updates, false);
	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const setPlaybackRate = (value: number, history = false) => {
		const playbackRate = clampPlaybackRate(value);
		update({ playbackRate }, history);
	};
	const setSpeedKeyframes = (
		keyframes: MediaPropertyKeyframe[],
		history = true
	) => update({ speedKeyframes: keyframes }, history);
	const changeSpeedMode = (mode: string) => {
		if (mode === speedMode) return;
		if (mode === "beat") {
			setSpeedMode("beat");
			return;
		}
		if (mode === "normal") {
			setSpeedMode("normal");
			update({ speedKeyframes: [] });
			return;
		}
		setSpeedMode("curve");
		if (speedKeyframes.length > 0) {
			setCurveSelection(
				identifySpeedCurvePreset({
					keyframes: speedKeyframes,
					durationInFrames: sourceDurationInFrames,
				})
			);
			return;
		}
		setCurveSelection("custom");
		update({ speedKeyframes: createFlatSpeedCurve({ element, fps }) });
	};
	const applyCurvePreset = (
		presetId: (typeof SPEED_CURVE_PRESETS)[number]["id"]
	) => {
		setSpeedMode("curve");
		setCurveSelection(presetId);
		setSpeedKeyframes(
			createSpeedPresetKeyframes({
				preset: getSpeedCurvePreset({ id: presetId }),
				durationInFrames: sourceDurationInFrames,
			})
		);
	};
	const selectCurveKind = (selection: "custom" | "none") => {
		setSpeedMode("curve");
		setCurveSelection(selection);
		if (selection === "none") {
			setSpeedKeyframes([]);
			return;
		}
		if (speedKeyframes.length === 0) {
			setSpeedKeyframes(createFlatSpeedCurve({ element, fps }));
		}
	};
	const updateCustomCurve = (keyframes: MediaPropertyKeyframe[]) => {
		setCurveSelection("custom");
		setSpeedKeyframes(keyframes, false);
	};
	const resetCurve = () => {
		if (curveSelection === "none") {
			setSpeedKeyframes([]);
			return;
		}
		if (curveSelection === "custom") {
			setSpeedKeyframes(createFlatSpeedCurve({ element, fps }));
			return;
		}
		applyCurvePreset(curveSelection);
	};
	const applySpeedPointPreset = (preset: SpeedPointPreset) => {
		pushHistory();
		updateMediaTiming(
			trackId,
			element.id,
			{
				speedKeyframes: createSpeedPresetKeyframes({
					preset: getSpeedCurvePreset({ id: preset.curvePresetId }),
					durationInFrames: sourceDurationInFrames,
				}),
			},
			false
		);
		const effectsStore = useEffectsStore.getState();
		const appliedPresetIds = new Set(
			effectsStore
				.getElementEffects(element.id)
				.flatMap((effect) => (effect.presetId ? [effect.presetId] : []))
		);
		for (const presetId of preset.effectIds) {
			if (appliedPresetIds.has(presetId)) continue;
			const effectPreset = getEffectPresetById({ presetId });
			if (!effectPreset) continue;
			effectsStore.applyEffect(element.id, effectPreset);
		}
	};
	const setTargetDuration = (targetDuration: number) => {
		const freezeDuration = Math.max(0, element.freezeFrameDuration ?? 0);
		const speedDuration = Math.max(0.05, targetDuration - freezeDuration);
		setPlaybackRate(sourceDuration / speedDuration);
	};
	const commitTargetDuration = () => {
		const duration = Number(durationDraft);
		if (!Number.isFinite(duration) || duration <= 0) {
			setDurationDraft(formatDurationDraft({ duration: timelineDuration }));
			return;
		}
		setTargetDuration(duration);
	};

	useEffect(() => {
		setDurationDraft(formatDurationDraft({ duration: timelineDuration }));
	}, [timelineDuration]);

	useEffect(() => {
		setCurveSelection(
			identifySpeedCurvePreset({
				keyframes: element.speedKeyframes ?? [],
				durationInFrames: sourceDurationInFrames,
			})
		);
	}, [element.speedKeyframes, sourceDurationInFrames]);

	return (
		<div className="space-y-4" data-testid="media-speed-properties">
			<Tabs value={speedMode} onValueChange={changeSpeedMode}>
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="normal" data-testid="speed-mode-normal">
						{t("audioProperties.speed.normal")}
					</TabsTrigger>
					<TabsTrigger value="curve" data-testid="speed-mode-curve">
						{t("audioProperties.speed.curve")}
					</TabsTrigger>
					<TabsTrigger value="beat" data-testid="speed-mode-beat">
						{t("audioProperties.speed.beat")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="normal" className="mt-4">
					<PropertyGroup
						title={t("audioProperties.speed.normal")}
						defaultExpanded
					>
						<div className="space-y-4">
							<SpeedNumberControl
								label={t("audioProperties.speed.rate")}
								value={clampPlaybackRate(element.playbackRate)}
								min={0.1}
								max={MAX_PLAYBACK_RATE}
								step={0.05}
								suffix="x"
								onChange={(value) => setPlaybackRate(value)}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
							/>
							<div className="grid grid-cols-4 gap-1">
								{SPEED_PRESETS.map((preset) => (
									<Button
										key={preset}
										type="button"
										variant={
											clampPlaybackRate(element.playbackRate) === preset
												? "default"
												: "outline"
										}
										size="sm"
										onClick={() => setPlaybackRate(preset, true)}
									>
										{preset}x
									</Button>
								))}
							</div>
							<PropertyItem>
								<PropertyItemLabel>
									{t("audioProperties.speed.duration")}
								</PropertyItemLabel>
								<div className="flex items-center gap-1">
									<Input
										type="number"
										min={0.1}
										step={0.1}
										value={durationDraft}
										aria-label={t("audioProperties.speed.duration")}
										onChange={(event) => setDurationDraft(event.target.value)}
										onBlur={commitTargetDuration}
										onKeyDown={(event) => {
											if (event.key !== "Enter") return;
											event.preventDefault();
											commitTargetDuration();
										}}
										className="h-8 w-24 text-right text-xs tabular-nums"
										data-testid="speed-target-duration"
									/>
									<span className="text-[10px] text-muted-foreground">s</span>
								</div>
								<output className="sr-only" data-testid="speed-output-duration">
									{formatDuration({ seconds: timelineDuration })}
								</output>
							</PropertyItem>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="curve" className="mt-4">
					<div className="space-y-3">
						<div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<SpeedCurvePresetCard
								id="none"
								label={t("audioProperties.speed.preset.none")}
								kind="none"
								durationInFrames={sourceDurationInFrames}
								selected={curveSelection === "none"}
								onSelect={() => selectCurveKind("none")}
							/>
							<SpeedCurvePresetCard
								id="custom"
								label={t("audioProperties.speed.preset.custom")}
								kind="custom"
								durationInFrames={sourceDurationInFrames}
								selected={curveSelection === "custom"}
								onSelect={() => selectCurveKind("custom")}
							/>
							{SPEED_CURVE_PRESETS.map((preset) => (
								<SpeedCurvePresetCard
									key={preset.id}
									id={preset.id}
									label={t(preset.nameKey)}
									kind="curve"
									keyframes={createSpeedPresetKeyframes({
										preset,
										durationInFrames: sourceDurationInFrames,
									})}
									durationInFrames={sourceDurationInFrames}
									selected={curveSelection === preset.id}
									onSelect={() => applyCurvePreset(preset.id)}
								/>
							))}
						</div>
						{curveSelection !== "none" ? (
							<SpeedCurveEditor
								keyframes={speedKeyframes}
								durationInFrames={sourceDurationInFrames}
								sourceDurationLabel={formatDuration({
									seconds: sourceDuration,
								})}
								timelineDurationLabel={formatDuration({
									seconds: timelineDuration,
								})}
								durationLabel={t("audioProperties.speed.duration")}
								resetLabel={t("audioProperties.speed.reset")}
								onChange={updateCustomCurve}
								onInteractionStart={beginInteraction}
								onInteractionEnd={endInteraction}
								onReset={resetCurve}
							/>
						) : null}
					</div>
				</TabsContent>

				<TabsContent value="beat" className="mt-4">
					<PropertyGroup
						title={t("audioProperties.speed.beat")}
						defaultExpanded
					>
						<div className="grid grid-cols-2 gap-2">
							{SPEED_POINT_PRESETS.map((preset) => (
								<Button
									key={preset.id}
									type="button"
									variant="outline"
									className="h-16 flex-col gap-1 px-2 text-xs"
									data-testid={`speed-point-preset-${preset.id}`}
									onClick={() => applySpeedPointPreset(preset)}
								>
									<Sparkles className="size-4 text-primary" />
									<span className="line-clamp-2 text-center">
										{t(preset.nameKey)}
									</span>
								</Button>
							))}
						</div>
					</PropertyGroup>
				</TabsContent>
			</Tabs>

			<PropertyGroup
				title={t("audioProperties.speed.timeProcessing")}
				defaultExpanded
			>
				<div className="space-y-4">
					{mediaKind === "audio" ? (
						<div
							className="flex items-center justify-between gap-3"
							data-testid="audio-speed-preserve-pitch"
						>
							<PropertyItemLabel>
								{t("audioProperties.speed.pitchShift")}
							</PropertyItemLabel>
							<Switch
								aria-label={t("audioProperties.speed.pitchShift")}
								data-testid="speed-pitch-shift"
								checked={element.preservePitch === false}
								onCheckedChange={(pitchShift) =>
									update({ preservePitch: !pitchShift })
								}
							/>
						</div>
					) : null}
					{mediaKind === "video" ? (
						<div className="flex items-center justify-between gap-3">
							<PropertyItemLabel>
								{t("audioProperties.speed.frameInterpolation")}
							</PropertyItemLabel>
							<Switch
								aria-label={t("audioProperties.speed.frameInterpolation")}
								data-testid="speed-frame-interpolation"
								checked={element.frameInterpolation === "motion-compensated"}
								onCheckedChange={(enabled) =>
									update({
										frameInterpolation: enabled ? "motion-compensated" : "none",
									})
								}
							/>
						</div>
					) : null}
					<div className="flex items-center justify-between gap-3">
						<PropertyItemLabel>
							{t("audioProperties.speed.reverse")}
						</PropertyItemLabel>
						<Switch
							aria-label={t("audioProperties.speed.reverse")}
							checked={element.reverse ?? false}
							onCheckedChange={(reverse) => update({ reverse })}
						/>
					</div>
					{mediaKind === "video" ? (
						<>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>
									{t("audioProperties.speed.freeze")}
								</PropertyItemLabel>
								<Switch
									aria-label={t("audioProperties.speed.freeze")}
									checked={(element.freezeFrameDuration ?? 0) > 0}
									onCheckedChange={(checked) =>
										update(
											checked
												? {
														freezeFrameTime: element.reverse
															? sourceDuration - playbackTiming.sourceTime
															: playbackTiming.sourceTime,
														freezeFrameDuration: 1,
													}
												: { freezeFrameDuration: 0 }
										)
									}
								/>
							</div>
							{(element.freezeFrameDuration ?? 0) > 0 ? (
								<>
									<SpeedNumberControl
										label={t("audioProperties.speed.freezePosition")}
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
									<SpeedNumberControl
										label={t("audioProperties.speed.freezeDuration")}
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
						</>
					) : null}
				</div>
			</PropertyGroup>
		</div>
	);
}
