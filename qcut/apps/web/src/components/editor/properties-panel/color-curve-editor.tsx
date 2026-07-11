import { Trash2 } from "lucide-react";
import { useMemo, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ColorCurvePoint } from "@/types/timeline";
import {
	createCurveSampler,
	insertCurvePoint,
} from "@/lib/color/color-curve-math";
import { cn } from "@/lib/utils";

export type ColorCurveBackground =
	| "master"
	| "red"
	| "green"
	| "blue"
	| "hue-saturation"
	| "hue-hue"
	| "hue-luminance"
	| "luminance-saturation"
	| "saturation-saturation";

const MINIMUM_POINT_SPACING = 0.01;

const BACKGROUNDS: Record<ColorCurveBackground, string> = {
	master: "linear-gradient(to right, #090909, #e5e7eb)",
	red: "linear-gradient(to right, #090909, #dc2626)",
	green: "linear-gradient(to right, #090909, #16a34a)",
	blue: "linear-gradient(to right, #090909, #2563eb)",
	"hue-saturation":
		"linear-gradient(to bottom, transparent, rgba(128,128,128,.78)), linear-gradient(to right, #ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
	"hue-hue":
		"linear-gradient(to right, #ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
	"hue-luminance":
		"linear-gradient(to bottom, rgba(255,255,255,.65), transparent 50%, rgba(0,0,0,.72)), linear-gradient(to right, #ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
	"luminance-saturation":
		"linear-gradient(to bottom, transparent, rgba(96,96,96,.7)), linear-gradient(to right, #090909, #f4f4f5)",
	"saturation-saturation":
		"linear-gradient(to bottom, rgba(255,255,255,.28), transparent 50%, rgba(0,0,0,.48)), linear-gradient(to right, #737373, #ef4444)",
};

function normalizedPointer({
	event,
	element,
}: {
	event: PointerEvent<SVGSVGElement>;
	element: SVGSVGElement;
}) {
	const bounds = element.getBoundingClientRect();
	return {
		x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
		y: Math.min(
			1,
			Math.max(0, 1 - (event.clientY - bounds.top) / bounds.height)
		),
	};
}

function curvePath({ points }: { points: ColorCurvePoint[] }): string {
	const sample = createCurveSampler({ points });
	return Array.from({ length: 129 }, (_, index) => {
		const x = index / 128;
		const command = index === 0 ? "M" : "L";
		return `${command}${(x * 100).toFixed(3)},${((1 - sample(x)) * 100).toFixed(3)}`;
	}).join(" ");
}

function sortedPoints({ points }: { points: ColorCurvePoint[] }) {
	return [...points].sort((left, right) => left.x - right.x);
}

export function ColorCurveEditor({
	label,
	points,
	selectedPointId,
	stroke,
	background,
	wide = false,
	centeredOutput = false,
	linkEndpoints = false,
	onPointsChange,
	onSelectedPointChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	points: ColorCurvePoint[];
	selectedPointId: string | undefined;
	stroke: string;
	background: ColorCurveBackground;
	wide?: boolean;
	centeredOutput?: boolean;
	linkEndpoints?: boolean;
	onPointsChange: (points: ColorCurvePoint[]) => void;
	onSelectedPointChange: (id: string | undefined) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const ordered = sortedPoints({ points });
	const selectedPoint = ordered.find((point) => point.id === selectedPointId);
	const path = useMemo(() => curvePath({ points }), [points]);
	const movePoint = ({ id, x, y }: { id: string; x: number; y: number }) => {
		const index = ordered.findIndex((point) => point.id === id);
		if (index < 0) return;
		const endpoint = index === 0 || index === ordered.length - 1;
		const minimumX = ordered[index - 1]?.x ?? 0;
		const maximumX = ordered[index + 1]?.x ?? 1;
		const nextX = endpoint
			? ordered[index].x
			: Math.min(
					maximumX - MINIMUM_POINT_SPACING,
					Math.max(minimumX + MINIMUM_POINT_SPACING, x)
				);
		const nextY = Math.min(1, Math.max(0, y));
		onPointsChange(
			ordered.map((point, pointIndex) => {
				if (point.id === id) return { ...point, x: nextX, y: nextY };
				if (
					linkEndpoints &&
					endpoint &&
					(pointIndex === 0 || pointIndex === ordered.length - 1)
				) {
					return { ...point, y: nextY };
				}
				return point;
			})
		);
	};
	const deleteSelectedPoint = () => {
		if (!selectedPointId) return;
		const index = ordered.findIndex((point) => point.id === selectedPointId);
		if (index <= 0 || index === ordered.length - 1) return;
		onPointsChange(ordered.filter((point) => point.id !== selectedPointId));
		onSelectedPointChange(undefined);
	};
	return (
		<div className="space-y-2">
			<button
				type="button"
				className={cn(
					"relative w-full overflow-hidden rounded border border-border p-0 text-left",
					wide ? "aspect-[2/1]" : "aspect-square"
				)}
				style={{ background: BACKGROUNDS[background] }}
				aria-label={`${label} curve editor`}
				onKeyDown={(event) => {
					if (event.key === "Delete" || event.key === "Backspace") {
						event.preventDefault();
						deleteSelectedPoint();
						return;
					}
					if (
						!selectedPoint ||
						!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
							event.key
						)
					) {
						return;
					}
					event.preventDefault();
					movePoint({
						id: selectedPoint.id,
						x:
							selectedPoint.x +
							(event.key === "ArrowRight"
								? 0.01
								: event.key === "ArrowLeft"
									? -0.01
									: 0),
						y:
							selectedPoint.y +
							(event.key === "ArrowUp"
								? 0.01
								: event.key === "ArrowDown"
									? -0.01
									: 0),
					});
				}}
			>
				<svg
					viewBox="0 0 100 100"
					className="size-full touch-none"
					onPointerDown={(event) => {
						event.currentTarget.parentElement?.focus();
						if (event.target !== event.currentTarget) return;
						const position = normalizedPointer({
							event,
							element: event.currentTarget,
						});
						const id = `curve-${crypto.randomUUID()}`;
						const nextPoints = insertCurvePoint({
							points: ordered,
							point: { id, ...position },
							minimumSpacing: MINIMUM_POINT_SPACING,
						});
						if (nextPoints.length === ordered.length) return;
						onInteractionStart();
						onPointsChange(nextPoints);
						onSelectedPointChange(id);
						event.currentTarget.dataset.draggingPoint = id;
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						const id = event.currentTarget.dataset.draggingPoint;
						if (!id) return;
						movePoint({
							id,
							...normalizedPointer({ event, element: event.currentTarget }),
						});
					}}
					onPointerUp={(event) => {
						if (!event.currentTarget.dataset.draggingPoint) return;
						event.currentTarget.dataset.draggingPoint = "";
						onInteractionEnd();
						if (event.currentTarget.hasPointerCapture(event.pointerId)) {
							event.currentTarget.releasePointerCapture(event.pointerId);
						}
					}}
					onPointerCancel={(event) => {
						if (!event.currentTarget.dataset.draggingPoint) return;
						event.currentTarget.dataset.draggingPoint = "";
						onInteractionEnd();
					}}
				>
					<title>{label} curve editor</title>
					{[25, 50, 75].flatMap((position) => [
						<line
							key={`v-${position}`}
							x1={position}
							x2={position}
							y1="0"
							y2="100"
							stroke="white"
							opacity="0.14"
							pointerEvents="none"
						/>,
						<line
							key={`h-${position}`}
							x1="0"
							x2="100"
							y1={position}
							y2={position}
							stroke="white"
							opacity="0.14"
							pointerEvents="none"
						/>,
					])}
					<path
						d={path}
						fill="none"
						stroke={stroke}
						strokeWidth="1.4"
						pointerEvents="none"
					/>
					{ordered.map((point) => (
						<circle
							key={point.id}
							cx={point.x * 100}
							cy={(1 - point.y) * 100}
							r={selectedPointId === point.id ? 3 : 2.2}
							fill={stroke}
							stroke="white"
							strokeWidth="0.7"
							onPointerDown={(event) => {
								event.stopPropagation();
								onInteractionStart();
								onSelectedPointChange(point.id);
								const svg = event.currentTarget.ownerSVGElement;
								if (!svg) return;
								svg.dataset.draggingPoint = point.id;
								svg.setPointerCapture(event.pointerId);
							}}
						/>
					))}
				</svg>
			</button>
			<div className="flex min-h-7 items-center gap-2">
				{selectedPoint ? (
					<>
						<label className="flex items-center gap-1 text-[10px] text-muted-foreground">
							In
							<Input
								type="number"
								aria-label={`${label} point input`}
								value={Math.round(selectedPoint.x * 1000) / 10}
								min={0}
								max={100}
								step={0.1}
								disabled={
									selectedPoint === ordered[0] ||
									selectedPoint === ordered.at(-1)
								}
								onFocus={onInteractionStart}
								onBlur={onInteractionEnd}
								onChange={(event) =>
									movePoint({
										id: selectedPoint.id,
										x: Number(event.target.value) / 100,
										y: selectedPoint.y,
									})
								}
								className="h-7 w-16 px-2 text-right text-[10px]"
							/>
						</label>
						<label className="flex items-center gap-1 text-[10px] text-muted-foreground">
							Out
							<Input
								type="number"
								aria-label={`${label} point output`}
								value={
									centeredOutput
										? Math.round((selectedPoint.y - 0.5) * 2000) / 10
										: Math.round(selectedPoint.y * 1000) / 10
								}
								min={centeredOutput ? -100 : 0}
								max={100}
								step={0.1}
								onFocus={onInteractionStart}
								onBlur={onInteractionEnd}
								onChange={(event) =>
									movePoint({
										id: selectedPoint.id,
										x: selectedPoint.x,
										y: centeredOutput
											? Number(event.target.value) / 200 + 0.5
											: Number(event.target.value) / 100,
									})
								}
								className="h-7 w-16 px-2 text-right text-[10px]"
							/>
						</label>
					</>
				) : (
					<span className="text-[10px] text-muted-foreground">
						Select a point
					</span>
				)}
				<Button
					type="button"
					variant="text"
					size="icon"
					className="ml-auto size-7"
					aria-label={`Delete ${label} curve point`}
					title={`Delete ${label} curve point`}
					disabled={
						!selectedPoint ||
						selectedPoint === ordered[0] ||
						selectedPoint === ordered.at(-1)
					}
					onClick={deleteSelectedPoint}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
