import { useEffect, useRef, useState } from "react";
import { DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY } from "@qcut/editor-core";
import { screenPointToManualBodyPoint } from "@/lib/portrait/portrait-manual-body-coordinates";
import { usePortraitManualBodyStore } from "@/stores/editor/portrait-manual-body-store";
import type { MediaPortraitManualBody } from "@/types/timeline";

type DragKind =
	| "stretch-upper"
	| "stretch-bottom"
	| "slim-move"
	| "slim-resize"
	| "slim-rotate"
	| "zoom-move"
	| "zoom-radius";

interface DragState {
	kind: DragKind;
	start: { x: number; y: number };
	value: MediaPortraitManualBody;
}

function clamp({
	max,
	min,
	value,
}: {
	max: number;
	min: number;
	value: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function copyBody({
	manualBody,
}: {
	manualBody: MediaPortraitManualBody;
}): MediaPortraitManualBody {
	return {
		...(manualBody.stretch ? { stretch: { ...manualBody.stretch } } : {}),
		...(manualBody.slim ? { slim: { ...manualBody.slim } } : {}),
		...(manualBody.zoom ? { zoom: { ...manualBody.zoom } } : {}),
	};
}

export function PortraitManualBodyOverlay({
	elementId,
}: {
	elementId: string;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ width: 1, height: 1 });
	const [drag, setDrag] = useState<DragState | null>(null);
	const active = usePortraitManualBodyStore((state) => state.active);
	const activeElementId = usePortraitManualBodyStore(
		(state) => state.elementId
	);
	const tool = usePortraitManualBodyStore((state) => state.tool);
	const manualBody = usePortraitManualBodyStore((state) => state.manualBody);
	const beginInteraction = usePortraitManualBodyStore(
		(state) => state.beginInteraction
	);
	const updateManualBody = usePortraitManualBodyStore(
		(state) => state.updateManualBody
	);
	const finishInteraction = usePortraitManualBodyStore(
		(state) => state.finishInteraction
	);
	const cancelInteraction = usePortraitManualBodyStore(
		(state) => state.cancelInteraction
	);

	useEffect(() => {
		if (!active || activeElementId !== elementId) return;
		const svg = svgRef.current;
		if (!svg) return;
		const updateSize = () => {
			const bounds = svg.getBoundingClientRect();
			setSize({
				width: Math.max(1, bounds.width),
				height: Math.max(1, bounds.height),
			});
		};
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(svg);
		return () => observer.disconnect();
	}, [active, activeElementId, elementId]);

	if (!active || activeElementId !== elementId) return null;
	const pointForEvent = ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => {
		const svg = svgRef.current;
		const matrix = svg?.getScreenCTM();
		if (!svg || !matrix) return null;
		return screenPointToManualBodyPoint({
			clientX,
			clientY,
			width: size.width,
			height: size.height,
			matrix,
		});
	};
	const beginDrag = ({
		event,
		kind,
	}: {
		event: React.PointerEvent<SVGElement>;
		kind: DragKind;
	}) => {
		if (event.button !== 0) return;
		const point = pointForEvent(event);
		if (!point || !svgRef.current) return;
		svgRef.current.setPointerCapture(event.pointerId);
		beginInteraction();
		setDrag({ kind, start: point, value: copyBody({ manualBody }) });
		event.preventDefault();
		event.stopPropagation();
	};
	const updateDrag = ({ point }: { point: { x: number; y: number } }) => {
		if (!drag) return;
		if (drag.kind === "stretch-upper" || drag.kind === "stretch-bottom") {
			const value =
				drag.value.stretch ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch;
			const next =
				drag.kind === "stretch-upper"
					? {
							...value,
							upper: clamp({
								value: point.y,
								min: value.bottom + 0.02,
								max: 1,
							}),
						}
					: {
							...value,
							bottom: clamp({
								value: point.y,
								min: 0,
								max: value.upper - 0.02,
							}),
						};
			updateManualBody({ manualBody: { ...manualBody, stretch: next } });
			return;
		}
		if (drag.kind.startsWith("slim")) {
			const value = drag.value.slim ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim;
			if (drag.kind === "slim-move") {
				updateManualBody({
					manualBody: {
						...manualBody,
						slim: { ...value, x: point.x, y: point.y },
					},
				});
				return;
			}
			const pixelX = (point.x - value.x) * size.width;
			const pixelY = (point.y - value.y) * size.height;
			if (drag.kind === "slim-rotate") {
				const rotation = clamp({
					value: (Math.atan2(pixelY, pixelX) * 180) / Math.PI + 90,
					min: -180,
					max: 180,
				});
				updateManualBody({
					manualBody: { ...manualBody, slim: { ...value, rotation } },
				});
				return;
			}
			const radians = (-value.rotation * Math.PI) / 180;
			const localX = pixelX * Math.cos(radians) - pixelY * Math.sin(radians);
			const localY = pixelX * Math.sin(radians) + pixelY * Math.cos(radians);
			updateManualBody({
				manualBody: {
					...manualBody,
					slim: {
						...value,
						width: clamp({
							value: (Math.abs(localX) * 2) / size.width,
							min: 0.02,
							max: 1,
						}),
						height: clamp({
							value: (Math.abs(localY) * 2) / size.height,
							min: 0.02,
							max: 1,
						}),
					},
				},
			});
			return;
		}
		const value = drag.value.zoom ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom;
		if (drag.kind === "zoom-move") {
			updateManualBody({
				manualBody: {
					...manualBody,
					zoom: { ...value, x: point.x, y: point.y },
				},
			});
			return;
		}
		const radius =
			Math.hypot(
				(point.x - value.x) * size.width,
				(point.y - value.y) * size.height
			) / Math.min(size.width, size.height);
		updateManualBody({
			manualBody: {
				...manualBody,
				zoom: {
					...value,
					radius: clamp({ value: radius, min: 0.01, max: 0.5 }),
				},
			},
		});
	};
	const finishDrag = ({
		event,
	}: {
		event: React.PointerEvent<SVGSVGElement>;
	}) => {
		if (!drag) return;
		setDrag(null);
		finishInteraction();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		event.preventDefault();
		event.stopPropagation();
	};
	const cancelDrag = () => {
		setDrag(null);
		cancelInteraction();
	};
	const stroke = "rgb(34 211 238)";
	const handle = "rgb(255 255 255)";
	const stretch =
		manualBody.stretch ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch;
	const slim = manualBody.slim ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim;
	const zoom = manualBody.zoom ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom;
	const slimWidth = slim.width * size.width;
	const slimHeight = slim.height * size.height;
	const zoomRadius = zoom.radius * Math.min(size.width, size.height);

	return (
		<svg
			ref={svgRef}
			className="absolute inset-0 z-[70] size-full touch-none"
			data-testid="portrait-manual-body-overlay"
			data-manual-body-tool={tool}
			role="application"
			aria-label="Manual body canvas controls"
			onPointerMove={(event) => {
				if (!drag) return;
				const point = pointForEvent(event);
				if (point) updateDrag({ point });
			}}
			onPointerUp={(event) => finishDrag({ event })}
			onPointerCancel={cancelDrag}
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			{tool === "stretch" ? (
				<>
					{(["upper", "bottom"] as const).map((line) => {
						const y = stretch[line] * size.height;
						return (
							<g key={line} data-testid={`manual-body-stretch-${line}`}>
								<line
									x1={0}
									x2={size.width}
									y1={y}
									y2={y}
									stroke={stroke}
									strokeWidth={2}
									strokeDasharray="8 5"
								/>
								<circle
									cx={size.width / 2}
									cy={y}
									r={8}
									fill={handle}
									stroke={stroke}
									strokeWidth={3}
									className="cursor-ns-resize"
									data-testid={`manual-body-stretch-${line}-handle`}
									onPointerDown={(event) =>
										beginDrag({ event, kind: `stretch-${line}` })
									}
								/>
							</g>
						);
					})}
				</>
			) : null}
			{tool === "slim" ? (
				<g
					transform={`rotate(${slim.rotation} ${slim.x * size.width} ${slim.y * size.height})`}
				>
					<rect
						x={slim.x * size.width - slimWidth / 2}
						y={slim.y * size.height - slimHeight / 2}
						width={slimWidth}
						height={slimHeight}
						fill="rgb(34 211 238 / 0.08)"
						stroke={stroke}
						strokeWidth={2}
						strokeDasharray="8 5"
						className="cursor-move"
						data-testid="manual-body-slim-rect"
						onPointerDown={(event) => beginDrag({ event, kind: "slim-move" })}
					/>
					<line
						x1={slim.x * size.width}
						y1={slim.y * size.height - slimHeight / 2}
						x2={slim.x * size.width}
						y2={slim.y * size.height - slimHeight / 2 - 28}
						stroke={stroke}
						strokeWidth={2}
					/>
					<circle
						cx={slim.x * size.width}
						cy={slim.y * size.height - slimHeight / 2 - 28}
						r={7}
						fill={handle}
						stroke={stroke}
						strokeWidth={3}
						className="cursor-grab"
						data-testid="manual-body-slim-rotate"
						onPointerDown={(event) => beginDrag({ event, kind: "slim-rotate" })}
					/>
					<circle
						cx={slim.x * size.width + slimWidth / 2}
						cy={slim.y * size.height + slimHeight / 2}
						r={8}
						fill={handle}
						stroke={stroke}
						strokeWidth={3}
						className="cursor-nwse-resize"
						data-testid="manual-body-slim-resize"
						onPointerDown={(event) => beginDrag({ event, kind: "slim-resize" })}
					/>
				</g>
			) : null}
			{tool === "zoom" ? (
				<>
					<circle
						cx={zoom.x * size.width}
						cy={zoom.y * size.height}
						r={zoomRadius}
						fill="rgb(34 211 238 / 0.08)"
						stroke={stroke}
						strokeWidth={2}
						strokeDasharray="8 5"
						className="cursor-move"
						data-testid="manual-body-zoom-circle"
						onPointerDown={(event) => beginDrag({ event, kind: "zoom-move" })}
					/>
					<circle
						cx={zoom.x * size.width + zoomRadius}
						cy={zoom.y * size.height}
						r={8}
						fill={handle}
						stroke={stroke}
						strokeWidth={3}
						className="cursor-ew-resize"
						data-testid="manual-body-zoom-radius"
						onPointerDown={(event) => beginDrag({ event, kind: "zoom-radius" })}
					/>
				</>
			) : null}
		</svg>
	);
}
