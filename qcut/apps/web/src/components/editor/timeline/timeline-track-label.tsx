import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
	Eye,
	EyeOff,
	GripVertical,
	Lock,
	Unlock,
	Volume2,
	VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineTrack } from "@/types/timeline";
import { getTrackHeight } from "@/constants/timeline-constants";
import { TrackIcon } from "./track-icon";

interface TimelineTrackLabelProps {
	track: TimelineTrack;
	dragHandleProps: DraggableProvidedDragHandleProps | null;
	isDragging: boolean;
	onToggleHidden: () => void;
	onToggleLocked: () => void;
	onToggleMuted: () => void;
}

function handleKeyboardActivation({
	event,
	action,
}: {
	event: React.KeyboardEvent<HTMLButtonElement>;
	action: () => void;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	event.stopPropagation();
	action();
}

export function TimelineTrackLabel({
	track,
	dragHandleProps,
	isDragging,
	onToggleHidden,
	onToggleLocked,
	onToggleMuted,
}: TimelineTrackLabelProps) {
	const hasAudioControls = track.type === "media" || track.type === "audio";
	const controlClassName =
		"grid size-6 shrink-0 place-items-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

	return (
		<div
			className={cn(
				"flex items-center gap-1 border-b border-muted/30 bg-foreground/5 px-1.5",
				track.hidden && "opacity-55",
				isDragging && "bg-accent shadow-md"
			)}
			style={{ height: `${getTrackHeight(track.type)}px` }}
			data-testid="timeline-track-label"
			data-track-id={track.id}
		>
			<button
				type="button"
				className={cn(controlClassName, !track.locked && "cursor-grab")}
				aria-label={`Reorder ${track.name}`}
				title={
					track.locked ? "Unlock track to reorder" : "Drag to reorder track"
				}
				disabled={track.locked}
				{...dragHandleProps}
			>
				<GripVertical className="size-3.5" />
			</button>

			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<TrackIcon type={track.type} />
				<span className="truncate text-xs" title={track.name}>
					{track.name}
				</span>
			</div>

			<button
				type="button"
				className={controlClassName}
				onClick={(event) => {
					event.stopPropagation();
					onToggleHidden();
				}}
				onKeyDown={(event) =>
					handleKeyboardActivation({ event, action: onToggleHidden })
				}
				aria-label={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`}
				title={track.hidden ? "Show track" : "Hide track"}
			>
				{track.hidden ? (
					<EyeOff className="size-3.5" />
				) : (
					<Eye className="size-3.5" />
				)}
			</button>

			{hasAudioControls ? (
				<button
					type="button"
					className={controlClassName}
					onClick={(event) => {
						event.stopPropagation();
						onToggleMuted();
					}}
					onKeyDown={(event) =>
						handleKeyboardActivation({ event, action: onToggleMuted })
					}
					aria-label={
						track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`
					}
					title={track.muted ? "Unmute track" : "Mute track"}
				>
					{track.muted ? (
						<VolumeX className="size-3.5" />
					) : (
						<Volume2 className="size-3.5" />
					)}
				</button>
			) : null}

			<button
				type="button"
				className={controlClassName}
				onClick={(event) => {
					event.stopPropagation();
					onToggleLocked();
				}}
				onKeyDown={(event) =>
					handleKeyboardActivation({ event, action: onToggleLocked })
				}
				aria-label={
					track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`
				}
				title={track.locked ? "Unlock track" : "Lock track"}
			>
				{track.locked ? (
					<Lock className="size-3.5" />
				) : (
					<Unlock className="size-3.5" />
				)}
			</button>
		</div>
	);
}
