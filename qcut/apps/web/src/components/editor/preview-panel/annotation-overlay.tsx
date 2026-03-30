/**
 * Interactive annotation overlay — renders annotations over the preview canvas.
 * Supports click-to-select, drag-to-move, and resize handles.
 */

import { useCallback, useRef, useState } from "react";
import {
	useFigureAnnotationsStore,
	type FigureAnnotation,
} from "@/stores/figure-annotations-store";

interface AnnotationOverlayProps {
	/** Current playhead time in ms */
	currentTimeMs: number;
	/** Overlay container width in px */
	containerWidth: number;
	/** Overlay container height in px */
	containerHeight: number;
}

export function AnnotationOverlay({
	currentTimeMs,
	containerWidth,
	containerHeight,
}: AnnotationOverlayProps) {
	const annotations = useFigureAnnotationsStore((s) => s.annotations);
	const selectedId = useFigureAnnotationsStore((s) => s.selectedId);
	const setSelectedId = useFigureAnnotationsStore((s) => s.setSelectedId);
	const updateAnnotation = useFigureAnnotationsStore(
		(s) => s.updateAnnotation
	);

	const visible = Array.from(annotations.values())
		.filter((a: FigureAnnotation) => currentTimeMs >= a.startMs && currentTimeMs <= a.endMs)
		.sort((a: FigureAnnotation, b: FigureAnnotation) => a.zIndex - b.zIndex);

	const handleBackgroundClick = useCallback(() => {
		setSelectedId(null);
	}, [setSelectedId]);

	if (visible.length === 0 && !selectedId) return null;

	return (
		<svg
			className="absolute inset-0 pointer-events-auto"
			width={containerWidth}
			height={containerHeight}
			onClick={handleBackgroundClick}
			data-testid="annotation-overlay"
		>
			{visible.map((a) => (
				<AnnotationShape
					key={a.id}
					annotation={a}
					containerWidth={containerWidth}
					containerHeight={containerHeight}
					selected={selectedId === a.id}
					onSelect={() => setSelectedId(a.id)}
					onUpdate={(updates) => updateAnnotation(a.id, updates)}
				/>
			))}
		</svg>
	);
}

interface AnnotationShapeProps {
	annotation: FigureAnnotation;
	containerWidth: number;
	containerHeight: number;
	selected: boolean;
	onSelect: () => void;
	onUpdate: (updates: Partial<FigureAnnotation>) => void;
}

function AnnotationShape({
	annotation: a,
	containerWidth,
	containerHeight,
	selected,
	onSelect,
	onUpdate,
}: AnnotationShapeProps) {
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef({ startClientX: 0, startClientY: 0, origX: 0, origY: 0 });

	const px = (a.x / 100) * containerWidth;
	const py = (a.y / 100) * containerHeight;
	const pw = (a.width / 100) * containerWidth;
	const ph = (a.height / 100) * containerHeight;

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.stopPropagation();
			onSelect();
			setDragging(true);
			dragRef.current = {
				startClientX: e.clientX,
				startClientY: e.clientY,
				origX: a.x,
				origY: a.y,
			};

			const onMove = (me: PointerEvent) => {
				const dx = ((me.clientX - dragRef.current.startClientX) / containerWidth) * 100;
				const dy = ((me.clientY - dragRef.current.startClientY) / containerHeight) * 100;
				onUpdate({
					x: Math.max(0, Math.min(100 - a.width, dragRef.current.origX + dx)),
					y: Math.max(0, Math.min(100 - a.height, dragRef.current.origY + dy)),
				});
			};
			const onUp = () => {
				setDragging(false);
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[a.x, a.y, a.width, a.height, containerWidth, containerHeight, onSelect, onUpdate]
	);

	const strokeColor = a.strokeColor || "#ff4444";
	const strokeWidth = a.strokeWidth || 3;

	return (
		<g
			transform={`translate(${px},${py})${a.rotation ? ` rotate(${a.rotation},${pw / 2},${ph / 2})` : ""}`}
			onPointerDown={handlePointerDown}
			className={`cursor-move ${dragging ? "opacity-80" : ""}`}
			data-testid={`annotation-shape-${a.id}`}
		>
			{a.type === "circle" && (
				<ellipse
					cx={pw / 2}
					cy={ph / 2}
					rx={pw / 2}
					ry={ph / 2}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					fill={a.fillColor ? a.fillColor : "none"}
					fillOpacity={a.fillOpacity ?? 0}
				/>
			)}
			{a.type === "rectangle" && (
				<rect
					width={pw}
					height={ph}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					fill={a.fillColor ? a.fillColor : "none"}
					fillOpacity={a.fillOpacity ?? 0}
					rx={4}
				/>
			)}
			{a.type === "arrow" && (
				<line
					x1={0}
					y1={ph / 2}
					x2={pw}
					y2={ph / 2}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					markerEnd="url(#arrowhead)"
				/>
			)}

			{/* Selection indicator */}
			{selected && (
				<rect
					x={-2}
					y={-2}
					width={pw + 4}
					height={ph + 4}
					fill="none"
					stroke="#3b82f6"
					strokeWidth={1.5}
					strokeDasharray="4 2"
					pointerEvents="none"
				/>
			)}
		</g>
	);
}
