import { useCallback, useMemo, useRef, useState } from "react";
import { AudioLines, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CloudTaskStatus } from "@/components/editor/cloud-task-status";
import { CaptionPresetGrid } from "@/components/captions/caption-preset-grid";
import {
	CaptionStyleControls,
	CaptionStyleSlider,
} from "@/components/captions/caption-style-controls";
import { useSpeechAvatarGeneration } from "@/hooks/use-speech-avatar-generation";
import {
	CAPTION_ANIMATION_TYPES,
	resolveSubtitleStyle,
} from "@/lib/captions/subtitle-style";
import { KARAOKE_MODES, type KaraokeMode } from "@/lib/captions/karaoke-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { CaptionStyleScope } from "@/stores/timeline/types";
import type { CaptionElement, SubtitleStyle } from "@/types/timeline";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

const CAPTION_ANIMATION_LABEL_KEYS: Record<
	(typeof CAPTION_ANIMATION_TYPES)[number],
	TranslationKey
> = {
	none: "caption.animation.none",
	fade: "caption.animation.fade",
	"slide-up": "caption.animation.slideUp",
	"slide-left": "caption.animation.slideLeft",
};

const KARAOKE_MODE_LABEL_KEYS: Record<KaraokeMode, TranslationKey> = {
	none: "caption.karaoke.none",
	"word-highlight": "caption.karaoke.wordHighlight",
	"word-by-word": "caption.karaoke.wordByWord",
	karaoke: "caption.karaoke.fill",
	bounce: "caption.karaoke.bounce",
	typewriter: "caption.karaoke.typewriter",
	slam: "caption.karaoke.slam",
	spring: "caption.karaoke.spring",
	overlap: "caption.karaoke.overlap",
	expand: "caption.karaoke.expand",
	shine: "caption.karaoke.shine",
	pulse: "caption.karaoke.pulse",
	"fly-in": "caption.karaoke.flyIn",
	gather: "caption.karaoke.gather",
	flip: "caption.karaoke.flip",
	"blur-roll": "caption.karaoke.blurRoll",
	glitch: "caption.karaoke.glitch",
	mischief: "caption.karaoke.mischief",
};

function activateOnKeyboard({
	event,
	action,
}: {
	event: React.KeyboardEvent<HTMLButtonElement>;
	action: () => void;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	action();
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
		<div className="flex items-center justify-between gap-3">
			<Label className="text-xs">{label}</Label>
			<Input
				type="color"
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-8 w-16 cursor-pointer p-1"
			/>
		</div>
	);
}

function CaptionAppearanceControls({
	style,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	style: SubtitleStyle;
	onChange: (updates: Partial<SubtitleStyle>) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="space-y-4 border-t border-border pt-4">
			<CaptionStyleSlider
				label={t("caption.textOpacity")}
				value={style.fontOpacity * 100}
				min={0}
				max={100}
				step={1}
				onChange={(fontOpacity) => onChange({ fontOpacity: fontOpacity / 100 })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<ColorControl
				label={t("caption.outlineColor")}
				value={style.outlineColor}
				onChange={(outlineColor) => onChange({ outlineColor })}
			/>
			<CaptionStyleSlider
				label={t("caption.outlineWidth")}
				value={style.outlineWidth}
				min={0}
				max={10}
				step={0.5}
				onChange={(outlineWidth) => onChange({ outlineWidth })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<ColorControl
				label={t("caption.shadowColor")}
				value={style.shadowColor}
				onChange={(shadowColor) => onChange({ shadowColor })}
			/>
			<ColorControl
				label={t("caption.backgroundColor")}
				value={style.backgroundColor}
				onChange={(backgroundColor) => onChange({ backgroundColor })}
			/>
			<CaptionStyleSlider
				label={t("caption.backgroundOpacity")}
				value={style.bgOpacity * 100}
				min={0}
				max={100}
				step={1}
				onChange={(bgOpacity) => onChange({ bgOpacity: bgOpacity / 100 })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
		</div>
	);
}

function CaptionAnimationControls({
	style,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	style: SubtitleStyle;
	onChange: (updates: Partial<SubtitleStyle>) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-2">
				{CAPTION_ANIMATION_TYPES.map((animationType) => {
					const active = style.animationType === animationType;
					const action = () => onChange({ animationType });
					return (
						<Button
							key={animationType}
							type="button"
							variant={active ? "default" : "outline"}
							className="h-9 capitalize"
							onClick={action}
							onKeyDown={(event) => activateOnKeyboard({ event, action })}
							aria-pressed={active}
						>
							{t(CAPTION_ANIMATION_LABEL_KEYS[animationType])}
						</Button>
					);
				})}
			</div>
			{style.animationType !== "none" ? (
				<>
					<CaptionStyleSlider
						label={t("caption.animationDuration")}
						value={style.animationDuration}
						min={0.1}
						max={3}
						step={0.05}
						onChange={(animationDuration) => onChange({ animationDuration })}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
					<CaptionStyleSlider
						label={t("caption.animationDelay")}
						value={style.animationDelay}
						min={0}
						max={3}
						step={0.05}
						onChange={(animationDelay) => onChange({ animationDelay })}
						onInteractionStart={onInteractionStart}
						onInteractionEnd={onInteractionEnd}
					/>
				</>
			) : null}
		</div>
	);
}

function KaraokeControls({
	style,
	onChange,
}: {
	style: SubtitleStyle;
	onChange: (updates: Partial<SubtitleStyle>) => void;
}) {
	const { t } = useTranslation();
	const karaokeMode = style.karaokeMode ?? "none";
	return (
		<div className="space-y-3 border-t border-border pt-4">
			<Label className="text-xs">{t("caption.karaoke")}</Label>
			<Select
				value={karaokeMode}
				onValueChange={(value) =>
					onChange({ karaokeMode: value as KaraokeMode })
				}
			>
				<SelectTrigger
					className="h-8 text-xs"
					aria-label={t("caption.karaokeMode")}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{KARAOKE_MODES.map((mode) => (
						<SelectItem key={mode.value} value={mode.value}>
							{t(KARAOKE_MODE_LABEL_KEYS[mode.value])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{karaokeMode !== "none" ? (
				<div className="grid grid-cols-2 gap-3">
					<ColorControl
						label={t("caption.highlight")}
						value={style.highlightColor ?? "#ffff00"}
						onChange={(highlightColor) => onChange({ highlightColor })}
					/>
					<ColorControl
						label={t("caption.upcoming")}
						value={style.upcomingColor ?? style.fontColor}
						onChange={(upcomingColor) => onChange({ upcomingColor })}
					/>
				</div>
			) : null}
		</div>
	);
}

export function CaptionProperties({
	element,
	trackId,
}: {
	element: CaptionElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const tracks = useTimelineStore((state) => state.tracks);
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const updateCaptionElement = useTimelineStore(
		(state) => state.updateCaptionElement
	);
	const applyCaptionStyle = useTimelineStore(
		(state) => state.applyCaptionStyle
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const [scope, setScope] = useState<CaptionStyleScope>("element");
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	const interactionActive = useRef(false);
	const style = resolveSubtitleStyle(element.style);
	const scopeCounts = useMemo(() => {
		const captionTracks = tracks.filter((track) => track.type === "captions");
		const project = captionTracks.reduce(
			(total, track) =>
				total +
				track.elements.filter((candidate) => candidate.type === "captions")
					.length,
			0
		);
		const track =
			captionTracks
				.find((candidate) => candidate.id === trackId)
				?.elements.filter((candidate) => candidate.type === "captions")
				.length ?? 0;
		const selection = selectedElements.filter(
			({ trackId: selectedTrackId, elementId }) =>
				tracks
					.find((candidate) => candidate.id === selectedTrackId)
					?.elements.some(
						(candidate) =>
							candidate.id === elementId && candidate.type === "captions"
					)
		).length;
		return { project, selection, track };
	}, [selectedElements, trackId, tracks]);
	const generation = useSpeechAvatarGeneration({
		captionElementId: element.id,
		text: element.text,
		startTime: element.startTime,
		duration: Math.max(
			0.1,
			element.duration - element.trimStart - element.trimEnd
		),
	});

	const beginInteraction = useCallback(() => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		pushHistory();
	}, [pushHistory]);
	const endInteraction = useCallback(() => {
		interactionActive.current = false;
	}, []);
	const updateStyle = useCallback(
		(updates: Partial<SubtitleStyle>) => {
			applyCaptionStyle({
				trackId,
				elementId: element.id,
				style: updates,
				scope,
				pushHistory: !interactionActive.current,
			});
		},
		[applyCaptionStyle, element.id, scope, trackId]
	);

	return (
		<div className="space-y-4 p-4" data-testid="caption-properties">
			<Textarea
				placeholder={t("caption.textPlaceholder")}
				value={element.text}
				className="min-h-20 resize-none bg-background/50"
				onChange={(event) =>
					updateCaptionElement(trackId, element.id, {
						text: event.target.value,
					})
				}
			/>

			<div className="space-y-1.5">
				<Label className="text-xs">{t("caption.scopeLabel")}</Label>
				<Select
					value={scope}
					onValueChange={(value) => setScope(value as CaptionStyleScope)}
				>
					<SelectTrigger
						className="h-8 text-xs"
						aria-label={t("caption.scopeAria")}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="element">
							{t("caption.scope.element")}
						</SelectItem>
						<SelectItem value="selection">
							{t("caption.scope.selection", { count: scopeCounts.selection })}
						</SelectItem>
						<SelectItem value="track">
							{t("caption.scope.track", { count: scopeCounts.track })}
						</SelectItem>
						<SelectItem value="project">
							{t("caption.scope.project", { count: scopeCounts.project })}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<Tabs defaultValue="basic">
				<TabsList className="grid h-9 w-full grid-cols-5">
					<TabsTrigger value="basic" className="px-1 text-[10px]">
						{t("caption.tab.basic")}
					</TabsTrigger>
					<TabsTrigger value="presets" className="px-1 text-[10px]">
						{t("caption.tab.presets")}
					</TabsTrigger>
					<TabsTrigger value="motion" className="px-1 text-[10px]">
						{t("caption.tab.motion")}
					</TabsTrigger>
					<TabsTrigger value="voice" className="px-1 text-[10px]">
						{t("caption.tab.voice")}
					</TabsTrigger>
					<TabsTrigger
						value="avatar"
						className="px-1 text-[10px]"
						data-testid="caption-avatar-tab"
					>
						{t("caption.tab.avatar")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="basic" className="mt-4 space-y-4">
					<CaptionStyleControls
						style={style}
						onChange={updateStyle}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
					/>
					<CaptionAppearanceControls
						style={style}
						onChange={updateStyle}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
					/>
					<KaraokeControls style={style} onChange={updateStyle} />
				</TabsContent>

				<TabsContent value="presets" className="mt-4">
					<CaptionPresetGrid
						selectedId={selectedPresetId}
						onSelect={(preset) => {
							setSelectedPresetId(preset.id);
							updateStyle(preset.style);
						}}
					/>
				</TabsContent>

				<TabsContent value="motion" className="mt-4">
					<CaptionAnimationControls
						style={style}
						onChange={updateStyle}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
					/>
				</TabsContent>

				<TabsContent value="voice" className="mt-4 space-y-4">
					<div className="space-y-1.5">
						<Label className="text-xs">{t("caption.voiceModel")}</Label>
						<Select
							value={generation.speechModel}
							onValueChange={generation.setSpeechModel}
						>
							<SelectTrigger
								className="h-8 text-xs"
								aria-label={t("caption.voiceModel")}
							>
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
					</div>
					<Button
						type="button"
						className="w-full"
						disabled={!generation.canGenerateSpeech}
						onClick={generation.createSpeech}
						onKeyDown={(event) =>
							activateOnKeyboard({
								event,
								action: generation.createSpeech,
							})
						}
					>
						{generation.isGenerating &&
						generation.generationKind === "speech" ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<AudioLines className="size-4" />
						)}
						{generation.isGenerating && generation.generationKind === "speech"
							? (generation.progress?.message ?? t("caption.generatingSpeech"))
							: t("caption.generateSpeech")}
					</Button>
				</TabsContent>

				<TabsContent value="avatar" className="mt-4 space-y-4">
					<div className="space-y-1.5">
						<Label className="text-xs">{t("caption.portrait")}</Label>
						<Select
							value={generation.avatarImageId}
							onValueChange={generation.setAvatarImageId}
						>
							<SelectTrigger
								className="h-8 text-xs"
								aria-label={t("caption.portrait")}
								data-testid="caption-avatar-portrait"
							>
								<SelectValue placeholder={t("caption.chooseImage")} />
							</SelectTrigger>
							<SelectContent>
								{generation.avatarImages.map((image) => (
									<SelectItem key={image.id} value={image.id}>
										{image.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button
						type="button"
						className="w-full"
						disabled={!generation.canGenerateAlignedPair}
						onClick={() => void generation.createAlignedPair()}
						onKeyDown={(event) =>
							activateOnKeyboard({
								event,
								action: () => void generation.createAlignedPair(),
							})
						}
						data-testid="generate-aligned-avatar"
					>
						{generation.isGenerating && generation.generationKind === "pair" ? (
							<Loader2 className="size-4 animate-spin">
								<title>{t("caption.generatingPair")}</title>
							</Loader2>
						) : (
							<Sparkles className="size-4">
								<title>{t("caption.generatePair")}</title>
							</Sparkles>
						)}
						{generation.isGenerating && generation.generationKind === "pair"
							? (generation.progress?.message ?? t("caption.generatingPair"))
							: t("caption.generatePair")}
					</Button>
					<CloudTaskStatus
						taskId={generation.alignedTaskId}
						onCancel={generation.cancelAlignedPair}
						onRetry={generation.retryAlignedPair}
					/>
					<div className="border-t border-border pt-3">
						<p className="mb-2 text-[10px] text-muted-foreground">
							{t("caption.videoOnly")}
						</p>
						<Button
							type="button"
							className="w-full"
							disabled={!generation.canGenerateAvatar}
							onClick={generation.createAvatar}
							onKeyDown={(event) =>
								activateOnKeyboard({
									event,
									action: generation.createAvatar,
								})
							}
						>
							{generation.isGenerating &&
							generation.generationKind === "avatar" ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Sparkles className="size-4" />
							)}
							{generation.isGenerating && generation.generationKind === "avatar"
								? (generation.progress?.message ??
									t("caption.generatingAvatar"))
								: t("caption.generateAvatar")}
						</Button>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
