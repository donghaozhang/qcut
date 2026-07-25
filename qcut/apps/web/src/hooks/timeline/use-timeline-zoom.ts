import { useState, useCallback, useEffect, useRef, RefObject } from "react";
import {
	TIMELINE_ZOOM_EVENT,
	type TimelineZoomDirection,
} from "@/lib/editor-shortcut-events";

const MIN_TIMELINE_ZOOM = 0.1;
const MAX_TIMELINE_ZOOM = 10;
const KEYBOARD_ZOOM_FACTOR = 1.25;

export function nextTimelineZoom({
	current,
	direction,
}: {
	current: number;
	direction: TimelineZoomDirection;
}): number {
	const next =
		direction === "in"
			? current * KEYBOARD_ZOOM_FACTOR
			: current / KEYBOARD_ZOOM_FACTOR;
	return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, next));
}

interface UseTimelineZoomProps {
	containerRef: RefObject<HTMLDivElement | null>;
	isInTimeline?: boolean;
}

interface PinchHandlers {
	onPointerDown: (e: React.PointerEvent) => void;
	onPointerMove: (e: React.PointerEvent) => void;
	onPointerUp: (e: React.PointerEvent) => void;
	onPointerCancel: (e: React.PointerEvent) => void;
}

interface UseTimelineZoomReturn {
	zoomLevel: number;
	setZoomLevel: (zoomLevel: number | ((prev: number) => number)) => void;
	handleWheel: (e: React.WheelEvent) => void;
	pinchHandlers: PinchHandlers;
}

export function useTimelineZoom({
	containerRef,
	isInTimeline = false,
}: UseTimelineZoomProps): UseTimelineZoomReturn {
	const [zoomLevel, setZoomLevel] = useState(1);

	useEffect(() => {
		const handleKeyboardZoom = (event: Event) => {
			const direction = (event as CustomEvent<TimelineZoomDirection>).detail;
			if (direction !== "in" && direction !== "out") return;
			setZoomLevel((current) => nextTimelineZoom({ current, direction }));
		};
		window.addEventListener(TIMELINE_ZOOM_EVENT, handleKeyboardZoom);
		return () =>
			window.removeEventListener(TIMELINE_ZOOM_EVENT, handleKeyboardZoom);
	}, []);

	const handleWheel = useCallback((e: React.WheelEvent) => {
		// Only zoom if user is using pinch gesture (ctrlKey or metaKey is true)
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -0.15 : 0.15;
			setZoomLevel((prev) =>
				Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, prev + delta))
			);
		}
		// For horizontal scrolling (when shift is held or horizontal wheel movement),
		// let the event bubble up to allow ScrollArea to handle it
		else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			// Don't prevent default - let ScrollArea handle horizontal scrolling
			return;
		}
		// Otherwise, allow normal scrolling
	}, []);

	// Prevent browser zooming in/out when in timeline
	useEffect(() => {
		const preventZoom = (e: WheelEvent) => {
			if (
				isInTimeline &&
				(e.ctrlKey || e.metaKey) &&
				containerRef.current?.contains(e.target as Node)
			) {
				e.preventDefault();
			}
		};

		document.addEventListener("wheel", preventZoom, { passive: false });

		return () => {
			document.removeEventListener("wheel", preventZoom);
		};
	}, [isInTimeline, containerRef]);

	// Pinch-to-zoom support via pointer events
	const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const initialPinchDistanceRef = useRef<number | null>(null);
	const pinchBaseZoomRef = useRef<number>(1);

	const getDistance = useCallback(
		(p1: { x: number; y: number }, p2: { x: number; y: number }) => {
			return Math.hypot(p2.x - p1.x, p2.y - p1.y);
		},
		[]
	);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		// Only handle touch pointers — pinch-to-zoom is the only gesture this
		// hook implements, and tracking mouse/pen risks two failure modes:
		// (1) capturing a mouse pointer redirects the post-mouseup `contextmenu`
		// to this div, suppressing right-click menus on clips underneath; and
		// (2) recording a mouse pointerdown that releases outside the timeline
		// leaves a stale entry in pointersRef — a single subsequent finger
		// touch then trips the pinch path with phantom pointers.size === 2.
		if (e.pointerType !== "touch") return;
		e.currentTarget.setPointerCapture(e.pointerId);
		pointersRef.current.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY,
		});
	}, []);

	// Keep a ref to current zoom so pinch callback doesn't recreate mid-gesture
	const zoomLevelRef = useRef(zoomLevel);
	zoomLevelRef.current = zoomLevel;

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			const pointers = pointersRef.current;
			if (!pointers.has(e.pointerId)) return;

			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

			if (pointers.size < 2) return;

			const [p1, p2] = [...pointers.values()];
			const currentDistance = getDistance(p1, p2);

			if (initialPinchDistanceRef.current === null) {
				initialPinchDistanceRef.current = currentDistance;
				pinchBaseZoomRef.current = zoomLevelRef.current;
				return;
			}

			const ratio = currentDistance / initialPinchDistanceRef.current;
			const newZoom = Math.max(
				MIN_TIMELINE_ZOOM,
				Math.min(MAX_TIMELINE_ZOOM, pinchBaseZoomRef.current * ratio)
			);
			setZoomLevel(newZoom);
		},
		[getDistance]
	);

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		pointersRef.current.delete(e.pointerId);
		if (pointersRef.current.size < 2) {
			initialPinchDistanceRef.current = null;
		}
	}, []);

	const pinchHandlers: PinchHandlers = {
		onPointerDown: handlePointerDown,
		onPointerMove: handlePointerMove,
		onPointerUp: handlePointerUp,
		onPointerCancel: handlePointerUp,
	};

	return {
		zoomLevel,
		setZoomLevel,
		handleWheel,
		pinchHandlers,
	};
}
