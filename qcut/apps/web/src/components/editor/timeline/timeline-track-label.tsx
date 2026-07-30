import { useRef } from "react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
	Eye,
	EyeOff,
	GripVertical,
	Image as ImageIcon,
	Lock,
	Unlock,
	Volume2,
	VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineTrack } from "@/types/timeline";
import { getTrackHeight } from "@/constants/timeline-constants";
import { TrackIcon } from "./track-icon";
import { useTranslation } from "@/lib/i18n";
import { localizeTrackName } from "@/lib/i18n/timeline-names";

interface TimelineTrackLabelProps {
	track: TimelineTrack;
	dragHandleProps: DraggableProvidedDragHandleProps | null;
	isDragging: boolean;
	onToggleHidden: () => void;
	onToggleLocked: () => void;
	onToggleMuted: () => void;
	onToggleSolo: () => void;
	onResizeStart: () => void;
	onResizeHeight: (height: number) => void;
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
	onToggleSolo,
	onResizeStart,
	onResizeHeight,
}: TimelineTrackLabelProps) {
	const { locale, t } = useTranslation();
	const displayName = localizeTrackName({ track, locale });
	const hasAudioControls = track.type === "media" || track.type === "audio";
	const trackHeight = getTrackHeight(track.type, track.height);
	const resizeState = useRef<{
		pointerId: number;
		startY: number;
		startHeight: number;
	} | null>(null);
	const controlClassName =
		"grid size-6 shrink-0 place-items-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

	return (
		<div
			className={cn(
				"relative flex items-center gap-1 border-b border-muted/30 bg-foreground/5 px-1.5",
				track.hidden && "opacity-55",
				isDragging && "bg-accent shadow-md"
			)}
			style={{ height: `${trackHeight}px` }}
			data-testid="timeline-track-label"
			data-track-id={track.id}
		>
			<button
				type="button"
				data-testid="timeline-track-reorder"
				className={cn(controlClassName, !track.locked && "cursor-grab")}
				aria-label={t("timeline.reorder", { name: displayName })}
				title={
					track.locked
						? t("timeline.unlockToReorder")
						: t("timeline.dragToReorder")
				}
				disabled={track.locked}
				{...dragHandleProps}
			>
				<GripVertical className="size-3.5" />
			</button>

			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<TrackIcon type={track.type} />
				<span className="truncate text-xs" title={displayName}>
					{displayName}
				</span>
			</div>

			{track.isMain ? (
				<div
					className="flex h-6 shrink-0 items-center gap-1 rounded-sm border border-cyan-400/35 bg-cyan-400/10 px-1.5 text-cyan-700 dark:text-cyan-200"
					title={t("timeline.track.cover")}
					data-testid="main-track-cover-badge"
				>
					<ImageIcon className="size-3" />
					<span className="text-[10px] leading-none">
						{t("timeline.track.cover")}
					</span>
				</div>
			) : null}

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
				aria-label={
					track.hidden
						? t("timeline.show", { name: displayName })
						: t("timeline.hide", { name: displayName })
				}
				title={track.hidden ? t("timeline.showTrack") : t("timeline.hideTrack")}
			>
				{track.hidden ? (
					<EyeOff className="size-3.5" />
				) : (
					<Eye className="size-3.5" />
				)}
			</button>

			{hasAudioControls ? (
				<>
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
							track.muted
								? t("timeline.unmute", { name: displayName })
								: t("timeline.mute", { name: displayName })
						}
						title={
							track.muted ? t("timeline.unmuteTrack") : t("timeline.muteTrack")
						}
					>
						{track.muted ? (
							<VolumeX className="size-3.5" />
						) : (
							<Volume2 className="size-3.5" />
						)}
					</button>
					<button
						type="button"
						className={cn(
							controlClassName,
							track.audio?.solo && "bg-primary/15 font-semibold text-primary"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onToggleSolo();
						}}
						onKeyDown={(event) =>
							handleKeyboardActivation({ event, action: onToggleSolo })
						}
						aria-label={
							track.audio?.solo
								? t("timeline.disableSolo", { name: displayName })
								: t("timeline.solo", { name: displayName })
						}
						aria-pressed={track.audio?.solo === true}
						title={
							track.audio?.solo
								? t("timeline.disableSoloTrack")
								: t("timeline.soloTrack")
						}
					>
						<span className="text-[10px] leading-none">S</span>
					</button>
				</>
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
					track.locked
						? t("timeline.unlock", { name: displayName })
						: t("timeline.lock", { name: displayName })
				}
				title={
					track.locked ? t("timeline.unlockTrack") : t("timeline.lockTrack")
				}
			>
				{track.locked ? (
					<Lock className="size-3.5" />
				) : (
					<Unlock className="size-3.5" />
				)}
			</button>

			<div
				role="separator"
				tabIndex={0}
				aria-label={t("timeline.resize", { name: displayName })}
				aria-orientation="horizontal"
				aria-valuemin={24}
				aria-valuemax={140}
				aria-valuenow={trackHeight}
				className="absolute inset-x-0 bottom-0 z-10 h-1 cursor-row-resize bg-transparent hover:bg-primary/60 focus:bg-primary/60 focus:outline-none"
				onPointerDown={(event) => {
					event.preventDefault();
					event.stopPropagation();
					event.currentTarget.setPointerCapture(event.pointerId);
					resizeState.current = {
						pointerId: event.pointerId,
						startY: event.clientY,
						startHeight: trackHeight,
					};
					onResizeStart();
				}}
				onPointerMove={(event) => {
					const resize = resizeState.current;
					if (!resize || resize.pointerId !== event.pointerId) return;
					onResizeHeight(resize.startHeight + event.clientY - resize.startY);
				}}
				onPointerUp={(event) => {
					if (resizeState.current?.pointerId !== event.pointerId) return;
					event.currentTarget.releasePointerCapture(event.pointerId);
					resizeState.current = null;
				}}
				onPointerCancel={() => {
					resizeState.current = null;
				}}
				onKeyDown={(event) => {
					if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
					event.preventDefault();
					event.stopPropagation();
					onResizeStart();
					onResizeHeight(trackHeight + (event.key === "ArrowUp" ? -8 : 8));
				}}
			/>
		</div>
	);
}
