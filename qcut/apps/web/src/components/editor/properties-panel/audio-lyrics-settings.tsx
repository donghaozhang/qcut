import {
	FileText,
	ListMusic,
	LoaderCircle,
	Mic2,
	Save,
	Trash2,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useElevenLabsTranscription } from "@/hooks/media/use-elevenlabs-transcription";
import {
	buildKaraokeCaptionElements,
	retimeLyricsWords,
} from "@/lib/audio/audio-lyrics";
import {
	DEFAULT_MEDIA_AUDIO_SETTINGS,
	normalizeMediaAudioSettings,
} from "@/lib/audio/audio-properties";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { useProjectStore } from "@/stores/project-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import type { AudioLyricsWord, MediaElement } from "@/types/timeline";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { activateButtonFromKeyboard } from "./audio-property-controls";

function editableWords({ words }: { words: AudioLyricsWord[] }): WordItem[] {
	return words.map((word) => ({
		id: word.id,
		text: word.text,
		start: word.start,
		end: word.end,
		type: word.type,
		speaker_id: word.speakerId,
		filterState: WORD_FILTER_STATE.NONE,
	}));
}

function persistedWords({ words }: { words: WordItem[] }): AudioLyricsWord[] {
	return words.map((word) => ({
		id: word.id,
		text: word.text,
		start: word.start,
		end: word.end,
		type: word.type,
		speakerId: word.speaker_id,
	}));
}

export function AudioLyricsSettings({
	element,
	trackId,
	mediaItem,
	bindings,
}: {
	element: MediaElement;
	trackId: string;
	mediaItem: MediaItem | undefined;
	bindings: AudioSettingsEditorBindings;
}) {
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const addTrack = useTimelineStore((state) => state.addTrack);
	const addElementToTrack = useTimelineStore(
		(state) => state.addElementToTrack
	);
	const removeTrack = useTimelineStore((state) => state.removeTrack);
	const tracks = useTimelineStore((state) => state.tracks);
	const wordEditorData = useWordTimelineStore((state) => state.data);
	const { transcribeMedia, isTranscribing, progress, error } =
		useElevenLabsTranscription();
	const [draft, setDraft] = useState(bindings.settings.lyrics.text);
	const [targetVoiceUrl, setTargetVoiceUrl] = useState("");
	const [targetVoiceFile, setTargetVoiceFile] = useState<File>();
	const targetVoiceInputRef = useRef<HTMLInputElement>(null);
	const lyrics = bindings.settings.lyrics;
	const cover = bindings.settings.cover;
	const coverBusy =
		cover.status === "separating" || cover.status === "converting";
	const sourcePath =
		mediaItem?.localPath ?? mediaItem?.importMetadata?.originalPath;

	useEffect(() => setDraft(lyrics.text), [lyrics.text]);

	const latestSettings = () => {
		const latest = useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.find((candidate) => candidate.id === element.id);
		return latest?.type === "media"
			? normalizeMediaAudioSettings({ element: latest })
			: bindings.settings;
	};
	const updateLyrics = ({ nextLyrics }: { nextLyrics: typeof lyrics }) => {
		const current = latestSettings();
		bindings.onSettingsChange({ ...current, lyrics: nextLyrics });
	};
	const transcribe = async () => {
		if (!sourcePath) return;
		updateLyrics({
			nextLyrics: {
				...lyrics,
				status: "transcribing",
				error: undefined,
			},
		});
		const result = await transcribeMedia(sourcePath);
		if (!result) {
			updateLyrics({
				nextLyrics: {
					...latestSettings().lyrics,
					status: "error",
					error: error ?? "Transcription failed",
				},
			});
			return;
		}
		const words: AudioLyricsWord[] = result.words.map((word, index) => ({
			id: `lyrics-${element.id}-${index}`,
			text: word.text,
			start: word.start,
			end: word.end,
			type: word.type === "word" ? "word" : "spacing",
			speakerId: word.speaker_id ?? undefined,
		}));
		updateLyrics({
			nextLyrics: {
				...latestSettings().lyrics,
				status: "ready",
				text: result.text,
				language: result.language_code,
				words,
				sourceMediaId: element.mediaId,
				error: undefined,
			},
		});
		toast.success("Lyrics transcribed");
	};
	const saveDraft = () => {
		const words = retimeLyricsWords({
			text: draft,
			words: editableWords({ words: lyrics.words }),
		});
		if (words.length === 0) {
			toast.error("Lyrics cannot be empty");
			return;
		}
		updateLyrics({
			nextLyrics: {
				...lyrics,
				status: "ready",
				text: draft.trim(),
				words: persistedWords({ words }),
				error: undefined,
			},
		});
		toast.success("Lyrics saved");
	};
	const openWordEditor = () => {
		useWordTimelineStore.getState().loadFromData(
			{
				text: lyrics.text,
				language_code: lyrics.language ?? "unknown",
				language_probability: 1,
				words: editableWords({ words: lyrics.words }),
			},
			`${element.name}-lyrics.json`
		);
		useMediaPanelStore.getState().setActiveTab("word-timeline");
	};
	const syncFromWordEditor = () => {
		const data = wordEditorData;
		if (!data) return;
		updateLyrics({
			nextLyrics: {
				...lyrics,
				status: "ready",
				text: data.text,
				language: data.language_code,
				words: persistedWords({ words: data.words }),
				error: undefined,
			},
		});
		toast.success("Lyrics synced from word editor");
	};
	const createKaraokeTrack = () => {
		const captions = buildKaraokeCaptionElements({
			element,
			words: editableWords({ words: lyrics.words }),
			language: lyrics.language ?? "unknown",
			fps,
		});
		if (captions.length === 0) {
			toast.error("No timed lyrics available");
			return;
		}
		if (
			lyrics.captionTrackId &&
			tracks.some((track) => track.id === lyrics.captionTrackId)
		) {
			removeTrack(lyrics.captionTrackId);
		}
		const captionTrackId = addTrack("captions");
		for (const caption of captions) {
			addElementToTrack(captionTrackId, caption, {
				pushHistory: false,
				selectElement: false,
			});
		}
		updateLyrics({
			nextLyrics: { ...lyrics, captionTrackId },
		});
		toast.success(`Created ${captions.length} karaoke captions`);
	};
	const runCover = async () => {
		try {
			await bindings.onRunCover({ targetVoiceUrl, targetVoiceFile });
			toast.success("AI cover is ready");
		} catch (coverError) {
			toast.error(
				coverError instanceof Error ? coverError.message : "AI cover failed"
			);
		}
	};
	const selectCoverSource = ({ value }: { value: "original" | "cover" }) => {
		const current = latestSettings();
		const enabled = value === "cover";
		bindings.onSettingsChange({
			...current,
			separation: { ...current.separation, enabled },
			voiceConversion: { ...current.voiceConversion, enabled },
			cover: { ...current.cover, enabled },
		});
	};
	const removeCoverResult = () => {
		const current = latestSettings();
		bindings.onSettingsChange({
			...current,
			separation: { ...current.separation, enabled: false },
			voiceConversion:
				current.voiceConversion.sourceStem === "vocals"
					? { ...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceConversion }
					: current.voiceConversion,
			cover: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.cover },
		});
	};

	return (
		<div
			className="divide-y divide-border/70"
			data-testid="audio-lyrics-settings"
		>
			<section className="space-y-3 py-3">
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 text-xs">Transcription</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!sourcePath || isTranscribing}
						onClick={() => void transcribe()}
						title={sourcePath ? "Transcribe lyrics" : "Local media required"}
					>
						{isTranscribing ? (
							<LoaderCircle className="size-3.5 animate-spin" />
						) : (
							<FileText className="size-3.5" />
						)}
						{lyrics.status === "ready" ? "Retranscribe" : "Transcribe"}
					</Button>
				</div>
				{isTranscribing ? (
					<output className="block text-[10px] text-muted-foreground">
						{progress}
					</output>
				) : null}
				{lyrics.error ? (
					<p className="text-[10px] text-destructive">{lyrics.error}</p>
				) : null}
			</section>

			<section className="space-y-3 py-3">
				<div className="flex items-center gap-2">
					<label htmlFor={`lyrics-${element.id}`} className="text-xs">
						Lyrics
					</label>
					<span className="ml-auto text-[10px] text-muted-foreground">
						{lyrics.language ?? "--"}
					</span>
				</div>
				<Textarea
					id={`lyrics-${element.id}`}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					rows={7}
					disabled={lyrics.status !== "ready"}
					className="resize-y text-xs leading-5"
				/>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={lyrics.status !== "ready"}
						onClick={saveDraft}
					>
						<Save className="size-3.5" />
						Save
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={lyrics.status !== "ready"}
						onClick={openWordEditor}
					>
						<ListMusic className="size-3.5" />
						Word editor
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!wordEditorData}
						onClick={syncFromWordEditor}
					>
						Sync edits
					</Button>
					<Button
						type="button"
						variant="default"
						size="sm"
						disabled={lyrics.status !== "ready"}
						onClick={createKaraokeTrack}
					>
						<ListMusic className="size-3.5" />
						{lyrics.captionTrackId ? "Update karaoke" : "Add karaoke"}
					</Button>
				</div>
			</section>

			<section className="space-y-3 py-3" data-testid="audio-cover-settings">
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 text-xs">AI cover</span>
					<span className="text-[10px] capitalize text-muted-foreground">
						{cover.status}
					</span>
				</div>
				<Input
					value={targetVoiceUrl}
					onChange={(event) => setTargetVoiceUrl(event.target.value)}
					placeholder="Target voice URL (optional)"
					aria-label="AI cover target voice URL"
				/>
				<input
					ref={targetVoiceInputRef}
					type="file"
					accept="audio/*"
					className="sr-only"
					onChange={(event) => setTargetVoiceFile(event.target.files?.[0])}
				/>
				<div className="flex items-center justify-between gap-2">
					<Button
						type="button"
						variant="text"
						size="sm"
						onClick={() => targetVoiceInputRef.current?.click()}
						onKeyDown={(event) => activateButtonFromKeyboard({ event })}
					>
						<Upload className="size-3.5" />
						<span className="max-w-28 truncate">
							{targetVoiceFile?.name ?? "Reference voice"}
						</span>
					</Button>
					<Button
						type="button"
						variant="default"
						size="sm"
						disabled={coverBusy}
						onClick={() => void runCover()}
						onKeyDown={(event) => activateButtonFromKeyboard({ event })}
					>
						{coverBusy ? (
							<LoaderCircle className="size-3.5 animate-spin" />
						) : (
							<Mic2 className="size-3.5" />
						)}
						{cover.status === "ready" ? "Regenerate" : "Generate cover"}
					</Button>
				</div>
				{cover.convertedVocalMediaId ? (
					<div className="flex items-center justify-between gap-2">
						<ToggleGroup
							type="single"
							value={cover.enabled ? "cover" : "original"}
							onValueChange={(value) => {
								if (value === "cover" || value === "original") {
									selectCoverSource({ value });
								}
							}}
							variant="outline"
							size="sm"
							aria-label="AI cover result source"
						>
							<ToggleGroupItem value="original" className="h-7 text-[10px]">
								Original
							</ToggleGroupItem>
							<ToggleGroupItem value="cover" className="h-7 text-[10px]">
								Cover
							</ToggleGroupItem>
						</ToggleGroup>
						<Button
							type="button"
							variant="text"
							size="icon"
							className="size-7"
							aria-label="Remove AI cover result"
							title="Remove AI cover result"
							onClick={removeCoverResult}
							onKeyDown={(event) => activateButtonFromKeyboard({ event })}
						>
							<Trash2 className="size-3.5" />
						</Button>
					</div>
				) : null}
				{cover.targetVoiceLabel ? (
					<p className="text-[10px] text-muted-foreground">
						Voice: {cover.targetVoiceLabel}
					</p>
				) : null}
				{cover.error ? (
					<p className="text-[10px] text-destructive">{cover.error}</p>
				) : null}
			</section>
		</div>
	);
}
