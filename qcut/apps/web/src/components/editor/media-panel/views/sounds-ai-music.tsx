import {
	FileMusic,
	ListPlus,
	Loader2,
	Music2,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAIPipeline } from "@/hooks/use-ai-pipeline";
import { buildAiMusicPrompt, importGeneratedMusic } from "@/lib/audio/ai-music";
import { useTranslation } from "@/lib/i18n";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { MediaItem } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useMediaPanelStore } from "../store";

const TARGET_DURATIONS = [15, 30, 60, 120] as const;

const BPM_MIN = 40;
const BPM_MAX = 220;
const BPM_DEFAULT = 100;

function clampBpm({ value }: { value: string }): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return BPM_DEFAULT;
	return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(parsed)));
}

type MusicModel = "minimax_music_v2_6" | "minimax_music_v2_5";

export function AiMusicView() {
	const { t } = useTranslation();
	const activeProject = useProjectStore((state) => state.activeProject);
	const setActiveSoundsTab = useMediaPanelStore(
		(state) => state.setActiveSoundsTab
	);
	const [style, setStyle] = useState("");
	const [mood, setMood] = useState("");
	const [scene, setScene] = useState("");
	const [targetDuration, setTargetDuration] = useState<number>(30);
	const [bpmInput, setBpmInput] = useState(String(BPM_DEFAULT));
	const [instrumental, setInstrumental] = useState(true);
	const [lyrics, setLyrics] = useState("");
	const [model, setModel] = useState<MusicModel>("minimax_music_v2_6");
	const [validationError, setValidationError] = useState<string>();
	const [generatedResult, setGeneratedResult] = useState<{
		projectId: string;
		mediaItem: MediaItem;
	}>();
	// Results stay bound to their originating project so a project switch
	// during generation cannot leak media into the newly opened project.
	const generatedMedia =
		generatedResult && generatedResult.projectId === activeProject?.id
			? generatedResult.mediaItem
			: undefined;
	const bpm = clampBpm({ value: bpmInput });
	const {
		generate,
		cancel,
		isAvailable,
		isChecked,
		isGenerating,
		progress,
		error: generationError,
	} = useAIPipeline();

	const handleGenerate = useCallback(async () => {
		if (!activeProject) {
			setValidationError(t("audioLibrary.error.noProject"));
			return;
		}
		if (!style.trim()) {
			setValidationError(t("audioLibrary.aiMusic.error.style"));
			return;
		}
		setValidationError(undefined);
		setGeneratedResult(undefined);
		const prompt = buildAiMusicPrompt({
			style,
			mood,
			scene,
			targetDuration,
			bpm,
		});
		const result = await generate({
			command: "generate-music",
			args: {
				text: prompt,
				model,
				instrumental,
				"sample-rate": 44_100,
				bitrate: 256_000,
				"audio-format": "mp3",
				...(!instrumental && lyrics.trim() ? { lyrics: lyrics.trim() } : {}),
			},
			projectId: activeProject.id,
			autoImport: false,
		});
		if (!result.success || !result.outputPath) return;
		try {
			const mediaItem = await importGeneratedMusic({
				projectId: activeProject.id,
				outputPath: result.outputPath,
				prompt,
				model,
				instrumental,
				targetDuration,
				bpm,
			});
			setGeneratedResult({ projectId: activeProject.id, mediaItem });
			toast.success(t("audioLibrary.aiMusic.toast.saved"));
		} catch (error) {
			setValidationError(
				error instanceof Error
					? error.message
					: t("audioLibrary.aiMusic.error.import")
			);
		}
	}, [
		activeProject,
		bpm,
		generate,
		instrumental,
		lyrics,
		model,
		mood,
		scene,
		style,
		t,
		targetDuration,
	]);

	const addGeneratedToTimeline = useCallback(() => {
		if (!generatedMedia) return;
		const success = useTimelineStore
			.getState()
			.addMediaAtTime(generatedMedia, usePlaybackStore.getState().currentTime);
		if (success) toast.success(t("audioLibrary.aiMusic.toast.timeline"));
	}, [generatedMedia, t]);

	const error = validationError ?? generationError;
	const unavailable = isChecked && !isAvailable;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
			<div className="flex items-center gap-2 border-b border-border/60 pb-3">
				<Sparkles className="size-4 text-primary" />
				<h2 className="text-sm font-semibold">
					{t("audioLibrary.aiMusic.title")}
				</h2>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5 sm:col-span-2">
					<Label htmlFor="ai-music-style" className="text-xs">
						{t("audioLibrary.aiMusic.style")}
					</Label>
					<Input
						id="ai-music-style"
						value={style}
						onChange={(event) => setStyle(event.target.value)}
						placeholder={t("audioLibrary.aiMusic.stylePlaceholder")}
						maxLength={140}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ai-music-mood" className="text-xs">
						{t("audioLibrary.aiMusic.mood")}
					</Label>
					<Input
						id="ai-music-mood"
						value={mood}
						onChange={(event) => setMood(event.target.value)}
						placeholder={t("audioLibrary.aiMusic.moodPlaceholder")}
						maxLength={80}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ai-music-scene" className="text-xs">
						{t("audioLibrary.aiMusic.scene")}
					</Label>
					<Input
						id="ai-music-scene"
						value={scene}
						onChange={(event) => setScene(event.target.value)}
						placeholder={t("audioLibrary.aiMusic.scenePlaceholder")}
						maxLength={80}
					/>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">
						{t("audioLibrary.aiMusic.duration")}
					</Label>
					<Select
						value={String(targetDuration)}
						onValueChange={(value) => setTargetDuration(Number(value))}
					>
						<SelectTrigger aria-label={t("audioLibrary.aiMusic.duration")}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TARGET_DURATIONS.map((duration) => (
								<SelectItem key={duration} value={String(duration)}>
									{duration}s
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ai-music-bpm" className="text-xs">
						{t("audioLibrary.aiMusic.bpm")}
					</Label>
					<Input
						id="ai-music-bpm"
						type="number"
						min={BPM_MIN}
						max={BPM_MAX}
						value={bpmInput}
						onChange={(event) => setBpmInput(event.target.value)}
						onBlur={() => setBpmInput(String(clampBpm({ value: bpmInput })))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">{t("audioLibrary.aiMusic.model")}</Label>
					<Select
						value={model}
						onValueChange={(value) => setModel(value as MusicModel)}
					>
						<SelectTrigger aria-label={t("audioLibrary.aiMusic.model")}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="minimax_music_v2_6">
								MiniMax Music v2.6
							</SelectItem>
							<SelectItem value="minimax_music_v2_5">
								MiniMax Music v2.5
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-end">
					<div className="flex h-9 w-full items-center justify-between rounded border border-border px-3">
						<Label htmlFor="ai-music-instrumental" className="text-xs">
							{t("audioLibrary.aiMusic.instrumental")}
						</Label>
						<Switch
							id="ai-music-instrumental"
							checked={instrumental}
							onCheckedChange={setInstrumental}
						/>
					</div>
				</div>
			</div>

			{instrumental ? null : (
				<div className="space-y-1.5">
					<Label htmlFor="ai-music-lyrics" className="text-xs">
						{t("audioLibrary.aiMusic.lyrics")}
					</Label>
					<Textarea
						id="ai-music-lyrics"
						value={lyrics}
						onChange={(event) => setLyrics(event.target.value)}
						placeholder={t("audioLibrary.aiMusic.lyricsPlaceholder")}
						maxLength={1000}
						className="min-h-28"
					/>
				</div>
			)}

			{isGenerating && progress ? (
				<div className="space-y-2" role="status">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>{progress.message}</span>
						<span>{Math.round(progress.percent)}%</span>
					</div>
					<Progress value={progress.percent} />
				</div>
			) : null}

			{error || unavailable ? (
				<p className="text-xs text-destructive" role="alert">
					{error ?? t("audioLibrary.aiMusic.error.unavailable")}
				</p>
			) : null}

			<div className="flex gap-2">
				<Button
					type="button"
					className="flex-1"
					disabled={isGenerating || unavailable || !isChecked}
					onClick={() => void handleGenerate()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							void handleGenerate();
						}
					}}
				>
					{isGenerating ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Music2 className="size-4" />
					)}
					{isGenerating
						? t("audioLibrary.aiMusic.generating")
						: t("audioLibrary.aiMusic.generate")}
				</Button>
				{isGenerating ? (
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={t("common.cancel")}
						title={t("common.cancel")}
						onClick={() => void cancel()}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								void cancel();
							}
						}}
					>
						<X className="size-4" />
					</Button>
				) : null}
			</div>

			{generatedMedia ? (
				<div className="flex items-center gap-3 rounded-md border border-emerald-500/35 bg-emerald-500/5 p-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded bg-emerald-700/45 text-emerald-200">
						<Music2 className="size-5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs font-medium">
							{generatedMedia.name}
						</p>
						<p className="text-[10px] text-muted-foreground">
							{Math.round(generatedMedia.duration ?? targetDuration)}s · {bpm}{" "}
							BPM
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={t("audioLibrary.card.addToTimeline")}
						title={t("audioLibrary.card.addToTimeline")}
						onClick={addGeneratedToTimeline}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								addGeneratedToTimeline();
							}
						}}
					>
						<ListPlus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={t("audioLibrary.section.projectAudio")}
						title={t("audioLibrary.section.projectAudio")}
						onClick={() => setActiveSoundsTab("project-audio")}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								setActiveSoundsTab("project-audio");
							}
						}}
					>
						<FileMusic className="size-4" />
					</Button>
				</div>
			) : null}
		</div>
	);
}
