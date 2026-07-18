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
import { useTranslation } from "@/lib/i18n";
import {
	TEXT_ALIGN_LABEL_KEYS,
	TEXT_ANIMATION_TYPE_KEYS,
	TEXT_BLEND_MODE_KEYS,
	TEXT_KEYFRAME_PROPERTY_KEYS,
	TEXT_PRESET_NAME_KEYS,
	TEXT_REWRITE_MODE_KEYS,
	TEXT_VERTICAL_ALIGN_LABEL_KEYS,
} from "./text-properties-i18n";

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
	const { t } = useTranslation();
	const presetNameKey = TEXT_PRESET_NAME_KEYS[preset.id];
	const presetName = presetNameKey ? t(presetNameKey) : preset.name;
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
				aria-label={t("textProperties.aria.applyPreset", { name: presetName })}
				title={presetName}
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
					aria-label={t("textProperties.aria.deletePreset", {
						name: presetName,
					})}
					title={t("textProperties.action.deletePreset")}
					onClick={onDelete}
				>
					<Trash2 className="size-3" />
				</Button>
			) : null}
		</div>
	);
}

function buildGroupContentDraft({
	contents,
}: {
	contents: readonly string[];
}): string {
	return contents.join("\n");
}

type TextGroupContentSlot = {
	content: string;
	elementId: string;
	index: number;
	name: string;
};

export function buildTextGroupContentSlots({
	selections,
}: {
	selections: readonly TextGroupSelection[];
}): TextGroupContentSlot[] {
	return selections.map(({ element }, index) => ({
		content: element.content,
		elementId: element.id,
		index,
		name: element.name,
	}));
}

export function parseTextGroupDraftContents({
	draft,
	slotCount,
}: {
	draft: string;
	slotCount: number;
}): string[] {
	const lines = draft.split(/\r?\n/);
	return Array.from({ length: slotCount }, (_, index) => lines[index] ?? "");
}

export function updateTextGroupSlotContents({
	contents,
	startIndex,
	value,
}: {
	contents: readonly string[];
	startIndex: number;
	value: string;
}): string[] {
	const next = [...contents];
	const pastedLines = value.split(/\r?\n/);
	for (let offset = 0; offset < pastedLines.length; offset += 1) {
		const targetIndex = startIndex + offset;
		if (targetIndex >= next.length) break;
		next[targetIndex] = pastedLines[offset] ?? "";
	}
	return next;
}

export function TextGroupProperties({
	selections,
}: {
	selections: readonly TextGroupSelection[];
}) {
	const { t } = useTranslation();
	const updateTextGroupContents = useTimelineStore(
		(state) => state.updateTextGroupContents
	);
	const orderedSelections = useMemo(
		() => selections.filter(({ element }) => element.type === "text"),
		[selections]
	);
	const groupId = orderedSelections[0]?.element.groupId;
	const slots = useMemo(
		() => buildTextGroupContentSlots({ selections: orderedSelections }),
		[orderedSelections]
	);
	const currentContents = useMemo(
		() => slots.map((slot) => slot.content),
		[slots]
	);
	const [slotContents, setSlotContents] = useState(currentContents);
	const draft = useMemo(
		() => buildGroupContentDraft({ contents: slotContents }),
		[slotContents]
	);
	const changedCount = slotContents.filter(
		(content, index) => content !== currentContents[index]
	).length;

	useEffect(() => {
		setSlotContents(currentContents);
	}, [currentContents]);

	const applyGroupContents = () => {
		if (!groupId) return;
		const updatedCount = updateTextGroupContents({
			groupId,
			contents: slotContents,
		});
		if (updatedCount > 0) {
			toast.success(
				t("textProperties.toast.updatedLayers", { count: updatedCount })
			);
		}
	};
	const handleDraftChange = ({ value }: { value: string }) => {
		setSlotContents(
			parseTextGroupDraftContents({
				draft: value,
				slotCount: slots.length,
			})
		);
	};
	const handleSlotChange = ({
		index,
		value,
	}: {
		index: number;
		value: string;
	}) => {
		setSlotContents((current) =>
			updateTextGroupSlotContents({
				contents: current,
				startIndex: index,
				value,
			})
		);
	};
	const resetGroupContents = () => {
		setSlotContents(currentContents);
	};

	return (
		<div className="space-y-5" data-testid="text-group-properties">
			<PropertyGroup
				title={t("textProperties.section.templateText")}
				defaultExpanded
			>
				<div className="space-y-3">
					<div className="grid gap-2">
						{slots.map((slot) => (
							<div key={slot.elementId} className="grid gap-1">
								<label
									className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
									htmlFor={`text-group-slot-${slot.elementId}`}
								>
									<span className="truncate">
										{String(slot.index + 1).padStart(2, "0")} {slot.name}
									</span>
									{slotContents[slot.index] !== slot.content ? (
										<span className="shrink-0 text-cyan-300">
											{t("textProperties.status.changed")}
										</span>
									) : null}
								</label>
								<Input
									id={`text-group-slot-${slot.elementId}`}
									aria-label={t("textProperties.aria.textLayerContent", {
										index: slot.index + 1,
									})}
									value={slotContents[slot.index] ?? ""}
									className="h-8 bg-background/50 text-xs"
									onChange={(event) =>
										handleSlotChange({
											index: slot.index,
											value: event.target.value,
										})
									}
									onPaste={(event) => {
										const value = event.clipboardData.getData("text");
										if (!/\r?\n/.test(value)) return;
										event.preventDefault();
										handleSlotChange({ index: slot.index, value });
									}}
								/>
							</div>
						))}
					</div>
					<Textarea
						aria-label={t("textProperties.aria.groupContent")}
						value={draft}
						placeholder={t("textProperties.placeholder.groupDraft")}
						className="min-h-32 resize-y bg-background/50"
						onChange={(event) =>
							handleDraftChange({ value: event.target.value })
						}
					/>
					<div className="grid gap-1 rounded-sm border border-border/70 bg-background/40 p-2 text-[10px] text-muted-foreground">
						{slots.map((slot) => (
							<div key={slot.elementId} className="flex min-w-0 gap-2">
								<span className="shrink-0 tabular-nums">
									{String(slot.index + 1).padStart(2, "0")}
								</span>
								<span className="truncate">{slot.name}</span>
							</div>
						))}
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							className="flex-1"
							disabled={!groupId || changedCount === 0}
							onClick={applyGroupContents}
						>
							{changedCount > 0
								? t("textProperties.action.applyTextCount", {
										count: changedCount,
									})
								: t("textProperties.action.applyText")}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={changedCount === 0}
							onClick={resetGroupContents}
						>
							{t("textProperties.action.reset")}
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
	const { t } = useTranslation();
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
				throw new Error(result.error || t("textProperties.toast.rewriteEmpty"));
			}
			update({ content: result.text.trim() });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("textProperties.toast.rewriteFailed")
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
			toast.error(t("textProperties.toast.noCursorOverlap"));
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
		toast.success(
			t("textProperties.toast.addedCursorKeyframes", {
				count: tracking.x.length,
			})
		);
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
				aria-label={t("textProperties.aria.textContent")}
				placeholder={t("textProperties.placeholder.enterText")}
				value={element.content}
				className="min-h-24 resize-y bg-background/50"
				onChange={(event) => update({ content: event.target.value })}
			/>

			<PropertyGroup
				title={t("textProperties.section.presets")}
				defaultExpanded
			>
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
						<Save className="mr-2 size-4" />{" "}
						{t("textProperties.action.saveCurrentStyle")}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.animation")}
				defaultExpanded={false}
			>
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
								className="h-8"
								onClick={() => update({ animationType })}
							>
								{t(TEXT_ANIMATION_TYPE_KEYS[animationType])}
							</Button>
						))}
					</div>
					{animation.type !== "none" ? (
						<>
							<NumberControl
								label={t("textProperties.label.duration")}
								value={animation.duration}
								min={0.1}
								max={3}
								step={0.1}
								onChange={(animationDuration) => update({ animationDuration })}
								suffix="s"
							/>
							<NumberControl
								label={t("textProperties.label.delay")}
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

			<PropertyGroup
				title={t("textProperties.section.aiWriting")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<PropertyItem direction="column">
						<PropertyItemLabel>
							{t("textProperties.label.rewrite")}
						</PropertyItemLabel>
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
											{t(TEXT_REWRITE_MODE_KEYS[mode])}
										</Button>
									)
								)}
							</div>
						</PropertyItemValue>
					</PropertyItem>

					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.voiceModel")}
						</PropertyItemLabel>
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
								? t("textProperties.action.generateSpeech")
								: t("textProperties.hint.configureFalKey")
						}
						onClick={createSpeech}
					>
						{isGeneratingAI && generationKind === "speech" ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<AudioLines className="mr-2 size-4" />
						)}
						{isGeneratingAI && generationKind === "speech"
							? (speechProgress?.message ??
								t("textProperties.action.generatingSpeech"))
							: t("textProperties.action.generateSpeech")}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.digitalHuman")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.portrait")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<Select value={avatarImageId} onValueChange={setAvatarImageId}>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue
										placeholder={t("textProperties.placeholder.chooseImage")}
									/>
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
								? t("textProperties.hint.generatePortrait")
								: t("textProperties.hint.importPortraitFirst")
						}
						onClick={createAvatar}
					>
						{isGeneratingAI && generationKind === "avatar" ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Sparkles className="mr-2 size-4" />
						)}
						{isGeneratingAI && generationKind === "avatar"
							? (speechProgress?.message ??
								t("textProperties.action.generatingDigitalHuman"))
							: t("textProperties.action.generateDigitalHuman")}
					</Button>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.tracking")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.followClip")}
						</PropertyItemLabel>
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
									<SelectItem value="none">{t("common.none")}</SelectItem>
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
								label={t("textProperties.label.horizontalOffset")}
								value={element.trackingOffsetX ?? 0}
								min={-canvasSize.width}
								max={canvasSize.width}
								onChange={(trackingOffsetX) => update({ trackingOffsetX })}
								suffix="px"
							/>
							<NumberControl
								label={t("textProperties.label.verticalOffset")}
								value={element.trackingOffsetY ?? 0}
								min={-canvasSize.height}
								max={canvasSize.height}
								onChange={(trackingOffsetY) => update({ trackingOffsetY })}
								suffix="px"
							/>
							<div className="flex items-center justify-between gap-3">
								<PropertyItemLabel>
									{t("textProperties.label.followRotation")}
								</PropertyItemLabel>
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
									? t("textProperties.hint.followRecordedCursor")
									: t("textProperties.hint.cursorTelemetry")
							}
							onClick={applyCursorTracking}
						>
							<MousePointer2 className="mr-2 size-4" />{" "}
							{t("textProperties.action.trackCursor")}
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
							<Unlink className="mr-2 size-4" />{" "}
							{t("textProperties.action.clear")}
						</Button>
					</div>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.keyframes")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.property")}
						</PropertyItemLabel>
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
											{t(TEXT_KEYFRAME_PROPERTY_KEYS[property.value])}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
					<KeyframeEditor
						propName={keyframeProperty}
						propLabel={t(TEXT_KEYFRAME_PROPERTY_KEYS[keyframeProperty])}
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

			<PropertyGroup
				title={t("textProperties.section.typography")}
				defaultExpanded
			>
				<div className="space-y-4">
					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.font")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<FontPicker
								value={element.fontFamily as FontFamily}
								onValueChange={(fontFamily) => update({ fontFamily })}
							/>
						</PropertyItemValue>
					</PropertyItem>

					<NumberControl
						label={t("textProperties.label.fontSize")}
						value={element.fontSize}
						min={8}
						max={300}
						onChange={(fontSize) => update({ fontSize })}
						suffix="px"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.style")}
						</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex flex-wrap gap-2">
								<IconToggle
									label={t("textProperties.style.bold")}
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
									label={t("textProperties.style.italic")}
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
									label={t("textProperties.style.underline")}
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
									label={t("textProperties.style.strikethrough")}
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
						label={t("textProperties.label.letterSpacing")}
						value={style.letterSpacing}
						min={-20}
						max={100}
						onChange={(letterSpacing) => update({ letterSpacing })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.lineHeight")}
						value={style.lineHeight}
						min={0.5}
						max={3}
						step={0.05}
						onChange={(lineHeight) => update({ lineHeight })}
						suffix="x"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.alignment")}
						</PropertyItemLabel>
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
										label={t(TEXT_ALIGN_LABEL_KEYS[alignment])}
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
										className="h-8 px-2 text-[10px]"
										onClick={() => update({ verticalAlign: alignment })}
									>
										{t(TEXT_VERTICAL_ALIGN_LABEL_KEYS[alignment])}
									</Button>
								))}
							</div>
						</PropertyItemValue>
					</PropertyItem>
				</div>
			</PropertyGroup>

			<PropertyGroup title={t("textProperties.section.layout")} defaultExpanded>
				<div className="space-y-4">
					<NumberControl
						label={t("textProperties.label.textBoxWidth")}
						value={style.width}
						min={40}
						max={Math.max(40, canvasSize.width)}
						onChange={(width) => update({ width })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.textBoxHeight")}
						value={style.height}
						min={40}
						max={Math.max(40, canvasSize.height)}
						onChange={(height) => update({ height })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.xPosition")}
						value={element.x}
						min={-canvasSize.width / 2}
						max={canvasSize.width / 2}
						onChange={(x) => update({ x })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.yPosition")}
						value={element.y}
						min={-canvasSize.height / 2}
						max={canvasSize.height / 2}
						onChange={(y) => update({ y })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.rotation")}
						value={element.rotation}
						min={-180}
						max={180}
						onChange={(rotation) => update({ rotation })}
						suffix="deg"
					/>

					<PropertyItem direction="row">
						<PropertyItemLabel className="flex items-center gap-1.5">
							<Grid3X3 className="size-3.5" />{" "}
							{t("textProperties.label.position")}
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
											aria-label={t("textProperties.aria.placeTextAt", {
												column,
												row,
											})}
											title={t("textProperties.hint.placeText")}
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

			<PropertyGroup
				title={t("textProperties.section.appearance")}
				defaultExpanded
			>
				<div className="space-y-4">
					<ColorControl
						label={t("textProperties.label.textColor")}
						value={element.color}
						onChange={(color) => update({ color })}
					/>
					<NumberControl
						label={t("textProperties.label.opacity")}
						value={Math.round(element.opacity * 100)}
						min={0}
						max={100}
						onChange={(opacity) => update({ opacity: opacity / 100 })}
						suffix="%"
					/>
					<PropertyItem direction="row">
						<PropertyItemLabel>
							{t("textProperties.label.blendMode")}
						</PropertyItemLabel>
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
										<SelectItem key={mode} value={mode}>
											{t(TEXT_BLEND_MODE_KEYS[mode])}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</PropertyItemValue>
					</PropertyItem>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.stroke")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<ColorControl
						label={t("textProperties.label.color")}
						value={style.strokeColor}
						onChange={(strokeColor) => update({ strokeColor })}
					/>
					<NumberControl
						label={t("textProperties.label.width")}
						value={style.strokeWidth}
						min={0}
						max={20}
						step={0.5}
						onChange={(strokeWidth) => update({ strokeWidth })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.opacity")}
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

			<PropertyGroup
				title={t("textProperties.section.background")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<ColorControl
						label={t("textProperties.label.color")}
						value={element.backgroundColor}
						onChange={(backgroundColor) => update({ backgroundColor })}
					/>
					<NumberControl
						label={t("textProperties.label.opacity")}
						value={Math.round(style.backgroundOpacity * 100)}
						min={0}
						max={100}
						onChange={(backgroundOpacity) =>
							update({ backgroundOpacity: backgroundOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label={t("textProperties.label.cornerRadius")}
						value={style.backgroundRadius}
						min={0}
						max={100}
						onChange={(backgroundRadius) => update({ backgroundRadius })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.padding")}
						value={style.backgroundPadding}
						min={0}
						max={100}
						onChange={(backgroundPadding) => update({ backgroundPadding })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.shadow")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<ColorControl
						label={t("textProperties.label.color")}
						value={style.shadowColor}
						onChange={(shadowColor) => update({ shadowColor })}
					/>
					<NumberControl
						label={t("textProperties.label.opacity")}
						value={Math.round(style.shadowOpacity * 100)}
						min={0}
						max={100}
						onChange={(shadowOpacity) =>
							update({ shadowOpacity: shadowOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label={t("textProperties.label.horizontalOffset")}
						value={style.shadowOffsetX}
						min={-100}
						max={100}
						onChange={(shadowOffsetX) => update({ shadowOffsetX })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.verticalOffset")}
						value={style.shadowOffsetY}
						min={-100}
						max={100}
						onChange={(shadowOffsetY) => update({ shadowOffsetY })}
						suffix="px"
					/>
					<NumberControl
						label={t("textProperties.label.blur")}
						value={style.shadowBlur}
						min={0}
						max={100}
						onChange={(shadowBlur) => update({ shadowBlur })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.glow")}
				defaultExpanded={false}
			>
				<div className="space-y-4">
					<ColorControl
						label={t("textProperties.label.color")}
						value={style.glowColor}
						onChange={(glowColor) => update({ glowColor })}
					/>
					<NumberControl
						label={t("textProperties.label.opacity")}
						value={Math.round(style.glowOpacity * 100)}
						min={0}
						max={100}
						onChange={(glowOpacity) =>
							update({ glowOpacity: glowOpacity / 100 })
						}
						suffix="%"
					/>
					<NumberControl
						label={t("textProperties.label.blur")}
						value={style.glowBlur}
						min={0}
						max={100}
						onChange={(glowBlur) => update({ glowBlur })}
						suffix="px"
					/>
				</div>
			</PropertyGroup>

			<PropertyGroup
				title={t("textProperties.section.curve")}
				defaultExpanded={false}
			>
				<NumberControl
					label={t("textProperties.label.arc")}
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
				<RotateCcw className="mr-2 size-4" />{" "}
				{t("textProperties.action.resetVisualStyle")}
			</Button>
		</div>
	);
}
