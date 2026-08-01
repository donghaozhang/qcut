import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
} from "@qcut/editor-core";
import {
	Check,
	AudioLines,
	Copyright,
	Download,
	Flame,
	FolderPlus,
	Heart,
	Loader2,
	MoreHorizontal,
	Music2,
	Pause,
	Play,
	Repeat2,
	Volume2,
	Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createAudioLibraryAssetEntry } from "@/lib/assets/freesound-asset";
import AudioWaveform from "@/components/editor/audio-waveform";
import {
	audioArtworkSeed,
	renderAudioArtworkDataUrl,
} from "@/lib/audio/audio-artwork";
import {
	AUDIO_LIBRARY_DRAG_MIME,
	serializeAudioLibraryDrag,
} from "@/lib/audio/audio-library-drag";
import { localizeAudioLibraryTag } from "@/lib/audio/audio-library-catalog";
import {
	buildAudioAttribution,
	requiresAttribution,
} from "@/lib/audio/audio-attribution";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import type { AudioTimelineAddMode } from "@/stores/media/sounds-store";
import type { SoundEffect } from "@/types/sounds";
import type { AudioBeatAlignment } from "@/lib/audio/audio-library-placement";
import {
	audioLibraryAssetKey,
	type AudioLibraryFolder,
} from "@/lib/audio/audio-library-personal";

export type AudioAssetKind = "sound-effect" | "music";

const REMOTE_TRACK_URL_PATTERN = /^https?:/i;

interface AudioLibraryItemProps {
	sound: SoundEffect;
	assetKind: AudioAssetKind;
	isPlaying: boolean;
	folders: readonly AudioLibraryFolder[];
	onPlay: () => void;
	onToggleSaved: () => void;
	onToggleFolder: ({ folderId }: { folderId: string }) => void;
}

export function formatAudioDuration({
	duration,
}: {
	duration: number;
}): string {
	const roundedSeconds = Math.max(0, Math.round(duration));
	const minutes = Math.floor(roundedSeconds / 60);
	const seconds = String(roundedSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

const WAVEFORM_HEIGHTS = [35, 68, 48, 84, 55, 74, 42, 62, 32, 78];

export function AudioLibraryItem({
	sound,
	assetKind,
	folders,
	isPlaying,
	onPlay,
	onToggleFolder,
	onToggleSaved,
}: AudioLibraryItemProps) {
	const { locale, t } = useTranslation();
	const [isAdding, setIsAdding] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [artworkFailed, setArtworkFailed] = useState(false);
	const generatedArtworkUrl = useMemo(() => {
		if (sound.artworkUrl && !artworkFailed) return undefined;
		return renderAudioArtworkDataUrl({
			seed: audioArtworkSeed({ value: `${sound.id}:${sound.name}` }),
			colors: sound.artworkColors,
		});
	}, [
		artworkFailed,
		sound.artworkColors,
		sound.artworkUrl,
		sound.id,
		sound.name,
	]);
	const artworkUrl =
		sound.artworkUrl && !artworkFailed ? sound.artworkUrl : generatedArtworkUrl;
	// Hover-to-play: start the preview after a short dwell on the artwork so
	// browsing feels like JianYing without firing on incidental pointer moves.
	const hoverPlayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	);
	const cancelHoverPlay = useCallback(() => {
		if (hoverPlayTimerRef.current === undefined) return;
		clearTimeout(hoverPlayTimerRef.current);
		hoverPlayTimerRef.current = undefined;
	}, []);
	useEffect(() => cancelHoverPlay, [cancelHoverPlay]);
	const asset = useMemo(
		() => createAudioLibraryAssetEntry({ sound, kind: assetKind }),
		[assetKind, sound]
	);
	const identity = assetManifestIdentity({ kind: asset.kind, id: asset.id });
	const assetKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	const favorite = useAssetLibraryStore(
		(state) => state.favorites[identity] === true
	);
	const persistedRuntime = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey[assetKey]
	);
	const runtime = persistedRuntime ?? createInitialAssetRuntimeState({ asset });
	const addSoundToTimeline = useSoundsStore(
		(state) => state.addSoundToTimeline
	);
	const name =
		locale === "zh" ? (sound.localizedName ?? sound.name) : sound.name;
	const description =
		locale === "zh"
			? (sound.localizedDescription ?? sound.description)
			: sound.description;
	const colors = sound.artworkColors ?? ["#28465c", "#9ed7c7"];
	// Drawing a real waveform means downloading and decoding the entire track.
	// That is fine for a short bundled loop or something already cached, but a
	// grid of full-length remote songs would pull hundreds of megabytes just to
	// decorate a 28px strip — those keep the static bars until the audio is
	// local, at which point the waveform costs nothing extra.
	const isRemoteTrack = REMOTE_TRACK_URL_PATTERN.test(
		sound.previewUrl ?? sound.url ?? ""
	);
	const showRealWaveform =
		Boolean(sound.previewUrl) &&
		(!isRemoteTrack || runtime.cacheStatus === "cached");
	const licenseLabel = asset.license.spdxId ?? asset.license.name;
	const needsAttribution = requiresAttribution({ license: asset.license });
	const copyAttribution = useCallback(async () => {
		const credit = buildAudioAttribution({ sound, license: asset.license });
		try {
			await navigator.clipboard.writeText(credit);
			toast.success(t("audioLibrary.action.attributionCopied"));
		} catch {
			toast.error(t("audioLibrary.action.attributionCopyFailed"));
		}
	}, [asset.license, sound, t]);
	const localizedMoods = (sound.moods ?? []).map((mood) =>
		localizeAudioLibraryTag({ tag: mood, locale })
	);
	const localizedScenes = (sound.scenes ?? []).map((scene) =>
		localizeAudioLibraryTag({ tag: scene, locale })
	);
	const popularity = new Intl.NumberFormat(
		locale === "zh" ? "zh-CN" : "en-US",
		{ notation: "compact", maximumFractionDigits: 1 }
	).format(sound.downloads);
	const fullPopularity = new Intl.NumberFormat(
		locale === "zh" ? "zh-CN" : "en-US"
	).format(sound.downloads);
	const folderAssetKey = audioLibraryAssetKey({
		kind: assetKind,
		id: sound.id,
	});
	const isSoundEffectsLabReference = sound.source === "sound-effects-lab";

	const handleAdd = async ({
		mode = "single",
		autoDucking = false,
		beatAlignment,
	}: {
		mode?: AudioTimelineAddMode;
		autoDucking?: boolean;
		beatAlignment?: AudioBeatAlignment;
	} = {}) => {
		setIsAdding(true);
		try {
			await addSoundToTimeline({
				sound,
				kind: assetKind,
				mode,
				autoDucking,
				beatAlignment,
			});
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div
			className={cn(
				"group flex h-[106px] min-w-0 cursor-grab select-none gap-2 overflow-hidden rounded-md border border-border/60 bg-card p-2 transition-colors hover:border-primary/45 active:cursor-grabbing",
				isDragging && "border-primary/70 opacity-55"
			)}
			data-testid={`audio-library-item-${assetKind}-${sound.id}`}
			draggable={!isSoundEffectsLabReference}
			onDragStart={(event) => {
				if (isSoundEffectsLabReference) return;
				cancelHoverPlay();
				setIsDragging(true);
				event.dataTransfer.effectAllowed = "copy";
				event.dataTransfer.setData(
					AUDIO_LIBRARY_DRAG_MIME,
					serializeAudioLibraryDrag({
						payload: { sound, kind: assetKind },
					})
				);
				event.dataTransfer.setData("text/plain", name);
			}}
			onDragEnd={() => setIsDragging(false)}
		>
			<button
				type="button"
				className="relative flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				style={{ backgroundColor: colors[0], color: colors[1] }}
				aria-label={
					isPlaying
						? t("audioLibrary.card.pause", { name })
						: t("audioLibrary.card.preview", { name })
				}
				title={
					isPlaying
						? t("audioLibrary.player.pause")
						: t("audioLibrary.player.play")
				}
				onClick={() => {
					cancelHoverPlay();
					onPlay();
				}}
				onPointerEnter={() => {
					if (isPlaying) return;
					cancelHoverPlay();
					hoverPlayTimerRef.current = setTimeout(() => {
						hoverPlayTimerRef.current = undefined;
						onPlay();
					}, 550);
				}}
				onPointerLeave={cancelHoverPlay}
				onKeyDown={cancelHoverPlay}
			>
				{artworkUrl ? (
					<img
						src={artworkUrl}
						alt=""
						loading="lazy"
						draggable={false}
						className="absolute inset-0 size-full object-cover"
						data-testid={`audio-artwork-${assetKind}-${sound.id}`}
						onError={() => setArtworkFailed(true)}
					/>
				) : null}
				<div className="absolute inset-x-2 bottom-2 flex h-7 items-end justify-center gap-0.5 opacity-75">
					{WAVEFORM_HEIGHTS.map((height, index) => (
						<span
							key={`${sound.id}-wave-${index}`}
							className="w-0.5 rounded-full bg-current"
							style={{ height: `${height}%` }}
						/>
					))}
				</div>
				{showRealWaveform ? (
					<div className="pointer-events-none absolute inset-x-2 bottom-2 h-7 overflow-hidden">
						<AudioWaveform
							audioUrl={sound.previewUrl ?? ""}
							cacheKey={`audio-library:${assetKind}:${sound.id}`}
							height={28}
							className="w-full opacity-90"
							ariaLabel={t("audioLibrary.card.waveform", { name })}
							showStatus={false}
						/>
					</div>
				) : null}
				{assetKind === "music" ? (
					<Music2 className="absolute left-2 top-2 size-3.5 opacity-80" />
				) : (
					<Waves className="absolute left-2 top-2 size-3.5 opacity-80" />
				)}
				{sound.downloads > 0 ? (
					<span
						className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/45 px-1 py-0.5 text-[8px] tabular-nums"
						aria-label={t("audioLibrary.card.popularity", {
							count: fullPopularity,
						})}
						title={t("audioLibrary.card.popularity", {
							count: fullPopularity,
						})}
					>
						<Flame className="size-2.5" />
						{popularity}
					</span>
				) : null}
				<span className="relative flex size-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
					{isPlaying ? (
						<Pause className="size-3.5 fill-current" />
					) : (
						<Play className="size-3.5 fill-current" />
					)}
				</span>
			</button>

			<div className="flex min-w-0 flex-1 flex-col py-0.5">
				<div className="flex min-w-0 items-start gap-1">
					<div className="min-w-0 flex-1">
						<div className="truncate text-[11px] font-medium" title={name}>
							{name}
						</div>
						<div
							className="mt-0.5 truncate text-[9px] text-muted-foreground"
							title={description}
						>
							{description || sound.username}
						</div>
					</div>
					{isSoundEffectsLabReference ? null : (
						<Button
							type="button"
							variant="text"
							size="icon"
							className={cn(
								"-mr-1 -mt-1 size-7 text-muted-foreground",
								favorite && "text-rose-400"
							)}
							aria-label={
								favorite
									? t("audioLibrary.card.unfavorite", { name })
									: t("audioLibrary.card.favorite", { name })
							}
							title={
								favorite
									? t("audioLibrary.card.removeFavorite")
									: t("audioLibrary.card.addFavorite")
							}
							onClick={onToggleSaved}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggleSaved();
								}
							}}
						>
							<Heart className={cn("size-3.5", favorite && "fill-current")} />
						</Button>
					)}
				</div>
				{sound.musicalKey ||
				localizedMoods.length > 0 ||
				localizedScenes.length > 0 ? (
					<div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[8px] text-muted-foreground">
						{sound.musicalKey ? (
							<span
								className="shrink-0 rounded-sm border border-border/70 px-1 py-0.5"
								title={t("audioLibrary.card.key", {
									key: sound.musicalKey,
								})}
							>
								{sound.musicalKey}
							</span>
						) : null}
						{localizedMoods.length > 0 ? (
							<span
								className="max-w-14 truncate rounded-sm border border-border/70 px-1 py-0.5"
								title={t("audioLibrary.card.mood", {
									mood: localizedMoods.join(", "),
								})}
							>
								{localizedMoods[0]}
							</span>
						) : null}
						{localizedScenes.length > 0 ? (
							<span
								className="max-w-14 truncate rounded-sm border border-border/70 px-1 py-0.5"
								title={t("audioLibrary.card.scene", {
									scene: localizedScenes.join(", "),
								})}
							>
								{localizedScenes[0]}
							</span>
						) : null}
					</div>
				) : null}

				<div className="mt-auto flex min-w-0 items-center justify-between gap-1 text-[9px] text-muted-foreground">
					<div className="flex min-w-0 items-center gap-1.5">
						{sound.username && description ? (
							<span className="max-w-20 truncate" title={sound.username}>
								{sound.username}
							</span>
						) : null}
						<span className="tabular-nums">
							{formatAudioDuration({ duration: sound.duration })}
						</span>
						{sound.bpm ? <span>{sound.bpm} BPM</span> : null}
						{sound.loopable ? (
							<span className="text-emerald-400">
								{t("audioLibrary.card.loop")}
							</span>
						) : null}
						<span className="max-w-16 truncate" title={asset.license.name}>
							{licenseLabel}
						</span>
					</div>
					<div className="-mb-1 -mr-1 flex shrink-0 items-center">
						<Button
							type="button"
							variant="text"
							size="icon"
							className="size-7 shrink-0"
							disabled={isAdding}
							aria-label={t("audioLibrary.card.add", { name })}
							title={t("audioLibrary.card.addToTimeline")}
							onClick={() => void handleAdd()}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									void handleAdd();
								}
							}}
						>
							{isAdding || runtime.downloadStatus === "downloading" ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : sound.source === "project" ||
								runtime.cacheStatus === "cached" ? (
								<Check className="size-3.5 text-emerald-400" />
							) : (
								<Download className="size-3.5" />
							)}
						</Button>
						{(!isSoundEffectsLabReference && folders.length > 0) ||
						needsAttribution ||
						(assetKind === "music" && (sound.bpm || sound.loopable)) ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										variant="text"
										size="icon"
										className="size-7 shrink-0"
										disabled={isAdding}
										aria-label={t("audioLibrary.card.moreActions", {
											name,
										})}
										title={t("audioLibrary.card.moreActions", { name })}
									>
										<MoreHorizontal className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									{folders.length > 0 ? (
										<DropdownMenuSub>
											<DropdownMenuSubTrigger>
												<FolderPlus />
												{t("audioLibrary.folders.addTo")}
											</DropdownMenuSubTrigger>
											<DropdownMenuSubContent className="w-44">
												{folders.map((folder) => (
													<DropdownMenuCheckboxItem
														key={folder.id}
														checked={folder.assetKeys.includes(folderAssetKey)}
														onCheckedChange={() =>
															onToggleFolder({ folderId: folder.id })
														}
														onSelect={(event) => event.preventDefault()}
													>
														<span className="truncate">{folder.name}</span>
													</DropdownMenuCheckboxItem>
												))}
											</DropdownMenuSubContent>
										</DropdownMenuSub>
									) : null}
									{folders.length > 0 &&
									(needsAttribution ||
										(assetKind === "music" &&
											(sound.bpm || sound.loopable))) ? (
										<DropdownMenuSeparator />
									) : null}
									{needsAttribution ? (
										<DropdownMenuItem onSelect={() => void copyAttribution()}>
											<Copyright />
											{t("audioLibrary.action.copyAttribution")}
										</DropdownMenuItem>
									) : null}
									{needsAttribution &&
									assetKind === "music" &&
									(sound.bpm || sound.loopable) ? (
										<DropdownMenuSeparator />
									) : null}
									{sound.bpm ? (
										<DropdownMenuItem
											onSelect={() =>
												void handleAdd({ beatAlignment: "nearest" })
											}
										>
											<AudioLines />
											{t("audioLibrary.action.alignBeat")}
										</DropdownMenuItem>
									) : null}
									{sound.loopable ? (
										<DropdownMenuItem
											onSelect={() => void handleAdd({ mode: "fit-project" })}
										>
											<Repeat2 />
											{t("audioLibrary.action.fitProject")}
										</DropdownMenuItem>
									) : null}
									{sound.loopable ? (
										<DropdownMenuItem
											onSelect={() =>
												void handleAdd({
													mode: "fit-project",
													autoDucking: true,
												})
											}
										>
											<Volume2 />
											{t("audioLibrary.action.fitAndDuck")}
										</DropdownMenuItem>
									) : null}
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
