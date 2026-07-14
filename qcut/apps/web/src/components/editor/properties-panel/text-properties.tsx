import { useEffect, useMemo, useState } from "react";
import {
	AudioLines,
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Grid3X3,
	Italic,
	Loader2,
	MousePointer2,
	RotateCcw,
	Save,
	Sparkles,
	Strikethrough,
	Trash2,
	Unlink,
	Underline,
} from "lucide-react";
import { platform } from "@qcut/platform-core";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { FontPicker } from "@/components/ui/font-picker";
import type { FontFamily } from "@/constants/font-constants";
import type {
	TextElement,
	TextKeyframeProperty,
	TextPropertyKeyframe,
} from "@/types/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	colorWithOpacity,
	resolveTextStyle,
	TEXT_BLEND_MODES,
} from "@/lib/text/text-style";
import {
	BUILT_IN_TEXT_PRESETS,
	captureTextPreset,
	loadCustomTextPresets,
	storeCustomTextPresets,
	type TextStylePreset,
} from "@/lib/text/text-presets";
import {
	resolveTextAnimation,
	TEXT_ANIMATION_TYPES,
} from "@/lib/text/text-animation";
import {
	TEXT_KEYFRAME_PROPERTIES,
	upsertTextKeyframe,
} from "@/lib/text/text-keyframes";
import type { EasingType, Keyframe } from "@/lib/remotion/keyframe-converter";
import {
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
	PropertyGroup,
} from "./property-item";
import { KeyframeEditor } from "./keyframe-editor";
import { buildCursorTextTrackingKeyframes } from "@/lib/text/cursor-text-tracking";
import { useSpeechAvatarGeneration } from "@/hooks/use-speech-avatar-generation";

type TextUpdates = Parameters<
	ReturnType<typeof useTimelineStore.getState>["updateTextElement"]
>[2];

export interface TextGroupSelection {
	trackId: string;
	element: TextElement;
}

interface NumberControlProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	suffix?: string;
}

function NumberControl({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
	suffix,
}: NumberControlProps) {
	const [inputValue, setInputValue] = useState(String(value));

	useEffect(() => setInputValue(String(value)), [value]);

	const commit = (raw: string) => {
		const parsed = Number(raw);
		const next = Number.isFinite(parsed)
			? Math.min(max, Math.max(min, parsed))
			: value;
		setInputValue(String(next));
		onChange(next);
	};

	return (
		<PropertyItem direction="column">
			<PropertyItemLabel>{label}</PropertyItemLabel>
			<PropertyItemValue>
				<div className="flex items-center gap-2">
					<Slider
						aria-label={label}
						value={[value]}
						min={min}
						max={max}
						step={step}
						onValueChange={([next]) => onChange(next)}
						className="min-w-0 flex-1"
					/>
					<div className="flex w-20 items-center gap-1">
						<Input
							type="number"
							aria-label={`${label} value`}
							value={inputValue}
							min={min}
							max={max}
							step={step}
							onChange={(event) => {
								const raw = event.target.value;
								setInputValue(raw);
								// Mid-edit tokens like "-" parse to NaN; committing them
								// would snap the field back to the previous value before
								// the user can finish typing a negative number.
								const parsed = Number(raw);
								if (raw.trim() && Number.isFinite(parsed)) {
									onChange(Math.min(max, Math.max(min, parsed)));
								}
							}}
							onBlur={() => commit(inputValue)}
							className="h-7 w-14 rounded-sm px-1 text-center !text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
						/>
						{suffix ? (
							<span className="text-[10px] text-muted-foreground">
								{suffix}
							</span>
						) : null}
					</div>
				</div>
			</PropertyItemValue>
		</PropertyItem>
	);
}

function ColorControl({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<PropertyItem direction="row">
			<PropertyItemLabel>{label}</PropertyItemLabel>
			<PropertyItemValue className="flex justify-end">
				<Input
					type="color"
					aria-label={label}
					value={value === "transparent" ? "#000000" : value}
					onChange={(event) => onChange(event.target.value)}
					className="h-8 w-16 cursor-pointer rounded-sm p-1"
				/>
			</PropertyItemValue>
		</PropertyItem>
	);
}

function IconToggle({
	label,
	pressed,
	onClick,
	children,
}: {
	label: string;
	pressed: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Button
			type="button"
			aria-label={label}
			aria-pressed={pressed}
			title={label}
			variant={pressed ? "default" : "outline"}
			size="icon"
			className="size-8"
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

function PresetButton({
	preset,
	onApply,
	onDelete,
}: {
	preset: TextStylePreset;
	onApply: () => void;
	onDelete?: () => void;
}) {
	const backgroundOpacity = preset.updates.backgroundOpacity ?? 0;
	const strokeWidth = preset.updates.strokeWidth ?? 0;
	const glowOpacity = preset.updates.glowOpacity ?? 0;
	const shadowOpacity = preset.updates.shadowOpacity ?? 0;
	const shadows: string[] = [];
	if (shadowOpacity > 0) {
		shadows.push(
			`${preset.updates.shadowOffsetX ?? 3}px ${preset.updates.shadowOffsetY ?? 3}px ${preset.updates.shadowBlur ?? 6}px ${colorWithOpacity(preset.updates.shadowColor ?? "#000000", shadowOpacity)}`
		);
	}
	if (glowOpacity > 0) {
		shadows.push(
			`0 0 ${preset.updates.glowBlur ?? 12}px ${colorWithOpacity(preset.updates.glowColor ?? "#ffffff", glowOpacity)}`
		);
	}

	return (
		<div className="relative">
			<button
				type="button"
				aria-label={`Apply ${preset.name} text preset`}
				title={preset.name}
				onClick={onApply}
				className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm border border-border bg-muted transition-colors hover:border-primary"
				style={{
					backgroundColor:
						backgroundOpacity > 0
							? colorWithOpacity(
									preset.updates.backgroundColor ?? "#000000",
									backgroundOpacity
								)
							: undefined,
				}}
			>
				<span
					className="text-xl"
					style={{
						color: preset.updates.color ?? "#ffffff",
						fontFamily: preset.updates.fontFamily,
						fontWeight: preset.updates.fontWeight,
						fontStyle: preset.updates.fontStyle,
						WebkitTextStroke:
							strokeWidth > 0
								? `${Math.min(2, strokeWidth)}px ${colorWithOpacity(preset.updates.strokeColor ?? "#000000", preset.updates.strokeOpacity ?? 1)}`
								: undefined,
						textShadow: shadows.length > 0 ? shadows.join(", ") : undefined,
					}}
				>
					T
				</span>
			</button>
			{onDelete ? (
				<Button
					type="button"
					variant="destructive"
					size="icon"
					className="absolute -right-1 -top-1 size-5"
					aria-label={`Delete ${preset.name} preset`}
					title="Delete preset"
					onClick={onDelete}
				>
					<Trash2 className="size-3" />
				</Button>
			) : null}
		</div>
	);
}

function buildGroupContentDraft({
	selections,
}: {
	selections: readonly TextGroupSelection[];
}): string {
	return selections.map(({ element }) => element.content).join("\n");
}

export function TextGroupProperties({
	selections,
}: {
	selections: readonly TextGroupSelection[];
}) {
	const updateTextGroupContents = useTimelineStore(
		(state) => state.updateTextGroupContents
	);
	const orderedSelections = useMemo(
		() => selections.filter(({ element }) => element.type === "text"),
		[selections]
	);
	const groupId = orderedSelections[0]?.element.groupId;
	const currentDraft = useMemo(
		() => buildGroupContentDraft({ selections: orderedSelections }),
		[orderedSelections]
	);
	const [draft, setDraft] = useState(currentDraft);

	useEffect(() => {
		setDraft(currentDraft);
	}, [currentDraft]);

	const applyGroupContents = () => {
		if (!groupId) return;
		const updatedCount = updateTextGroupContents({
			groupId,
			contents: draft.split(/\r?\n/),
		});
		if (updatedCount > 0) {
			toast.success(`Updated ${updatedCount} text layers`);
		}
	};

	return (
		<div className="space-y-5" data-testid="text-group-properties">
			<PropertyGroup title="Template text" defaultExpanded>
				<div className="space-y-3">
					<Textarea
						aria-label="Template group text content"
						value={draft}
						placeholder="每行替换一个文字层"
						className="min-h-32 resize-y bg-background/50"
						onChange={(event) => setDraft(event.target.value)}
					/>
					<div className="grid gap-1 rounded-sm border border-border/70 bg-background/40 p-2 text-[10px] text-muted-foreground">
						{orderedSelections.map(({ element }, index) => (
							<div key={element.id} className="flex min-w-0 gap-2">
								<span className="shrink-0 tabular-nums">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="truncate">{element.name}</span>
							</div>
						))}
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							className="flex-1"
							disabled={!groupId || draft === currentDraft}
							onClick={applyGroupContents}
						>
							Apply text
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={draft === currentDraft}
							onClick={() => setDraft(currentDraft)}
						>
							Reset
						</Button>
					</div>
				</div>
			</PropertyGroup>
		</div>
	);
}

export function TextProperties({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const updateTextElement = useTimelineStore(
		(state) => state.updateTextElement
	);
	const tracks = useTimelineStore((state) => state.tracks);
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const cursorTelemetry = useScreenRecordingEnhancementStore(
		(state) => state.cursorTelemetry
	);
	const style = resolveTextStyle(element);
	const animation = resolveTextAnimation(element);
	const [customPresets, setCustomPresets] = useState(loadCustomTextPresets);
	const [keyframeProperty, setKeyframeProperty] =
		useState<TextKeyframeProperty>("x");
	const [isRewriting, setIsRewriting] = useState(false);
	const {
		avatarImageId,
		avatarImages,
		canGenerateAvatar,
		canGenerateSpeech,
		createAvatar,
		createSpeech,
		generationKind,
		isAvailable: isSpeechAvailable,
		isGenerating: isGeneratingAI,
		progress: speechProgress,
		setAvatarImageId,
		setSpeechModel,
		speechModel,
	} = useSpeechAvatarGeneration({
		captionElementId: element.id,
		text: element.content,
		startTime: element.startTime,
		duration: Math.max(
			0.1,
			element.duration - element.trimStart - element.trimEnd
		),
	});
	const trackingTargets = tracks
		.flatMap((track) => track.elements)
		.filter((candidate) => candidate.type === "media");

	const update = (updates: TextUpdates) =>
		updateTextElement(trackId, element.id, updates);

	const quickPosition = (column: 0 | 1 | 2, row: 0 | 1 | 2) => {
		const horizontal = [
			-canvasSize.width / 2 + style.width / 2,
			0,
			canvasSize.width / 2 - style.width / 2,
		] as const;
		const vertical = [
			-canvasSize.height / 2 + style.height / 2,
			0,
			canvasSize.height / 2 - style.height / 2,
		] as const;
		update({ x: Math.round(horizontal[column]), y: Math.round(vertical[row]) });
	};

	const resetVisualStyle = () =>
		update({
			letterSpacing: 0,
			lineHeight: 1.2,
			strokeWidth: 0,
			strokeOpacity: 1,
			backgroundOpacity: 0,
			backgroundRadius: 4,
			backgroundPadding: 12,
			shadowOpacity: 0,
			shadowOffsetX: 4,
			shadowOffsetY: 4,
			shadowBlur: 8,
			glowOpacity: 0,
			glowBlur: 12,
			curve: 0,
			blendMode: "normal",
		});

	const saveCurrentPreset = () => {
		const nextPreset: TextStylePreset = {
			id:
				typeof crypto !== "undefined" && "randomUUID" in crypto
					? crypto.randomUUID()
					: `custom-${Date.now()}`,
			name: `Custom ${customPresets.length + 1}`,
			updates: captureTextPreset(element),
			custom: true,
		};
		const next = [...customPresets, nextPreset];
		setCustomPresets(next);
		storeCustomTextPresets({ presets: next });
	};

	const deletePreset = (presetId: string) => {
		const next = customPresets.filter((preset) => preset.id !== presetId);
		setCustomPresets(next);
		storeCustomTextPresets({ presets: next });
	};

	const propertyKeyframes = element.keyframes?.[keyframeProperty] ?? [];
	const durationInFrames = Math.max(
		1,
		Math.round((element.duration - element.trimStart - element.trimEnd) * fps)
	);
	const currentFrame = Math.min(
		durationInFrames,
		Math.max(0, Math.round((currentTime - element.startTime) * fps))
	);

	const setPropertyKeyframes = (keyframes: TextPropertyKeyframe[]) => {
		update({
			keyframes: {
				...element.keyframes,
				[keyframeProperty]: keyframes,
			},
		});
	};

	const addKeyframe = (frame: number, value: unknown) => {
		const existing = propertyKeyframes.find((item) => item.frame === frame);
		const keyframe: TextPropertyKeyframe = {
			id:
				existing?.id ??
				(typeof crypto !== "undefined" && "randomUUID" in crypto
					? crypto.randomUUID()
					: `keyframe-${Date.now()}`),
			frame,
			value: Number(value),
			easing: existing?.easing ?? "linear",
		};
		setPropertyKeyframes(
			upsertTextKeyframe({ keyframes: propertyKeyframes, keyframe })
		);
	};

	const updateKeyframe = (
		id: string,
		frame: number,
		value: unknown,
		easing: EasingType = "linear"
	) => {
		setPropertyKeyframes(
			upsertTextKeyframe({
				keyframes: propertyKeyframes,
				keyframe: { id, frame, value: Number(value), easing },
			})
		);
	};

	const deleteKeyframe = (id: string) => {
		setPropertyKeyframes(propertyKeyframes.filter((item) => item.id !== id));
	};

	const rewriteText = async (mode: "shorter" | "punchier" | "professional") => {
		if (!element.content.trim() || isRewriting) return;
		setIsRewriting(true);

		try {
			const result = await platform().moyin.callLLM({
				systemPrompt:
					"You edit concise on-screen text for videos. Preserve the source language and meaning. Return only the rewritten text without quotation marks or commentary.",
				userPrompt: `Rewrite this text to be ${mode}:\n\n${element.content}`,
				temperature: 0.5,
				maxTokens: 256,
			});
			if (!result.success || !result.text?.trim()) {
				throw new Error(result.error || "Text rewrite returned no content");
			}
			update({ content: result.text.trim() });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Text rewrite failed"
			);
		} finally {
			setIsRewriting(false);
		}
	};

	const applyCursorTracking = () => {
		if (!cursorTelemetry) return;
		const tracking = buildCursorTextTrackingKeyframes({
			telemetry: cursorTelemetry,
			canvasSize,
			elementStartTime: element.startTime,
			elementDuration: element.duration - element.trimStart - element.trimEnd,
			fps,
		});
		if (tracking.x.length === 0) {
			toast.error("No cursor movement overlaps this text clip");
			return;
		}

		const generatedFrames = new Set(
			tracking.x.map((keyframe) => keyframe.frame)
		);
		const keepManual = (keyframes: TextPropertyKeyframe[] = []) =>
			keyframes.filter(
				(keyframe) =>
					!keyframe.id.startsWith("cursor-") &&
					!generatedFrames.has(keyframe.frame)
			);
		update({
			keyframes: {
				...element.keyframes,
				x: [...keepManual(element.keyframes?.x), ...tracking.x].sort(
					(a, b) => a.frame - b.frame
				),
				y: [...keepManual(element.keyframes?.y), ...tracking.y].sort(
					(a, b) => a.frame - b.frame
				),
			},
		});
		toast.success(`Added ${tracking.x.length} cursor tracking keyframes`);
	};

	const clearCursorTracking = () => {
		update({
			keyframes: {
				...element.keyframes,
				x: element.keyframes?.x?.filter(
					(keyframe) => !keyframe.id.startsWith("cursor-")
				),
				y: element.keyframes?.y?.filter(
					(keyframe) => !keyframe.id.startsWith("cursor-")
				),
			},
		});
	};

	return (
		<div className="space-y-5 p-5" data-testid="text-properties">
			<Textarea
				aria-label="Text content"
				placeholder="Enter text"
				value={element.content}
				className="min-h-24 resize-y bg-background/50"
				onChange={(event) => update({ content: event.target.value })}
			/>

			<PropertyGroup title="Style presets" defaultExpanded>
				<div className="space-y-3">
					<div className="grid grid-cols-5 gap-2">
						{[...BUILT_IN_TEXT_PRESETS, ...customPresets].map((preset) => (
							<PresetButton
								key={preset.id}
								preset={preset}
								onApply={() => update(preset.updates)}
								onDelete={
									preset.custom ? () => deletePreset(preset.id) : undefined
								}
							/>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={saveCurrentPreset}
					>
						<Save className="mr-2 size-4" /> Save current style
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Animation" defaultExpanded={false}>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-2">
						{TEXT_ANIMATION_TYPES.map((animationType) => (
							<Button
								key={animationType}
								type="button"
								aria-pressed={animation.type === animationType}
								variant={
									animation.type === animationType ? "default" : "outline"
								}
								size="sm"
								className="h-8 capitalize"
								onClick={() => update({ animationType })}
							>
								{animationType.replace("-", " ")}
							</Button>
						))}
					</div>
					{animation.type !== "none" ? (
						<>
							<NumberControl
								label="Duration"
								value={animation.duration}
								min={0.1}
								max={3}
								step={0.1}
								onChange={(animationDuration) => update({ animationDuration })}
								suffix="s"
							/>
							<NumberControl
								label="Delay"
								value={animation.delay}
								min={0}
								max={5}
								step={0.1}
								onChange={(animationDelay) => update({ animationDelay })}
								suffix="s"
							/>
						</>
					) : null}
				</div>
			</PropertyGroup>

			<PropertyGroup title="AI writing and speech" defaultExpanded={false}>
				<div className="space-y-4">
					<PropertyItem direction="column">
						<PropertyItemLabel>Rewrite</PropertyItemLabel>
						<PropertyItemValue>
							<div className="grid grid-cols-3 gap-2">
								{(["shorter", "punchier", "professional"] as const).map(
									(mode) => (
										<Button
											key={mode}
											type="button"
											variant="outline"
											size="sm"
											className="h-8 px-2 text-[10px] capitalize"
											disabled={isRewriting || !element.content.trim()}
											onClick={() => rewriteText(mode)}
										>
											{isRewriting ? (
												<Loader2 className="size-3 animate-spin" />
											) : (
												<Sparkles className="mr-1 size-3" />
											)}
											{mode}
										</Button>
									)
								)}
							</div>
						</PropertyItemValue>
					</PropertyItem>

					<PropertyItem direction="row">
						<PropertyItemLabel>Voice model</PropertyItemLabel>
						<PropertyItemValue>
							<Select value={speechModel} onValueChange={setSpeechModel}>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="chatterbox_tts">Chatterbox</SelectItem>
									<SelectItem value="chatterbox_tts_turbo">
										Chatterbox Turbo
									</SelectItem>
									<SelectItem value="elevenlabs_v3">ElevenLabs v3</SelectItem>
									<SelectItem value="qwen3_tts">Qwen3 TTS</SelectItem>
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					<Button
						type="button"
						className="w-full"
						disabled={!canGenerateSpeech}
						title={
							isSpeechAvailable
								? "Generate speech"
								: "Configure a FAL API key to generate speech"
						}
						onClick={createSpeech}
					>
						{isGeneratingAI && generationKind === "speech" ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<AudioLines className="mr-2 size-4" />
						)}
						{isGeneratingAI && generationKind === "speech"
							? (speechProgress?.message ?? "Generating speech")
							: "Generate speech"}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Digital human" defaultExpanded={false}>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>Portrait</PropertyItemLabel>
						<PropertyItemValue>
							<Select value={avatarImageId} onValueChange={setAvatarImageId}>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue placeholder="Choose an image" />
								</SelectTrigger>
								<SelectContent>
									{avatarImages.map((image) => (
										<SelectItem key={image.id} value={image.id}>
											{image.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					<Button
						type="button"
						className="w-full"
						disabled={!canGenerateAvatar}
						title={
							avatarImages.length > 0
								? "Generate a talking portrait"
								: "Import a portrait image first"
						}
						onClick={createAvatar}
					>
						{isGeneratingAI && generationKind === "avatar" ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Sparkles className="mr-2 size-4" />
						)}
						{isGeneratingAI && generationKind === "avatar"
							? (speechProgress?.message ?? "Generating digital human")
							: "Generate digital human"}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Tracking" defaultExpanded={false}>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>Follow clip</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={element.trackingTargetId ?? "none"}
								onValueChange={(value) =>
									update({
										trackingTargetId: value === "none" ? undefined : value,
									})
								}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									{trackingTargets.map((target) => (
										<SelectItem key={target.id} value={target.id}>
											{target.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					{element.trackingTargetId ? (
						<>
							<NumberControl
								label="Horizontal offset"
								value={element.trackingOffsetX ?? 0}
								min={-canvasSize.width}
								max={canvasSize.width}
								onChange={(trackingOffsetX) => update({ trackingOffsetX })}
								suffix="px"
							/>
							<NumberControl
								label="Vertical offset"
								value={element.trackingOffsetY ?? 0}
								min={-canvasSize.height}
								max={canvasSize.height}
								onChange={(trackingOffsetY) => update({ trackingOffsetY })}
								suffix="px"
							/>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>Follow rotation</PropertyItemLabel>
								<Switch
									checked={element.trackingRotation ?? false}
									onCheckedChange={(trackingRotation) =>
										update({ trackingRotation })
									}
								/>
							</div>
						</>
					) : null}
					<div className="grid grid-cols-2 gap-2">
						<Button
							type="button"
							disabled={!cursorTelemetry}
							title={
								cursorTelemetry
									? "Follow the recorded cursor"
									: "Cursor telemetry is available for screen recordings"
							}
							onClick={applyCursorTracking}
						>
							<MousePointer2 className="mr-2 size-4" /> Track cursor
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={
								![
									...(element.keyframes?.x ?? []),
									...(element.keyframes?.y ?? []),
								].some((keyframe) => keyframe.id.startsWith("cursor-"))
							}
							onClick={clearCursorTracking}
						>
							<Unlink className="mr-2 size-4" /> Clear
						</Button>
					</div>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Keyframes" defaultExpanded={false}>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>Property</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={keyframeProperty}
								onValueChange={(value) =>
									setKeyframeProperty(value as TextKeyframeProperty)
								}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TEXT_KEYFRAME_PROPERTIES.map((property) => (
										<SelectItem key={property.value} value={property.value}>
											{property.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					<KeyframeEditor
						propName={keyframeProperty}
						propLabel={
							TEXT_KEYFRAME_PROPERTIES.find(
								(property) => property.value === keyframeProperty
							)?.label ?? keyframeProperty
						}
						propType="number"
						keyframes={propertyKeyframes as Keyframe[]}
						durationInFrames={durationInFrames}
						fps={fps}
						currentFrame={currentFrame}
						currentValueWhenEmpty={element[keyframeProperty]}
						onKeyframeAdd={addKeyframe}
						onKeyframeUpdate={updateKeyframe}
						onKeyframeDelete={deleteKeyframe}
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Typography" defaultExpanded>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>Font</PropertyItemLabel>
						<PropertyItemValue>
							<FontPicker
								value={element.fontFamily as FontFamily}
								onValueChange={(fontFamily) => update({ fontFamily })}
							/>
						</PropertyItemValue>
					</PropertyItem>

					<NumberControl
						label="Font size"
						value={element.fontSize}
						min={8}
						max={300}
						onChange={(fontSize) => update({ fontSize })}
						suffix="px"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel>Style</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex flex-wrap gap-2">
								<IconToggle
									label="Bold"
									pressed={element.fontWeight === "bold"}
									onClick={() =>
										update({
											fontWeight:
												element.fontWeight === "bold" ? "normal" : "bold",
										})
									}
								>
									<Bold className="size-4" />
								</IconToggle>
								<IconToggle
									label="Italic"
									pressed={element.fontStyle === "italic"}
									onClick={() =>
										update({
											fontStyle:
												element.fontStyle === "italic" ? "normal" : "italic",
										})
									}
								>
									<Italic className="size-4" />
								</IconToggle>
								<IconToggle
									label="Underline"
									pressed={element.textDecoration === "underline"}
									onClick={() =>
										update({
											textDecoration:
												element.textDecoration === "underline"
													? "none"
													: "underline",
										})
									}
								>
									<Underline className="size-4" />
								</IconToggle>
								<IconToggle
									label="Strikethrough"
									pressed={element.textDecoration === "line-through"}
									onClick={() =>
										update({
											textDecoration:
												element.textDecoration === "line-through"
													? "none"
													: "line-through",
										})
									}
								>
									<Strikethrough className="size-4" />
								</IconToggle>
							</div>
						</PropertyItemValue>
					</PropertyItem>

					<NumberControl
						label="Letter spacing"
						value={style.letterSpacing}
						min={-20}
						max={100}
						onChange={(letterSpacing) => update({ letterSpacing })}
						suffix="px"
					/>
					<NumberControl
						label="Line height"
						value={style.lineHeight}
						min={0.5}
						max={3}
						step={0.05}
						onChange={(lineHeight) => update({ lineHeight })}
						suffix="x"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel>Alignment</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex flex-wrap gap-2">
								{(
									[
										["left", AlignLeft],
										["center", AlignCenter],
										["right", AlignRight],
									] as const
								).map(([alignment, Icon]) => (
									<IconToggle
										key={alignment}
										label={`Align ${alignment}`}
										pressed={element.textAlign === alignment}
										onClick={() => update({ textAlign: alignment })}
									>
										<Icon className="size-4" />
									</IconToggle>
								))}
								{(["top", "middle", "bottom"] as const).map((alignment) => (
									<Button
										key={alignment}
										type="button"
										aria-pressed={style.verticalAlign === alignment}
										variant={
											style.verticalAlign === alignment ? "default" : "outline"
										}
										size="sm"
										className="h-8 px-2 text-[10px] capitalize"
										onClick={() => update({ verticalAlign: alignment })}
									>
										{alignment}
									</Button>
								))}
							</div>
						</PropertyItemValue>
					</PropertyItem>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Layout" defaultExpanded>
				<div className="space-y-4">
					<NumberControl
						label="Text box width"
						value={style.width}
						min={40}
						max={Math.max(40, canvasSize.width)}
						onChange={(width) => update({ width })}
						suffix="px"
					/>
					<NumberControl
						label="Text box height"
						value={style.height}
						min={40}
						max={Math.max(40, canvasSize.height)}
						onChange={(height) => update({ height })}
						suffix="px"
					/>
					<NumberControl
						label="X position"
						value={element.x}
						min={-canvasSize.width / 2}
						max={canvasSize.width / 2}
						onChange={(x) => update({ x })}
						suffix="px"
					/>
					<NumberControl
						label="Y position"
						value={element.y}
						min={-canvasSize.height / 2}
						max={canvasSize.height / 2}
						onChange={(y) => update({ y })}
						suffix="px"
					/>
					<NumberControl
						label="Rotation"
						value={element.rotation}
						min={-180}
						max={180}
						onChange={(rotation) => update({ rotation })}
						suffix="deg"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel className="flex items-center gap-1.5">
							<Grid3X3 className="size-3.5" /> Position
						</PropertyItemLabel>
						<PropertyItemValue className="flex justify-end">
							<div className="grid grid-cols-3 gap-1">
								{([0, 1, 2] as const).flatMap((row) =>
									([0, 1, 2] as const).map((column) => (
										<Button
											key={`${column}-${row}`}
											type="button"
											variant="outline"
											size="icon"
											className="size-7"
											aria-label={`Place text at ${column}-${row}`}
											title="Place text on canvas"
											onClick={() => quickPosition(column, row)}
										>
											<span className="size-1.5 rounded-full bg-current" />
										</Button>
									))
								)}
							</div>
						</PropertyItemValue>
					</PropertyItem>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Appearance" defaultExpanded>
				<div className="space-y-4">
					<ColorControl
						label="Text color"
						value={element.color}
						onChange={(color) => update({ color })}
					/>
					<NumberControl
						label="Opacity"
						value={Math.round(element.opacity * 100)}
						min={0}
						max={100}
						onChange={(opacity) => update({ opacity: opacity / 100 })}
						suffix="%"
					/>
					<PropertyItem direction="row">
						<PropertyItemLabel>Blend mode</PropertyItemLabel>
						<PropertyItemValue>
							<Select
								value={style.blendMode}
								onValueChange={(blendMode) =>
									update({
										blendMode: blendMode as NonNullable<
											TextElement["blendMode"]
										>,
									})
								}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TEXT_BLEND_MODES.map((mode) => (
										<SelectItem key={mode} value={mode} className="capitalize">
											{mode}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Stroke" defaultExpanded={false}>
				<div className="space-y-4">
					<ColorControl
						label="Color"
						value={style.strokeColor}
						onChange={(strokeColor) => update({ strokeColor })}
					/>
					<NumberControl
						label="Width"
						value={style.strokeWidth}
						min={0}
						max={20}
						step={0.5}
						onChange={(strokeWidth) => update({ strokeWidth })}
						suffix="px"
					/>
					<NumberControl
						label="Opacity"
						value={Math.round(style.strokeOpacity * 100)}
						min={0}
						max={100}
						onChange={(strokeOpacity) =>
							update({ strokeOpacity: strokeOpacity / 100 })
						}
						suffix="%"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Background" defaultExpanded={false}>
				<div className="space-y-4">
					<ColorControl
						label="Color"
						value={element.backgroundColor}
						onChange={(backgroundColor) => update({ backgroundColor })}
					/>
					<NumberControl
						label="Opacity"
						value={Math.round(style.backgroundOpacity * 100)}
						min={0}
						max={100}
						onChange={(backgroundOpacity) =>
							update({ backgroundOpacity: backgroundOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label="Corner radius"
						value={style.backgroundRadius}
						min={0}
						max={100}
						onChange={(backgroundRadius) => update({ backgroundRadius })}
						suffix="px"
					/>
					<NumberControl
						label="Padding"
						value={style.backgroundPadding}
						min={0}
						max={100}
						onChange={(backgroundPadding) => update({ backgroundPadding })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Shadow" defaultExpanded={false}>
				<div className="space-y-4">
					<ColorControl
						label="Color"
						value={style.shadowColor}
						onChange={(shadowColor) => update({ shadowColor })}
					/>
					<NumberControl
						label="Opacity"
						value={Math.round(style.shadowOpacity * 100)}
						min={0}
						max={100}
						onChange={(shadowOpacity) =>
							update({ shadowOpacity: shadowOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label="Horizontal offset"
						value={style.shadowOffsetX}
						min={-100}
						max={100}
						onChange={(shadowOffsetX) => update({ shadowOffsetX })}
						suffix="px"
					/>
					<NumberControl
						label="Vertical offset"
						value={style.shadowOffsetY}
						min={-100}
						max={100}
						onChange={(shadowOffsetY) => update({ shadowOffsetY })}
						suffix="px"
					/>
					<NumberControl
						label="Blur"
						value={style.shadowBlur}
						min={0}
						max={100}
						onChange={(shadowBlur) => update({ shadowBlur })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Glow" defaultExpanded={false}>
				<div className="space-y-4">
					<ColorControl
						label="Color"
						value={style.glowColor}
						onChange={(glowColor) => update({ glowColor })}
					/>
					<NumberControl
						label="Opacity"
						value={Math.round(style.glowOpacity * 100)}
						min={0}
						max={100}
						onChange={(glowOpacity) =>
							update({ glowOpacity: glowOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label="Blur"
						value={style.glowBlur}
						min={0}
						max={100}
						onChange={(glowBlur) => update({ glowBlur })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup title="Curve" defaultExpanded={false}>
				<NumberControl
					label="Arc"
					value={style.curve}
					min={-180}
					max={180}
					onChange={(curve) => update({ curve })}
					suffix="deg"
				/>
			</PropertyGroup>

			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={resetVisualStyle}
			>
				<RotateCcw className="mr-2 size-4" /> Reset visual style
			</Button>
		</div>
	);
}
