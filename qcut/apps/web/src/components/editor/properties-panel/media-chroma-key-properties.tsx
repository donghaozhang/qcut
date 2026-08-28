import { ChevronDown, Pipette } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { requestPreviewColor } from "@/stores/editor/color-picker-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	MediaChromaKey,
	MediaChromaKeyKeyframeProperty,
	MediaElement,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import { generateUUID } from "@/types/timeline";
import {
	DEFAULT_MEDIA_CHROMA_KEY,
	MEDIA_CHROMA_KEY_KEYFRAME_PROPERTIES,
	normalizeMediaChromaKey,
	pickedPreviewColorToHex,
	resolveMediaChromaKeyAtTime,
	upsertMediaChromaKeyframe,
} from "@/lib/video/media-chroma-key";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import {
	ColorIconButton,
	ColorModuleSection,
	ColorNumberControl,
} from "./color-property-controls";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

function keyframeFrames({
	settings,
	property,
}: {
	settings: MediaChromaKey;
	property: MediaChromaKeyKeyframeProperty;
}): number[] {
	return (settings.keyframes?.[property] ?? [])
		.map((keyframe) => keyframe.frame)
		.sort((left, right) => left - right);
}

export function MediaChromaKeyProperties({
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
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const seek = usePlaybackStore((state) => state.seek);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const interactionActive = useRef(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const settings = normalizeMediaChromaKey(element.chromaKey);
	const resolved = resolveMediaChromaKeyAtTime({
		chromaKey: settings,
		currentTime,
		elementStartTime: element.startTime,
		fps,
	});
	const durationInFrames = Math.max(
		1,
		Math.round(getMediaTimelineDuration(element, fps) * fps)
	);
	const currentFrame = Math.min(
		durationInFrames,
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);

	const persist = ({
		next,
		history = !interactionActive.current,
	}: {
		next: MediaChromaKey;
		history?: boolean;
	}) => {
		const updates: MediaUpdates = { chromaKey: next };
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
	const updateProperty = ({
		property,
		value,
	}: {
		property: MediaChromaKeyKeyframeProperty;
		value: number;
	}) => {
		const keyframes = settings.keyframes?.[property] ?? [];
		if (keyframes.length === 0) {
			persist({ next: { ...settings, [property]: value } });
			return;
		}
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		persist({
			next: {
				...settings,
				keyframes: {
					...settings.keyframes,
					[property]: upsertMediaChromaKeyframe({
						keyframes,
						keyframe: {
							id: existing?.id ?? `chroma-keyframe-${generateUUID()}`,
							frame: currentFrame,
							value,
							easing: existing?.easing ?? "linear",
						},
					}),
				},
			},
		});
	};
	const toggleKeyframe = ({
		property,
	}: {
		property: MediaChromaKeyKeyframeProperty;
	}) => {
		const keyframes = settings.keyframes?.[property] ?? [];
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const nextKeyframes: MediaPropertyKeyframe[] = existing
			? keyframes.filter((keyframe) => keyframe.id !== existing.id)
			: upsertMediaChromaKeyframe({
					keyframes,
					keyframe: {
						id: `chroma-keyframe-${generateUUID()}`,
						frame: currentFrame,
						value: resolved[property],
						easing: "linear",
					},
				});
		persist({
			next: {
				...settings,
				keyframes: {
					...settings.keyframes,
					[property]: nextKeyframes,
				},
			},
		});
	};
	const pickColor = async () => {
		toast.message("请在预览画面中点击要抠除的颜色");
		const color = await requestPreviewColor();
		if (!color) return;
		persist({
			next: {
				...settings,
				color: pickedPreviewColorToHex({ color }),
			},
		});
	};
	const renderControl = ({
		property,
		label,
		withKeyframes,
	}: {
		property: MediaChromaKeyKeyframeProperty;
		label: string;
		withKeyframes: boolean;
	}) => {
		const frames = keyframeFrames({ settings, property });
		const previousFrame = [...frames]
			.reverse()
			.find((frame) => frame < currentFrame);
		const nextFrame = frames.find((frame) => frame > currentFrame);
		return (
			<ColorNumberControl
				key={property}
				label={label}
				value={resolved[property] * 100}
				min={property === "similarity" ? 1 : 0}
				max={100}
				step={1}
				suffix="%"
				keyframedHere={withKeyframes && frames.includes(currentFrame)}
				hasPreviousKeyframe={withKeyframes && previousFrame !== undefined}
				hasNextKeyframe={withKeyframes && nextFrame !== undefined}
				onChange={(value) => updateProperty({ property, value: value / 100 })}
				onToggleKeyframe={
					withKeyframes ? () => toggleKeyframe({ property }) : undefined
				}
				onPreviousKeyframe={
					withKeyframes
						? () => {
								if (previousFrame !== undefined) {
									seek(element.startTime + previousFrame / fps);
								}
							}
						: undefined
				}
				onNextKeyframe={
					withKeyframes
						? () => {
								if (nextFrame !== undefined) {
									seek(element.startTime + nextFrame / fps);
								}
							}
						: undefined
				}
				onInteractionStart={beginInteraction}
				onInteractionEnd={endInteraction}
			/>
		);
	};
	const basicProperties = MEDIA_CHROMA_KEY_KEYFRAME_PROPERTIES.filter(
		({ value }) => value !== "spill"
	);

	return (
		<ColorModuleSection
			title="色度抠像"
			enabled={settings.enabled}
			onEnabledChange={(enabled) => persist({ next: { ...settings, enabled } })}
			onReset={() => persist({ next: { ...DEFAULT_MEDIA_CHROMA_KEY } })}
			defaultExpanded
			testId="media-chroma-key-properties"
		>
			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 text-xs">取色</span>
				<Input
					type="color"
					aria-label="色度抠像颜色"
					value={settings.color}
					onChange={(event) =>
						persist({
							next: { ...settings, color: event.target.value },
						})
					}
					className="h-7 w-12 cursor-pointer rounded-sm p-0.5"
				/>
				<ColorIconButton label="从预览画面取色" onClick={pickColor}>
					<Pipette className="size-3.5" />
				</ColorIconButton>
			</div>

			{advancedOpen
				? null
				: basicProperties.map(({ value, label }) =>
						renderControl({
							property: value,
							label,
							withKeyframes: false,
						})
					)}
			<details
				open={advancedOpen}
				onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
				className="group rounded-sm border px-3 py-2"
			>
				<summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
					高级
					<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
				</summary>
				<div className="mt-3 space-y-3">
					<p className="text-[11px] text-muted-foreground">
						可为每项参数添加关键帧，并用溢色抑制清理人物边缘的背景色
					</p>
					{MEDIA_CHROMA_KEY_KEYFRAME_PROPERTIES.map(({ value, label }) =>
						renderControl({
							property: value,
							label,
							withKeyframes: true,
						})
					)}
				</div>
			</details>
		</ColorModuleSection>
	);
}
