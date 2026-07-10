import { useEffect } from "react";
import {
	ChevronDown,
	ChevronUp,
	Circle,
	Columns2,
	Copy,
	Diamond,
	Eye,
	EyeOff,
	Heart,
	Link2,
	PanelTop,
	PenTool,
	Plus,
	RectangleHorizontal,
	ScanSearch,
	Square,
	Star,
	Trash2,
	Type,
	Unlink2,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import type {
	MediaMask,
	MediaMaskBlendMode,
	MediaMaskKeyframeProperty,
	MediaMaskType,
} from "@/types/timeline";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, generateUUID } from "@/lib/utils";
import {
	addMediaMask,
	createMediaMask,
	duplicateMediaMask,
	moveMediaMask,
	normalizeMediaMaskStack,
	removeMediaMask,
	removeMediaMaskKeyframe,
	updateMediaMaskInStack,
	upsertMediaMaskKeyframe,
} from "@/lib/video/media-mask-stack";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { PropertyItemLabel } from "./property-item";

type AddableMaskType = Exclude<MediaMaskType, "none">;

const MASK_SHAPES: Array<{
	type: AddableMaskType;
	label: string;
	icon: LucideIcon;
}> = [
	{ type: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
	{ type: "ellipse", label: "Ellipse", icon: Circle },
	{ type: "linear", label: "Linear", icon: PanelTop },
	{ type: "mirror", label: "Mirror", icon: Columns2 },
	{ type: "pen", label: "Pen", icon: PenTool },
	{ type: "text", label: "Text", icon: Type },
	{ type: "star", label: "Star", icon: Star },
	{ type: "heart", label: "Heart", icon: Heart },
	{ type: "person", label: "Person", icon: UserRound },
	{ type: "object", label: "Object", icon: ScanSearch },
];

const MASK_PROPERTY_FALLBACKS: Record<MediaMaskKeyframeProperty, number> = {
	centerX: 0.5,
	centerY: 0.5,
	width: 0.8,
	height: 0.8,
	rotation: 0,
	feather: 0,
	roundness: 0,
	expansion: 0,
	opacity: 1,
};

function maskIcon(type: MediaMaskType): LucideIcon {
	return MASK_SHAPES.find((shape) => shape.type === type)?.icon ?? Square;
}

function createMaskForShape(type: AddableMaskType, index: number): MediaMask {
	const mask = createMediaMask({
		id: `mask-${generateUUID()}`,
		type,
		index,
	});
	if (type === "pen") {
		return {
			...mask,
			points: [
				{ x: 0.2, y: 0.2 },
				{ x: 0.8, y: 0.2 },
				{ x: 0.8, y: 0.8 },
				{ x: 0.2, y: 0.8 },
			],
		};
	}
	if (type === "text") {
		return { ...mask, text: "Text", fontFamily: "sans-serif" };
	}
	return mask;
}

function MaskIconButton({
	label,
	onClick,
	disabled,
	active,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	children: React.ReactNode;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={active ? "secondary" : "text"}
						size="icon"
						className="size-7 rounded-sm"
						onClick={onClick}
						disabled={disabled}
						aria-label={label}
					>
						{children}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function MaskNumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	suffix,
	keyframed,
	onChange,
	onToggleKeyframe,
	onInteractionStart,
	onInteractionEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	keyframed: boolean;
	onChange: (value: number) => void;
	onToggleKeyframe: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<PropertyItemLabel className="min-w-0 flex-1">
					{label}
				</PropertyItemLabel>
				<MaskIconButton
					label={
						keyframed ? `Remove ${label} keyframe` : `Add ${label} keyframe`
					}
					onClick={onToggleKeyframe}
					active={keyframed}
				>
					<Diamond
						className={cn("size-3", keyframed && "fill-primary text-primary")}
					/>
				</MaskIconButton>
				<div className="flex items-center gap-1">
					<Input
						type="number"
						aria-label={`${label} value`}
						value={Number(value.toFixed(step < 1 ? 2 : 0))}
						min={min}
						max={max}
						step={step}
						onFocus={onInteractionStart}
						onBlur={onInteractionEnd}
						onChange={(event) => {
							const next = Number(event.target.value);
							if (Number.isFinite(next)) onChange(next);
						}}
						className="h-7 w-20 text-right text-xs"
					/>
					{suffix ? (
						<span className="w-4 text-[10px] text-muted-foreground">
							{suffix}
						</span>
					) : null}
				</div>
			</div>
			<div
				onPointerDown={onInteractionStart}
				onPointerUp={onInteractionEnd}
				onPointerCancel={onInteractionEnd}
			>
				<Slider
					aria-label={label}
					value={[Math.min(max, Math.max(min, value))]}
					min={min}
					max={max}
					step={step}
					onValueChange={([next]) => onChange(next)}
				/>
			</div>
		</div>
	);
}

export function MediaMaskProperties({
	elementId,
	masks,
	currentFrame,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	elementId: string;
	masks: MediaMask[];
	currentFrame: number;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
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
	const selectedIndex = masks.findIndex((mask) => mask.id === selectedMaskId);

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
		const mask = createMaskForShape(type, masks.length);
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
					<PropertyItemLabel>Mask stack</PropertyItemLabel>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button type="button" variant="outline" size="sm" className="h-7">
								<Plus className="size-3.5" /> Add
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							{MASK_SHAPES.map((shape) => {
								const Icon = shape.icon;
								return (
									<DropdownMenuItem
										key={shape.type}
										onSelect={() => addMask(shape.type)}
									>
										<Icon className="mr-2 size-4" /> {shape.label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{masks.length === 0 ? (
					<button
						type="button"
						className="flex h-16 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
						onClick={() => addMask("rectangle")}
					>
						<Plus className="size-4" /> Add a mask
					</button>
				) : (
					<div className="space-y-1.5">
						{masks.map((mask, index) => {
							const Icon = maskIcon(mask.type);
							const selected = mask.id === selectedMaskId;
							return (
								<div
									key={mask.id}
									className={cn(
										"rounded-md border p-1.5",
										selected
											? "border-primary/70 bg-primary/5"
											: "border-border"
									)}
								>
									<div className="flex items-center gap-1">
										<button
											type="button"
											className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
											onClick={() => {
												selectMask(elementId, mask.id!);
												setEditing(true);
											}}
											aria-label={`Select ${mask.name}`}
										>
											<Icon className="size-4" />
										</button>
										<Input
											aria-label="Mask name"
											value={mask.name ?? `Mask ${index + 1}`}
											onFocus={() => selectMask(elementId, mask.id!)}
											onChange={(event) =>
												commitMasks(
													updateMediaMaskInStack({
														masks,
														maskId: mask.id!,
														updates: { name: event.target.value },
													}),
													false
												)
											}
											className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs shadow-none"
										/>
										<MaskIconButton
											label={mask.enabled === false ? "Show mask" : "Hide mask"}
											onClick={() =>
												commitMasks(
													updateMediaMaskInStack({
														masks,
														maskId: mask.id!,
														updates: { enabled: mask.enabled === false },
													})
												)
											}
										>
											{mask.enabled === false ? (
												<EyeOff className="size-3.5" />
											) : (
												<Eye className="size-3.5" />
											)}
										</MaskIconButton>
										<MaskIconButton
											label="Delete mask"
											onClick={() => {
												const next = removeMediaMask(masks, mask.id!);
												commitMasks(next);
												if (selected) {
													const fallback =
														next[Math.min(index, next.length - 1)];
													if (fallback?.id) selectMask(elementId, fallback.id);
												}
											}}
										>
											<Trash2 className="size-3.5" />
										</MaskIconButton>
									</div>
									{selected ? (
										<div className="mt-1.5 flex items-center gap-1 border-t border-border/70 pt-1.5">
											<Select
												value={index === 0 ? "add" : (mask.blendMode ?? "add")}
												onValueChange={(blendMode) =>
													patchSelected({
														blendMode: blendMode as MediaMaskBlendMode,
													})
												}
												disabled={index === 0}
											>
												<SelectTrigger
													className="h-7 min-w-0 flex-1 text-[11px]"
													aria-label="Mask blend mode"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="add">Add</SelectItem>
													<SelectItem value="subtract">Subtract</SelectItem>
													<SelectItem value="intersect">Intersect</SelectItem>
												</SelectContent>
											</Select>
											<MaskIconButton
												label="Move mask up"
												disabled={index === 0}
												onClick={() =>
													commitMasks(
														moveMediaMask({
															masks,
															maskId: mask.id!,
															toIndex: index - 1,
														})
													)
												}
											>
												<ChevronUp className="size-3.5" />
											</MaskIconButton>
											<MaskIconButton
												label="Move mask down"
												disabled={index === masks.length - 1}
												onClick={() =>
													commitMasks(
														moveMediaMask({
															masks,
															maskId: mask.id!,
															toIndex: index + 1,
														})
													)
												}
											>
												<ChevronDown className="size-3.5" />
											</MaskIconButton>
											<MaskIconButton
												label="Duplicate mask"
												onClick={() => {
													const newId = `mask-${generateUUID()}`;
													commitMasks(
														duplicateMediaMask({
															masks,
															maskId: mask.id!,
															newId,
														})
													);
													selectMask(elementId, newId);
												}}
											>
												<Copy className="size-3.5" />
											</MaskIconButton>
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{selectedMask ? (
				<>
					<div className="border-t border-border pt-4">
						<PropertyItemLabel>Shape</PropertyItemLabel>
						<div className="mt-2 grid grid-cols-5 gap-1.5">
							{MASK_SHAPES.map((shape) => {
								const Icon = shape.icon;
								return (
									<TooltipProvider key={shape.type}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant={
														selectedMask.type === shape.type
															? "primary"
															: "outline"
													}
													size="icon"
													className="aspect-square h-auto w-full"
													onClick={() => patchSelected({ type: shape.type })}
													aria-label={shape.label}
												>
													<Icon className="size-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>{shape.label}</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								);
							})}
						</div>
					</div>

					{selectedMask.type === "text" ? (
						<div className="space-y-1.5">
							<PropertyItemLabel>Mask text</PropertyItemLabel>
							<Input
								value={selectedMask.text ?? "Text"}
								onChange={(event) =>
									patchSelected({ text: event.target.value }, false)
								}
								aria-label="Mask text"
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
							<PenTool className="size-3.5" /> Edit points on canvas
						</Button>
					) : null}

					<div className="space-y-4 border-t border-border pt-4">
						{numberControl(
							"centerX",
							"X position",
							selectedMask.centerX * 100,
							-100,
							200,
							(value) => updatePercent("centerX", value),
							0.1,
							"%"
						)}
						{numberControl(
							"centerY",
							"Y position",
							selectedMask.centerY * 100,
							-100,
							200,
							(value) => updatePercent("centerY", value),
							0.1,
							"%"
						)}

						<div className="flex items-center justify-between gap-2">
							<PropertyItemLabel>Lock proportions</PropertyItemLabel>
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
									"Width",
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
									"Height",
									selectedMask.height * 100,
									0.1,
									300,
									(value) => updateSize("height", value),
									0.1,
									"%"
								)}
						{numberControl(
							"rotation",
							"Rotation",
							selectedMask.rotation,
							-180,
							180,
							(rotation) => updateNumericProperties({ rotation }),
							0.1,
							"°"
						)}
						{numberControl(
							"feather",
							"Feather",
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
									"Roundness",
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
							"Expansion",
							(selectedMask.expansion ?? 0) * 100,
							-100,
							100,
							(value) => updatePercent("expansion", value),
							0.1,
							"%"
						)}
						{numberControl(
							"opacity",
							"Density",
							(selectedMask.opacity ?? 1) * 100,
							0,
							100,
							(value) => updatePercent("opacity", value),
							1,
							"%"
						)}

						<div className="flex items-center justify-between gap-2">
							<PropertyItemLabel>Invert</PropertyItemLabel>
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
