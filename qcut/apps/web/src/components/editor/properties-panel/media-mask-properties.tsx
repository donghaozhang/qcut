import { useEffect } from "react";
import { Link2, PenTool, Plus, Unlink2 } from "lucide-react";
import type {
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskTrackingDirection,
} from "@/types/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { generateUUID } from "@/lib/utils";
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

	const toggleKeyframe = (property: MediaMaskKeyframeProperty) => {
		if (!selectedMask || !selectedMaskId) return;
		const existing = (selectedMask.keyframes?.[property] ?? []).find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const nextMask = existing
			? removeMediaMaskKeyframe({
					mask: selectedMask,
					property,
					keyframeId: existing.id,
				})
			: upsertMediaMaskKeyframe({
					mask: selectedMask,
					property,
					keyframe: {
						id: `mask-keyframe-${generateUUID()}`,
						frame: currentFrame,
						value: selectedMask[property] ?? MASK_PROPERTY_FALLBACKS[property],
						easing: "linear",
					},
				});
		commitMasks(
			updateMediaMaskInStack({
				masks,
				maskId: selectedMaskId,
				updates: nextMask,
			})
		);
	};

	const isKeyframedHere = (property: MediaMaskKeyframeProperty) =>
		(selectedMask?.keyframes?.[property] ?? []).some(
			(keyframe) => keyframe.frame === currentFrame
		);

	const updatePercent = (property: MediaMaskKeyframeProperty, value: number) =>
		updateNumericProperties({ [property]: value / 100 });

	const updateSize = (property: "width" | "height", percent: number) => {
		if (!selectedMask) return;
		const value = percent / 100;
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
				direction,
				status: "processing",
				source: selectedMask.type === "person" ? "mediapipe" : "sam3",
			},
		});
		onTrack({ mask: selectedMask, direction });
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
			keyframed={isKeyframedHere(property)}
			onChange={onValueChange}
			onToggleKeyframe={() => toggleKeyframe(property)}
			onInteractionStart={onInteractionStart}
			onInteractionEnd={onInteractionEnd}
		/>
	);

	return (
		<div className="space-y-4" data-testid="media-mask-properties">
			<div className="space-y-2" data-testid="media-mask-stack">
				<div className="flex items-center justify-between gap-2">
					<PropertyItemLabel>蒙版形状</PropertyItemLabel>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7"
						onClick={() => addMask("rectangle")}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							addMask("rectangle");
						}}
						aria-label="新建蒙版"
						title="新建蒙版"
					>
						<Plus className="size-3.5" /> 新建
					</Button>
				</div>

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

				{masks.length > 0 ? (
					<MediaMaskLayerList
						masks={masks}
						selectedMaskId={selectedMaskId}
						onChange={commitMasks}
						onSelect={(maskId) => {
							selectMask(elementId, maskId);
							setEditing(true);
						}}
					/>
				) : null}
			</div>

			{selectedMask ? (
				<>
					{selectedMask.type === "text" ? (
						<div className="space-y-1.5 border-t border-border pt-4">
							<PropertyItemLabel>蒙版文字</PropertyItemLabel>
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

					<MediaMaskTrackingControls
						mask={selectedMask}
						onTrack={onTrack ? startTracking : undefined}
					/>

					<MediaMaskStrokeProperties
						stroke={selectedMask.stroke}
						onChange={(stroke, history) => patchSelected({ stroke }, history)}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>

					<div className="space-y-4 border-t border-border pt-4">
						{numberControl(
							"centerX",
							"X 位置",
							selectedMask.centerX * 100,
							-100,
							200,
							(value) => updatePercent("centerX", value),
							0.1,
							"%"
						)}
						{numberControl(
							"centerY",
							"Y 位置",
							selectedMask.centerY * 100,
							-100,
							200,
							(value) => updatePercent("centerY", value),
							0.1,
							"%"
						)}

						<div className="flex items-center justify-between gap-2">
							<PropertyItemLabel>锁定比例</PropertyItemLabel>
							<div className="flex items-center gap-2">
								{selectedMask.maintainAspectRatio ? (
									<Link2 className="size-3.5 text-primary" />
								) : (
									<Unlink2 className="size-3.5 text-muted-foreground" />
								)}
								<Switch
									checked={selectedMask.maintainAspectRatio ?? false}
									onCheckedChange={(maintainAspectRatio) =>
										patchSelected({ maintainAspectRatio })
									}
								/>
							</div>
						</div>

						{selectedMask.type === "linear"
							? null
							: numberControl(
									"width",
									"宽度",
									selectedMask.width * 100,
									0.1,
									300,
									(value) => updateSize("width", value),
									0.1,
									"%"
								)}
						{selectedMask.type === "linear" || selectedMask.type === "mirror"
							? null
							: numberControl(
									"height",
									"高度",
									selectedMask.height * 100,
									0.1,
									300,
									(value) => updateSize("height", value),
									0.1,
									"%"
								)}
						{numberControl(
							"rotation",
							"旋转",
							selectedMask.rotation,
							-180,
							180,
							(rotation) => updateNumericProperties({ rotation }),
							0.1,
							"°"
						)}
						{numberControl(
							"feather",
							"羽化",
							selectedMask.feather * 100,
							0,
							100,
							(value) => updatePercent("feather", value),
							0.1,
							"%"
						)}
						{selectedMask.type === "rectangle" || selectedMask.type === "text"
							? numberControl(
									"roundness",
									"圆角",
									(selectedMask.roundness ?? 0) * 100,
									0,
									100,
									(value) => updatePercent("roundness", value),
									1,
									"%"
								)
							: null}
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
							<PropertyItemLabel>反转</PropertyItemLabel>
							<Switch
								checked={selectedMask.invert}
								onCheckedChange={(invert) => patchSelected({ invert })}
							/>
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}
