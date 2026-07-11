import { useEffect, useMemo, useRef, useState } from "react";
import type {
	MediaCustomCutoutPoint,
	MediaCustomCutoutStroke,
	MediaElement,
} from "@/types/timeline";
import {
	activeCustomCutoutStrokes,
	appendCustomCutoutPoint,
	eraseCustomCutoutStrokes,
	normalizeMediaCustomCutout,
} from "@/lib/video/media-custom-cutout";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { useCustomCutoutEditorStore } from "@/stores/editor/custom-cutout-editor-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

function strokePath({ stroke }: { stroke: MediaCustomCutoutStroke }) {
	return stroke.points
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"} ${point.x * 100} ${point.y * 100}`
		)
		.join(" ");
}

function pointerPoint({
	event,
}: {
	event: React.PointerEvent<SVGSVGElement>;
}): MediaCustomCutoutPoint {
	const bounds = event.currentTarget.getBoundingClientRect();
	return {
		x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
		y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
	};
}

export function CustomCutoutOverlay({
	element,
	trackId,
	currentFrame,
}: {
	element: MediaElement;
	trackId: string;
	currentFrame: number;
}) {
	const activeElementId = useCustomCutoutEditorStore(
		(state) => state.elementId
	);
	const editing = useCustomCutoutEditorStore((state) => state.editing);
	const tool = useCustomCutoutEditorStore((state) => state.tool);
	const brushSize = useCustomCutoutEditorStore((state) => state.brushSize);
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const [currentStroke, setCurrentStroke] =
		useState<MediaCustomCutoutStroke | null>(null);
	const [cursor, setCursor] = useState<MediaCustomCutoutPoint | null>(null);
	const strokesRef = useRef(element.customCutout?.strokes ?? []);
	const erasingRef = useRef(false);
	const settings = normalizeMediaCustomCutout(element.customCutout);
	const isActive = editing && activeElementId === element.id;

	useEffect(() => {
		strokesRef.current = element.customCutout?.strokes ?? [];
	}, [element.customCutout?.strokes]);

	const visibleStrokes = useMemo(
		() =>
			activeCustomCutoutStrokes({
				customCutout: settings,
				currentFrame,
			}),
		[currentFrame, settings]
	);

	if (!isActive) return null;

	const resultDisabledMasks = () =>
		resolveMediaMasks(element).map((mask) =>
			mask.id === settings.resultMaskId ? { ...mask, enabled: false } : mask
		);
	const persistStrokes = ({
		strokes,
		history,
	}: {
		strokes: MediaCustomCutoutStroke[];
		history: boolean;
	}) => {
		strokesRef.current = strokes;
		updateMediaElement(
			trackId,
			element.id,
			{
				customCutout: {
					...settings,
					enabled: true,
					applyStrokes: true,
					strokes,
					status: "idle",
					error: undefined,
				},
				masks: resultDisabledMasks(),
			},
			history
		);
	};
	const eraseAt = ({ point }: { point: MediaCustomCutoutPoint }) => {
		const next = eraseCustomCutoutStrokes({
			strokes: strokesRef.current,
			point,
			size: brushSize,
			frame: currentFrame,
		});
		if (next.length === strokesRef.current.length) return;
		persistStrokes({ strokes: next, history: false });
	};
	const finishInteraction = ({ pointerId }: { pointerId: number }) => {
		if (currentStroke) {
			persistStrokes({
				strokes: [...strokesRef.current, currentStroke],
				history: true,
			});
			setCurrentStroke(null);
		}
		erasingRef.current = false;
		const overlay = document.querySelector<SVGSVGElement>(
			`[data-custom-cutout-element="${element.id}"]`
		);
		if (overlay?.hasPointerCapture(pointerId)) {
			overlay.releasePointerCapture(pointerId);
		}
	};

	return (
		<svg
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			className="absolute inset-0 z-40 size-full cursor-crosshair touch-none"
			data-testid="custom-cutout-overlay"
			data-custom-cutout-element={element.id}
			role="application"
			aria-label="Custom cutout brush canvas"
			onPointerDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				const point = pointerPoint({ event });
				setCursor(point);
				if (tool === "erase") {
					pushHistory();
					erasingRef.current = true;
					eraseAt({ point });
					return;
				}
				setCurrentStroke({
					id: `custom-cutout-${crypto.randomUUID()}`,
					frame: currentFrame,
					mode: tool,
					size: brushSize,
					points: [point],
				});
			}}
			onPointerMove={(event) => {
				const point = pointerPoint({ event });
				setCursor(point);
				if (erasingRef.current) {
					eraseAt({ point });
					return;
				}
				setCurrentStroke((stroke) =>
					stroke
						? {
								...stroke,
								points: appendCustomCutoutPoint({
									points: stroke.points,
									point,
									minimumDistance: Math.max(0.002, brushSize / 6),
								}),
							}
						: null
				);
			}}
			onPointerUp={(event) => finishInteraction({ pointerId: event.pointerId })}
			onPointerCancel={(event) =>
				finishInteraction({ pointerId: event.pointerId })
			}
			onPointerLeave={() => setCursor(null)}
		>
			<g opacity="0.76">
				{[...visibleStrokes, ...(currentStroke ? [currentStroke] : [])].map(
					(stroke) => {
						const color = stroke.mode === "foreground" ? "#34d399" : "#f87171";
						const first = stroke.points[0];
						return stroke.points.length === 1 ? (
							<circle
								key={stroke.id}
								cx={first.x * 100}
								cy={first.y * 100}
								r={stroke.size * 50}
								fill={color}
							/>
						) : (
							<path
								key={stroke.id}
								d={strokePath({ stroke })}
								fill="none"
								stroke={color}
								strokeWidth={stroke.size * 100}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						);
					}
				)}
			</g>
			{cursor ? (
				<circle
					cx={cursor.x * 100}
					cy={cursor.y * 100}
					r={brushSize * 50}
					fill="none"
					stroke="white"
					strokeWidth={0.35}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}
		</svg>
	);
}
