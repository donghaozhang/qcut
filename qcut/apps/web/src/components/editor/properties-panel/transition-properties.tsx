import { useEffect, useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { getTimelineElementDuration } from "@/lib/timeline";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { getVideoMediaIds } from "@/lib/transitions/video-transition-eligibility";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	CLIP_TRANSITION_MIN_DURATION_SECONDS,
	clampClipTransitionDuration,
	getTransitionMaxDuration,
	type ClipTransition,
	type ClipTransitionDirection,
	type ClipTransitionEasing,
	type TimelineTrack,
} from "@/types/timeline";
import { getTransitionPresetById } from "../media-panel/views/transitions/transition-presets";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
} from "./property-item";

const DIRECTIONS: ClipTransitionDirection[] = ["left", "right", "up", "down"];
const DIRECTION_LABELS: Record<ClipTransitionDirection, string> = {
	left: "向左",
	right: "向右",
	up: "向上",
	down: "向下",
};

function clampDuration({
	duration,
	maxDuration,
}: {
	duration: number;
	maxDuration: number;
}): number {
	return (
		clampClipTransitionDuration({ duration, maxDuration }) ??
		CLIP_TRANSITION_MIN_DURATION_SECONDS
	);
}

export function TransitionProperties({
	track,
	transition,
}: {
	track: TimelineTrack;
	transition: ClipTransition;
}) {
	const updateTransition = useTimelineStore((state) => state.updateTransition);
	const { mediaItems } = useAsyncMediaItems();
	const videoMediaIds = useMemo(
		() => getVideoMediaIds({ mediaItems }),
		[mediaItems]
	);
	const removeTransition = useTimelineStore((state) => state.removeTransition);
	const setTransitionAudioCrossfade = useTimelineStore(
		(state) => state.setTransitionAudioCrossfade
	);
	const [duration, setDuration] = useState(transition.duration);
	const maxDuration = getTransitionMaxDuration({
		track,
		fromElementId: transition.fromElementId,
		toElementId: transition.toElementId,
		transitions: track.transitions,
		excludeTransitionId: transition.id,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element }),
	});
	const preset = getTransitionPresetById({ presetId: transition.presetId });
	const supportsDirection =
		transition.type === "slide" ||
		transition.type === "wipe" ||
		transition.type === "push" ||
		transition.type === "whip-pan";
	const hasAudioCrossfade = track.audioCrossfades?.some(
		(crossfade) =>
			crossfade.fromElementId === transition.fromElementId &&
			crossfade.toElementId === transition.toElementId
	);

	useEffect(() => {
		setDuration(transition.duration);
	}, [transition.duration]);

	const commitDuration = ({ value }: { value: number }) => {
		const nextDuration = clampDuration({ duration: value, maxDuration });
		setDuration(nextDuration);
		updateTransition({
			trackId: track.id,
			transitionId: transition.id,
			videoMediaIds,
			updates: { duration: nextDuration },
		});
	};

	const handleRemove = () =>
		removeTransition({ trackId: track.id, transitionId: transition.id });

	return (
		<div className="space-y-4 p-5">
			<PropertyGroup title="转场" defaultExpanded={true}>
				<div className="space-y-4">
					<PropertyItem>
						<PropertyItemLabel>预设</PropertyItemLabel>
						<span className="text-xs text-muted-foreground">
							{preset?.name ?? transition.presetId}
						</span>
					</PropertyItem>

					<PropertyItem direction="column">
						<div className="flex w-full items-center justify-between">
							<PropertyItemLabel>时长</PropertyItemLabel>
							<Input
								type="number"
								min={CLIP_TRANSITION_MIN_DURATION_SECONDS}
								max={maxDuration}
								step={0.1}
								value={duration}
								onChange={(event) =>
									setDuration(
										Number(event.target.value) ||
											CLIP_TRANSITION_MIN_DURATION_SECONDS
									)
								}
								onBlur={() => commitDuration({ value: duration })}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										commitDuration({ value: duration });
									}
								}}
								className="h-7 w-20 text-right text-xs"
								aria-label="转场时长（秒）"
							/>
						</div>
						<Slider
							min={CLIP_TRANSITION_MIN_DURATION_SECONDS}
							max={Math.max(CLIP_TRANSITION_MIN_DURATION_SECONDS, maxDuration)}
							step={0.1}
							value={[duration]}
							onValueChange={([value]) => setDuration(value)}
							onValueCommit={([value]) => commitDuration({ value })}
							aria-label="转场时长"
						/>
					</PropertyItem>

					{supportsDirection ? (
						<PropertyItem>
							<PropertyItemLabel>方向</PropertyItemLabel>
							<Select
								value={transition.direction ?? "left"}
								onValueChange={(value: ClipTransitionDirection) =>
									updateTransition({
										trackId: track.id,
										transitionId: transition.id,
										videoMediaIds,
										updates: { direction: value },
									})
								}
							>
								<SelectTrigger
									className="h-8 w-32 text-xs"
									aria-label="转场方向"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DIRECTIONS.map((direction) => (
										<SelectItem key={direction} value={direction}>
											{DIRECTION_LABELS[direction]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItem>
					) : null}

					<PropertyItem>
						<PropertyItemLabel>缓动</PropertyItemLabel>
						<Select
							value={transition.easing}
							onValueChange={(value: ClipTransitionEasing) =>
								updateTransition({
									trackId: track.id,
									transitionId: transition.id,
									videoMediaIds,
									updates: { easing: value },
								})
							}
						>
							<SelectTrigger className="h-8 w-32 text-xs" aria-label="转场缓动">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="linear">线性</SelectItem>
								<SelectItem value="easeInOut">缓入缓出</SelectItem>
							</SelectContent>
						</Select>
					</PropertyItem>

					<PropertyItem>
						<PropertyItemLabel>音频</PropertyItemLabel>
						<Select
							value={hasAudioCrossfade ? "equal-power" : "cut"}
							onValueChange={(value: "cut" | "equal-power") =>
								setTransitionAudioCrossfade({
									trackId: track.id,
									fromElementId: transition.fromElementId,
									toElementId: transition.toElementId,
									duration: transition.duration,
									enabled: value === "equal-power",
								})
							}
						>
							<SelectTrigger className="h-8 w-32 text-xs" aria-label="转场音频">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="cut">直接切换</SelectItem>
								<SelectItem value="equal-power">等功率交叉淡化</SelectItem>
							</SelectContent>
						</Select>
					</PropertyItem>

					<Button
						type="button"
						variant="destructive"
						size="sm"
						className="w-full gap-2"
						onClick={handleRemove}
						onKeyDown={(event) => {
							if (event.key === "Delete") {
								event.preventDefault();
								handleRemove();
							}
						}}
					>
						<Trash2Icon className="h-4 w-4" />
						删除转场
					</Button>
				</div>
			</PropertyGroup>
		</div>
	);
}
