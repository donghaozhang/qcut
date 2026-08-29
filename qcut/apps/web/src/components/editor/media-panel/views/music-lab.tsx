import {
	Crown,
	Database,
	Disc3,
	Download,
	FolderOpen,
	Loader2,
	LockKeyhole,
	Pause,
	Play,
	RefreshCw,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	JianyingMusicLabBatchResult,
	JianyingMusicLabListResult,
	JianyingMusicLabTrackSummary,
} from "@/types/electron";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ALL_GENRES = "__all__";

function formatDuration({ seconds }: { seconds: number }) {
	const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	const roundedSeconds = Math.round(safeSeconds);
	const minutes = Math.floor(roundedSeconds / 60);
	const remainder = roundedSeconds % 60;
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatBytes({ bytes }: { bytes: number }) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesQuery({
	track,
	query,
}: {
	track: JianyingMusicLabTrackSummary;
	query: string;
}) {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return true;
	return [track.title, track.author, track.album, ...track.genres]
		.join(" ")
		.toLocaleLowerCase()
		.includes(normalized);
}

function MusicLabTrackCard({
	isLoading,
	isPlaying,
	onTogglePlayback,
	track,
}: {
	isLoading: boolean;
	isPlaying: boolean;
	onTogglePlayback: () => void;
	track: JianyingMusicLabTrackSummary;
}) {
	const { t } = useTranslation();
	const playLabel = isPlaying
		? t("audioLibrary.musicLab.stopPreview")
		: t("audioLibrary.musicLab.playPreview");
	return (
		<article className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/70 p-2">
			<div className="flex size-14 shrink-0 items-center justify-center rounded bg-foreground/5 text-muted-foreground">
				<Disc3 className="size-5">
					<title>{t("audioLibrary.section.musicLab")}</title>
				</Disc3>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate text-[11px] font-medium" title={track.title}>
							{track.title}
						</p>
						<p
							className="truncate text-[9px] text-muted-foreground"
							title={track.author}
						>
							{track.author}
						</p>
					</div>
					<Button
						type="button"
						variant={isPlaying ? "secondary" : "text"}
						size="icon"
						className="size-7 shrink-0"
						aria-label={playLabel}
						title={playLabel}
						disabled={isLoading}
						onClick={onTogglePlayback}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onTogglePlayback();
							}
						}}
					>
						{isLoading ? (
							<Loader2 className="size-3.5 animate-spin">
								<title>{t("audioLibrary.musicLab.loadingTrack")}</title>
							</Loader2>
						) : isPlaying ? (
							<Pause className="size-3.5">
								<title>{playLabel}</title>
							</Pause>
						) : (
							<Play className="size-3.5">
								<title>{playLabel}</title>
							</Play>
						)}
					</Button>
				</div>
				<div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[8px] text-muted-foreground">
					<span>{formatDuration({ seconds: track.durationSeconds })}</span>
					<span>{formatBytes({ bytes: track.byteSize })}</span>
					{track.genres.slice(0, 2).map((genre) => (
						<span
							key={genre}
							className="rounded-sm bg-foreground/5 px-1 py-0.5"
						>
							{genre}
						</span>
					))}
					{track.paidType ? (
						<span className="flex items-center gap-0.5 rounded-sm bg-amber-400/10 px-1 py-0.5 text-amber-300">
							<Crown className="size-2.5" />
							{t("audioLibrary.musicLab.member")}
						</span>
					) : null}
					{track.copyrighted ? (
						<span className="flex items-center gap-0.5 rounded-sm bg-rose-400/10 px-1 py-0.5 text-rose-300">
							<LockKeyhole className="size-2.5" />
							{t("audioLibrary.musicLab.copyrighted")}
						</span>
					) : null}
				</div>
			</div>
		</article>
	);
}

export function MusicLabPanel({
	error,
	isBatchCaching,
	isLoading,
	loadTrack,
	onBeforePlay,
	onCacheNextBatch,
	onRefresh,
	onRevealCache,
	result,
}: {
	error: string | null;
	isBatchCaching: boolean;
	isLoading: boolean;
	loadTrack: ({ trackId }: { trackId: string }) => Promise<{
		mimeType: "audio/mpeg" | "audio/mp4";
		bytes: Uint8Array;
	}>;
	onBeforePlay: () => void;
	onCacheNextBatch: () => Promise<JianyingMusicLabBatchResult>;
	onRefresh: () => Promise<void>;
	onRevealCache: () => Promise<boolean>;
	result: JianyingMusicLabListResult;
}) {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [genre, setGenre] = useState(ALL_GENRES);
	const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
	const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const playbackVersion = useRef(0);

	const stopPlayback = useCallback(() => {
		playbackVersion.current += 1;
		audioRef.current?.pause();
		audioRef.current = null;
		if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		objectUrlRef.current = null;
		setPlayingTrackId(null);
		setLoadingTrackId(null);
	}, []);

	useEffect(() => stopPlayback, [stopPlayback]);

	const genres = useMemo(
		() =>
			[...new Set(result.tracks.flatMap((track) => track.genres))].sort(
				(left, right) => left.localeCompare(right)
			),
		[result.tracks]
	);
	const visibleTracks = useMemo(
		() =>
			result.tracks.filter(
				(track) =>
					(genre === ALL_GENRES || track.genres.includes(genre)) &&
					matchesQuery({ track, query })
			),
		[genre, query, result.tracks]
	);

	const togglePlayback = useCallback(
		async ({ track }: { track: JianyingMusicLabTrackSummary }) => {
			if (playingTrackId === track.trackId) {
				stopPlayback();
				return;
			}
			stopPlayback();
			onBeforePlay();
			const version = playbackVersion.current + 1;
			playbackVersion.current = version;
			setLoadingTrackId(track.trackId);
			try {
				const loaded = await loadTrack({ trackId: track.trackId });
				if (playbackVersion.current !== version) return;
				const bytes = new Uint8Array(loaded.bytes);
				const objectUrl = URL.createObjectURL(
					new Blob([bytes.buffer], { type: loaded.mimeType })
				);
				const audio = new Audio(objectUrl);
				objectUrlRef.current = objectUrl;
				audioRef.current = audio;
				audio.onended = stopPlayback;
				audio.onerror = () => {
					stopPlayback();
					toast.error(t("audioLibrary.musicLab.playFailed"));
				};
				await audio.play();
				if (playbackVersion.current !== version) {
					stopPlayback();
					return;
				}
				setLoadingTrackId(null);
				setPlayingTrackId(track.trackId);
			} catch (playError) {
				console.error(
					"[JianyingMusicLab] Failed to preview cached track",
					playError
				);
				stopPlayback();
				toast.error(t("audioLibrary.musicLab.playFailed"));
			}
		},
		[loadTrack, onBeforePlay, playingTrackId, stopPlayback, t]
	);

	const refresh = async () => {
		stopPlayback();
		await onRefresh();
		setGenre(ALL_GENRES);
	};

	const revealCache = async () => {
		if (!(await onRevealCache())) {
			toast.error(t("audioLibrary.musicLab.revealFailed"));
		}
	};

	const cacheNextBatch = async () => {
		stopPlayback();
		try {
			const batchResult = await onCacheNextBatch();
			const { batch } = batchResult;
			if (batch.attemptedCount === 0) {
				toast.info(t("audioLibrary.musicLab.noFreshCandidates"));
				return;
			}
			if (batch.failedCount > 0) {
				toast.warning(
					t("audioLibrary.musicLab.batchPartial", {
						count: batch.newTrackCount,
						failed: batch.failedCount,
					})
				);
				return;
			}
			toast.success(
				t("audioLibrary.musicLab.batchSuccess", {
					count: batch.newTrackCount,
				})
			);
		} catch {
			toast.error(t("audioLibrary.musicLab.batchFailed"));
		}
	};

	return (
		<section
			className="flex min-w-0 flex-1 flex-col pb-[62px]"
			data-testid="music-lab"
		>
			<div className="shrink-0 border-b border-border/60 p-3">
				<div className="flex min-w-0 items-start justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
							<Disc3 className="size-3.5">
								<title>{t("audioLibrary.section.musicLab")}</title>
							</Disc3>
						</span>
						<div className="min-w-0">
							<h2 className="text-xs font-semibold">
								{t("audioLibrary.section.musicLab")}
							</h2>
							<p className="text-[9px] text-muted-foreground">
								{t("audioLibrary.musicLab.summary", {
									count: result.stats.cachedTrackCount,
								})}
							</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Button
							type="button"
							variant="default"
							size="sm"
							className="h-7 gap-1 px-2 text-[9px]"
							disabled={isLoading || isBatchCaching}
							onClick={() => void cacheNextBatch()}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									void cacheNextBatch();
								}
							}}
						>
							{isBatchCaching ? (
								<Loader2 className="size-3 animate-spin" />
							) : (
								<Download className="size-3" />
							)}
							{isBatchCaching
								? t("audioLibrary.musicLab.cachingBatch")
								: t("audioLibrary.musicLab.cacheNextBatch")}
						</Button>
						<Button
							type="button"
							variant="text"
							size="icon"
							className="size-7"
							aria-label={t("audioLibrary.musicLab.openCache")}
							title={t("audioLibrary.musicLab.openCache")}
							disabled={isLoading || result.stats.cachedTrackCount === 0}
							onClick={() => void revealCache()}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									void revealCache();
								}
							}}
						>
							<FolderOpen className="size-3.5">
								<title>{t("audioLibrary.musicLab.openCache")}</title>
							</FolderOpen>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 gap-1 px-2 text-[9px]"
							disabled={isLoading || isBatchCaching}
							onClick={() => void refresh()}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									void refresh();
								}
							}}
						>
							<RefreshCw
								className={cn("size-3", isLoading && "animate-spin")}
							/>
							{t("audioLibrary.musicLab.refresh")}
						</Button>
					</div>
				</div>

				<div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
					<span className="flex items-center gap-1 text-cyan-300">
						<Database className="size-3" />
						{t("audioLibrary.musicLab.matched", {
							count: result.stats.matchedTrackCount,
						})}
					</span>
					<span>
						{t("audioLibrary.musicLab.unmatched", {
							count: result.stats.unmatchedDownloadCount,
						})}
					</span>
					<span className="text-amber-300">
						{t("audioLibrary.musicLab.internalReference")}
					</span>
				</div>
				{result.latestBatch ? (
					<p className="mt-1 text-[9px] text-muted-foreground">
						{t("audioLibrary.musicLab.latestBatch", {
							count: result.latestBatch.newTrackCount,
							remaining: result.latestBatch.remainingEligibleCount,
						})}
					</p>
				) : null}

				<div className="relative mt-3 min-w-0">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground">
						<title>{t("audioLibrary.musicLab.searchLabel")}</title>
					</Search>
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("audioLibrary.musicLab.search")}
						aria-label={t("audioLibrary.musicLab.searchLabel")}
						className="h-8 pl-8 text-xs"
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				<aside className="w-[104px] shrink-0 border-r border-border/60 bg-panel-accent/40">
					<ScrollArea className="h-full">
						<div className="space-y-0.5 p-2 pb-10">
							{[
								{ id: ALL_GENRES, label: t("audioLibrary.musicLab.allGenres") },
								...genres.map((genreName) => ({
									id: genreName,
									label: genreName,
								})),
							].map((item) => (
								<button
									type="button"
									key={item.id}
									className={cn(
										"flex min-h-7 w-full items-center rounded px-2 text-left text-[9px] transition-colors",
										genre === item.id
											? "bg-primary/15 text-primary"
											: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
									)}
									aria-pressed={genre === item.id}
									onClick={() => setGenre(item.id)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setGenre(item.id);
										}
									}}
								>
									<span className="break-words">{item.label}</span>
								</button>
							))}
						</div>
					</ScrollArea>
				</aside>

				<ScrollArea className="min-h-0 flex-1">
					<div className="p-3">
						{isLoading && result.tracks.length === 0 ? (
							<div className="flex h-48 items-center justify-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								{t("audioLibrary.musicLab.loading")}
							</div>
						) : error && result.tracks.length === 0 ? (
							<div className="flex h-48 items-center justify-center px-6 text-center text-xs text-destructive">
								{error}
							</div>
						) : visibleTracks.length === 0 ? (
							<div className="flex h-48 items-center justify-center px-6 text-center text-xs text-muted-foreground">
								{result.tracks.length === 0
									? t("audioLibrary.musicLab.emptyCache")
									: t("audioLibrary.empty")}
							</div>
						) : (
							<>
								<div className="mb-2 text-[10px] text-muted-foreground">
									{t("audioLibrary.resultCount", {
										count: visibleTracks.length,
									})}
								</div>
								<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
									{visibleTracks.map((track) => (
										<MusicLabTrackCard
											key={track.trackId}
											isLoading={loadingTrackId === track.trackId}
											isPlaying={playingTrackId === track.trackId}
											onTogglePlayback={() => void togglePlayback({ track })}
											track={track}
										/>
									))}
								</div>
							</>
						)}
					</div>
				</ScrollArea>
			</div>
		</section>
	);
}
