import { ArrowLeftRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { getTimelineElementDuration } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	resolveClipTransition,
	type ClipTransition,
	type TimelineTrack,
} from "@/types/timeline";
import {
	calculateTransitionKeyboardResize,
	calculateTransitionPointerResize,
} from "./timeline-transition-resize";

type ResolvedClipTransition = NonNullable<
	ReturnType<typeof resolveClipTransition>
>;
type TransitionEdge = "left" | "right";

export function TimelineTransitionMarker({
	track,
	transition,
	zoomLevel,
}: {
	track: TimelineTrack;
	transition: ClipTransition;
	zoomLevel: number;
}) {
	const resolved = resolveClipTransition({
		track,
		transition,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element }),
	});
	if (!resolved) return null;

	return (
		<ResolvedTimelineTransitionMarker
			resolved={resolved}
			track={track}
			transition={transition}
			zoomLevel={zoomLevel}
		/>
	);
}

function ResolvedTimelineTransitionMarker({
	resolved,
	track,
	transition,
	zoomLevel,
}: {
	resolved: ResolvedClipTransition;
	track: TimelineTrack;
	transition: ClipTransition;
	zoomLevel: number;
}) {
	const selectedTransition = useTimelineStore(
		(state) => state.selectedTransition
	);
	const selectTransition = useTimelineStore((state) => state.selectTransition);
	const updateTransition = useTimelineStore((state) => state.updateTransition);
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const [draftDuration, setDraftDuration] = useState(transition.duration);
	const draftDurationRef = useRef(transition.duration);
	const resizeRef = useRef<{
		side: TransitionEdge;
		startX: number;
		initialDuration: number;
	} | null>(null);
	const [resizing, setResizing] = useState(false);
	const selected =
		selectedTransition?.trackId === track.id &&
		selectedTransition.transitionId === transition.id;

	const setDurationDraft = useCallback(({ duration }: { duration: number }) => {
		draftDurationRef.current = duration;
		setDraftDuration(duration);
	}, []);
	const handleSelect = useCallback(() => {
		selectTransition({ trackId: track.id, transitionId: transition.id });
	}, [selectTransition, track.id, transition.id]);
	const commitDuration = useCallback(
		({ duration }: { duration: number }) => {
			if (Math.abs(duration - transition.duration) < 0.000_1) return;
			updateTransition({
				trackId: track.id,
				transitionId: transition.id,
				updates: { duration },
			});
		},
		[track.id, transition.duration, transition.id, updateTransition]
	);

	useEffect(() => {
		if (resizeRef.current) return;
		setDurationDraft({ duration: transition.duration });
	}, [setDurationDraft, transition.duration]);

	useEffect(() => {
		if (!resizing) return;
		const finishResize = ({ commit }: { commit: boolean }) => {
			if (commit) {
				commitDuration({ duration: draftDurationRef.current });
			} else {
				setDurationDraft({ duration: transition.duration });
			}
			resizeRef.current = null;
			setResizing(false);
		};
		const handlePointerMove = (event: PointerEvent) => {
			const resize = resizeRef.current;
			if (!resize) return;
			setDurationDraft({
				duration: calculateTransitionPointerResize({
					currentX: event.clientX,
					initialDuration: resize.initialDuration,
					maxDuration: resolved.maxDuration,
					pixelsPerSecond,
					side: resize.side,
					startX: resize.startX,
				}),
			});
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			finishResize({ commit: false });
		};
		const handlePointerUp = () => finishResize({ commit: true });
		const handlePointerCancel = () => finishResize({ commit: false });
		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
		document.addEventListener("pointercancel", handlePointerCancel);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("pointercancel", handlePointerCancel);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		commitDuration,
		pixelsPerSecond,
		resizing,
		resolved.maxDuration,
		setDurationDraft,
		transition.duration,
	]);

	const beginResize = ({
		event,
		side,
	}: {
		event: ReactPointerEvent<HTMLButtonElement>;
		side: TransitionEdge;
	}) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		resizeRef.current = {
			side,
			startX: event.clientX,
			initialDuration: draftDurationRef.current,
		};
		setResizing(true);
		handleSelect();
	};

	const resizeWithKeyboard = ({
		event,
		side,
	}: {
		event: ReactKeyboardEvent<HTMLButtonElement>;
		side: TransitionEdge;
	}) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		event.stopPropagation();
		commitDuration({
			duration: calculateTransitionKeyboardResize({
				duration: transition.duration,
				key: event.key,
				maxDuration: resolved.maxDuration,
				shiftKey: event.shiftKey,
				side,
			}),
		});
	};

	const width = Math.max(20, draftDuration * pixelsPerSecond);
	const left = resolved.cutTime * pixelsPerSecond - width / 2;
	const transitionLabel = `${transition.presetId} transition, ${draftDuration.toFixed(2)} seconds`;

	return (
		<div
			className={cn(
				"absolute top-1/2 z-30 h-6 -translate-y-1/2 rounded border bg-cyan-950/90 text-cyan-100 shadow-sm transition-colors hover:border-cyan-300",
				selected
					? "border-cyan-200 ring-2 ring-cyan-300/40"
					: "border-cyan-500/70"
			)}
			style={{ left, width }}
			data-transition-marker
			data-testid={`timeline-transition-${transition.id}`}
			data-transition-duration={draftDuration.toFixed(3)}
			title={transitionLabel}
		>
			<button
				type="button"
				className={cn(
					"absolute inset-y-0 flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100",
					selected ? "inset-x-2" : "inset-x-0"
				)}
				aria-label={`Select ${transition.presetId} transition`}
				onClick={(event) => {
					event.stopPropagation();
					handleSelect();
				}}
			>
				<ArrowLeftRightIcon className="h-3.5 w-3.5">
					<title>{transitionLabel}</title>
				</ArrowLeftRightIcon>
			</button>
			{selected ? (
				<>
					<TransitionResizeHandle
						onKeyDown={resizeWithKeyboard}
						onPointerDown={beginResize}
						side="left"
						transitionId={transition.id}
					/>
					<TransitionResizeHandle
						onKeyDown={resizeWithKeyboard}
						onPointerDown={beginResize}
						side="right"
						transitionId={transition.id}
					/>
				</>
			) : null}
		</div>
	);
}

function TransitionResizeHandle({
	onKeyDown,
	onPointerDown,
	side,
	transitionId,
}: {
	onKeyDown: ({
		event,
		side,
	}: {
		event: ReactKeyboardEvent<HTMLButtonElement>;
		side: TransitionEdge;
	}) => void;
	onPointerDown: ({
		event,
		side,
	}: {
		event: ReactPointerEvent<HTMLButtonElement>;
		side: TransitionEdge;
	}) => void;
	side: TransitionEdge;
	transitionId: string;
}) {
	return (
		<button
			type="button"
			className={cn(
				"absolute inset-y-0 z-10 w-2 cursor-ew-resize bg-cyan-300/25 hover:bg-cyan-200/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100",
				side === "left"
					? "left-0 rounded-l border-r border-cyan-100/80"
					: "right-0 rounded-r border-l border-cyan-100/80"
			)}
			aria-label={`Resize transition from ${side} edge`}
			data-testid={`transition-handle-${side}-${transitionId}`}
			onPointerDown={(event) => onPointerDown({ event, side })}
			onKeyDown={(event) => onKeyDown({ event, side })}
		/>
	);
}
