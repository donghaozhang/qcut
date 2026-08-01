import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { SquareRoundCorner } from "lucide-react";
import { updateMediaMaskAtFrame } from "@/lib/video/media-mask-stack";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	AdjustmentElement,
	MediaElement,
	MediaMask,
	MediaMaskMirrorMode,
} from "@/types/timeline";
import {
	clamp,
	featherOutlineInsetPercent,
	featherPathStrokeWidth,
	isPointInteractionMode,
	keyboardDelta,
	linearFeatherFromHandle,
	linearFeatherFromKeyboard,
	linearFeatherOffsetPixels,
	localDelta,
	MASK_RESIZE_HANDLES,
	moveMaskPoint,
	penPathData,
	pointId,
	pointerAngle,
	resizeMaskFromHandle,
	resizeMaskFromKeyboard,
	type ResizeHandle,
	type LinearFeatherEdge,
	type MaskInteraction,
	type MaskInteractionMode,
	type PointInteractionMode,
} from "./media-mask-overlay-utils";

interface MediaMaskOverlayProps {
	element: MediaElement | AdjustmentElement;
	trackId: string;
	mask: MediaMask;
	currentTime: number;
	fps: number;
}

export function MediaMaskOverlay({
	element,
	trackId,
	mask,
	currentTime,
	fps,
}: MediaMaskOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [interaction, setInteraction] = useState<MaskInteraction | null>(null);
	const [roundnessHandlePosition, setRoundnessHandlePosition] =
		useState<CSSProperties>();
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
	);
	const updateAdjustmentElement = useTimelineStore(
		(state) => state.updateAdjustmentElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const maskId = mask.id ?? "mask";

	const updateMask = useCallback(
		({
			updates,
			history,
		}: {
			updates: Partial<MediaMask>;
			history: boolean;
		}) => {
			const frame = Math.max(
				0,
				Math.round((currentTime - element.startTime) * fps)
			);
			const nextMasks = resolveMediaMasks(element).map((item) =>
				item.id === mask.id
					? updateMediaMaskAtFrame({ mask: item, updates, frame })
					: item
			);
			if (element.type === "adjustment") {
				updateAdjustmentElement(
					trackId,
					element.id,
					{ masks: nextMasks },
					history
				);
				return;
			}
			updateMediaElement(trackId, element.id, { masks: nextMasks }, history);
		},
		[
			currentTime,
			element,
			fps,
			mask.id,
			trackId,
			updateAdjustmentElement,
			updateMediaElement,
		]
	);

	const beginInteraction = useCallback(
		({
			event,
			mode,
			pointId: selectedPointId,
			resizeHandle,
			linearFeatherEdge,
		}: {
			event: ReactPointerEvent;
			mode: MaskInteractionMode;
			pointId?: string;
			resizeHandle?: ResizeHandle;
			linearFeatherEdge?: LinearFeatherEdge;
		}) => {
			const containerRect = containerRef.current?.getBoundingClientRect();
			if (!containerRect) return;
			event.preventDefault();
			event.stopPropagation();
			const centerX = containerRect.left + mask.centerX * containerRect.width;
			const centerY = containerRect.top + mask.centerY * containerRect.height;
			pushHistory();
			setInteraction({
				mode,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startPointerAngle: pointerAngle({
					clientX: event.clientX,
					clientY: event.clientY,
					centerX,
					centerY,
				}),
				startMask: mask,
				containerRect,
				pointId: selectedPointId,
				resizeHandle,
				linearFeatherEdge,
			});
		},
		[mask, pushHistory]
	);

	useEffect(() => {
		if (!interaction) return;
		const handlePointerMove = (event: PointerEvent) => {
			const pointerDeltaX = event.clientX - interaction.startClientX;
			const pointerDeltaY = event.clientY - interaction.startClientY;
			const deltaX =
				pointerDeltaX / Math.max(1, interaction.containerRect.width);
			const deltaY =
				pointerDeltaY / Math.max(1, interaction.containerRect.height);
			if (interaction.mode === "move") {
				updateMask({
					updates: {
						centerX: clamp({
							value: interaction.startMask.centerX + deltaX,
							min: -1,
							max: 2,
						}),
						centerY: clamp({
							value: interaction.startMask.centerY + deltaY,
							min: -1,
							max: 2,
						}),
					},
					history: false,
				});
				return;
			}
			const local = localDelta({
				deltaX,
				deltaY,
				rotation: interaction.startMask.rotation,
			});
			if (interaction.mode === "resize") {
				updateMask({
					updates: resizeMaskFromHandle({
						mask: interaction.startMask,
						handle: interaction.resizeHandle ?? "se",
						localX: local.x,
						localY: local.y,
					}),
					history: false,
				});
				return;
			}
			if (interaction.mode === "linear-feather") {
				const localPixels = localDelta({
					deltaX: pointerDeltaX,
					deltaY: pointerDeltaY,
					rotation: interaction.startMask.rotation,
				});
				updateMask({
					updates: linearFeatherFromHandle({
						mask: interaction.startMask,
						edge: interaction.linearFeatherEdge ?? "bottom",
						localYPixels: localPixels.y,
					}),
					history: false,
				});
				return;
			}
			if (isPointInteractionMode(interaction.mode) && interaction.pointId) {
				const pointMode = interaction.mode;
				const points = interaction.startMask.points ?? [];
				const displayWidth = Math.max(
					0.001,
					interaction.startMask.width +
						(interaction.startMask.expansion ?? 0) * 2
				);
				const displayHeight = Math.max(
					0.001,
					interaction.startMask.height +
						(interaction.startMask.expansion ?? 0) * 2
				);
				updateMask({
					updates: {
						points: points.map((point, index) =>
							pointId({ point, index, maskId }) === interaction.pointId
								? moveMaskPoint({
										point,
										mode: pointMode,
										deltaX: local.x / displayWidth,
										deltaY: local.y / displayHeight,
									})
								: point
						),
					},
					history: false,
				});
				return;
			}
			const centerX =
				interaction.containerRect.left +
				interaction.startMask.centerX * interaction.containerRect.width;
			const centerY =
				interaction.containerRect.top +
				interaction.startMask.centerY * interaction.containerRect.height;
			const angle = pointerAngle({
				clientX: event.clientX,
				clientY: event.clientY,
				centerX,
				centerY,
			});
			updateMask({
				updates: {
					rotation:
						interaction.startMask.rotation +
						angle -
						interaction.startPointerAngle,
				},
				history: false,
			});
		};
		const finishInteraction = () => setInteraction(null);
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", finishInteraction);
		window.addEventListener("pointercancel", finishInteraction);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", finishInteraction);
			window.removeEventListener("pointercancel", finishInteraction);
		};
	}, [interaction, maskId, updateMask]);

	const moveWithKeyboard = (event: ReactKeyboardEvent) => {
		const delta = keyboardDelta({ event });
		if (!delta) return;
		event.preventDefault();
		updateMask({
			updates: {
				centerX: clamp({ value: mask.centerX + delta.x, min: -1, max: 2 }),
				centerY: clamp({ value: mask.centerY + delta.y, min: -1, max: 2 }),
			},
			history: true,
		});
	};

	const resizeWithKeyboard = ({
		event,
		handle,
	}: {
		event: ReactKeyboardEvent;
		handle: ResizeHandle;
	}) => {
		const updates = resizeMaskFromKeyboard({ mask, handle, event });
		if (!updates) return;
		event.preventDefault();
		updateMask({ updates, history: true });
	};

	const linearFeatherWithKeyboard = ({
		event,
		edge,
	}: {
		event: ReactKeyboardEvent;
		edge: LinearFeatherEdge;
	}) => {
		const updates = linearFeatherFromKeyboard({ mask, edge, event });
		if (!updates) return;
		event.preventDefault();
		updateMask({ updates, history: true });
	};

	const rotateWithKeyboard = (event: ReactKeyboardEvent) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const step = event.shiftKey ? 10 : 1;
		updateMask({
			updates: {
				rotation: mask.rotation + (event.key === "ArrowLeft" ? -step : step),
			},
			history: true,
		});
	};
	const cycleRoundness = (event: ReactPointerEvent | ReactKeyboardEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const current = mask.roundness ?? 0;
		const next = current >= 1 ? 0 : Math.min(1, current + 0.25);
		updateMask({ updates: { roundness: next }, history: true });
	};

	const setMirrorMode = ({
		event,
		mirrorMode,
	}: {
		event: ReactPointerEvent | ReactKeyboardEvent;
		mirrorMode: MediaMaskMirrorMode;
	}) => {
		event.preventDefault();
		event.stopPropagation();
		updateMask({ updates: { mirrorMode }, history: true });
	};

	const editPointWithKeyboard = ({
		event,
		selectedPointId,
		mode,
	}: {
		event: ReactKeyboardEvent;
		selectedPointId: string;
		mode: PointInteractionMode;
	}) => {
		const points = mask.points ?? [];
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			if (mode === "anchor") {
				if (points.length <= 3) return;
				updateMask({
					updates: {
						points: points.filter(
							(point, index) =>
								pointId({ point, index, maskId }) !== selectedPointId
						),
					},
					history: true,
				});
				return;
			}
			updateMask({
				updates: {
					points: points.map((point, index) =>
						pointId({ point, index, maskId }) === selectedPointId
							? {
									...point,
									handleIn: mode === "handle-in" ? undefined : point.handleIn,
									handleOut:
										mode === "handle-out" ? undefined : point.handleOut,
								}
							: point
					),
				},
				history: true,
			});
			return;
		}
		const delta = keyboardDelta({ event });
		if (!delta) return;
		event.preventDefault();
		updateMask({
			updates: {
				points: points.map((point, index) =>
					pointId({ point, index, maskId }) === selectedPointId
						? moveMaskPoint({
								point,
								mode,
								deltaX: delta.x,
								deltaY: delta.y,
							})
						: point
				),
			},
			history: true,
		});
	};

	const isLinear = mask.type === "linear";
	const isMirror = mask.type === "mirror";
	const displayWidth = Math.max(0.001, mask.width + (mask.expansion ?? 0) * 2);
	const displayHeight = Math.max(
		0.001,
		mask.height + (mask.expansion ?? 0) * 2
	);
	const featherInsetPercent = featherOutlineInsetPercent({
		feather: mask.feather,
	});
	const featherStrokeWidth = featherPathStrokeWidth({ feather: mask.feather });
	const hasFeatherGuide = featherInsetPercent > 0;
	const shapeStyle: CSSProperties = {
		left: `${mask.centerX * 100}%`,
		top: `${mask.centerY * 100}%`,
		width: isLinear ? "150%" : `${displayWidth * 100}%`,
		height: isLinear ? "0px" : isMirror ? "150%" : `${displayHeight * 100}%`,
		transform: `translate(-50%, -50%) rotate(${mask.rotation}deg)`,
		borderRadius:
			mask.type === "ellipse"
				? "50%"
				: `${(mask.roundness ?? 0) * Math.min(displayWidth, displayHeight) * 50}%`,
		boxShadow: `0 0 ${Math.max(2, mask.feather * 80)}px rgba(34, 211, 238, 0.8)`,
	};
	const invertGuideStyle: CSSProperties = {
		borderRadius:
			mask.type === "ellipse"
				? "50%"
				: `${(mask.roundness ?? 0) * Math.min(displayWidth, displayHeight) * 50}%`,
		background:
			"repeating-linear-gradient(135deg, rgba(34,211,238,0.22) 0 6px, rgba(34,211,238,0.04) 6px 12px)",
	};
	const featherOutlineStyle: CSSProperties = {
		inset: `-${featherInsetPercent}%`,
		borderRadius:
			mask.type === "ellipse"
				? "50%"
				: `${(mask.roundness ?? 0) * Math.min(displayWidth, displayHeight) * 50}%`,
	};
	const linearFeatherLineOffset = linearFeatherOffsetPixels({
		feather: mask.feather,
	});
	const mirrorMode = mask.mirrorMode ?? "center";
	const mirrorRangeClassName =
		mirrorMode === "left"
			? "left-0 right-1/2"
			: mirrorMode === "right"
				? "left-1/2 right-0"
				: "left-[42%] right-[42%]";
	const points = mask.points ?? [];
	const canRoundCorners = mask.type === "rectangle" || mask.type === "text";

	useEffect(() => {
		if (!canRoundCorners) {
			setRoundnessHandlePosition(undefined);
			return;
		}
		const updateHandlePosition = () => {
			const bounds = containerRef.current?.getBoundingClientRect();
			if (!bounds) return;
			const previewBounds = containerRef.current
				?.closest('[data-testid="preview-panel"]')
				?.getBoundingClientRect();
			const clampBounds = {
				left: Math.max(bounds.left, previewBounds?.left ?? 0),
				top: Math.max(bounds.top, previewBounds?.top ?? 0),
				right: Math.min(
					bounds.right,
					previewBounds?.right ?? window.innerWidth
				),
				bottom: Math.min(
					bounds.bottom,
					previewBounds?.bottom ?? window.innerHeight
				),
			};
			setRoundnessHandlePosition({
				left: clamp({
					value: bounds.left + (mask.centerX - displayWidth / 2) * bounds.width,
					min: clampBounds.left + 4,
					max: Math.max(clampBounds.left + 4, clampBounds.right - 28),
				}),
				top: clamp({
					value:
						bounds.top + (mask.centerY - displayHeight / 2) * bounds.height,
					min: clampBounds.top + 4,
					max: Math.max(clampBounds.top + 4, clampBounds.bottom - 28),
				}),
			});
		};
		updateHandlePosition();
		window.addEventListener("resize", updateHandlePosition);
		return () => window.removeEventListener("resize", updateHandlePosition);
	}, [
		canRoundCorners,
		displayHeight,
		displayWidth,
		mask.centerX,
		mask.centerY,
	]);

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 z-30"
			data-testid="media-mask-canvas-overlay"
		>
			{canRoundCorners && typeof document !== "undefined"
				? createPortal(
						<button
							type="button"
							className="pointer-events-auto fixed z-50 flex size-6 items-center justify-center rounded-full border border-cyan-200/80 bg-background/90 text-cyan-200 shadow hover:bg-cyan-400/20 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-cyan-200"
							style={roundnessHandlePosition ?? { left: 4, top: 4 }}
							onPointerDown={cycleRoundness}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								cycleRoundness(event);
							}}
							aria-label={`调整${mask.name ?? "蒙版"}圆角`}
							title="调整圆角"
							data-testid="media-mask-roundness-handle"
						>
							<SquareRoundCorner className="size-3.5" />
						</button>,
						document.body
					)
				: null}
			<div
				className="pointer-events-auto absolute border-2 border-cyan-400"
				style={shapeStyle}
				onPointerDown={(event) => beginInteraction({ event, mode: "move" })}
			>
				{hasFeatherGuide && !isLinear && mask.type !== "pen" ? (
					<div
						className="pointer-events-none absolute border-2 border-dashed border-cyan-200/90 shadow-[0_0_10px_rgba(103,232,249,0.35)]"
						data-testid="media-mask-feather-outline"
						style={featherOutlineStyle}
						aria-hidden="true"
					/>
				) : null}
				{hasFeatherGuide && isLinear ? (
					<div
						className="pointer-events-none absolute left-0 w-full border-t-2 border-dashed border-cyan-200/90"
						data-testid="media-mask-feather-outline"
						style={{ top: `${-linearFeatherLineOffset}px` }}
						aria-hidden="true"
					/>
				) : null}
				{hasFeatherGuide && isLinear ? (
					<div
						className="pointer-events-none absolute left-0 w-full border-t-2 border-dashed border-cyan-200/90"
						style={{ top: `${linearFeatherLineOffset}px` }}
						aria-hidden="true"
					/>
				) : null}
				{isLinear
					? (
							[
								{
									edge: "top" as const,
									label: "上羽化范围",
									offset: -linearFeatherLineOffset,
								},
								{
									edge: "bottom" as const,
									label: "下羽化范围",
									offset: linearFeatherLineOffset,
								},
							] satisfies Array<{
								edge: LinearFeatherEdge;
								label: string;
								offset: number;
							}>
						).map((handle) => (
							<button
								type="button"
								key={handle.edge}
								className="absolute left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border-2 border-white bg-cyan-500 shadow"
								style={{ top: `${handle.offset}px` }}
								onPointerDown={(event) =>
									beginInteraction({
										event,
										mode: "linear-feather",
										linearFeatherEdge: handle.edge,
									})
								}
								onKeyDown={(event) =>
									linearFeatherWithKeyboard({ event, edge: handle.edge })
								}
								aria-label={`${handle.label}${mask.name ?? "蒙版"}`}
								title={handle.label}
							/>
						))
					: null}
				{mask.invert && !isLinear && mask.type !== "pen" ? (
					<div
						className="pointer-events-none absolute inset-0 border border-cyan-200/60"
						data-testid="media-mask-invert-guide"
						style={invertGuideStyle}
						aria-hidden="true"
					/>
				) : null}
				{isMirror ? (
					<div
						className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-0 -translate-x-1/2 border-l-2 border-dashed border-fuchsia-300/90 shadow-[0_0_10px_rgba(217,70,239,0.45)]"
						data-testid="media-mask-mirror-axis"
						aria-hidden="true"
					/>
				) : null}
				{isMirror ? (
					<div
						className={`pointer-events-none absolute bottom-0 top-0 border-x border-fuchsia-200/70 bg-fuchsia-400/10 ${mirrorRangeClassName}`}
						data-testid="media-mask-mirror-active-range"
						aria-hidden="true"
					/>
				) : null}
				{isMirror ? (
					<div
						className="pointer-events-none absolute left-[25%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-fuchsia-300/90"
						aria-hidden="true"
					/>
				) : null}
				{isMirror ? (
					<div
						className="pointer-events-none absolute right-[25%] top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rotate-45 border-r-2 border-t-2 border-fuchsia-300/90"
						aria-hidden="true"
					/>
				) : null}
				{isMirror ? (
					<div
						className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-12 gap-1 rounded-full border border-fuchsia-200/70 bg-background/85 p-1 shadow"
						data-testid="media-mask-mirror-mode-controls"
					>
						{(
							[
								{ mode: "left", label: "左侧镜像" },
								{ mode: "center", label: "双向镜像" },
								{ mode: "right", label: "右侧镜像" },
							] satisfies Array<{
								mode: MediaMaskMirrorMode;
								label: string;
							}>
						).map((item) => (
							<button
								type="button"
								key={item.mode}
								className={`h-5 min-w-8 rounded-full px-2 text-[10px] ${
									mirrorMode === item.mode
										? "bg-fuchsia-500 text-white"
										: "text-fuchsia-100 hover:bg-fuchsia-500/25"
								}`}
								onPointerDown={(event) =>
									setMirrorMode({ event, mirrorMode: item.mode })
								}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									setMirrorMode({ event, mirrorMode: item.mode });
								}}
								aria-label={`${item.label}${mask.name ?? "蒙版"}`}
								aria-pressed={mirrorMode === item.mode}
								title={item.label}
								data-testid={`media-mask-mirror-mode-${item.mode}`}
							>
								{item.mode === "left"
									? "左"
									: item.mode === "right"
										? "右"
										: "双"}
							</button>
						))}
					</div>
				) : null}
				{mask.type === "pen" ? (
					<svg
						className="pointer-events-none absolute inset-0 size-full overflow-visible"
						viewBox="0 0 1 1"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<path
							d={penPathData({ points, closed: mask.closed ?? true })}
							fill="rgba(34, 211, 238, 0.12)"
							stroke="rgb(34, 211, 238)"
							strokeWidth="0.006"
							vectorEffect="non-scaling-stroke"
						/>
						{featherStrokeWidth > 0 ? (
							<path
								d={penPathData({ points, closed: mask.closed ?? true })}
								fill="none"
								stroke="rgba(165, 243, 252, 0.75)"
								strokeDasharray="0.03 0.025"
								strokeWidth={featherStrokeWidth}
								vectorEffect="non-scaling-stroke"
								data-testid="media-mask-feather-outline"
							/>
						) : null}
						{points.flatMap((point, index) => {
							const id = pointId({ point, index, maskId });
							return [point.handleIn, point.handleOut]
								.filter((handle): handle is { x: number; y: number } =>
									Boolean(handle)
								)
								.map((handle, handleIndex) => (
									<line
										key={`${id}-line-${handleIndex}`}
										x1={point.x}
										y1={point.y}
										x2={handle.x}
										y2={handle.y}
										stroke="rgb(217, 70, 239)"
										strokeWidth="0.004"
										vectorEffect="non-scaling-stroke"
									/>
								));
						})}
					</svg>
				) : null}

				<button
					type="button"
					className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-cyan-500 shadow"
					onPointerDown={(event) => beginInteraction({ event, mode: "move" })}
					onKeyDown={moveWithKeyboard}
					aria-label={`移动${mask.name ?? "蒙版"}`}
					title="移动蒙版"
				/>
				{isLinear
					? null
					: MASK_RESIZE_HANDLES.map((handle) => {
							if (isMirror && handle.y !== 0) return null;
							return (
								<button
									type="button"
									key={handle.id}
									className={`absolute size-4 rounded-sm border-2 border-white bg-cyan-500 shadow ${handle.className} ${handle.cursor}`}
									onPointerDown={(event) =>
										beginInteraction({
											event,
											mode: "resize",
											resizeHandle: handle.id,
										})
									}
									onKeyDown={(event) =>
										resizeWithKeyboard({ event, handle: handle.id })
									}
									aria-label={`${handle.label}${mask.name ?? "蒙版"}`}
									title={handle.label}
									data-testid={
										isMirror && handle.id === "w"
											? "media-mask-mirror-range-left"
											: isMirror && handle.id === "e"
												? "media-mask-mirror-range-right"
												: undefined
									}
								/>
							);
						})}

				{mask.type === "pen"
					? points.map((point, index) => {
							const id = pointId({ point, index, maskId });
							return (
								<div key={id}>
									{(["handleIn", "handleOut"] as const).map((handleName) => {
										const handle = point[handleName];
										if (!handle) return null;
										const mode =
											handleName === "handleIn" ? "handle-in" : "handle-out";
										return (
											<button
												type="button"
												key={handleName}
												className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border border-white bg-fuchsia-500 shadow"
												style={{
													left: `${handle.x * 100}%`,
													top: `${handle.y * 100}%`,
												}}
												onPointerDown={(event) =>
													beginInteraction({ event, mode, pointId: id })
												}
												onKeyDown={(event) =>
													editPointWithKeyboard({
														event,
														selectedPointId: id,
														mode,
													})
												}
												aria-label={`编辑${mask.name ?? "蒙版"}${
													handleName === "handleIn" ? "入切线" : "出切线"
												}`}
												title="编辑贝塞尔切线"
											/>
										);
									})}
									<button
										type="button"
										className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border border-white bg-fuchsia-600 shadow"
										style={{
											left: `${point.x * 100}%`,
											top: `${point.y * 100}%`,
										}}
										onPointerDown={(event) =>
											beginInteraction({ event, mode: "anchor", pointId: id })
										}
										onKeyDown={(event) =>
											editPointWithKeyboard({
												event,
												selectedPointId: id,
												mode: "anchor",
											})
										}
										aria-label={`编辑${mask.name ?? "蒙版"}节点 ${index + 1}`}
										title="编辑贝塞尔节点"
									/>
								</div>
							);
						})
					: null}

				<div className="absolute bottom-full left-1/2 h-6 w-px -translate-x-1/2 bg-cyan-400" />
				<button
					type="button"
					className="absolute bottom-[calc(100%+20px)] left-1/2 size-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-cyan-500 shadow"
					onPointerDown={(event) => beginInteraction({ event, mode: "rotate" })}
					onKeyDown={rotateWithKeyboard}
					aria-label={`旋转${mask.name ?? "蒙版"}`}
					title="旋转蒙版"
				/>
			</div>
		</div>
	);
}
