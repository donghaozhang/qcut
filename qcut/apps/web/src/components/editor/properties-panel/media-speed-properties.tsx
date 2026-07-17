import { useRef } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EasingType, Keyframe } from "@/lib/remotion/keyframe-converter";
import { generateUUID } from "@/lib/utils";
import { upsertMediaKeyframe } from "@/lib/video/video-properties";
import {
	clampPlaybackRate,
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
	resolveSpeedAtSourceTime,
} from "@/lib/video/video-timing";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";
import { KeyframeEditor } from "./keyframe-editor";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { useTranslation } from "@/lib/i18n";

const SPEED_PRESETS = [0.5, 1, 1.5, 2] as const;

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
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
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const interactionActive = useRef(false);

	const speedKeyframes = element.speedKeyframes ?? [];
	const speedMode = speedKeyframes.length > 0 ? "curve" : "normal";
	const sourceDuration = getMediaSourceDuration(element);
	const timelineDuration = getMediaTimelineDuration(element, fps);
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

	const update = (updates: MediaUpdates, history = true) =>
		updateMediaElement(trackId, element.id, updates, history);
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
	const setSpeedKeyframes = (keyframes: MediaPropertyKeyframe[]) =>
		update({ speedKeyframes: keyframes });
	const addSpeedKeyframe = (frame: number, value: unknown) => {
		const existing = speedKeyframes.find((item) => item.frame === frame);
		setSpeedKeyframes(
			upsertMediaKeyframe({
				keyframes: speedKeyframes,
				keyframe: {
					id: existing?.id ?? generateUUID(),
					frame,
					value: clampPlaybackRate(Number(value)),
					easing: existing?.easing ?? "linear",
				},
			})
		);
	};
	const updateSpeedKeyframe = (
		id: string,
		frame: number,
		value: unknown,
		easing: EasingType = "linear"
	) =>
		setSpeedKeyframes(
			upsertMediaKeyframe({
				keyframes: speedKeyframes,
				keyframe: {
					id,
					frame,
					value: clampPlaybackRate(Number(value)),
					easing,
				},
			})
		);
	const changeSpeedMode = (mode: string) => {
		if (mode === speedMode) return;
		if (mode === "normal") {
			update({ speedKeyframes: [] });
			return;
		}
		update({ speedKeyframes: createFlatSpeedCurve({ element, fps }) });
	};

	return (
		<div className="space-y-4" data-testid="media-speed-properties">
			<Tabs value={speedMode} onValueChange={changeSpeedMode}>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="normal" data-testid="speed-mode-normal">
						{t("audioProperties.speed.normal")}
					</TabsTrigger>
					<TabsTrigger value="curve" data-testid="speed-mode-curve">
						{t("audioProperties.speed.curve")}
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
								max={8}
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
								<output
									className="text-xs tabular-nums text-muted-foreground"
									data-testid="speed-output-duration"
								>
									{formatDuration({ seconds: timelineDuration })}
								</output>
							</PropertyItem>
						</div>
					</PropertyGroup>
				</TabsContent>

				<TabsContent value="curve" className="mt-4">
					<PropertyGroup
						title={t("audioProperties.speed.curve")}
						defaultExpanded
					>
						<KeyframeEditor
							propName="playbackRate"
							propLabel={t("audioProperties.speed.curveLabel")}
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
							onKeyframeUpdate={updateSpeedKeyframe}
							onKeyframeDelete={(id) =>
								setSpeedKeyframes(
									speedKeyframes.filter((item) => item.id !== id)
								)
							}
						/>
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
								{t("audioProperties.speed.preservePitch")}
							</PropertyItemLabel>
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<Check className="size-3.5 text-primary" />
								{t("audioProperties.speed.enabled")}
							</span>
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
