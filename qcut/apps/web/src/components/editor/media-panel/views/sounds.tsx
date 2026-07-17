import { assetManifestVersionKey } from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import {
	AudioWaveform,
	Clock3,
	Download,
	FileMusic,
	Heart,
	ListFilter,
	Mic2,
	Music2,
	Search,
	Sparkles,
	Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAudioLibrarySearch } from "@/hooks/media/use-audio-library-search";
import { useAudioCdnCatalog } from "@/hooks/media/use-audio-cdn-catalog";
import { useAudioPreview } from "@/hooks/media/use-audio-preview";
import {
	AUDIO_LIBRARY_CATEGORIES,
	BUILT_IN_AUDIO,
	MUSIC_CATEGORIES,
	SOUND_EFFECT_CATEGORIES,
	findAudioLibraryCategory,
	getCatalogAudio,
	restoreSavedAudio,
	translateAudioSearchQuery,
	type AudioLibraryCategory,
	type AudioLibrarySectionId,
} from "@/lib/audio/audio-library-catalog";
import { createAudioLibraryAssetEntry } from "@/lib/assets/freesound-asset";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { projectAudioToSound } from "@/lib/audio/ai-music";
import {
	AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT,
	audioLibraryAssetKey,
} from "@/lib/audio/audio-library-personal";
import { buildProjectAudioRecommendations } from "@/lib/audio/audio-project-recommendations";
import {
	analyzeProjectAudioVisuals,
	createProjectVideoAnalyzer,
	getReferencedProjectVideoMedia,
	type ProjectVideoAnalyzer,
} from "@/lib/audio/audio-project-vision";
import { useMediaStore } from "@/stores/media/media-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { SoundEffect } from "@/types/sounds";
import { AIVoiceView } from "./sounds-ai-voice";
import { AiMusicView } from "./sounds-ai-music";
import { AudioPreviewPlayer } from "./audio-preview-player";
import { AudioLibraryItem, type AudioAssetKind } from "./sounds-audio-item";
import { AudioFoldersSidebar } from "./sounds-folders-sidebar";
import { ProjectAudioRecommendationSummary } from "./sounds-project-recommendations";

interface SidebarItem {
	id: AudioLibrarySectionId;
	labelKey: TranslationKey;
	icon?: ReactNode;
}

const MY_LIBRARY_ITEMS: readonly SidebarItem[] = [
	{
		id: "favorites",
		labelKey: "audioLibrary.section.favorites",
		icon: <Heart className="size-3" />,
	},
	{
		id: "recent",
		labelKey: "audioLibrary.section.recent",
		icon: <Clock3 className="size-3" />,
	},
	{
		id: "downloads",
		labelKey: "audioLibrary.section.downloads",
		icon: <Download className="size-3" />,
	},
	{
		id: "project-audio",
		labelKey: "audioLibrary.section.projectAudio",
		icon: <FileMusic className="size-3" />,
	},
	{
		id: "project-recommended",
		labelKey: "audioLibrary.section.projectRecommended",
		icon: <Sparkles className="size-3" />,
	},
	{
		id: "ai-music",
		labelKey: "audioLibrary.section.aiMusic",
		icon: <Sparkles className="size-3" />,
	},
	{
		id: "ai-voice",
		labelKey: "audioLibrary.section.aiVoice",
		icon: <Mic2 className="size-3" />,
	},
] as const;

function mergeUniqueAudio({
	primary,
	secondary,
}: {
	primary: readonly SoundEffect[];
	secondary: readonly SoundEffect[];
}): SoundEffect[] {
	const seen = new Set(primary.map((sound) => sound.id));
	return [...primary, ...secondary.filter((sound) => !seen.has(sound.id))];
}

function matchesAudioQuery({
	sound,
	query,
}: {
	sound: SoundEffect;
	query: string;
}): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return true;
	return [
		sound.name,
		sound.localizedName,
		sound.description,
		sound.localizedDescription,
		sound.username,
		...sound.tags,
		...(sound.moods ?? []),
		...(sound.scenes ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLocaleLowerCase()
		.includes(normalized);
}

function SidebarButton({
	active,
	icon,
	label,
	onSelect,
}: {
	active: boolean;
	icon?: ReactNode;
	label: string;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-[10px] transition-colors",
				active
					? "bg-primary/15 text-primary"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
			)}
			aria-pressed={active}
			title={label}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect();
				}
			}}
		>
			{icon}
			<span className="truncate">{label}</span>
		</button>
	);
}

function CategoryList({
	title,
	icon,
	categories,
	activeSection,
	onSelect,
}: {
	title: string;
	icon: ReactNode;
	categories: readonly AudioLibraryCategory[];
	activeSection: AudioLibrarySectionId;
	onSelect: ({ section }: { section: AudioLibrarySectionId }) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="mt-3">
			<div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium text-foreground">
				{icon}
				<span>{title}</span>
			</div>
			<div className="space-y-0.5">
				{categories.map((category) => (
					<SidebarButton
						key={category.id}
						active={activeSection === category.id}
						label={t(category.labelKey)}
						onSelect={() => onSelect({ section: category.id })}
					/>
				))}
			</div>
		</div>
	);
}

function isKnownCategory({ section }: { section: AudioLibrarySectionId }) {
	return AUDIO_LIBRARY_CATEGORIES.some((category) => category.id === section);
}

export function SoundsView() {
	const { t } = useTranslation();
	const activeSection = useMediaPanelStore((state) => state.activeSoundsTab);
	const setActiveSection = useMediaPanelStore(
		(state) => state.setActiveSoundsTab
	);
	const setActiveTab = useMediaPanelStore((state) => state.setActiveTab);
	const [query, setQuery] = useState("");
	const [commercialOnly, setCommercialOnly] = useState(true);
	const [continuousPlayback, setContinuousPlayback] = useState(false);
	const [isPlacingSuggestions, setIsPlacingSuggestions] = useState(false);
	const [isAnalyzingVisuals, setIsAnalyzingVisuals] = useState(false);
	const playNextRef = useRef<
		(({ sound }: { sound: SoundEffect }) => void) | undefined
	>(undefined);
	const savedSounds = useSoundsStore((state) => state.savedSounds);
	const recentSounds = useSoundsStore((state) => state.recentSounds);
	const audioFolders = useSoundsStore((state) => state.audioFolders);
	const loadSavedSounds = useSoundsStore((state) => state.loadSavedSounds);
	const reloadPersonalLibrary = useSoundsStore(
		(state) => state.reloadPersonalLibrary
	);
	const toggleSavedSound = useSoundsStore((state) => state.toggleSavedSound);
	const toggleSoundInFolder = useSoundsStore(
		(state) => state.toggleSoundInFolder
	);
	const createAudioFolder = useSoundsStore((state) => state.createAudioFolder);
	const renameAudioFolder = useSoundsStore((state) => state.renameAudioFolder);
	const deleteAudioFolder = useSoundsStore((state) => state.deleteAudioFolder);
	const markSoundRecent = useSoundsStore((state) => state.markSoundRecent);
	const addSoundCuesToTimeline = useSoundsStore(
		(state) => state.addSoundCuesToTimeline
	);
	const runtimeByAssetKey = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey
	);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const updateMediaItem = useMediaStore((state) => state.updateMediaItem);
	const tracks = useTimelineStore((state) => state.tracks);
	const activeProject = useProjectStore((state) => state.activeProject);
	const projectName = activeProject?.name ?? "";
	const analyzeVideo = useMemo<ProjectVideoAnalyzer | undefined>(() => {
		try {
			return createProjectVideoAnalyzer({
				run: platform().claude?.analyze.run,
			});
		} catch {
			return undefined;
		}
	}, []);
	const referencedVideoMedia = useMemo(
		() => getReferencedProjectVideoMedia({ mediaItems, tracks }),
		[mediaItems, tracks]
	);
	const preview = useAudioPreview({
		onEnded: ({ sound }) => playNextRef.current?.({ sound }),
	});
	const category = findAudioLibraryCategory({ categoryId: activeSection });
	const catalogActive = isKnownCategory({ section: activeSection });
	// Personal sections (favorites, recents, folders) have no catalog category;
	// untyped legacy items there default to sound effects, never to the
	// fallback music category.
	const fallbackKind: AudioAssetKind = catalogActive
		? category.kind
		: "sound-effect";
	const externalQuery = query.trim()
		? translateAudioSearchQuery({ query })
		: category.query;
	const {
		results: remoteResults,
		isLoading,
		isLoadingMore,
		error,
		hasNextPage,
		loadMore,
	} = useAudioLibrarySearch({
		query: externalQuery,
		type: category.kind === "music" ? "songs" : "effects",
		commercialOnly,
		sort: query.trim() ? "score" : category.sort,
		enabled: catalogActive,
		pageSize: 24,
	});

	useEffect(() => {
		void loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		window.addEventListener(
			AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT,
			reloadPersonalLibrary
		);
		return () =>
			window.removeEventListener(
				AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT,
				reloadPersonalLibrary
			);
	}, [reloadPersonalLibrary]);

	const cdnTracks = useAudioCdnCatalog();
	const builtInResults = useMemo(
		() =>
			getCatalogAudio({
				category,
				query,
				catalog: mergeUniqueAudio({
					primary: BUILT_IN_AUDIO,
					secondary: cdnTracks,
				}),
			}),
		[category, cdnTracks, query]
	);
	const catalogResults = useMemo(
		() =>
			mergeUniqueAudio({ primary: builtInResults, secondary: remoteResults }),
		[builtInResults, remoteResults]
	);
	const projectItems = useMemo(
		() =>
			mediaItems
				.filter((mediaItem) => mediaItem.type === "audio")
				.map((mediaItem) => projectAudioToSound({ mediaItem })),
		[mediaItems]
	);
	const projectItemsByMediaId = useMemo(
		() => new Map(projectItems.map((sound) => [sound.mediaId, sound])),
		[projectItems]
	);
	const savedItems = useMemo(
		() =>
			savedSounds.map((savedSound) =>
				savedSound.mediaId
					? (projectItemsByMediaId.get(savedSound.mediaId) ??
						restoreSavedAudio({ savedSound }))
					: restoreSavedAudio({ savedSound })
			),
		[projectItemsByMediaId, savedSounds]
	);
	const recentItems = useMemo(
		() =>
			recentSounds.map((savedSound) =>
				savedSound.mediaId
					? (projectItemsByMediaId.get(savedSound.mediaId) ??
						restoreSavedAudio({ savedSound }))
					: restoreSavedAudio({ savedSound })
			),
		[projectItemsByMediaId, recentSounds]
	);
	const downloadedItems = useMemo(() => {
		const knownRemote = mergeUniqueAudio({
			primary: savedItems,
			secondary: recentItems,
		}).filter((sound) => {
			const kind = sound.kind ?? "sound-effect";
			const asset = createAudioLibraryAssetEntry({ sound, kind });
			const key = assetManifestVersionKey({
				kind: asset.kind,
				id: asset.id,
				version: asset.version,
			});
			return runtimeByAssetKey[key]?.cacheStatus === "cached";
		});
		return mergeUniqueAudio({
			primary: BUILT_IN_AUDIO,
			secondary: knownRemote,
		});
	}, [recentItems, runtimeByAssetKey, savedItems]);
	const projectRecommendations = useMemo(
		() =>
			buildProjectAudioRecommendations({
				catalog: BUILT_IN_AUDIO,
				mediaItems,
				projectName,
				tracks,
			}),
		[mediaItems, projectName, tracks]
	);
	const activeFolder = activeSection.startsWith("audio-folder:")
		? audioFolders.find(
				(folder) => folder.id === activeSection.slice("audio-folder:".length)
			)
		: undefined;
	const folderItems = useMemo(() => {
		if (!activeFolder) return [];
		const folderAssetKeys = new Set(activeFolder.assetKeys);
		return savedItems.filter((sound) =>
			folderAssetKeys.has(
				audioLibraryAssetKey({
					kind: sound.kind ?? "sound-effect",
					id: sound.id,
				})
			)
		);
	}, [activeFolder, savedItems]);
	const personalItems = useMemo(() => {
		const source =
			activeSection === "favorites"
				? savedItems
				: activeSection === "recent"
					? recentItems
					: activeSection === "project-audio"
						? projectItems
						: activeSection === "project-recommended"
							? projectRecommendations.sounds
							: activeSection.startsWith("audio-folder:")
								? folderItems
								: downloadedItems;
		return source.filter((sound) => matchesAudioQuery({ sound, query }));
	}, [
		activeSection,
		downloadedItems,
		folderItems,
		projectItems,
		projectRecommendations.sounds,
		query,
		recentItems,
		savedItems,
	]);
	const displayedItems = catalogActive ? catalogResults : personalItems;
	const title = catalogActive
		? t(category.labelKey)
		: activeSection === "favorites"
			? t("audioLibrary.section.favorites")
			: activeSection === "recent"
				? t("audioLibrary.section.recent")
				: activeSection === "project-audio"
					? t("audioLibrary.section.projectAudio")
					: activeSection === "project-recommended"
						? t("audioLibrary.section.projectRecommended")
						: (activeFolder?.name ?? t("audioLibrary.section.downloads"));

	const selectSection = ({ section }: { section: AudioLibrarySectionId }) => {
		setActiveSection(section);
		setQuery("");
	};

	useEffect(() => {
		if (activeSection.startsWith("audio-folder:") && !activeFolder) {
			setActiveSection("favorites");
			setQuery("");
		}
	}, [activeFolder, activeSection, setActiveSection]);
	const playSound = ({
		sound,
		kind,
	}: {
		sound: SoundEffect;
		kind: AudioAssetKind;
	}) => {
		markSoundRecent(sound, kind);
		void preview.togglePreview({ sound });
	};
	const autoPlaceSuggestedSfx = async () => {
		if (projectRecommendations.cues.length === 0 || isPlacingSuggestions)
			return;
		setIsPlacingSuggestions(true);
		try {
			const count = await addSoundCuesToTimeline({
				cues: projectRecommendations.cues.map((cue) => ({
					sound: cue.sound,
					kind: "sound-effect" as const,
					startTime: cue.time,
				})),
			});
			toast.success(t("audioLibrary.recommendation.placed", { count }));
		} catch {
			toast.error(t("audioLibrary.recommendation.placeFailed"));
		} finally {
			setIsPlacingSuggestions(false);
		}
	};
	const analyzeProjectVisuals = async () => {
		if (!activeProject || !analyzeVideo || isAnalyzingVisuals) return;
		setIsAnalyzingVisuals(true);
		try {
			const result = await analyzeProjectAudioVisuals({
				projectId: activeProject.id,
				mediaItems,
				tracks,
				analyzeVideo,
				updateMediaItem,
				force:
					projectRecommendations.visionAnalyzedCount > 0 &&
					projectRecommendations.visionAnalyzedCount ===
						referencedVideoMedia.length,
			});
			toast.success(
				t("audioLibrary.recommendation.visionAnalyzed", {
					count: result.total,
					events: result.eventCount,
				})
			);
		} catch {
			toast.error(t("audioLibrary.recommendation.visionFailed"));
		} finally {
			setIsAnalyzingVisuals(false);
		}
	};

	useEffect(() => {
		playNextRef.current = ({ sound }) => {
			if (!continuousPlayback) return;
			const currentIndex = displayedItems.findIndex(
				(item) => item.id === sound.id
			);
			const nextSound = displayedItems[currentIndex + 1];
			if (!nextSound) return;
			const nextKind = nextSound.kind ?? fallbackKind;
			markSoundRecent(nextSound, nextKind);
			void preview.togglePreview({ sound: nextSound });
		};
	}, [
		fallbackKind,
		continuousPlayback,
		displayedItems,
		markSoundRecent,
		preview.togglePreview,
	]);

	return (
		<div
			className="relative flex h-full min-h-0 bg-panel"
			data-testid="audio-library"
		>
			<aside className="w-[118px] shrink-0 border-r border-border/60 bg-panel-accent/40">
				<ScrollArea className="h-full">
					<div className="p-2 pb-20">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							className="mb-3 h-8 w-full justify-start px-2 text-[10px]"
							onClick={() => setActiveTab("media")}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									setActiveTab("media");
								}
							}}
						>
							<Upload className="size-3" />
							{t("audioLibrary.import")}
						</Button>

						<div className="mb-1 px-2 text-[9px] font-medium uppercase text-muted-foreground">
							{t("audioLibrary.my")}
						</div>
						<div className="space-y-0.5">
							{MY_LIBRARY_ITEMS.map((item) => (
								<SidebarButton
									key={item.id}
									active={activeSection === item.id}
									icon={item.icon}
									label={t(item.labelKey)}
									onSelect={() => selectSection({ section: item.id })}
								/>
							))}
						</div>

						<AudioFoldersSidebar
							activeSection={activeSection}
							folders={audioFolders}
							onSelect={selectSection}
							onCreate={({ name }) => {
								const folderId = createAudioFolder({ name });
								if (folderId) {
									selectSection({ section: `audio-folder:${folderId}` });
								}
								return folderId;
							}}
							onRename={renameAudioFolder}
							onDelete={deleteAudioFolder}
						/>

						<CategoryList
							title={t("audioLibrary.music")}
							icon={<Music2 className="size-3" />}
							categories={MUSIC_CATEGORIES}
							activeSection={activeSection}
							onSelect={selectSection}
						/>
						<CategoryList
							title={t("audioLibrary.soundEffects")}
							icon={<AudioWaveform className="size-3" />}
							categories={SOUND_EFFECT_CATEGORIES}
							activeSection={activeSection}
							onSelect={selectSection}
						/>
					</div>
				</ScrollArea>
			</aside>

			{activeSection === "ai-music" ? (
				<div className="min-w-0 flex-1 overflow-y-auto p-4 pb-20">
					<AiMusicView />
				</div>
			) : activeSection === "ai-voice" ? (
				<div className="min-w-0 flex-1 overflow-y-auto p-4 pb-20">
					<AIVoiceView />
				</div>
			) : (
				<section className="flex min-w-0 flex-1 flex-col pb-[62px]">
					<div className="shrink-0 border-b border-border/60 p-3">
						<div className="flex items-center gap-2">
							<div className="relative min-w-0 flex-1">
								<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder={t("audioLibrary.search.placeholder")}
									aria-label={t("audioLibrary.search.label")}
									className="h-8 pl-8 text-xs"
								/>
							</div>
							{catalogActive ? (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className={cn("size-8", commercialOnly && "text-primary")}
											aria-label={t("audioLibrary.license.filter")}
											title={t("audioLibrary.license.filter")}
										>
											<ListFilter className="size-3.5" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-56">
										<DropdownMenuCheckboxItem
											checked={commercialOnly}
											onCheckedChange={setCommercialOnly}
										>
											{t("audioLibrary.license.commercial")}
										</DropdownMenuCheckboxItem>
									</DropdownMenuContent>
								</DropdownMenu>
							) : null}
						</div>
						<div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
							<span className="font-medium text-foreground">{title}</span>
							<span>
								{t("audioLibrary.resultCount", {
									count:
										catalogActive && hasNextPage
											? `${displayedItems.length}+`
											: displayedItems.length,
								})}
							</span>
						</div>
					</div>

					<ScrollArea className="min-h-0 flex-1">
						<div className="p-3">
							{activeSection === "project-recommended" ? (
								<ProjectAudioRecommendationSummary
									recommendations={projectRecommendations}
									canAnalyzeVisuals={Boolean(
										activeProject &&
											analyzeVideo &&
											referencedVideoMedia.length > 0
									)}
									isAnalyzingVisuals={isAnalyzingVisuals}
									isPlacing={isPlacingSuggestions}
									onAnalyzeVisuals={() => void analyzeProjectVisuals()}
									onAutoPlace={() => void autoPlaceSuggestedSfx()}
								/>
							) : null}
							{error && displayedItems.length === 0 ? (
								<div className="mb-3 rounded border border-amber-400/35 bg-amber-400/10 p-3 text-xs text-amber-200">
									{t("audioLibrary.onlineUnavailable")}
								</div>
							) : null}
							{isLoading && displayedItems.length === 0 ? (
								<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
									{Array.from({ length: 6 }, (_, index) => (
										<div
											key={`audio-loading-${index}`}
											className="h-[92px] animate-pulse rounded-md border border-border/50 bg-foreground/5"
										/>
									))}
								</div>
							) : displayedItems.length > 0 ? (
								<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
									{displayedItems.map((sound) => {
										const kind = sound.kind ?? fallbackKind;
										return (
											<AudioLibraryItem
												key={`${kind}-${sound.id}`}
												sound={sound}
												assetKind={kind}
												folders={audioFolders}
												isPlaying={preview.playingId === sound.id}
												onPlay={() => playSound({ sound, kind })}
												onToggleSaved={() => void toggleSavedSound(sound, kind)}
												onToggleFolder={({ folderId }) =>
													void toggleSoundInFolder({ folderId, sound, kind })
												}
											/>
										);
									})}
								</div>
							) : (
								<div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
									{t("audioLibrary.empty")}
								</div>
							)}
							{catalogActive && hasNextPage ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-3 w-full"
									disabled={isLoadingMore}
									onClick={() => void loadMore()}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											void loadMore();
										}
									}}
								>
									{isLoadingMore
										? t("audioLibrary.loadingMore")
										: t("audioLibrary.loadMore")}
								</Button>
							) : null}
						</div>
					</ScrollArea>
				</section>
			)}

			{preview.playingSound ? (
				<AudioPreviewPlayer
					sound={preview.playingSound}
					isPlaying={preview.isPlaying}
					currentTime={preview.currentTime}
					duration={preview.duration}
					volume={preview.volume}
					continuousPlayback={continuousPlayback}
					onToggle={() => {
						const sound = preview.playingSound;
						if (sound) void preview.togglePreview({ sound });
					}}
					onSeek={preview.seek}
					onVolumeChange={preview.setVolume}
					onContinuousPlaybackChange={({ enabled }) =>
						setContinuousPlayback(enabled)
					}
					onClose={preview.stop}
				/>
			) : null}
		</div>
	);
}
