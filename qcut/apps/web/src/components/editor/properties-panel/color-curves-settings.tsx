import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ColorCurvePoint, ColorKeyframeProperty } from "@/types/timeline";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	ColorKeyframedControl,
	ColorModuleSection,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

type CurveChannel = "master" | "red" | "green" | "blue";

const CURVE_COLORS: Record<CurveChannel, string> = {
	master: "#e5e7eb",
	red: "#ef4444",
	green: "#22c55e",
	blue: "#3b82f6",
};

function normalizedPointer({
	event,
	element,
}: {
	event: React.PointerEvent<SVGSVGElement>;
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

export function ColorCurvesSettings({
	bindings,
}: {
	bindings: ColorSettingsEditorBindings;
}) {
	const [channel, setChannel] = useState<CurveChannel>("master");
	const [selectedPoint, setSelectedPoint] = useState<string | undefined>(
		undefined
	);
	const draggingPoint = useRef<string | undefined>(undefined);
	const { settings, onSettingsChange } = bindings;
	const points = settings.curves[channel];
	const setPoints = (next: ColorCurvePoint[]) =>
		onSettingsChange({
			...settings,
			curves: {
				...settings.curves,
				[channel]: [...next].sort((left, right) => left.x - right.x),
			},
		});
	const movePoint = ({ id, x, y }: { id: string; x: number; y: number }) => {
		const index = points.findIndex((point) => point.id === id);
		if (index < 0) return;
		const point = points[index];
		const isEndpoint = index === 0 || index === points.length - 1;
		setPoints(
			points.map((candidate) =>
				candidate.id === id
					? { ...candidate, x: isEndpoint ? point.x : x, y }
					: candidate
			)
		);
	};
	const resetCurves = () => {
		setSelectedPoint(undefined);
		onSettingsChange({
			...removeColorKeyframes({
				settings,
				properties: ["curves.mix" as ColorKeyframeProperty],
			}),
			curves: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS.curves),
		});
	};
	return (
		<ColorModuleSection
			title="RGB curves"
			enabled={settings.curves.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					curves: { ...settings.curves, enabled },
				})
			}
			onReset={resetCurves}
			defaultExpanded
			testId="color-module-curves"
		>
			<ToggleGroup
				type="single"
				value={channel}
				onValueChange={(value) => {
					if (["master", "red", "green", "blue"].includes(value)) {
						setChannel(value as CurveChannel);
						setSelectedPoint(undefined);
					}
				}}
				className="grid grid-cols-4"
			>
				{(["master", "red", "green", "blue"] as const).map((name) => (
					<ToggleGroupItem key={name} value={name} aria-label={`${name} curve`}>
						<span
							className="size-2 rounded-full"
							style={{ backgroundColor: CURVE_COLORS[name] }}
						/>
						{name === "master" ? "Y" : name[0].toUpperCase()}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<button
				type="button"
				className="relative aspect-square w-full overflow-hidden rounded border border-border bg-black/40 p-0 text-left"
				aria-label={`${channel} curve editor`}
				onKeyDown={(event) => {
					if (
						!selectedPoint ||
						!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
							event.key
						)
					)
						return;
					event.preventDefault();
					const point = points.find(
						(candidate) => candidate.id === selectedPoint
					);
					if (!point) return;
					movePoint({
						id: point.id,
						x:
							point.x +
							(event.key === "ArrowRight"
								? 0.01
								: event.key === "ArrowLeft"
									? -0.01
									: 0),
						y:
							point.y +
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
						bindings.onInteractionStart();
						const position = normalizedPointer({
							event,
							element: event.currentTarget,
						});
						const id = `curve-${crypto.randomUUID()}`;
						setPoints([...points, { id, ...position }]);
						setSelectedPoint(id);
						draggingPoint.current = id;
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						if (!draggingPoint.current) return;
						movePoint({
							id: draggingPoint.current,
							...normalizedPointer({ event, element: event.currentTarget }),
						});
					}}
					onPointerUp={(event) => {
						draggingPoint.current = undefined;
						bindings.onInteractionEnd();
						event.currentTarget.releasePointerCapture(event.pointerId);
					}}
					onPointerCancel={() => {
						draggingPoint.current = undefined;
						bindings.onInteractionEnd();
					}}
				>
					{[25, 50, 75].flatMap((position) => [
						<line
							key={`v-${position}`}
							x1={position}
							x2={position}
							y1="0"
							y2="100"
							stroke="currentColor"
							opacity="0.12"
						/>,
						<line
							key={`h-${position}`}
							x1="0"
							x2="100"
							y1={position}
							y2={position}
							stroke="currentColor"
							opacity="0.12"
						/>,
					])}
					<polyline
						points={[...points]
							.sort((left, right) => left.x - right.x)
							.map((point) => `${point.x * 100},${(1 - point.y) * 100}`)
							.join(" ")}
						fill="none"
						stroke={CURVE_COLORS[channel]}
						strokeWidth="1.5"
					/>
					{points.map((point) => (
						<circle
							key={point.id}
							cx={point.x * 100}
							cy={(1 - point.y) * 100}
							r={selectedPoint === point.id ? 3 : 2.2}
							fill={CURVE_COLORS[channel]}
							stroke="white"
							strokeWidth="0.7"
							onPointerDown={(event) => {
								event.stopPropagation();
								bindings.onInteractionStart();
								setSelectedPoint(point.id);
								draggingPoint.current = point.id;
								event.currentTarget.ownerSVGElement?.setPointerCapture(
									event.pointerId
								);
							}}
						/>
					))}
				</svg>
			</button>
			<div className="flex justify-end">
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					aria-label="Delete curve point"
					title="Delete curve point"
					disabled={
						!selectedPoint ||
						points.findIndex((point) => point.id === selectedPoint) <= 0 ||
						points.findIndex((point) => point.id === selectedPoint) ===
							points.length - 1
					}
					onClick={() => {
						setPoints(points.filter((point) => point.id !== selectedPoint));
						setSelectedPoint(undefined);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ")
							event.currentTarget.click();
					}}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</div>
			<ColorKeyframedControl property="curves.mix" bindings={bindings} />
		</ColorModuleSection>
	);
}
