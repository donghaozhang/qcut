"use client";

import { normalizeTextAnimations } from "@qcut/editor-core/text-animation";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
} from "react";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import { resolveTextAnimationPreviewCrop } from "@/lib/text/text-animation-preview-crop";
import { renderTextToCanvas } from "@/lib/text/text-canvas-renderer";
import { resolveTextStyle } from "@/lib/text/text-style";
import type { TextElement } from "@/types/timeline";
import type { PreviewDimensions } from "./types";
import { resolveTextPreviewDomGeometry } from "./text-preview-dom-geometry";

export type TextPreviewRenderMode = "canvas" | "dom";

export function resolveTextPreviewRenderMode({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): TextPreviewRenderMode {
	const normalized = normalizeTextAnimations({ element, fps });
	if (normalized.source !== "canonical" || !normalized.animation) {
		return "dom";
	}
	const { entrance, exit, loop } = normalized.animation;
	return entrance || exit || loop ? "canvas" : "dom";
}

interface TextAnimationCanvasProps {
	element: TextElement;
	canvasSize: { width: number; height: number };
	previewDimensions: PreviewDimensions;
	currentTime: number;
	fps: number;
	boxWidth: number;
	boxHeight: number;
	zIndex: number;
	onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
	onSelect: ({ multi }: { multi: boolean }) => void;
}

function isSelectionKey({
	event,
}: {
	event: KeyboardEvent<HTMLDivElement>;
}): boolean {
	return event.key === "Enter" || event.key === " ";
}

export function TextAnimationCanvas({
	element,
	canvasSize,
	previewDimensions,
	currentTime,
	fps,
	boxWidth,
	boxHeight,
	zIndex,
	onPointerDown,
	onSelect,
}: TextAnimationCanvasProps): ReactNode {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [fontRevision, setFontRevision] = useState(0);
	const canvasWidth = Math.max(1, Math.round(canvasSize.width));
	const canvasHeight = Math.max(1, Math.round(canvasSize.height));
	const previewScale =
		previewDimensions.width > 0
			? previewDimensions.width / canvasWidth
			: previewDimensions.height > 0
				? previewDimensions.height / canvasHeight
				: 1;
	const blendMode = resolveTextStyle(element).blendMode;
	const fontRequest = `${element.fontStyle} ${element.fontWeight} 16px ${canvasFontFamily(element.fontFamily)}`;
	const crop = resolveTextAnimationPreviewCrop({
		element,
		canvas: { width: canvasWidth, height: canvasHeight },
		boxWidth,
		boxHeight,
		fps,
	});
	const interactionGeometry = resolveTextPreviewDomGeometry({
		boxWidth,
		boxHeight,
		previewScale,
		rotation: element.rotation,
	});

	useEffect(() => {
		if (!document.fonts) return;
		let active = true;
		void document.fonts
			.load(fontRequest, element.content)
			.then(() => {
				if (active) setFontRevision((revision) => revision + 1);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [element.content, fontRequest]);

	useLayoutEffect(() => {
		void fontRevision;
		const canvasElement = canvasRef.current;
		if (!canvasElement) return;
		const context = canvasElement.getContext("2d");
		if (!context) return;

		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, crop.width, crop.height);
		context.translate(-crop.x, -crop.y);
		renderTextToCanvas({
			ctx: context,
			canvas: { width: canvasWidth, height: canvasHeight },
			element:
				blendMode === "normal" ? element : { ...element, blendMode: "normal" },
			currentTime,
			fps,
		});
	}, [
		blendMode,
		canvasHeight,
		canvasWidth,
		crop.height,
		crop.width,
		crop.x,
		crop.y,
		currentTime,
		element,
		fontRevision,
		fps,
	]);

	const handleClick = ({ event }: { event: MouseEvent<HTMLDivElement> }) => {
		onSelect({ multi: event.shiftKey || event.metaKey });
	};
	const handleKeyDown = ({
		event,
	}: {
		event: KeyboardEvent<HTMLDivElement>;
	}) => {
		if (!isSelectionKey({ event })) return;
		event.preventDefault();
		onSelect({ multi: event.shiftKey || event.metaKey });
	};

	return (
		<>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-0 top-0 block"
				style={{
					height: `${crop.height * previewScale}px`,
					left: `${crop.x * previewScale}px`,
					mixBlendMode: blendMode,
					top: `${crop.y * previewScale}px`,
					width: `${crop.width * previewScale}px`,
					zIndex,
				}}
			>
				<canvas
					ref={canvasRef}
					data-text-animation-canvas={element.id}
					height={crop.height}
					style={{
						height: `${crop.height * previewScale}px`,
						width: `${crop.width * previewScale}px`,
					}}
					width={crop.width}
				/>
			</div>
			<div
				aria-label={`Select text element: ${element.content}`}
				className="absolute flex cursor-grab"
				data-text-animation-interaction={element.id}
				onClick={(event) => handleClick({ event })}
				onKeyDown={(event) => handleKeyDown({ event })}
				onPointerDown={onPointerDown}
				role="button"
				style={{
					height: `${interactionGeometry.frame.height}px`,
					left: `${50 + (element.x / canvasWidth) * 100}%`,
					top: `${50 + (element.y / canvasHeight) * 100}%`,
					transform: interactionGeometry.frame.transform,
					width: `${interactionGeometry.frame.width}px`,
					zIndex,
				}}
				tabIndex={0}
			/>
		</>
	);
}
