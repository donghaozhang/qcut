import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { updateMediaMaskAtFrame } from "@/lib/video/media-mask-stack";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, MediaMask } from "@/types/timeline";
import {
	clamp,
	featherOutlineInsetPercent,
	featherPathStrokeWidth,
	isPointInteractionMode,
	keyboardDelta,
	localDelta,
	MASK_RESIZE_HANDLES,
	moveMaskPoint,
	penPathData,
	pointId,
	pointerAngle,
	resizeMaskFromHandle,
	resizeMaskFromKeyboard,
	type ResizeHandle,
	type MaskInteraction,
	type MaskInteractionMode,
	type PointInteractionMode,
} from "./media-mask-overlay-utils";

interface MediaMaskOverlayProps {
	element: MediaElement;
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
	const updateMediaElement = useTimelineStore(
		(state) => state.updateMediaElement
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
			updateMediaElement(trackId, element.id, { masks: nextMasks }, history);
		},
		[currentTime, element, fps, mask.id, trackId, updateMediaElement]
	);

	const beginInteraction = useCallback(
		({
			event,
			mode,
			pointId: selectedPointId,
			resizeHandle,
		}: {
			event: ReactPointerEvent;
			mode: MaskInteractionMode;
			pointId?: string;
			resizeHandle?: ResizeHandle;
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
			});
		},
		[mask, pushHistory]
	);

	useEffect(() => {
		if (!interaction) return;
		const handlePointerMove = (event: PointerEvent) => {
			const deltaX =
				(event.clientX - interaction.startClientX) /
				Math.max(1, interaction.containerRect.width);
			const deltaY =
				(event.clientY - interaction.startClientY) /
				Math.max(1, interaction.containerRect.height);
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
	const linearFeatherLineOffset = Math.max(8, Math.round(mask.feather * 160));
	const points = mask.points ?? [];

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 z-30"
			data-testid="media-mask-canvas-overlay"
		>
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
