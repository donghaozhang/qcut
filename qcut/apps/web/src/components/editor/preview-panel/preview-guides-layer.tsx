"use client";

import {
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
} from "react";
import {
	addGuide,
	clampGuidePosition,
	getRulerTickStep,
	isWithinCanvas,
	moveGuide,
	pointerToCanvasPosition,
	removeGuide,
	resolveGuides,
	type GuideAxis,
} from "@/lib/preview/preview-guides";
import { usePreviewViewStore } from "@/stores/editor/preview-view-store";
import { useProjectStore } from "@/stores/project-store";
import type { PreviewDimensions } from "./types";

export const RULER_SIZE = 20;

interface DragState {
	axis: GuideAxis;
	/** Index of the guide being moved, or null while creating a new one. */
	index: number | null;
	/** Live pointer position in canvas coordinates (unclamped). */
	position: { x: number; y: number };
}

interface PreviewGuidesLayerProps {
	canvasSize: { width: number; height: number };
	previewDimensions: PreviewDimensions;
	previewRef: RefObject<HTMLDivElement | null>;
	/** CSS zoom applied to the preview surface (1 = 100%). */
	cssScale: number;
}

function drawRuler({
	canvas,
	lengthCss,
	canvasLength,
	scale,
	orientation,
}: {
	canvas: HTMLCanvasElement;
	lengthCss: number;
	canvasLength: number;
	scale: number;
	orientation: "top" | "left";
}) {
	const dpr = window.devicePixelRatio || 1;
	const width = orientation === "top" ? lengthCss : RULER_SIZE;
	const height = orientation === "top" ? RULER_SIZE : lengthCss;
	canvas.width = Math.max(1, Math.round(width * dpr));
	canvas.height = Math.max(1, Math.round(height * dpr));
	const context = canvas.getContext("2d");
	if (!context) return;
	context.scale(dpr, dpr);
	context.clearRect(0, 0, width, height);
	context.fillStyle = "rgba(9, 9, 11, 0.85)";
	context.fillRect(0, 0, width, height);

	const cssPerCanvasPx = lengthCss / (canvasLength || 1);
	const { major, minor } = getRulerTickStep({ scale });
	context.strokeStyle = "rgba(255, 255, 255, 0.35)";
	context.fillStyle = "rgba(255, 255, 255, 0.7)";
	context.lineWidth = 1;
	context.font = "9px ui-monospace, monospace";
	context.textBaseline = "top";

	for (let value = 0; value <= canvasLength; value += minor) {
		const cssPosition = value * cssPerCanvasPx;
		const isMajor = Math.round(value / minor) % 4 === 0;
		const tickLength = isMajor ? RULER_SIZE : 5;
		context.beginPath();
		if (orientation === "top") {
			context.moveTo(cssPosition, RULER_SIZE - tickLength);
			context.lineTo(cssPosition, RULER_SIZE);
		} else {
			context.moveTo(RULER_SIZE - tickLength, cssPosition);
			context.lineTo(RULER_SIZE, cssPosition);
		}
		context.stroke();
		if (isMajor && value + major <= canvasLength) {
			if (orientation === "top") {
				context.fillText(String(Math.round(value)), cssPosition + 3, 2);
			} else {
				context.save();
				context.translate(2, cssPosition + 3);
				context.rotate(Math.PI / 2);
				context.fillText(String(Math.round(value)), 0, -10);
				context.restore();
			}
		}
	}
}

/**
 * Rulers plus draggable alignment guides, rendered inside the preview
 * surface (outside the capture surface, so never baked into frames).
 * Guide positions are stored on the project in canvas coordinates and use
 * percentage layout so zoom presets cannot make them drift.
 */
export function PreviewGuidesLayer({
	canvasSize,
	previewDimensions,
	previewRef,
	cssScale,
}: PreviewGuidesLayerProps) {
	const showRulers = usePreviewViewStore((state) => state.showRulers);
	const storedGuides = useProjectStore((state) => state.activeProject?.guides);
	const updateProjectGuides = useProjectStore(
		(state) => state.updateProjectGuides
	);
	const guides = resolveGuides(storedGuides);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const topRulerRef = useRef<HTMLCanvasElement>(null);
	const leftRulerRef = useRef<HTMLCanvasElement>(null);

	const previewWidth = previewDimensions.width || canvasSize.width;
	const previewHeight = previewDimensions.height || canvasSize.height;
	const scale = (previewWidth / (canvasSize.width || 1)) * cssScale;

	useEffect(() => {
		if (!showRulers) return;
		if (topRulerRef.current) {
			drawRuler({
				canvas: topRulerRef.current,
				lengthCss: previewWidth,
				canvasLength: canvasSize.width,
				scale,
				orientation: "top",
			});
		}
		if (leftRulerRef.current) {
			drawRuler({
				canvas: leftRulerRef.current,
				lengthCss: previewHeight,
				canvasLength: canvasSize.height,
				scale,
				orientation: "left",
			});
		}
	}, [
		showRulers,
		previewWidth,
		previewHeight,
		canvasSize.width,
		canvasSize.height,
		scale,
	]);

	const pointerToCanvas = (event: {
		clientX: number;
		clientY: number;
	}): { x: number; y: number } | null => {
		const surface = previewRef.current;
		if (!surface) return null;
		return pointerToCanvasPosition({
			clientX: event.clientX,
			clientY: event.clientY,
			rect: surface.getBoundingClientRect(),
			canvasSize,
		});
	};

	const beginDrag = (
		event: ReactPointerEvent,
		axis: GuideAxis,
		index: number | null
	) => {
		const position = pointerToCanvas(event);
		if (!position) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragState({ axis, index, position });
	};

	const handleDragMove = (event: ReactPointerEvent) => {
		if (!dragState) return;
		const position = pointerToCanvas(event);
		if (!position) return;
		setDragState({ ...dragState, position });
	};

	const finishDrag = () => {
		if (!dragState) return;
		const { axis, index, position } = dragState;
		setDragState(null);
		const inside = isWithinCanvas({ position, canvasSize });
		const value = clampGuidePosition({
			position: axis === "horizontal" ? position.y : position.x,
			max: axis === "horizontal" ? canvasSize.height : canvasSize.width,
		});
		if (index === null) {
			if (inside) {
				void updateProjectGuides(addGuide({ guides, axis, position: value }));
			}
			return;
		}
		if (!inside) {
			void updateProjectGuides(removeGuide({ guides, axis, index }));
			return;
		}
		void updateProjectGuides(
			moveGuide({ guides, axis, index, position: value })
		);
	};

	const renderGuideLine = (
		axis: GuideAxis,
		position: number,
		index: number
	) => {
		const dragging =
			dragState && dragState.axis === axis && dragState.index === index;
		const livePosition = dragging
			? axis === "horizontal"
				? dragState.position.y
				: dragState.position.x
			: position;
		const max = axis === "horizontal" ? canvasSize.height : canvasSize.width;
		const percent =
			(clampGuidePosition({ position: livePosition, max }) / (max || 1)) * 100;
		const isHorizontal = axis === "horizontal";
		return (
			<div
				key={`${axis}-${index}`}
				role="separator"
				aria-label={`${axis} guide`}
				data-testid={`preview-guide-${axis}-${index}`}
				className={
					isHorizontal
						? "absolute left-0 right-0 h-[7px] -translate-y-1/2"
						: "absolute top-0 bottom-0 w-[7px] -translate-x-1/2"
				}
				style={{
					[isHorizontal ? "top" : "left"]: `${percent}%`,
					pointerEvents: guides.locked ? "none" : "auto",
					cursor: guides.locked
						? "default"
						: isHorizontal
							? "ns-resize"
							: "ew-resize",
					zIndex: 50,
				}}
				onPointerDown={(event) => {
					if (guides.locked) return;
					beginDrag(event, axis, index);
				}}
				onPointerMove={handleDragMove}
				onPointerUp={finishDrag}
				onPointerCancel={() => setDragState(null)}
			>
				<div
					className={
						isHorizontal
							? "absolute top-1/2 left-0 right-0 h-px bg-cyan-400/90"
							: "absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/90"
					}
				/>
				{dragging ? (
					<span className="absolute top-1 left-1 rounded bg-black/80 px-1 text-[10px] text-cyan-200">
						{Math.round(livePosition)}
					</span>
				) : null}
			</div>
		);
	};

	const renderNewGuidePreview = () => {
		if (!dragState || dragState.index !== null) return null;
		const { axis, position } = dragState;
		if (!isWithinCanvas({ position, canvasSize })) return null;
		const isHorizontal = axis === "horizontal";
		const max = isHorizontal ? canvasSize.height : canvasSize.width;
		const value = isHorizontal ? position.y : position.x;
		const percent = (clampGuidePosition({ position: value, max }) / max) * 100;
		return (
			<div
				className={
					isHorizontal
						? "pointer-events-none absolute left-0 right-0 h-px bg-cyan-300"
						: "pointer-events-none absolute top-0 bottom-0 w-px bg-cyan-300"
				}
				style={{ [isHorizontal ? "top" : "left"]: `${percent}%`, zIndex: 50 }}
				data-testid="preview-guide-preview"
			/>
		);
	};

	return (
		<>
			{showRulers ? (
				<>
					<canvas
						ref={topRulerRef}
						data-testid="preview-ruler-top"
						className="absolute cursor-ns-resize"
						style={{
							top: -RULER_SIZE,
							left: 0,
							width: "100%",
							height: RULER_SIZE,
							pointerEvents: "auto",
							zIndex: 50,
						}}
						onPointerDown={(event) => beginDrag(event, "horizontal", null)}
						onPointerMove={handleDragMove}
						onPointerUp={finishDrag}
						onPointerCancel={() => setDragState(null)}
					/>
					<canvas
						ref={leftRulerRef}
						data-testid="preview-ruler-left"
						className="absolute cursor-ew-resize"
						style={{
							top: 0,
							left: -RULER_SIZE,
							width: RULER_SIZE,
							height: "100%",
							pointerEvents: "auto",
							zIndex: 50,
						}}
						onPointerDown={(event) => beginDrag(event, "vertical", null)}
						onPointerMove={handleDragMove}
						onPointerUp={finishDrag}
						onPointerCancel={() => setDragState(null)}
					/>
				</>
			) : null}

			{guides.hidden ? null : (
				<div
					className="pointer-events-none absolute inset-0"
					data-testid="preview-guides"
					style={{ zIndex: 50 }}
				>
					{guides.horizontal.map((position, index) =>
						renderGuideLine("horizontal", position, index)
					)}
					{guides.vertical.map((position, index) =>
						renderGuideLine("vertical", position, index)
					)}
					{renderNewGuidePreview()}
				</div>
			)}
		</>
	);
}
