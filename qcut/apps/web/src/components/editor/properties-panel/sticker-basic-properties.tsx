import {
	AlignHorizontalJustifyCenter,
	AlignHorizontalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyEnd,
	AlignVerticalJustifyStart,
	Link2,
	RotateCcw,
	Unlink2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { PropertyGroup, PropertyItemLabel } from "./property-item";
import {
	alignedPosition,
	aspectSizeUpdates,
	clamp,
	type StickerKeyframeControls,
	type UpdateStickerProperties,
} from "./sticker-property-types";
import { IconButton, NumberControl } from "./visual-property-controls";

export function StickerBasicProperties({
	canvasSize,
	onInteractionEnd,
	onInteractionStart,
	onReset,
	keyframeControls,
	update,
	visual,
}: {
	canvasSize: { width: number; height: number };
	keyframeControls: StickerKeyframeControls;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
	onReset: () => void;
	update: UpdateStickerProperties;
	visual: OverlaySticker;
}) {
	const { t } = useTranslation();
	const updateSize = ({
		axis,
		value,
	}: {
		axis: "width" | "height";
		value: number;
	}) => {
		const updates = aspectSizeUpdates({
			axis,
			value,
			width: visual.size.width,
			height: visual.size.height,
			maintainAspectRatio: visual.maintainAspectRatio,
		});
		update({ keyframeValues: updates, updates });
	};

	const shortEdge = Math.min(canvasSize.width, canvasSize.height);
	const alignX = ({ alignment }: { alignment: "start" | "center" | "end" }) => {
		const x = alignedPosition({
			alignment,
			canvasLength: canvasSize.width,
			size: visual.size.width,
			shortEdge,
		});
		update({
			history: true,
			keyframeValues: { x },
			updates: { x },
		});
	};
	const alignY = ({ alignment }: { alignment: "start" | "center" | "end" }) => {
		const y = alignedPosition({
			alignment,
			canvasLength: canvasSize.height,
			size: visual.size.height,
			shortEdge,
		});
		update({
			history: true,
			keyframeValues: { y },
			updates: { y },
		});
	};

	return (
		<PropertyGroup title={t("mediaProperties.positionAndSize")} defaultExpanded>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<PropertyItemLabel>
						{t("mediaProperties.maintainAspectRatio")}
					</PropertyItemLabel>
					<div className="flex items-center gap-2">
						{visual.maintainAspectRatio ? (
							<Link2 className="size-3.5 text-primary" />
						) : (
							<Unlink2 className="size-3.5 text-muted-foreground" />
						)}
						<Switch
							aria-label={t("mediaProperties.maintainAspectRatio")}
							checked={visual.maintainAspectRatio}
							onCheckedChange={(maintainAspectRatio) =>
								update({
									history: true,
									updates: { maintainAspectRatio },
								})
							}
						/>
					</div>
				</div>
				<p className="text-[10px] text-muted-foreground">
					{t("stickerProperties.shortEdgePercent")}
				</p>
				<NumberControl
					label={t("stickerProperties.width")}
					value={visual.size.width}
					min={5}
					max={100}
					step={0.1}
					suffix="%"
					onChange={(value) => updateSize({ axis: "width", value })}
					keyframed={keyframeControls.isKeyframed({ property: "width" })}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "width",
							value: visual.size.width,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("stickerProperties.height")}
					value={visual.size.height}
					min={5}
					max={100}
					step={0.1}
					suffix="%"
					onChange={(value) => updateSize({ axis: "height", value })}
					keyframed={keyframeControls.isKeyframed({ property: "height" })}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "height",
							value: visual.size.height,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.positionX")}
					value={visual.position.x}
					min={0}
					max={100}
					step={0.1}
					suffix="%"
					onChange={(x) =>
						update({
							keyframeValues: {
								x: clamp({ value: x, min: 0, max: 100 }),
							},
							updates: { x: clamp({ value: x, min: 0, max: 100 }) },
						})
					}
					keyframed={keyframeControls.isKeyframed({ property: "x" })}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "x",
							value: visual.position.x,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.positionY")}
					value={visual.position.y}
					min={0}
					max={100}
					step={0.1}
					suffix="%"
					onChange={(y) =>
						update({
							keyframeValues: {
								y: clamp({ value: y, min: 0, max: 100 }),
							},
							updates: { y: clamp({ value: y, min: 0, max: 100 }) },
						})
					}
					keyframed={keyframeControls.isKeyframed({ property: "y" })}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "y",
							value: visual.position.y,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.rotation")}
					value={visual.rotation}
					min={-360}
					max={360}
					step={0.1}
					suffix="°"
					allowInputOverflow
					onChange={(rotation) =>
						update({
							keyframeValues: { rotation },
							updates: { rotation },
						})
					}
					keyframed={keyframeControls.isKeyframed({
						property: "rotation",
					})}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "rotation",
							value: visual.rotation,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<NumberControl
					label={t("mediaProperties.opacity")}
					value={visual.opacity * 100}
					min={0}
					max={100}
					step={0.1}
					suffix="%"
					onChange={(opacity) =>
						update({
							keyframeValues: {
								opacity: clamp({ value: opacity, min: 0, max: 100 }) / 100,
							},
							updates: {
								opacity: clamp({ value: opacity, min: 0, max: 100 }) / 100,
							},
						})
					}
					keyframed={keyframeControls.isKeyframed({
						property: "opacity",
					})}
					onToggleKeyframe={() =>
						keyframeControls.toggleKeyframe({
							property: "opacity",
							value: visual.opacity,
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>

				<div className="flex items-center justify-between gap-2">
					<div className="flex gap-1">
						<IconButton
							label={t("mediaProperties.alignLeft")}
							onClick={() => alignX({ alignment: "start" })}
						>
							<AlignHorizontalJustifyStart className="size-4" />
						</IconButton>
						<IconButton
							label={t("mediaProperties.alignCenter")}
							onClick={() => alignX({ alignment: "center" })}
						>
							<AlignHorizontalJustifyCenter className="size-4" />
						</IconButton>
						<IconButton
							label={t("mediaProperties.alignRight")}
							onClick={() => alignX({ alignment: "end" })}
						>
							<AlignHorizontalJustifyEnd className="size-4" />
						</IconButton>
					</div>
					<div className="flex gap-1">
						<IconButton
							label={t("mediaProperties.alignTop")}
							onClick={() => alignY({ alignment: "start" })}
						>
							<AlignVerticalJustifyStart className="size-4" />
						</IconButton>
						<IconButton
							label={t("mediaProperties.alignMiddle")}
							onClick={() => alignY({ alignment: "center" })}
						>
							<AlignVerticalJustifyCenter className="size-4" />
						</IconButton>
						<IconButton
							label={t("mediaProperties.alignBottom")}
							onClick={() => alignY({ alignment: "end" })}
						>
							<AlignVerticalJustifyEnd className="size-4" />
						</IconButton>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onReset}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<RotateCcw className="size-3.5" />
					{t("mediaProperties.resetTransform")}
				</Button>
			</div>
		</PropertyGroup>
	);
}
