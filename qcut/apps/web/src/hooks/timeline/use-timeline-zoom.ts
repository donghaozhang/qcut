import { useState, useCallback, useEffect, useRef, RefObject } from "react";

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

	const handleWheel = useCallback((e: React.WheelEvent) => {
		// Only zoom if user is using pinch gesture (ctrlKey or metaKey is true)
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -0.15 : 0.15;
			setZoomLevel((prev) => Math.max(0.1, Math.min(10, prev + delta)));
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

	function getDistance(
		p1: { x: number; y: number },
		p2: { x: number; y: number }
	) {
		return Math.hypot(p2.x - p1.x, p2.y - p1.y);
	}

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
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
				0.1,
				Math.min(10, pinchBaseZoomRef.current * ratio)
			);
			setZoomLevel(newZoom);
		},
		[setZoomLevel]
	);

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
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
