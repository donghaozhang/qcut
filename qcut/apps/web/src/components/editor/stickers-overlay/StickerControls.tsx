/**
 * StickerControls Component
 *
 * Provides control buttons for selected stickers including delete,
 * layer management, and other actions.
 */

import { memo, useRef, type MouseEvent, type SyntheticEvent } from "react";
import { X, ArrowUp, ArrowDown, Copy, RotateCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { CreateStickerElement } from "@/types/timeline";
import { cn } from "@/lib/utils";
import {
	assignNewStickerInstanceId,
	createStickerInstanceId,
} from "@/lib/stickers/sticker-instance";
import { stickerVisualUpdatesFromOverlay } from "@/lib/stickers/timeline-sticker-visual";

interface StickerControlsProps {
	stickerId: string;
	isVisible: boolean;
	sticker: OverlaySticker;
}

function stopControlInteraction(event: SyntheticEvent): void {
	event.stopPropagation();
}

/**
 * Control buttons and tools for selected stickers
 */
export const StickerControls = memo<StickerControlsProps>(
	({ stickerId, isVisible, sticker }) => {
		const {
			removeOverlaySticker,
			updateOverlaySticker,
			bringToFront,
			sendToBack,
			saveHistorySnapshot,
		} = useStickersOverlayStore();
		const opacityGestureActive = useRef(false);

		if (!isVisible) return null;

		/**
		 * Handle delete sticker
		 */
		const handleDelete = (e: MouseEvent) => {
			e.stopPropagation();
			removeOverlaySticker(stickerId);
		};

		/**
		 * Handle duplicate sticker
		 */
		const handleDuplicate = (e: MouseEvent) => {
			e.stopPropagation();
			const timeline = useTimelineStore.getState();
			for (const track of timeline._tracks) {
				const sourceElement = track.elements.find(
					(element) =>
						element.type === "sticker" && element.stickerId === stickerId
				);
				if (sourceElement?.type !== "sticker") continue;

				// The copy occupies the same time range as the source, so it needs
				// a sticker lane that is free there — stack a new lane on top when
				// none is (the no-overlap invariant rejects same-lane copies).
				const sourceDuration =
					sourceElement.duration -
					sourceElement.trimStart -
					sourceElement.trimEnd;
				const freeTrack = timeline._tracks.find(
					(candidate) =>
						candidate.type === "sticker" &&
						!candidate.locked &&
						!timeline.checkElementOverlap(
							candidate.id,
							sourceElement.startTime,
							sourceDuration
						)
				);
				// insertTrackAt pushes the history entry when a lane is created, so
				// the element add must not push a second one.
				const targetTrackId =
					freeTrack?.id ??
					timeline.insertTrackAt(
						"sticker",
						timeline._tracks.findIndex((candidate) => candidate.id === track.id)
					);

				const sourceWithoutElementId = {
					...sourceElement,
				} as typeof sourceElement & Record<string, unknown>;
				Reflect.deleteProperty(sourceWithoutElementId, "id");
				const visual = stickerVisualUpdatesFromOverlay({ sticker });
				useTimelineStore.getState().addElementToTrack(
					targetTrackId,
					assignNewStickerInstanceId({
						element: {
							...sourceWithoutElementId,
							...visual,
							name: `${sourceElement.name} (copy)`,
							x: Math.min(90, sticker.position.x + 5),
							y: Math.min(90, sticker.position.y + 5),
						} as CreateStickerElement,
						newStickerId: createStickerInstanceId(),
					}),
					{ pushHistory: !!freeTrack }
				);
				break;
			}
		};

		/**
		 * Handle rotation
		 */
		const handleRotate = (e: MouseEvent) => {
			e.stopPropagation();
			saveHistorySnapshot();
			updateOverlaySticker(stickerId, {
				rotation: (sticker.rotation + 45) % 360,
			});
		};

		const startOpacityGesture = () => {
			if (opacityGestureActive.current) return;
			saveHistorySnapshot();
			opacityGestureActive.current = true;
		};

		/**
		 * Handle opacity change
		 */
		const handleOpacityChange = (value: number[]) => {
			startOpacityGesture();
			updateOverlaySticker(stickerId, {
				opacity: value[0] / 100,
			});
		};

		const handleOpacityCommit = () => {
			opacityGestureActive.current = false;
		};

		/**
		 * Handle layer order changes
		 */
		const handleBringToFront = (e: MouseEvent) => {
			e.stopPropagation();
			saveHistorySnapshot();
			bringToFront(stickerId);
		};

		const handleSendToBack = (e: MouseEvent) => {
			e.stopPropagation();
			saveHistorySnapshot();
			sendToBack(stickerId);
		};

		return (
			<TooltipProvider>
				<div
					className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-background/95 backdrop-blur-sm border rounded-lg p-1 shadow-lg z-50"
					onMouseDown={stopControlInteraction}
					onPointerDown={stopControlInteraction}
					onTouchStart={stopControlInteraction}
				>
					{/* Delete button */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Delete sticker"
								size="icon"
								variant="outline"
								className="h-7 w-7"
								onClick={handleDelete}
								onKeyDown={stopControlInteraction}
							>
								<X className="h-4 w-4">
									<title>Delete sticker</title>
								</X>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete sticker (Del)</TooltipContent>
					</Tooltip>

					{/* Duplicate button */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Duplicate sticker"
								size="icon"
								variant="outline"
								className="h-7 w-7"
								onClick={handleDuplicate}
								onKeyDown={stopControlInteraction}
							>
								<Copy className="h-4 w-4">
									<title>Duplicate sticker</title>
								</Copy>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Duplicate sticker</TooltipContent>
					</Tooltip>

					{/* Rotate button */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Rotate sticker 45 degrees"
								size="icon"
								variant="outline"
								className="h-7 w-7"
								onClick={handleRotate}
								onKeyDown={stopControlInteraction}
							>
								<RotateCw className="h-4 w-4">
									<title>Rotate sticker 45 degrees</title>
								</RotateCw>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Rotate 45°</TooltipContent>
					</Tooltip>

					<div className="w-px h-5 bg-border" />

					{/* Layer controls */}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Bring sticker to front"
								size="icon"
								variant="outline"
								className="h-7 w-7"
								onClick={handleBringToFront}
								onKeyDown={stopControlInteraction}
							>
								<ArrowUp className="h-4 w-4">
									<title>Bring sticker to front</title>
								</ArrowUp>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Bring to front</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Send sticker to back"
								size="icon"
								variant="outline"
								className="h-7 w-7"
								onClick={handleSendToBack}
								onKeyDown={stopControlInteraction}
							>
								<ArrowDown className="h-4 w-4">
									<title>Send sticker to back</title>
								</ArrowDown>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Send to back</TooltipContent>
					</Tooltip>

					<div className="w-px h-5 bg-border" />

					{/* Opacity slider */}
					<div className="flex items-center gap-2 px-2">
						<Layers className="h-3 w-3 text-muted-foreground" />
						<Slider
							className="w-20"
							value={[sticker.opacity * 100]}
							onValueChange={handleOpacityChange}
							onValueCommit={handleOpacityCommit}
							onBlur={handleOpacityCommit}
							max={100}
							min={0}
							step={5}
						/>
						<span className="text-xs text-muted-foreground w-8">
							{Math.round(sticker.opacity * 100)}%
						</span>
					</div>
				</div>
			</TooltipProvider>
		);
	}
);

StickerControls.displayName = "StickerControls";

/**
 * Simplified controls for mobile/touch devices
 */
export const SimpleStickerControls = memo<{
	stickerId: string;
	isVisible: boolean;
}>(({ stickerId, isVisible }) => {
	const { removeOverlaySticker } = useStickersOverlayStore();

	if (!isVisible) return null;

	const handleDelete = (e: MouseEvent) => {
		e.stopPropagation();
		removeOverlaySticker(stickerId);
	};

	return (
		<div
			className="absolute -top-8 -right-2"
			onMouseDown={stopControlInteraction}
			onPointerDown={stopControlInteraction}
			onTouchStart={stopControlInteraction}
		>
			<Button
				type="button"
				aria-label="Delete sticker"
				size="icon"
				variant="destructive"
				className="h-6 w-6 rounded-full shadow-lg"
				onClick={handleDelete}
				onKeyDown={stopControlInteraction}
			>
				<X className="h-3 w-3">
					<title>Delete sticker</title>
				</X>
			</Button>
		</div>
	);
});

SimpleStickerControls.displayName = "SimpleStickerControls";
