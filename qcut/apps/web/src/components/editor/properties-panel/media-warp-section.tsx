import { Move3d } from "lucide-react";
import type {
	MediaElement,
	MediaKeyframeProperty,
	MediaPerspective,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import { useTranslation } from "@/lib/i18n";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";
import { usePerspectiveEditorStore } from "@/stores/editor/perspective-editor-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	PERSPECTIVE_CORNERS,
	perspectiveCornerFromOffsetPercent,
	perspectiveCornerOffsetPercent,
} from "../preview-panel/media-perspective-geometry";
import { PERSPECTIVE_PROPERTIES } from "../preview-panel/media-transform-update";
import { MediaKeyframeNav } from "./media-keyframe-nav";
import { PropertyGroup } from "./property-item";
import { PERSPECTIVE_FIELDS } from "./visual-property-controls";

type MediaUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateMediaElement"]
>[2];

/** Corners only travel inward, so each offset input is bounded on one side. */
function offsetRangeFor(key: keyof MediaPerspective): {
	min: number;
	max: number;
} {
	const field = PERSPECTIVE_CORNERS.find(
		(entry) => entry.x === key || entry.y === key
	);
	const rest = field ? (field.x === key ? field.restX : field.restY) : 0;
	return rest === 0 ? { min: 0, max: 100 } : { min: -100, max: 0 };
}

interface MediaWarpSectionProps {
	element: MediaElement;
	perspective: MediaPerspective;
	currentFrame: number;
	keyframesFor: (args: {
		property: MediaKeyframeProperty;
	}) => MediaPropertyKeyframe[];
	isKeyframedHere: (args: { property: MediaKeyframeProperty }) => boolean;
	currentPropertyValue: (args: { property: MediaKeyframeProperty }) => number;
	togglePropertyKeyframes: (args: {
		values: Partial<Record<MediaKeyframeProperty, number>>;
	}) => void;
	updateNumericProperties: (args: {
		updates: MediaUpdates;
		values: Partial<Record<MediaKeyframeProperty, number>>;
		history?: boolean;
	}) => void;
	resetNumericProperties: (args: {
		updates: MediaUpdates;
		properties: MediaKeyframeProperty[];
	}) => void;
	update: (updates: MediaUpdates, history?: boolean) => void;
	onSeekFrame: (frame: number) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}

/**
 * 变形: the four-corner pin, presented as offsets from each resting corner
 * (so an untouched clip reads 0 everywhere), with a drag-mode toggle that
 * hands the corners to the preview overlay.
 */
export function MediaWarpSection({
	element,
	perspective,
	currentFrame,
	keyframesFor,
	isKeyframedHere,
	currentPropertyValue,
	togglePropertyKeyframes,
	updateNumericProperties,
	resetNumericProperties,
	update,
	onSeekFrame,
	onInteractionStart,
	onInteractionEnd,
}: MediaWarpSectionProps) {
	const { t } = useTranslation();
	const title = t("mediaProperties.perspective");
	const editingElementId = usePerspectiveEditorStore(
		(state) => state.editingElementId
	);
	const toggleEditing = usePerspectiveEditorStore(
		(state) => state.toggleEditing
	);
	const setEditing = usePerspectiveEditorStore((state) => state.setEditing);
	const dragging = editingElementId === element.id;
	const enabled = element.perspectiveEnabled !== false;
	const cornerProperties = [
		...PERSPECTIVE_PROPERTIES,
	] as MediaKeyframeProperty[];
	const framesFor = (properties: MediaKeyframeProperty[]) =>
		properties.flatMap((property) =>
			keyframesFor({ property }).map((keyframe) => keyframe.frame)
		);
	const valuesFor = (properties: MediaKeyframeProperty[]) =>
		Object.fromEntries(
			properties.map((property) => [
				property,
				currentPropertyValue({ property }),
			])
		) as Partial<Record<MediaKeyframeProperty, number>>;

	return (
		<PropertyGroup
			title={title}
			defaultExpanded={false}
			testId="media-warp-section"
			enabled={enabled}
			enableLabel={t("mediaProperties.enableSection", { label: title })}
			onEnabledChange={(checked) => {
				if (!checked && dragging) setEditing(null);
				update({ perspectiveEnabled: checked });
			}}
			info={t("mediaProperties.warpInfo")}
			resetLabel={t("mediaProperties.resetSection", { label: title })}
			onReset={() =>
				resetNumericProperties({
					updates: { perspective: { ...DEFAULT_MEDIA_PERSPECTIVE } },
					properties: cornerProperties,
				})
			}
			headerActions={
				<MediaKeyframeNav
					label={title}
					frames={framesFor(cornerProperties)}
					currentFrame={currentFrame}
					keyframed={cornerProperties.every((property) =>
						isKeyframedHere({ property })
					)}
					onToggle={() =>
						togglePropertyKeyframes({
							values: valuesFor(cornerProperties),
						})
					}
					onSeekFrame={onSeekFrame}
					testId="media-warp-keyframes"
				/>
			}
		>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-xs">{t("mediaProperties.dragWarp")}</span>
					<Button
						type="button"
						variant={dragging ? "default" : "outline"}
						size="icon"
						className="size-7"
						aria-pressed={dragging}
						aria-label={t("mediaProperties.dragWarp")}
						title={t(
							dragging
								? "mediaProperties.dragWarpActive"
								: "mediaProperties.dragWarp"
						)}
						data-testid="media-warp-drag-toggle"
						onClick={() => toggleEditing(element.id)}
					>
						<Move3d className="size-3.5" />
					</Button>
				</div>
				{PERSPECTIVE_FIELDS.map((field) => {
					const rowProperties = [field.x, field.y] as MediaKeyframeProperty[];
					return (
						<div
							key={field.labelKey}
							className="grid grid-cols-[2.5rem_1fr_1fr_auto] items-center gap-2"
						>
							<span className="text-[11px] text-muted-foreground">
								{t(field.labelKey)}
							</span>
							{([field.x, field.y] as const).map((key, index) => {
								const property = key as MediaKeyframeProperty;
								const axis = index === 0 ? "X" : "Y";
								const live: MediaPerspective = {
									...perspective,
									[key]: currentPropertyValue({ property }),
								};
								return (
									<div key={key} className="flex items-center gap-1">
										<span className="w-3 text-[10px] text-muted-foreground">
											{axis}
										</span>
										<Input
											type="number"
											aria-label={t("mediaProperties.value", {
												label: `${t(field.labelKey)} ${axis}`,
											})}
											value={perspectiveCornerOffsetPercent({
												perspective: live,
												key,
											})}
											min={offsetRangeFor(key).min}
											max={offsetRangeFor(key).max}
											onFocus={onInteractionStart}
											onBlur={onInteractionEnd}
											onChange={(event) => {
												const percent = Number(event.target.value);
												if (!Number.isFinite(percent)) return;
												const value = perspectiveCornerFromOffsetPercent({
													key,
													percent,
												});
												updateNumericProperties({
													updates: {
														perspective: { ...perspective, [key]: value },
													},
													values: { [property]: value },
												});
											}}
											className="h-8 min-w-0 text-xs"
										/>
									</div>
								);
							})}
							<MediaKeyframeNav
								label={t(field.labelKey)}
								frames={framesFor(rowProperties)}
								currentFrame={currentFrame}
								keyframed={rowProperties.every((property) =>
									isKeyframedHere({ property })
								)}
								onToggle={() =>
									togglePropertyKeyframes({ values: valuesFor(rowProperties) })
								}
								onSeekFrame={onSeekFrame}
							/>
						</div>
					);
				})}
			</div>
		</PropertyGroup>
	);
}
