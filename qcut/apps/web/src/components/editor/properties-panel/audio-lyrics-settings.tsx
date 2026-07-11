import { FileText, ListMusic, LoaderCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useElevenLabsTranscription } from "@/hooks/media/use-elevenlabs-transcription";
import {
	buildKaraokeCaptionElements,
	retimeLyricsWords,
} from "@/lib/audio/audio-lyrics";
import { normalizeMediaAudioSettings } from "@/lib/audio/audio-properties";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { useProjectStore } from "@/stores/project-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import type { AudioLyricsWord, MediaElement } from "@/types/timeline";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";

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
	const lyrics = bindings.settings.lyrics;
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
		</div>
	);
}
