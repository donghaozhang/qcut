import { useCallback, useMemo, useRef, useState } from "react";
import { platform } from "@qcut/platform-core";
import { Loader2, Music4 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { buildKaraokeCaptionElements } from "@/lib/audio/audio-lyrics";
import { KARAOKE_MODES, type KaraokeMode } from "@/lib/captions/karaoke-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement } from "@/types/timeline";

/** JianYing offers Cantonese explicitly; Scribe v2 takes ISO codes. */
const LYRICS_LANGUAGES: { code: string; label: string }[] = [
	{ code: "auto", label: "" },
	{ code: "zh", label: "中文" },
	{ code: "yue", label: "中文(粤语)" },
	{ code: "en", label: "English" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
];

const KARAOKE_MODE_LABEL_KEYS: Record<KaraokeMode, TranslationKey> = {
	none: "captions.lyrics.effect.none",
	"word-highlight": "captions.lyrics.effect.wordHighlight",
	"word-by-word": "captions.lyrics.effect.wordByWord",
	karaoke: "captions.lyrics.effect.karaoke",
	bounce: "captions.lyrics.effect.bounce",
	typewriter: "captions.lyrics.effect.typewriter",
	slam: "caption.karaoke.slam",
	spring: "caption.karaoke.spring",
	overlap: "caption.karaoke.overlap",
	expand: "caption.karaoke.expand",
	shine: "caption.karaoke.shine",
	pulse: "caption.karaoke.pulse",
};

interface LyricsSource {
	key: string;
	label: string;
	item: MediaItem;
	element: MediaElement;
}

async function resolveAudioSourcePath({
	item,
}: {
	item: MediaItem;
}): Promise<string> {
	const existing = item.localPath ?? item.importMetadata?.originalPath;
	if (existing) return existing;
	if (!platform().audio?.saveTemp) {
		throw new Error("Temp save is unavailable on this platform");
	}
	const buffer = await item.file.arrayBuffer();
	return platform().audio.saveTemp(new Uint8Array(buffer), item.file.name);
}

/**
 * JianYing-style 歌词识别 card: word-level lyrics transcription for a
 * timeline audio clip, emitted as a karaoke caption track.
 */
export function LyricsRecognitionCard() {
	const { t } = useTranslation();
	const mediaItems = useMediaStore((store) => store.mediaItems);
	const tracks = useTimelineStore((store) => store.tracks);
	const addTrack = useTimelineStore((store) => store.addTrack);
	const removeTrack = useTimelineStore((store) => store.removeTrack);
	const addElementToTrack = useTimelineStore(
		(store) => store.addElementToTrack
	);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);

	const [sourceKey, setSourceKey] = useState("");
	const [language, setLanguage] = useState("auto");
	const [effect, setEffect] = useState<KaraokeMode>("karaoke");
	const [isRunning, setIsRunning] = useState(false);
	// Remember the track each clip produced so re-running replaces it.
	const createdTracksRef = useRef(new Map<string, string>());

	const sources = useMemo<LyricsSource[]>(() => {
		const byId = new Map(mediaItems.map((item) => [item.id, item]));
		const entries: LyricsSource[] = [];
		for (const track of tracks) {
			for (const element of track.elements) {
				if (element.type !== "media") continue;
				const item = byId.get(element.mediaId);
				if (!item || item.type !== "audio") continue;
				entries.push({
					key: element.id,
					label: element.name || item.name,
					item,
					element,
				});
			}
		}
		return entries;
	}, [mediaItems, tracks]);

	const selectedSource = useMemo(
		() => sources.find((source) => source.key === sourceKey) ?? sources[0],
		[sources, sourceKey]
	);

	const runRecognition = useCallback(async () => {
		if (!selectedSource) {
			toast.error(t("captions.lyrics.noSource"));
			return;
		}
		setIsRunning(true);
		try {
			const audioPath = await resolveAudioSourcePath({
				item: selectedSource.item,
			});
			const result = await platform().transcription.elevenlabs({
				audioPath,
				language: language === "auto" ? undefined : language,
				diarize: false,
				tagAudioEvents: false,
			});
			const words: WordItem[] = result.words.map((word, index) => ({
				id: `lyrics-${selectedSource.element.id}-${index}`,
				text: word.text,
				start: word.start,
				end: word.end,
				type: word.type === "word" ? "word" : "spacing",
				filterState: WORD_FILTER_STATE.NONE,
			}));
			const captions = buildKaraokeCaptionElements({
				element: selectedSource.element,
				words,
				language: result.language_code || language,
				fps,
			}).map((caption) => ({
				...caption,
				style: caption.style
					? { ...caption.style, karaokeMode: effect }
					: caption.style,
			}));
			if (captions.length === 0) {
				toast.warning(t("captions.lyrics.noLyrics"));
				return;
			}
			const previousTrackId = createdTracksRef.current.get(
				selectedSource.element.id
			);
			if (
				previousTrackId &&
				tracks.some((track) => track.id === previousTrackId)
			) {
				removeTrack(previousTrackId);
			}
			const trackId = addTrack("captions");
			for (const caption of captions) {
				addElementToTrack(trackId, caption, {
					pushHistory: false,
					selectElement: false,
				});
			}
			createdTracksRef.current.set(selectedSource.element.id, trackId);
			toast.success(t("captions.lyrics.done", { count: captions.length }));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error ?? "");
			toast.error(t("captions.lyrics.failed", { message }));
		} finally {
			setIsRunning(false);
		}
	}, [
		addElementToTrack,
		addTrack,
		effect,
		fps,
		language,
		removeTrack,
		selectedSource,
		t,
		tracks,
	]);

	return (
		<div
			className="space-y-4 rounded-lg border bg-card/50 p-4"
			data-testid="lyrics-recognition-card"
		>
			<div className="flex items-center gap-2">
				<Music4 className="size-4 text-primary" />
				<p className="text-sm font-medium">{t("captions.lyrics.title")}</p>
			</div>

			<div className="space-y-2">
				<Label>{t("captions.lyrics.source")}</Label>
				<Select
					value={selectedSource?.key ?? ""}
					onValueChange={setSourceKey}
					disabled={isRunning || sources.length === 0}
				>
					<SelectTrigger data-testid="lyrics-recognition-source">
						<SelectValue placeholder={t("captions.lyrics.noSource")} />
					</SelectTrigger>
					<SelectContent>
						{sources.map((source) => (
							<SelectItem key={source.key} value={source.key}>
								{source.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-2">
					<Label>{t("captions.lyrics.language")}</Label>
					<Select
						value={language}
						onValueChange={setLanguage}
						disabled={isRunning}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LYRICS_LANGUAGES.map((option) => (
								<SelectItem key={option.code} value={option.code}>
									{option.code === "auto"
										? t("captions.lyrics.autoDetect")
										: option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label>{t("captions.lyrics.effect")}</Label>
					<Select
						value={effect}
						onValueChange={(value) => setEffect(value as KaraokeMode)}
						disabled={isRunning}
					>
						<SelectTrigger>
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
				</div>
			</div>

			<Button
				className="w-full"
				onClick={runRecognition}
				disabled={isRunning || !selectedSource}
				data-testid="lyrics-recognition-start"
			>
				{isRunning ? (
					<>
						<Loader2 className="mr-2 size-4 animate-spin" />
						{t("captions.lyrics.progress")}
					</>
				) : (
					t("captions.lyrics.start")
				)}
			</Button>
		</div>
	);
}
