import {
	buildPlanarHomography,
	invertPlanarHomography,
	projectPlanarPoint,
	type PlanarQuad,
} from "@qcut/editor-core";
import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
} from "react";
import {
	getPlanarFitMapping,
	planarContainerPointToSource,
	sourcePointToPlanarContainer,
} from "@/lib/tracking/planar-tracking-overlay-geometry";
import { usePlanarTrackingEditorStore } from "@/stores/editor/planar-tracking-editor-store";

type QuadCorner = keyof PlanarQuad;

const HANDLES: Array<{ corner: QuadCorner; label: string }> = [
	{ corner: "topLeft", label: "Top left tracking corner" },
	{ corner: "topRight", label: "Top right tracking corner" },
	{ corner: "bottomRight", label: "Bottom right tracking corner" },
	{ corner: "bottomLeft", label: "Bottom left tracking corner" },
];

const ARROW_KEY_MOVEMENT = {
	ArrowDown: { x: 0, y: 1 },
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
} as const;

function clampNormalized({ value }: { value: number }): number {
	return Math.min(1, Math.max(0, value));
}

function localPointFromClient({
	clientX,
	clientY,
	element,
}: {
	clientX: number;
	clientY: number;
	element: HTMLDivElement;
}): { x: number; y: number } {
	const withBoxQuads = element as HTMLDivElement & {
		getBoxQuads?: () => DOMQuad[];
	};
	const box = withBoxQuads.getBoxQuads?.()[0];
	if (box && element.clientWidth > 0 && element.clientHeight > 0) {
		const matrix = buildPlanarHomography({
			source: {
				topLeft: { x: 0, y: 0 },
				topRight: { x: element.clientWidth, y: 0 },
				bottomRight: { x: element.clientWidth, y: element.clientHeight },
				bottomLeft: { x: 0, y: element.clientHeight },
			},
			destination: {
				topLeft: box.p1,
				topRight: box.p2,
				bottomRight: box.p3,
				bottomLeft: box.p4,
			},
		});
		const inverse = matrix ? invertPlanarHomography({ matrix }) : null;
		const projected = inverse
			? projectPlanarPoint({
					point: { x: clientX, y: clientY },
					matrix: inverse,
				})
			: null;
		if (projected) return projected;
	}
	const rect = element.getBoundingClientRect();
	return {
		x: ((clientX - rect.left) / Math.max(1, rect.width)) * element.clientWidth,
		y: ((clientY - rect.top) / Math.max(1, rect.height)) * element.clientHeight,
	};
}

export function PlanarTrackingSelectionOverlay({
	fitMode,
	sourceElementId,
	sourceHeight,
	sourceWidth,
}: {
	fitMode: "contain" | "cover" | "fill";
	sourceElementId: string;
	sourceHeight: number;
	sourceWidth: number;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const activeCorner = useRef<QuadCorner | null>(null);
	const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
	const selection = usePlanarTrackingEditorStore((state) => state.selection);
	const setSelectionQuad = usePlanarTrackingEditorStore(
		(state) => state.setSelectionQuad
	);
	const isActive = selection?.sourceElementId === sourceElementId;

	useLayoutEffect(() => {
		if (!isActive) return;
		const root = rootRef.current;
		if (!root) return;
		const update = (): void =>
			setContainerSize({ height: root.clientHeight, width: root.clientWidth });
		update();
		const observer = new ResizeObserver(update);
		observer.observe(root);
		return () => observer.disconnect();
	}, [isActive]);

	const mapping = useMemo(
		() =>
			getPlanarFitMapping({
				containerHeight: containerSize.height,
				containerWidth: containerSize.width,
				fitMode,
				sourceHeight,
				sourceWidth,
			}),
		[containerSize, fitMode, sourceHeight, sourceWidth]
	);
	if (!selection || !isActive) return null;

	const points = Object.fromEntries(
		HANDLES.map(({ corner }) => [
			corner,
			sourcePointToPlanarContainer({ mapping, point: selection.quad[corner] }),
		])
	) as Record<QuadCorner, { x: number; y: number }>;
	const updateFromClient = ({
		clientX,
		clientY,
		corner,
	}: {
		clientX: number;
		clientY: number;
		corner: QuadCorner;
	}): void => {
		const root = rootRef.current;
		if (!root) return;
		const sourcePoint = planarContainerPointToSource({
			mapping,
			point: localPointFromClient({ clientX, clientY, element: root }),
		});
		setSelectionQuad({
			stickerElementId: selection.stickerElementId,
			quad: {
				...selection.quad,
				[corner]: {
					x: clampNormalized({ value: sourcePoint.x }),
					y: clampNormalized({ value: sourcePoint.y }),
				},
			},
		});
	};
	const handleKeyboard = ({
		corner,
		event,
	}: {
		corner: QuadCorner;
		event: KeyboardEvent<HTMLButtonElement>;
	}): void => {
		const delta = event.shiftKey ? 0.02 : 0.005;
		const unit =
			ARROW_KEY_MOVEMENT[event.key as keyof typeof ARROW_KEY_MOVEMENT];
		if (!unit) return;
		event.preventDefault();
		const current = selection.quad[corner];
		setSelectionQuad({
			stickerElementId: selection.stickerElementId,
			quad: {
				...selection.quad,
				[corner]: {
					x: clampNormalized({ value: current.x + unit.x * delta }),
					y: clampNormalized({ value: current.y + unit.y * delta }),
				},
			},
		});
	};
	const finishPointerInteraction = ({
		corner,
		event,
	}: {
		corner: QuadCorner;
		event: PointerEvent<HTMLButtonElement>;
	}): void => {
		if (activeCorner.current === corner) activeCorner.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	return (
		<div
			ref={rootRef}
			className="pointer-events-none absolute inset-0 z-[70] overflow-visible"
			data-testid="planar-tracking-selection-overlay"
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 size-full overflow-visible"
				viewBox={`0 0 ${Math.max(1, containerSize.width)} ${Math.max(1, containerSize.height)}`}
			>
				<polygon
					points={[
						points.topLeft,
						points.topRight,
						points.bottomRight,
						points.bottomLeft,
					]
						.map((point) => `${point.x},${point.y}`)
						.join(" ")}
					fill="rgba(6, 182, 212, 0.12)"
					stroke="#22d3ee"
					strokeWidth="2"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			{HANDLES.map(({ corner, label }) => (
				<button
					key={corner}
					type="button"
					aria-label={label}
					title={label}
					className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
					style={{ left: points[corner].x, top: points[corner].y }}
					onKeyDown={(event) => handleKeyboard({ corner, event })}
					onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
						event.preventDefault();
						event.stopPropagation();
						activeCorner.current = corner;
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
						if (activeCorner.current !== corner) return;
						updateFromClient({
							clientX: event.clientX,
							clientY: event.clientY,
							corner,
						});
					}}
					onPointerUp={(event: PointerEvent<HTMLButtonElement>) =>
						finishPointerInteraction({ corner, event })
					}
					onPointerCancel={(event: PointerEvent<HTMLButtonElement>) =>
						finishPointerInteraction({ corner, event })
					}
				/>
			))}
		</div>
	);
}
