"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	CSSProperties,
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import { Crop, RotateCcw, RotateCw } from "lucide-react";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_CROP,
	resolveMediaKeyframes,
} from "@/lib/video/video-properties";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import {
	cropFromLocalDelta,
	getSelectionBounds,
	normalizeRotationDelta,
	resizeMediaSelection,
	resizeSingleMedia,
	rotateMediaSelection,
	rotateVector,
	snapSelectionMove,
	type CanvasBounds,
	type CanvasPoint,
	type CropSide,
	type MediaTransformSnapshot,
	type ResizeHandle,
	type SnapGuides,
} from "./media-transform-geometry";
import {
	buildMediaCanvasUpdate,
	type MediaCanvasMutation,
} from "./media-transform-update";

export interface SelectedMediaTransformTarget {
	trackId: string;
	element: MediaElement;
}

interface MediaTransformOverlayProps {
	targets: SelectedMediaTransformTarget[];
	canvasSize: { width: number; height: number };
	previewRef: RefObject<HTMLDivElement | null>;
	currentTime: number;
	fps: number;
}

type InteractionKind = "drag" | "resize" | "rotate" | "crop";

interface InteractionState {
	kind: InteractionKind;
	items: MediaTransformSnapshot[];
	targets: SelectedMediaTransformTarget[];
	bounds: CanvasBounds;
	startPoint: CanvasPoint;
	handle?: ResizeHandle;
	cropSide?: CropSide;
	startAngle: number;
	currentTime: number;
	fps: number;
}

interface PendingUpdate {
	trackId: string;
	elementId: string;
	updates: ReturnType<typeof buildMediaCanvasUpdate>;
}

const RESIZE_HANDLES: Array<{
	handle: ResizeHandle;
	className: string;
	label: string;
}> = [
	{
		handle: "top-left",
		className: "-left-1.5 -top-1.5 cursor-nwse-resize",
		label: "Resize from top left",
	},
	{
		handle: "top",
		className: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
		label: "Resize from top",
	},
	{
		handle: "top-right",
		className: "-right-1.5 -top-1.5 cursor-nesw-resize",
		label: "Resize from top right",
	},
	{
		handle: "right",
		className: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
		label: "Resize from right",
	},
	{
		handle: "bottom-right",
		className: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
		label: "Resize from bottom right",
	},
	{
		handle: "bottom",
		className: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
		label: "Resize from bottom",
	},
	{
		handle: "bottom-left",
		className: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
		label: "Resize from bottom left",
	},
	{
		handle: "left",
		className: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
		label: "Resize from left",
	},
];

const CROP_HANDLES: Array<{
	side: CropSide;
	className: string;
	label: string;
}> = [
	{
		side: "top",
		className: "-top-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize",
		label: "Crop top",
	},
	{
		side: "right",
		className: "-right-1 top-1/2 h-10 w-2 -translate-y-1/2 cursor-ew-resize",
		label: "Crop right",
	},
	{
		side: "bottom",
		className: "-bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize",
		label: "Crop bottom",
	},
	{
		side: "left",
		className: "-left-1 top-1/2 h-10 w-2 -translate-y-1/2 cursor-ew-resize",
		label: "Crop left",
	},
];

function canvasPointFromClient({
	clientX,
	clientY,
	previewRect,
	canvasSize,
}: {
	clientX: number;
	clientY: number;
	previewRect: DOMRect;
	canvasSize: { width: number; height: number };
}): CanvasPoint {
	return {
		x:
			((clientX - previewRect.left) / previewRect.width) * canvasSize.width -
			canvasSize.width / 2,
		y:
			((clientY - previewRect.top) / previewRect.height) * canvasSize.height -
			canvasSize.height / 2,
	};
}

function pointerAngle({
	point,
	center,
}: {
	point: CanvasPoint;
	center: CanvasPoint;
}) {
	return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function snapshotsFromTargets({
	targets,
	currentTime,
	fps,
}: {
	targets: SelectedMediaTransformTarget[];
	currentTime: number;
	fps: number;
}): MediaTransformSnapshot[] {
	return targets.map(({ trackId, element }) => {
		const visual = resolveMediaKeyframes({ element, currentTime, fps });
		return {
			trackId,
			elementId: element.id,
			x: visual.x,
			y: visual.y,
			scaleX: visual.scaleX,
			scaleY: visual.scaleY,
			rotation: visual.rotation,
			maintainAspectRatio: visual.maintainAspectRatio,
			crop: visual.crop,
		};
	});
}

function mutationFromSnapshot({
	item,
}: {
	item: MediaTransformSnapshot;
}): MediaCanvasMutation {
	return {
		x: item.x,
		y: item.y,
		scaleX: item.scaleX,
		scaleY: item.scaleY,
		rotation: item.rotation,
		crop: item.crop,
	};
}

function pendingUpdatesFromSnapshots({
	items,
	interaction,
}: {
	items: MediaTransformSnapshot[];
	interaction: InteractionState;
}): PendingUpdate[] {
	return items.flatMap((item) => {
		const target = interaction.targets.find(
			(candidate) => candidate.element.id === item.elementId
		);
		if (!target) return [];
		return [
			{
				trackId: target.trackId,
				elementId: target.element.id,
				updates: buildMediaCanvasUpdate({
					element: target.element,
					mutation: mutationFromSnapshot({ item }),
					currentTime: interaction.currentTime,
					fps: interaction.fps,
				}),
			},
		];
	});
}

function keyboardPoint({
	event,
	step,
}: {
	event: ReactKeyboardEvent;
	step: number;
}): CanvasPoint | null {
	if (event.key === "ArrowLeft") return { x: -step, y: 0 };
	if (event.key === "ArrowRight") return { x: step, y: 0 };
	if (event.key === "ArrowUp") return { x: 0, y: -step };
	if (event.key === "ArrowDown") return { x: 0, y: step };
	return null;
}

/** Direct manipulation controls for selected media on the preview canvas. */
export function MediaTransformOverlay({
	targets,
	canvasSize,
	previewRef,
	currentTime,
	fps,
}: MediaTransformOverlayProps) {
	const isEditingMask = useMaskEditorStore((state) => state.isEditing);
	const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
	const [cropMode, setCropMode] = useState(false);
	const [activeInteraction, setActiveInteraction] =
		useState<InteractionKind | null>(null);
	const [snapGuides, setSnapGuides] = useState<SnapGuides>({});
	const interactionRef = useRef<InteractionState | null>(null);
	const pendingUpdatesRef = useRef<PendingUpdate[] | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const historyPushedRef = useRef(false);
	const snapshots = useMemo(
		() => snapshotsFromTargets({ targets, currentTime, fps }),
		[targets, currentTime, fps]
	);
	const bounds = useMemo(
		() => getSelectionBounds({ items: snapshots, canvasSize }),
		[snapshots, canvasSize]
	);
	const singleItem = snapshots.length === 1 ? snapshots[0] : null;

	const flushPendingUpdates = useCallback(() => {
		const pending = pendingUpdatesRef.current;
		if (!pending?.length) return;
		const timeline = useTimelineStore.getState();
		if (!historyPushedRef.current) {
			timeline.pushHistory();
			historyPushedRef.current = true;
		}
		for (const update of pending) {
			timeline.updateMediaElement(
				update.trackId,
				update.elementId,
				update.updates,
				false
			);
		}
		pendingUpdatesRef.current = null;
		animationFrameRef.current = null;
	}, []);

	const queueUpdates = useCallback(
		({ updates }: { updates: PendingUpdate[] }) => {
			pendingUpdatesRef.current = updates;
			if (animationFrameRef.current !== null) return;
			animationFrameRef.current = requestAnimationFrame(flushPendingUpdates);
		},
		[flushPendingUpdates]
	);

	const applyImmediately = useCallback(
		({ updates }: { updates: PendingUpdate[] }) => {
			if (updates.length === 0) return;
			const timeline = useTimelineStore.getState();
			timeline.pushHistory();
			for (const update of updates) {
				timeline.updateMediaElement(
					update.trackId,
					update.elementId,
					update.updates,
					false
				);
			}
		},
		[]
	);

	const beginInteraction = useCallback(
		({
			event,
			kind,
			handle,
			cropSide,
		}: {
			event: ReactPointerEvent<HTMLElement>;
			kind: InteractionKind;
			handle?: ResizeHandle;
			cropSide?: CropSide;
		}) => {
			const preview = previewRef.current;
			if (!preview || snapshots.length === 0) return;
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.setPointerCapture?.(event.pointerId);
			const startPoint = canvasPointFromClient({
				clientX: event.clientX,
				clientY: event.clientY,
				previewRect: preview.getBoundingClientRect(),
				canvasSize,
			});
			interactionRef.current = {
				kind,
				items: snapshots,
				targets,
				bounds,
				startPoint,
				handle,
				cropSide,
				startAngle: pointerAngle({
					point: startPoint,
					center: { x: bounds.centerX, y: bounds.centerY },
				}),
				currentTime,
				fps,
			};
			historyPushedRef.current = false;
			setActiveInteraction(kind);
		},
		[previewRef, snapshots, targets, bounds, canvasSize, currentTime, fps]
	);

	const finishInteraction = useCallback(() => {
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		flushPendingUpdates();
		interactionRef.current = null;
		setActiveInteraction(null);
		setSnapGuides({});
	}, [flushPendingUpdates]);

	useEffect(() => {
		if (!activeInteraction) return;
		const handlePointerMove = (event: PointerEvent) => {
			const interaction = interactionRef.current;
			const preview = previewRef.current;
			if (!interaction || !preview) return;
			event.preventDefault();
			const point = canvasPointFromClient({
				clientX: event.clientX,
				clientY: event.clientY,
				previewRect: preview.getBoundingClientRect(),
				canvasSize,
			});
			const delta = {
				x: point.x - interaction.startPoint.x,
				y: point.y - interaction.startPoint.y,
			};
			let nextItems = interaction.items;

			if (interaction.kind === "drag") {
				const previewScale =
					preview.getBoundingClientRect().width / canvasSize.width;
				const snapped =
					snappingEnabled && !event.altKey
						? snapSelectionMove({
								bounds: interaction.bounds,
								delta,
								canvasSize,
								threshold: 6 / Math.max(previewScale, 0.01),
							})
						: { delta, guides: {} };
				setSnapGuides(snapped.guides);
				nextItems = interaction.items.map((item) => ({
					...item,
					x: item.x + snapped.delta.x,
					y: item.y + snapped.delta.y,
				}));
			}

			if (interaction.kind === "resize" && interaction.handle) {
				const lockAspect = !event.shiftKey;
				nextItems =
					interaction.items.length === 1
						? [
								resizeSingleMedia({
									item: interaction.items[0],
									handle: interaction.handle,
									delta,
									canvasSize,
									lockAspect:
										interaction.items[0].maintainAspectRatio && lockAspect,
								}),
							]
						: resizeMediaSelection({
								items: interaction.items,
								bounds: interaction.bounds,
								handle: interaction.handle,
								delta,
								lockAspect,
							});
			}

			if (interaction.kind === "rotate") {
				const currentAngle = pointerAngle({
					point,
					center: {
						x: interaction.bounds.centerX,
						y: interaction.bounds.centerY,
					},
				});
				let rotationDelta = normalizeRotationDelta({
					degrees: currentAngle - interaction.startAngle,
				});
				if (event.shiftKey) rotationDelta = Math.round(rotationDelta / 15) * 15;
				nextItems = rotateMediaSelection({
					items: interaction.items,
					center: {
						x: interaction.bounds.centerX,
						y: interaction.bounds.centerY,
					},
					degrees: rotationDelta,
				});
			}

			if (
				interaction.kind === "crop" &&
				interaction.cropSide &&
				interaction.items.length === 1
			) {
				const item = interaction.items[0];
				const localDelta = rotateVector({
					point: delta,
					degrees: -item.rotation,
				});
				nextItems = [
					{
						...item,
						crop: cropFromLocalDelta({
							crop: item.crop,
							side: interaction.cropSide,
							delta: localDelta,
							width: canvasSize.width * item.scaleX,
							height: canvasSize.height * item.scaleY,
						}),
					},
				];
			}

			queueUpdates({
				updates: pendingUpdatesFromSnapshots({
					items: nextItems,
					interaction,
				}),
			});
		};

		window.addEventListener("pointermove", handlePointerMove, {
			passive: false,
		});
		window.addEventListener("pointerup", finishInteraction);
		window.addEventListener("pointercancel", finishInteraction);
		document.body.style.userSelect = "none";
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", finishInteraction);
			window.removeEventListener("pointercancel", finishInteraction);
			document.body.style.userSelect = "";
		};
	}, [
		activeInteraction,
		canvasSize,
		finishInteraction,
		previewRef,
		queueUpdates,
		snappingEnabled,
	]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (activeInteraction) finishInteraction();
			setCropMode(false);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activeInteraction, finishInteraction]);

	useEffect(() => {
		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			flushPendingUpdates();
		};
	}, [flushPendingUpdates]);

	const applySnapshotChange = useCallback(
		({ items }: { items: MediaTransformSnapshot[] }) => {
			const interaction: InteractionState = {
				kind: "drag",
				items: snapshots,
				targets,
				bounds,
				startPoint: { x: 0, y: 0 },
				startAngle: 0,
				currentTime,
				fps,
			};
			applyImmediately({
				updates: pendingUpdatesFromSnapshots({ items, interaction }),
			});
		},
		[applyImmediately, bounds, currentTime, fps, snapshots, targets]
	);

	const handleDragKeyDown = useCallback(
		(event: ReactKeyboardEvent) => {
			const delta = keyboardPoint({
				event,
				step: event.shiftKey ? 10 : 1,
			});
			if (!delta) return;
			event.preventDefault();
			applySnapshotChange({
				items: snapshots.map((item) => ({
					...item,
					x: item.x + delta.x,
					y: item.y + delta.y,
				})),
			});
		},
		[applySnapshotChange, snapshots]
	);

	const handleResizeKeyDown = useCallback(
		({
			event,
			handle,
		}: {
			event: ReactKeyboardEvent;
			handle: ResizeHandle;
		}) => {
			const delta = keyboardPoint({
				event,
				step: event.shiftKey ? 10 : 1,
			});
			if (!delta) return;
			event.preventDefault();
			const resized =
				snapshots.length === 1
					? [
							resizeSingleMedia({
								item: snapshots[0],
								handle,
								delta,
								canvasSize,
								lockAspect: snapshots[0].maintainAspectRatio,
							}),
						]
					: resizeMediaSelection({
							items: snapshots,
							bounds,
							handle,
							delta,
							lockAspect: true,
						});
			applySnapshotChange({ items: resized });
		},
		[applySnapshotChange, bounds, canvasSize, snapshots]
	);

	const handleRotateKeyDown = useCallback(
		(event: ReactKeyboardEvent) => {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			const degrees =
				(event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 15 : 1);
			applySnapshotChange({
				items: rotateMediaSelection({
					items: snapshots,
					center: { x: bounds.centerX, y: bounds.centerY },
					degrees,
				}),
			});
		},
		[applySnapshotChange, bounds.centerX, bounds.centerY, snapshots]
	);

	const handleCropKeyDown = useCallback(
		({ event, side }: { event: ReactKeyboardEvent; side: CropSide }) => {
			if (!singleItem) return;
			const delta = keyboardPoint({
				event,
				step: event.shiftKey ? 10 : 1,
			});
			if (!delta) return;
			event.preventDefault();
			applySnapshotChange({
				items: [
					{
						...singleItem,
						crop: cropFromLocalDelta({
							crop: singleItem.crop,
							side,
							delta,
							width: canvasSize.width * singleItem.scaleX,
							height: canvasSize.height * singleItem.scaleY,
						}),
					},
				],
			});
		},
		[applySnapshotChange, canvasSize, singleItem]
	);

	const resetCrop = useCallback(() => {
		if (!singleItem) return;
		applySnapshotChange({
			items: [{ ...singleItem, crop: { ...DEFAULT_MEDIA_CROP } }],
		});
	}, [applySnapshotChange, singleItem]);

	if (snapshots.length === 0 || isEditingMask) return null;

	const frameStyle: CSSProperties = singleItem
		? {
				left: `${50 + (singleItem.x / canvasSize.width) * 100}%`,
				top: `${50 + (singleItem.y / canvasSize.height) * 100}%`,
				width: `${singleItem.scaleX * 100}%`,
				height: `${singleItem.scaleY * 100}%`,
				transform: `translate(-50%, -50%) rotate(${singleItem.rotation}deg)`,
				transformOrigin: "center",
			}
		: {
				left: `${50 + (bounds.centerX / canvasSize.width) * 100}%`,
				top: `${50 + (bounds.centerY / canvasSize.height) * 100}%`,
				width: `${(bounds.width / canvasSize.width) * 100}%`,
				height: `${(bounds.height / canvasSize.height) * 100}%`,
				transform: "translate(-50%, -50%)",
				transformOrigin: "center",
			};
	const cropStyle = singleItem
		? {
				left: `${singleItem.crop.left * 100}%`,
				top: `${singleItem.crop.top * 100}%`,
				width: `${(1 - singleItem.crop.left - singleItem.crop.right) * 100}%`,
				height: `${(1 - singleItem.crop.top - singleItem.crop.bottom) * 100}%`,
			}
		: undefined;

	return (
		<div
			className="pointer-events-none absolute inset-0 z-[70]"
			data-testid="media-transform-overlay"
			data-html2canvas-ignore="true"
			data-selection-count={snapshots.length}
			data-interaction={activeInteraction ?? "idle"}
		>
			{snapGuides.x !== undefined ? (
				<div
					className="absolute inset-y-0 w-px bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
					data-testid="media-snap-guide-x"
					style={{
						left: `${50 + (snapGuides.x / canvasSize.width) * 100}%`,
					}}
				/>
			) : null}
			{snapGuides.y !== undefined ? (
				<div
					className="absolute inset-x-0 h-px bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
					data-testid="media-snap-guide-y"
					style={{
						top: `${50 + (snapGuides.y / canvasSize.height) * 100}%`,
					}}
				/>
			) : null}
			<div
				className="pointer-events-auto absolute border border-primary shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
				data-testid="media-transform-box"
				style={{
					...frameStyle,
					touchAction: "none",
					overflow: cropMode ? "hidden" : "visible",
				}}
			>
				<button
					type="button"
					className="absolute inset-0 z-0 cursor-move bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					aria-label="Move selected media"
					data-testid="media-transform-drag-surface"
					onPointerDown={(event) => beginInteraction({ event, kind: "drag" })}
					onKeyDown={handleDragKeyDown}
				/>

				<div className="absolute left-2 top-2 z-30 flex h-7 items-center gap-1 rounded-sm bg-background/90 p-0.5 shadow-md backdrop-blur-sm">
					{singleItem ? (
						<button
							type="button"
							className={`flex size-6 items-center justify-center rounded-sm ${cropMode ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}
							aria-label={cropMode ? "Finish crop" : "Crop media"}
							title={cropMode ? "Finish crop" : "Crop media"}
							onClick={() => setCropMode((enabled) => !enabled)}
							onKeyDown={(event) => {
								if (event.key === "Escape") setCropMode(false);
							}}
						>
							<Crop className="size-3.5">
								<title>{cropMode ? "Finish crop" : "Crop media"}</title>
							</Crop>
						</button>
					) : null}
					{cropMode ? (
						<button
							type="button"
							className="flex size-6 items-center justify-center rounded-sm text-foreground hover:bg-accent"
							aria-label="Reset crop"
							title="Reset crop"
							onClick={resetCrop}
							onKeyDown={(event) => {
								if (event.key === "Escape") setCropMode(false);
							}}
						>
							<RotateCcw className="size-3.5">
								<title>Reset crop</title>
							</RotateCcw>
						</button>
					) : null}
				</div>

				{cropMode && cropStyle ? (
					<div
						className="pointer-events-none absolute z-10 border border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]"
						data-testid="media-crop-box"
						style={cropStyle}
					>
						{CROP_HANDLES.map(({ side, className, label }) => (
							<button
								key={side}
								type="button"
								className={`pointer-events-auto absolute z-20 border border-background bg-white ${className}`}
								aria-label={label}
								data-testid={`media-crop-handle-${side}`}
								onPointerDown={(event) =>
									beginInteraction({ event, kind: "crop", cropSide: side })
								}
								onKeyDown={(event) => handleCropKeyDown({ event, side })}
							/>
						))}
					</div>
				) : (
					<>
						{RESIZE_HANDLES.map(({ handle, className, label }) => (
							<button
								key={handle}
								type="button"
								className={`absolute z-20 size-3 border border-primary bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
								aria-label={label}
								data-testid={`media-resize-handle-${handle}`}
								onPointerDown={(event) =>
									beginInteraction({ event, kind: "resize", handle })
								}
								onKeyDown={(event) => handleResizeKeyDown({ event, handle })}
							/>
						))}
						<div className="absolute -top-7 left-1/2 z-10 h-7 w-px -translate-x-1/2 bg-primary" />
						<button
							type="button"
							className="absolute -top-10 left-1/2 z-20 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
							aria-label="Rotate selected media"
							title="Rotate selected media"
							data-testid="media-rotation-handle"
							onPointerDown={(event) =>
								beginInteraction({ event, kind: "rotate" })
							}
							onKeyDown={handleRotateKeyDown}
						>
							<RotateCw className="size-3.5">
								<title>Rotate selected media</title>
							</RotateCw>
						</button>
					</>
				)}
			</div>
		</div>
	);
}
