import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "@qcut/platform-core";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LanguageSelect } from "@/components/captions/language-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	analyzeFillerWords,
	applyFillerRemoval,
	buildSegmentsFromWords,
	buildSmartCaptionElements,
	parseKeyterms,
	selectKeySegments,
	toTranscriptionResult,
	translateSegmentsBilingual,
	type SmartSegmentation,
} from "@/lib/captions/smart-recognition";
import { applyCaptionPostProcess } from "@/lib/captions/workbench";
import { useTranslation } from "@/lib/i18n";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TranscriptionResult } from "@/types/captions";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { CreateCaptionElement, MediaElement } from "@/types/timeline";

const KEYTERMS_STORAGE_KEY = "qcut-caption-keyterms";

/** Languages offered as translation targets, labeled for the LLM prompt. */
const TRANSLATE_TARGETS: { code: string; promptLabel: string }[] = [
	{ code: "zh", promptLabel: "Simplified Chinese" },
	{ code: "en", promptLabel: "English" },
	{ code: "ja", promptLabel: "Japanese" },
	{ code: "ko", promptLabel: "Korean" },
	{ code: "es", promptLabel: "Spanish" },
	{ code: "fr", promptLabel: "French" },
	{ code: "de", promptLabel: "German" },
	{ code: "pt", promptLabel: "Portuguese" },
];

const TRANSLATE_TARGET_NAMES: Record<string, string> = {
	zh: "中文",
	en: "English",
	ja: "日本語",
	ko: "한국어",
	es: "Español",
	fr: "Français",
	de: "Deutsch",
	pt: "Português",
};

interface RecognitionSource {
	key: string;
	label: string;
	origin: "timeline" | "library";
	item: MediaItem;
	element?: MediaElement;
}

export interface SmartRecognitionOutcome {
	result: TranscriptionResult;
	elements: CreateCaptionElement[];
	clearExisting: boolean;
}

interface SmartRecognitionCardProps {
	onCompleted: (outcome: SmartRecognitionOutcome) => void;
}

function isRecognizableMedia({ item }: { item: MediaItem }): boolean {
	return item.type === "audio" || item.type === "video";
}

async function resolveSourcePath({
	item,
}: {
	item: MediaItem;
}): Promise<string> {
	if (item.localPath) return item.localPath;
	if (!platform().audio?.saveTemp) {
		throw new Error("Temp save is unavailable on this platform");
	}
	const buffer = await item.file.arrayBuffer();
	return platform().audio.saveTemp(new Uint8Array(buffer), item.file.name);
}

async function resolveAudioPath({
	item,
}: {
	item: MediaItem;
}): Promise<string> {
	const sourcePath = await resolveSourcePath({ item });
	if (item.type !== "video") return sourcePath;
	if (!platform().ffmpeg?.extractAudio) {
		throw new Error("FFmpeg audio extraction is unavailable on this platform");
	}
	const { audioPath } = await platform().ffmpeg.extractAudio({
		videoPath: sourcePath,
		format: "mp3",
	});
	return audioPath;
}

/**
 * JianYing-style 识别字幕 card: recognize speech on a timeline clip or media
 * library item and drop styled caption elements straight onto the timeline.
 */
export function SmartRecognitionCard({
	onCompleted,
}: SmartRecognitionCardProps) {
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement>(null);
	const mediaItems = useMediaStore((store) => store.mediaItems);
	const tracks = useTimelineStore((store) => store.tracks);

	const [sourceKey, setSourceKey] = useState<string>("");
	const [engine, setEngine] = useState<"elevenlabs" | "gemini">("elevenlabs");
	const [language, setLanguage] = useState("auto");
	const [translateTo, setTranslateTo] = useState("none");
	const [keytermsInput, setKeytermsInput] = useState(
		() => localStorage.getItem(KEYTERMS_STORAGE_KEY) ?? ""
	);
	const [removeFillers, setRemoveFillers] = useState(true);
	const [highlightKeyPoints, setHighlightKeyPoints] = useState(false);
	const [clearExisting, setClearExisting] = useState(false);
	const [isRunning, setIsRunning] = useState(false);
	const [progress, setProgress] = useState("");

	useEffect(() => {
		localStorage.setItem(KEYTERMS_STORAGE_KEY, keytermsInput);
	}, [keytermsInput]);

	const sources = useMemo<RecognitionSource[]>(() => {
		const byId = new Map(mediaItems.map((item) => [item.id, item]));
		const entries: RecognitionSource[] = [];
		const seenTimelineMedia = new Set<string>();
		for (const track of tracks) {
			for (const element of track.elements) {
				if (element.type !== "media") continue;
				const item = byId.get(element.mediaId);
				if (!item || !isRecognizableMedia({ item })) continue;
				if (seenTimelineMedia.has(element.id)) continue;
				seenTimelineMedia.add(element.id);
				entries.push({
					key: `element:${element.id}`,
					label: element.name || item.name,
					origin: "timeline",
					item,
					element,
				});
			}
		}
		for (const item of mediaItems) {
			if (!isRecognizableMedia({ item })) continue;
			entries.push({
				key: `media:${item.id}`,
				label: item.name,
				origin: "library",
				item,
			});
		}
		return entries;
	}, [mediaItems, tracks]);

	const selectedSource = useMemo(
		() => sources.find((source) => source.key === sourceKey) ?? sources[0],
		[sources, sourceKey]
	);

	const runRecognition = useCallback(async () => {
		if (!selectedSource) {
			toast.error(t("captions.smart.noSource"));
			return;
		}
		setIsRunning(true);
		try {
			setProgress(t("captions.smart.progressPreparing"));
			const audioPath = await resolveAudioPath({ item: selectedSource.item });

			setProgress(t("captions.smart.progressRecognizing"));
			const languageCode = language === "auto" ? undefined : language;
			let segmentation: SmartSegmentation;
			let detectedLanguage = language === "auto" ? "auto" : language;
			if (engine === "elevenlabs") {
				const keyterms = parseKeyterms({ input: keytermsInput });
				const transcription = await platform().transcription.elevenlabs({
					audioPath,
					language: languageCode,
					diarize: false,
					tagAudioEvents: false,
					...(keyterms.length > 0 ? { keyterms } : {}),
				});
				segmentation = buildSegmentsFromWords({ words: transcription.words });
				detectedLanguage = transcription.language_code || detectedLanguage;
			} else {
				const transcription = await platform().transcription.transcribe({
					audioPath,
					language: language,
				});
				segmentation = {
					segments: transcription.segments,
					segmentWords: new Map(),
				};
				detectedLanguage = transcription.language || detectedLanguage;
			}
			if (segmentation.segments.length === 0) {
				toast.warning(t("captions.smart.noSpeech"));
				return;
			}

			if (removeFillers) {
				setProgress(t("captions.smart.progressFillers"));
				if (segmentation.segmentWords.size > 0) {
					try {
						const removedWordIds = await analyzeFillerWords({
							segmentation,
							languageCode: detectedLanguage,
						});
						segmentation = applyFillerRemoval({
							segmentation,
							removedWordIds,
						});
					} catch {
						toast.warning(t("captions.smart.fillersFallback"));
					}
				} else {
					const processed = applyCaptionPostProcess({
						action: "remove-fillers",
						segments: segmentation.segments,
						targetLanguage: "",
					});
					segmentation = {
						segments: processed.segments,
						segmentWords: segmentation.segmentWords,
					};
				}
			}

			if (translateTo !== "none") {
				setProgress(t("captions.smart.progressTranslating"));
				const target = TRANSLATE_TARGETS.find(
					(candidate) => candidate.code === translateTo
				);
				try {
					const translated = await translateSegmentsBilingual({
						segments: segmentation.segments,
						targetLanguage: target?.promptLabel ?? translateTo,
					});
					segmentation = { ...segmentation, segments: translated.segments };
				} catch {
					toast.warning(t("captions.smart.translateFallback"));
				}
			}

			let highlightIds: Set<number> | undefined;
			if (highlightKeyPoints) {
				setProgress(t("captions.smart.progressHighlighting"));
				try {
					highlightIds = await selectKeySegments({
						segments: segmentation.segments,
					});
				} catch {
					toast.warning(t("captions.smart.highlightFallback"));
				}
			}

			const element = selectedSource.element;
			const elements = buildSmartCaptionElements({
				segmentation,
				language: detectedLanguage,
				highlightIds,
				timelineOffset: element ? element.startTime : 0,
				windowStart: element ? element.trimStart : 0,
				windowEnd: element
					? element.duration - element.trimEnd
					: Number.POSITIVE_INFINITY,
			});
			if (elements.length === 0) {
				toast.warning(t("captions.smart.noSpeech"));
				return;
			}
			onCompleted({
				result: toTranscriptionResult({
					segments: segmentation.segments,
					language: detectedLanguage,
				}),
				elements,
				clearExisting,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error ?? "");
			toast.error(t("captions.smart.failed", { message }));
		} finally {
			setIsRunning(false);
			setProgress("");
		}
	}, [
		clearExisting,
		engine,
		highlightKeyPoints,
		keytermsInput,
		language,
		onCompleted,
		removeFillers,
		selectedSource,
		t,
		translateTo,
	]);

	return (
		<div
			ref={containerRef}
			className="space-y-4 rounded-lg border bg-card/50 p-4"
			data-testid="smart-recognition-card"
		>
			<div className="flex items-center gap-2">
				<Sparkles className="size-4 text-primary" />
				<p className="text-sm font-medium">{t("captions.smart.title")}</p>
			</div>

			<div className="space-y-2">
				<Label>{t("captions.smart.source")}</Label>
				<Select
					value={selectedSource?.key ?? ""}
					onValueChange={setSourceKey}
					disabled={isRunning || sources.length === 0}
				>
					<SelectTrigger data-testid="smart-recognition-source">
						<SelectValue placeholder={t("captions.smart.noSource")} />
					</SelectTrigger>
					<SelectContent>
						{sources.map((source) => (
							<SelectItem key={source.key} value={source.key}>
								{source.origin === "timeline"
									? t("captions.smart.sourceTimeline", { name: source.label })
									: t("captions.smart.sourceLibrary", { name: source.label })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-2">
					<Label>{t("captions.smart.engine")}</Label>
					<Select
						value={engine}
						onValueChange={(value) =>
							setEngine(value === "gemini" ? "gemini" : "elevenlabs")
						}
						disabled={isRunning}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="elevenlabs">
								{t("captions.smart.engineAccurate")}
							</SelectItem>
							<SelectItem value="gemini">
								{t("captions.smart.engineGemini")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label>{t("captions.smart.sourceLanguage")}</Label>
					<LanguageSelect
						selectedCountry={language}
						onSelect={setLanguage}
						containerRef={containerRef}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label>{t("captions.smart.keyterms")}</Label>
				<Textarea
					value={keytermsInput}
					onChange={(event) => setKeytermsInput(event.target.value)}
					placeholder={t("captions.smart.keytermsPlaceholder")}
					className="min-h-16 resize-y bg-background/50"
					disabled={isRunning || engine !== "elevenlabs"}
				/>
			</div>

			<div className="space-y-2">
				<Label>{t("captions.smart.translateTo")}</Label>
				<Select
					value={translateTo}
					onValueChange={setTranslateTo}
					disabled={isRunning}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">
							{t("captions.smart.translateNone")}
						</SelectItem>
						{TRANSLATE_TARGETS.map((target) => (
							<SelectItem key={target.code} value={target.code}>
								{TRANSLATE_TARGET_NAMES[target.code] ?? target.code}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label htmlFor="smart-remove-fillers">
						{t("captions.smart.removeFillers")}
					</Label>
					<Switch
						id="smart-remove-fillers"
						checked={removeFillers}
						onCheckedChange={setRemoveFillers}
						disabled={isRunning}
					/>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="smart-highlight">
						{t("captions.smart.highlight")}
					</Label>
					<Switch
						id="smart-highlight"
						checked={highlightKeyPoints}
						onCheckedChange={setHighlightKeyPoints}
						disabled={isRunning}
					/>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="smart-clear-existing">
						{t("captions.smart.clearExisting")}
					</Label>
					<Switch
						id="smart-clear-existing"
						checked={clearExisting}
						onCheckedChange={setClearExisting}
						disabled={isRunning}
					/>
				</div>
			</div>

			<Button
				className="w-full"
				onClick={runRecognition}
				disabled={isRunning || !selectedSource}
				data-testid="smart-recognition-start"
			>
				{isRunning ? (
					<>
						<Loader2 className="mr-2 size-4 animate-spin" />
						{progress || t("captions.smart.progressRecognizing")}
					</>
				) : (
					t("captions.smart.start")
				)}
			</Button>
		</div>
	);
}
