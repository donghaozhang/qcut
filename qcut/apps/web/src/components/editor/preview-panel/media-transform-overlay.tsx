"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	CSSProperties,
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
	RefObject,
} from "react";
import { Crop, RotateCcw, RotateCw } from "lucide-react";
import { DEFAULT_MEDIA_CROP } from "@/lib/video/video-properties";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useCustomCutoutEditorStore } from "@/stores/editor/custom-cutout-editor-store";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { usePerspectiveEditorStore } from "@/stores/editor/perspective-editor-store";
import { usePortraitManualBodyStore } from "@/stores/editor/portrait-manual-body-store";
import {
	perspectiveDeltaFromScreen,
	perspectiveFromLocalDelta,
	type PerspectiveCorner,
} from "./media-perspective-geometry";
import { MediaPerspectiveHandles } from "./media-perspective-handles";
import {
	cropFromLocalDelta,
	getSelectionBounds,
	normalizeRotationDelta,
	resizeMediaSelection,
	resizeSingleMedia,
	rotateMediaSelection,
	rotateVector,
	snapSelectionMove,
	type CropSide,
	type MediaTransformSnapshot,
	type ResizeHandle,
	type SnapGuides,
} from "./media-transform-geometry";
import { buildMediaCanvasUpdate } from "./media-transform-update";
import {
	canvasPointFromClient,
	keyboardPoint,
	pendingUpdatesFromSnapshots,
	pointerAngle,
	snapshotsFromTargets,
	type InteractionKind,
	type InteractionState,
	type PendingUpdate,
	type SelectedMediaTransformTarget,
} from "./media-transform-overlay-helpers";

export type { SelectedMediaTransformTarget } from "./media-transform-overlay-helpers";

interface MediaTransformOverlayProps {
	targets: SelectedMediaTransformTarget[];
	canvasSize: { width: number; height: number };
	previewRef: RefObject<HTMLDivElement | null>;
	currentTime: number;
	fps: number;
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

/** Direct manipulation controls for selected media on the preview canvas. */
export function MediaTransformOverlay({
	targets,
	canvasSize,
	previewRef,
	currentTime,
	fps,
}: MediaTransformOverlayProps) {
	const isEditingMask = useMaskEditorStore((state) => state.isEditing);
	// Painting a custom cutout needs the whole clip surface, so the transform
	// box yields exactly like it does for mask editing.
	const isPaintingCutout = useCustomCutoutEditorStore((state) => state.editing);
	const isEditingManualBody = usePortraitManualBodyStore(
		(state) => state.active
	);
	const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
	const [cropMode, setCropMode] = useState(false);
	const perspectiveEditingId = usePerspectiveEditorStore(
		(state) => state.editingElementId
	);
	const setPerspectiveEditing = usePerspectiveEditorStore(
		(state) => state.setEditing
	);
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
	const singleTarget = targets.length === 1 ? targets[0] : null;
	const perspectiveMode =
		singleItem !== null &&
		perspectiveEditingId === singleItem.elementId &&
		singleTarget?.element.perspectiveEnabled !== false;

	// Drag-warp mode is tied to one enabled, solely selected element; leave it
	// when the selection changes, the clip disappears or the section is off.
	useEffect(() => {
		if (perspectiveEditingId === null) return;
		const stillValid =
			singleTarget !== null &&
			singleTarget.element.id === perspectiveEditingId &&
			singleTarget.element.perspectiveEnabled !== false;
		if (!stillValid) setPerspectiveEditing(null);
	}, [perspectiveEditingId, singleTarget, setPerspectiveEditing]);

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
			corner,
		}: {
			event: ReactPointerEvent<HTMLElement>;
			kind: InteractionKind;
			handle?: ResizeHandle;
			cropSide?: CropSide;
			corner?: PerspectiveCorner;
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
				corner,
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

			if (
				interaction.kind === "perspective" &&
				interaction.corner &&
				interaction.items.length === 1
			) {
				const item = interaction.items[0];
				const localDelta = perspectiveDeltaFromScreen({
					delta,
					rotation: item.rotation,
					flipHorizontal: item.flipHorizontal,
					flipVertical: item.flipVertical,
				});
				nextItems = [
					{
						...item,
						perspective: perspectiveFromLocalDelta({
							perspective: item.perspective,
							corner: interaction.corner,
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
			if (perspectiveMode) setPerspectiveEditing(null);
			if (activeInteraction) finishInteraction();
			setCropMode(false);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activeInteraction,
		finishInteraction,
		perspectiveMode,
		setPerspectiveEditing,
	]);

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

	const handlePerspectiveKeyDown = ({
		event,
		corner,
	}: {
		event: ReactKeyboardEvent<HTMLElement>;
		corner: PerspectiveCorner;
	}) => {
		const item = singleItem;
		if (!item) return;
		const step = keyboardPoint({ event, step: event.shiftKey ? 10 : 1 });
		if (!step) return;
		event.preventDefault();
		event.stopPropagation();
		const target = targets.find(
			(candidate) => candidate.element.id === item.elementId
		);
		if (!target) return;
		const width = canvasSize.width * item.scaleX;
		const height = canvasSize.height * item.scaleY;
		// Arrow keys nudge the visible corner in screen direction by 1% of the
		// box (10% with Shift), through the same mapping the pointer uses.
		const perspective = perspectiveFromLocalDelta({
			perspective: item.perspective,
			corner,
			delta: perspectiveDeltaFromScreen({
				delta: { x: step.x * width * 0.01, y: step.y * height * 0.01 },
				rotation: item.rotation,
				flipHorizontal: item.flipHorizontal,
				flipVertical: item.flipVertical,
			}),
			width,
			height,
		});
		applyImmediately({
			updates: [
				{
					trackId: target.trackId,
					elementId: target.element.id,
					updates: buildMediaCanvasUpdate({
						element: target.element,
						mutation: { perspective },
						currentTime,
						fps,
					}),
				},
			],
		});
	};

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

	if (
		snapshots.length === 0 ||
		isEditingMask ||
		isEditingManualBody ||
		isPaintingCutout
	)
		return null;

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

				{perspectiveMode && singleItem ? (
					<MediaPerspectiveHandles
						perspective={singleItem.perspective}
						flipHorizontal={singleItem.flipHorizontal}
						flipVertical={singleItem.flipVertical}
						onCornerPointerDown={({ event, corner }) =>
							beginInteraction({ event, kind: "perspective", corner })
						}
						onCornerKeyDown={({ event, corner }) =>
							handlePerspectiveKeyDown({ event, corner })
						}
					/>
				) : cropMode && cropStyle ? (
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
