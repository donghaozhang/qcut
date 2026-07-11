import { useEffect, useState } from "react";
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
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
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

const DIRECTIONS: ClipTransitionDirection[] = [
	"left",
	"right",
	"up",
	"down",
];

function clampDuration({
	duration,
	maxDuration,
}: {
	duration: number;
	maxDuration: number;
}): number {
	return Math.min(maxDuration, Math.max(0.05, duration));
}

export function TransitionProperties({
	track,
	transition,
}: {
	track: TimelineTrack;
	transition: ClipTransition;
}) {
	const updateTransition = useTimelineStore((state) => state.updateTransition);
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
		transition.type === "slide" || transition.type === "wipe";
	const hasAudioCrossfade = track.audioCrossfades?.some(
		(crossfade) =>
			crossfade.fromElementId === transition.fromElementId &&
			crossfade.toElementId === transition.toElementId
	);

	useEffect(() => {
		setDuration(transition.duration);
	}, [transition.duration, transition.id]);

	const commitDuration = ({ value }: { value: number }) => {
		const nextDuration = clampDuration({ duration: value, maxDuration });
		setDuration(nextDuration);
		updateTransition({
			trackId: track.id,
			transitionId: transition.id,
			updates: { duration: nextDuration },
		});
	};

	const handleRemove = () =>
		removeTransition({ trackId: track.id, transitionId: transition.id });

	return (
		<div className="space-y-4 p-5">
			<PropertyGroup title="Transition" defaultExpanded={true}>
				<div className="space-y-4">
					<PropertyItem>
						<PropertyItemLabel>Preset</PropertyItemLabel>
						<span className="text-xs text-muted-foreground">
							{preset?.name ?? transition.presetId}
						</span>
					</PropertyItem>

					<PropertyItem direction="column">
						<div className="flex w-full items-center justify-between">
							<PropertyItemLabel>Duration</PropertyItemLabel>
							<Input
								type="number"
								min={0.05}
								max={maxDuration}
								step={0.05}
								value={duration}
								onChange={(event) =>
									setDuration(Number(event.target.value) || 0.05)
								}
								onBlur={() => commitDuration({ value: duration })}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										commitDuration({ value: duration });
									}
								}}
								className="h-7 w-20 text-right text-xs"
								aria-label="Transition duration in seconds"
							/>
						</div>
						<Slider
							min={0.05}
							max={Math.max(0.05, maxDuration)}
							step={0.05}
							value={[duration]}
							onValueChange={([value]) => setDuration(value)}
							onValueCommit={([value]) => commitDuration({ value })}
							aria-label="Transition duration"
						/>
					</PropertyItem>

					{supportsDirection ? (
						<PropertyItem>
							<PropertyItemLabel>Direction</PropertyItemLabel>
							<Select
								value={transition.direction ?? "left"}
								onValueChange={(value: ClipTransitionDirection) =>
									updateTransition({
										trackId: track.id,
										transitionId: transition.id,
										updates: { direction: value },
									})
								}
							>
								<SelectTrigger className="h-8 w-28 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DIRECTIONS.map((direction) => (
										<SelectItem key={direction} value={direction}>
											{direction}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItem>
					) : null}

					<PropertyItem>
						<PropertyItemLabel>Easing</PropertyItemLabel>
						<Select
							value={transition.easing}
							onValueChange={(value: ClipTransitionEasing) =>
								updateTransition({
									trackId: track.id,
									transitionId: transition.id,
									updates: { easing: value },
								})
							}
						>
							<SelectTrigger className="h-8 w-28 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="linear">linear</SelectItem>
								<SelectItem value="easeInOut">ease in/out</SelectItem>
							</SelectContent>
						</Select>
					</PropertyItem>

					<PropertyItem>
						<PropertyItemLabel>Audio</PropertyItemLabel>
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
							<SelectTrigger className="h-8 w-28 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="cut">hard cut</SelectItem>
								<SelectItem value="equal-power">equal power</SelectItem>
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
							if (event.key === "Enter" || event.key === " ") {
								handleRemove();
							}
						}}
					>
						<Trash2Icon className="h-4 w-4" />
						Remove Transition
					</Button>
				</div>
			</PropertyGroup>
		</div>
	);
}
