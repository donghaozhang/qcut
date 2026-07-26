import { useEffect, useState } from "react";
import { ChevronDown, PenTool } from "lucide-react";
import type {
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskMirrorMode,
	MediaMaskTrackingDirection,
} from "@/types/timeline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, generateUUID } from "@/lib/utils";
import {
	addMaskTrackingCorrectionKeyframes,
	updateMaskTrackingStatus,
} from "@/lib/video/media-mask-tracking";
import {
	cancelActiveMaskTracking,
	resumeActiveMaskTracking,
} from "@/lib/segmentation/mask-tracking-runtime";
import {
	addMediaMask,
	normalizeMediaMaskStack,
	removeMediaMaskKeyframe,
	updateMediaMaskInStack,
	upsertMediaMaskKeyframe,
} from "@/lib/video/media-mask-stack";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { MaskNumberControl } from "./media-mask-controls";
import { MediaMaskLayerList } from "./media-mask-layer-list";
import { MediaMaskTrackingControls } from "./media-mask-tracking-controls";
import { MediaMaskStrokeProperties } from "./media-mask-stroke-properties";
import { MediaMaskTransformControls } from "./media-mask-transform-controls";
import {
	changeMediaMaskShape,
	createMaskForShape,
	MASK_PROPERTY_FALLBACKS,
	type AddableMaskType,
} from "./media-mask-shapes";
import { MediaMaskShapeGrid } from "./media-mask-shape-grid";
import { PropertyItemLabel } from "./property-item";

export function MediaMaskProperties({
	elementId,
	masks,
	currentFrame,
	onChange,
	onInteractionStart,
	onInteractionEnd,
	onTrack,
}: {
	elementId: string;
	masks: MediaMask[];
	currentFrame: number;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
	onTrack?: (options: {
		mask: MediaMask;
		direction: MediaMaskTrackingDirection;
	}) => void;
}) {
	const selectedElementId = useMaskEditorStore(
		(state) => state.selectedElementId
	);
	const storedMaskId = useMaskEditorStore((state) => state.selectedMaskId);
	const selectMask = useMaskEditorStore((state) => state.selectMask);
	const setEditing = useMaskEditorStore((state) => state.setEditing);
	const selectedMaskId =
		selectedElementId === elementId &&
		masks.some((mask) => mask.id === storedMaskId)
			? storedMaskId
			: (masks[0]?.id ?? null);
	const selectedMask = masks.find((mask) => mask.id === selectedMaskId);
	const [expanded, setExpanded] = useState(true);

	useEffect(() => {
		if (
			selectedMaskId &&
			(selectedElementId !== elementId || storedMaskId !== selectedMaskId)
		) {
			selectMask(elementId, selectedMaskId);
		}
	}, [elementId, selectMask, selectedElementId, selectedMaskId, storedMaskId]);

	const commitMasks = (next: MediaMask[], history = true) =>
		onChange(normalizeMediaMaskStack(next), history);

	const addMask = (type: AddableMaskType) => {
		const mask = createMaskForShape({ type, index: masks.length });
		commitMasks(addMediaMask(masks, mask));
		selectMask(elementId, mask.id!);
		setEditing(true);
	};

	const patchSelected = (updates: Partial<MediaMask>, history = true) => {
		if (!selectedMaskId) return;
		commitMasks(
			updateMediaMaskInStack({ masks, maskId: selectedMaskId, updates }),
			history
		);
	};

	const updateNumericProperties = (
		updates: Partial<Record<MediaMaskKeyframeProperty, number>>
	) => {
		if (!selectedMask || !selectedMaskId) return;
		let nextMask: MediaMask = { ...selectedMask, ...updates };
		for (const [property, value] of Object.entries(updates) as Array<
			[MediaMaskKeyframeProperty, number]
		>) {
			const keyframes = nextMask.keyframes?.[property] ?? [];
			if (keyframes.length === 0) continue;
			const existing = keyframes.find(
				(keyframe) => keyframe.frame === currentFrame
			);
			nextMask = upsertMediaMaskKeyframe({
				mask: nextMask,
				property,
				keyframe: {
					id: existing?.id ?? `mask-keyframe-${generateUUID()}`,
					frame: currentFrame,
					value,
					easing: existing?.easing ?? "linear",
				},
			});
		}
		commitMasks(
			updateMediaMaskInStack({
				masks,
				maskId: selectedMaskId,
				updates: nextMask,
			}),
			false
		);
	};

	const toggleKeyframes = ({
		properties,
	}: {
		properties: MediaMaskKeyframeProperty[];
	}) => {
		if (!selectedMask || !selectedMaskId) return;
		const removeGroup = properties.every((property) =>
			(selectedMask.keyframes?.[property] ?? []).some(
				(keyframe) => keyframe.frame === currentFrame
			)
		);
		let nextMask = selectedMask;
		for (const property of properties) {
			const existing = (nextMask.keyframes?.[property] ?? []).find(
				(keyframe) => keyframe.frame === currentFrame
			);
			if (removeGroup && existing) {
				nextMask = removeMediaMaskKeyframe({
					mask: nextMask,
					property,
					keyframeId: existing.id,
				});
				continue;
			}
			if (existing) continue;
			nextMask = upsertMediaMaskKeyframe({
				mask: nextMask,
				property,
				keyframe: {
					id: `mask-keyframe-${generateUUID()}`,
					frame: currentFrame,
					value: nextMask[property] ?? MASK_PROPERTY_FALLBACKS[property],
					easing: "linear",
				},
			});
		}
		commitMasks(
			updateMediaMaskInStack({
				masks,
				maskId: selectedMaskId,
				updates: nextMask,
			})
		);
	};

	const isKeyframedHere = ({
		property,
	}: {
		property: MediaMaskKeyframeProperty;
	}) =>
		(selectedMask?.keyframes?.[property] ?? []).some(
			(keyframe) => keyframe.frame === currentFrame
		);

	const updatePercent = (property: MediaMaskKeyframeProperty, value: number) =>
		updateNumericProperties({ [property]: value / 100 });

	const updateSize = ({
		property,
		value,
	}: {
		property: "width" | "height";
		value: number;
	}) => {
		if (!selectedMask) return;
		if (!selectedMask.maintainAspectRatio) {
			updateNumericProperties({ [property]: value });
			return;
		}
		const ratio = selectedMask.width / Math.max(0.001, selectedMask.height);
		updateNumericProperties(
			property === "width"
				? { width: value, height: value / ratio }
				: { height: value, width: value * ratio }
		);
	};

	const startTracking = (direction: MediaMaskTrackingDirection) => {
		if (!selectedMask || !onTrack) return;
		patchSelected({
			tracking: {
				...selectedMask.tracking,
				direction,
				status: "processing",
				source: selectedMask.type === "person" ? "mediapipe" : "sam3",
				progress: 0,
				anchorFrame: currentFrame,
			},
		});
		onTrack({ mask: selectedMask, direction });
	};
	const pauseTracking = () => {
		if (!selectedMask) return;
		void cancelActiveMaskTracking({ elementId, maskId: selectedMask.id });
		patchSelected(
			updateMaskTrackingStatus({ mask: selectedMask, status: "paused" })
		);
	};
	const resumeTracking = async () => {
		if (!selectedMask || !onTrack) return;
		const direction = selectedMask.tracking?.direction ?? "both";
		patchSelected(
			updateMaskTrackingStatus({
				mask: selectedMask,
				status: "processing",
				progress: selectedMask.tracking?.progress ?? 0,
			})
		);
		if (
			await resumeActiveMaskTracking({
				elementId,
				maskId: selectedMask.id,
			})
		) {
			return;
		}
		onTrack({ mask: selectedMask, direction });
	};
	const fixTrackingFrame = () => {
		if (!selectedMask) return;
		patchSelected(
			addMaskTrackingCorrectionKeyframes({
				mask: selectedMask,
				frame: currentFrame,
			})
		);
	};

	const numberControl = (
		property: MediaMaskKeyframeProperty,
		label: string,
		value: number,
		min: number,
		max: number,
		onValueChange: (value: number) => void,
		step = 1,
		suffix?: string
	) => (
		<MaskNumberControl
			key={property}
			label={label}
			value={value}
			min={min}
			max={max}
			step={step}
			suffix={suffix}
			keyframed={isKeyframedHere({ property })}
			onChange={onValueChange}
			onToggleKeyframe={() => toggleKeyframes({ properties: [property] })}
			onInteractionStart={onInteractionStart}
			onInteractionEnd={onInteractionEnd}
		/>
	);
	const isCutoutMask =
		selectedMask?.type === "object" || selectedMask?.type === "person";
	const extendedMaskControls = selectedMask ? (
		<>
			{numberControl(
				"expansion",
				"扩展",
				(selectedMask.expansion ?? 0) * 100,
				-100,
				100,
				(value) => updatePercent("expansion", value),
				0.1,
				"%"
			)}
			{numberControl(
				"opacity",
				"不透明度",
				(selectedMask.opacity ?? 1) * 100,
				0,
				100,
				(value) => updatePercent("opacity", value),
				1,
				"%"
			)}
			<div className="flex items-center justify-between gap-2">
				<PropertyItemLabel>反选</PropertyItemLabel>
				<Switch
					aria-label="反选蒙版"
					checked={selectedMask.invert}
					onCheckedChange={(invert) => patchSelected({ invert })}
				/>
			</div>
		</>
	) : null;

	return (
		<div className="space-y-3" data-testid="media-mask-properties">
			<div
				className="flex h-8 items-center justify-between border-b border-border/70 pb-2"
				data-testid="media-mask-section-header"
			>
				<div className="flex items-center gap-2">
					<Checkbox
						aria-label="启用蒙版"
						checked={selectedMask ? selectedMask.enabled !== false : false}
						disabled={!selectedMask}
						onCheckedChange={(checked) =>
							patchSelected({ enabled: checked === true })
						}
					/>
					<PropertyItemLabel className="text-foreground">
						蒙版
					</PropertyItemLabel>
				</div>
				<button
					type="button"
					className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
					onClick={() => setExpanded((current) => !current)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						setExpanded((current) => !current);
					}}
					aria-label={expanded ? "收起蒙版" : "展开蒙版"}
					aria-expanded={expanded}
				>
					<ChevronDown
						className={cn(
							"size-3.5 transition-transform",
							!expanded && "-rotate-90"
						)}
					/>
				</button>
			</div>

			{expanded ? (
				<>
					<div className="space-y-3" data-testid="media-mask-stack">
						<MediaMaskShapeGrid
							selectedType={selectedMask?.type}
							onSelect={(type) =>
								selectedMask
									? patchSelected(
											changeMediaMaskShape({
												mask: selectedMask,
												type,
												index: masks.indexOf(selectedMask),
											})
										)
									: addMask(type)
							}
						/>

						<div
							className="flex h-[84px] items-end justify-center border-b border-border/70 pb-2 text-muted-foreground"
							aria-hidden="true"
						>
							<ChevronDown className="size-3.5" />
						</div>

						{masks.length > 0 ? (
							<MediaMaskLayerList
								masks={masks}
								selectedMaskId={selectedMaskId}
								onChange={commitMasks}
								onSelect={(maskId) => {
									selectMask(elementId, maskId);
									setEditing(true);
								}}
								onAdd={() => addMask("rectangle")}
							/>
						) : null}
					</div>

					{selectedMask ? (
						<div className="space-y-3" data-mask-type={selectedMask.type}>
							{selectedMask.type === "text" ? (
								<div className="flex items-center gap-2">
									<PropertyItemLabel className="w-12 shrink-0">
										文字
									</PropertyItemLabel>
									<Input
										value={selectedMask.text ?? "Text"}
										onChange={(event) =>
											patchSelected({ text: event.target.value }, false)
										}
										aria-label="蒙版文字"
										className="h-8 text-xs"
									/>
								</div>
							) : null}

							{selectedMask.type === "pen" ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full"
									onClick={() => setEditing(true)}
								>
									<PenTool className="size-3.5" /> 在画布上编辑节点
								</Button>
							) : null}

							{isCutoutMask ? (
								<MediaMaskTrackingControls
									mask={selectedMask}
									onTrack={onTrack ? startTracking : undefined}
									onPause={pauseTracking}
									onResume={resumeTracking}
									onFixFrame={fixTrackingFrame}
								/>
							) : null}

							<MediaMaskTransformControls
								mask={selectedMask}
								isKeyframed={isKeyframedHere}
								onNumericChange={({ updates }) =>
									updateNumericProperties(updates)
								}
								onSizeChange={updateSize}
								onToggleKeyframes={toggleKeyframes}
								onAspectRatioChange={({ maintainAspectRatio }) =>
									patchSelected({ maintainAspectRatio })
								}
								onInteractionStart={onInteractionStart}
								onInteractionEnd={onInteractionEnd}
							/>

							{selectedMask.type === "mirror" || isCutoutMask ? (
								<div className="space-y-4 border-t border-border/70 pt-3">
									{selectedMask.type === "mirror" ? (
										<div className="space-y-2">
											<PropertyItemLabel>镜像方向</PropertyItemLabel>
											<div className="grid grid-cols-3 gap-1">
												{(
													[
														{ mode: "left", label: "左侧" },
														{ mode: "center", label: "双向" },
														{ mode: "right", label: "右侧" },
													] satisfies Array<{
														mode: MediaMaskMirrorMode;
														label: string;
													}>
												).map((item) => (
													<Button
														type="button"
														key={item.mode}
														variant={
															(selectedMask.mirrorMode ?? "center") ===
															item.mode
																? "default"
																: "outline"
														}
														size="sm"
														className="h-8 px-2 text-xs"
														onClick={() =>
															patchSelected({ mirrorMode: item.mode })
														}
														onKeyDown={(event) => {
															if (event.key !== "Enter" && event.key !== " ") {
																return;
															}
															event.preventDefault();
															patchSelected({ mirrorMode: item.mode });
														}}
														aria-pressed={
															(selectedMask.mirrorMode ?? "center") ===
															item.mode
														}
														data-testid={`media-mask-mirror-panel-mode-${item.mode}`}
													>
														{item.label}
													</Button>
												))}
											</div>
										</div>
									) : null}
									{isCutoutMask ? extendedMaskControls : null}
								</div>
							) : null}

							<details className="border-t border-border/70 pt-3">
								<summary className="cursor-pointer select-none text-xs text-muted-foreground">
									更多蒙版设置
								</summary>
								<div className="mt-3 space-y-3">
									{isCutoutMask ? null : (
										<>
											<div className="space-y-4">{extendedMaskControls}</div>
											<MediaMaskTrackingControls
												mask={selectedMask}
												onTrack={onTrack ? startTracking : undefined}
												onPause={pauseTracking}
												onResume={resumeTracking}
												onFixFrame={fixTrackingFrame}
											/>
										</>
									)}
									<MediaMaskStrokeProperties
										stroke={selectedMask.stroke}
										onChange={(stroke, history) =>
											patchSelected({ stroke }, history)
										}
										onInteractionStart={onInteractionStart}
										onInteractionEnd={onInteractionEnd}
									/>
								</div>
							</details>
						</div>
					) : null}
				</>
			) : null}
		</div>
	);
}
