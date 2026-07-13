import { Input } from "@/components/ui/input";
import { useEffect, useMemo, type UIEvent } from "react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { HeartIcon, ListFilter } from "lucide-react";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { useSoundSearch } from "@/hooks/media/use-sound-search";
import type { SoundEffect, SavedSound } from "@/types/sounds";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAudioPreview } from "@/hooks/media/use-audio-preview";
import { AIVoiceView } from "./sounds-ai-voice";
import {
	type SoundsPanelTab,
	useMediaPanelStore,
} from "@/components/editor/media-panel/store";
import { AudioLibraryItem } from "./sounds-audio-item";
import { SongsView } from "./sounds-songs";

const SOUND_EFFECT_CATEGORIES = [
	{ id: "whoosh", label: "Whoosh", query: "whoosh transition" },
	{ id: "impact", label: "Impact", query: "impact hit cinematic" },
	{ id: "ui", label: "UI", query: "interface click notification" },
	{ id: "foley", label: "Foley", query: "foley movement" },
	{ id: "nature", label: "Nature", query: "nature ambience" },
	{ id: "ambient", label: "Ambient", query: "ambient atmosphere" },
] as const;

export function SoundsView() {
	const activeSoundsTab = useMediaPanelStore((state) => state.activeSoundsTab);
	const setActiveSoundsTab = useMediaPanelStore(
		(state) => state.setActiveSoundsTab
	);
	return (
		<div className="flex h-full flex-col" data-testid="audio-library">
			<Tabs
				value={activeSoundsTab}
				onValueChange={(value) => setActiveSoundsTab(value as SoundsPanelTab)}
				className="flex flex-col h-full"
			>
				<div className="px-3 pt-4 pb-0">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger
							value="sound-effects"
							className="min-w-0 px-1 text-[11px]"
						>
							<span className="truncate">音效</span>
						</TabsTrigger>
						<TabsTrigger value="songs" className="min-w-0 px-1 text-[11px]">
							<span className="truncate">音乐</span>
						</TabsTrigger>
						<TabsTrigger value="ai-voice" className="min-w-0 px-1 text-[11px]">
							<span className="truncate">AI 配音</span>
						</TabsTrigger>
						<TabsTrigger value="saved" className="min-w-0 px-1 text-[11px]">
							<span className="truncate">收藏</span>
						</TabsTrigger>
					</TabsList>
				</div>
				<Separator className="my-4" />
				<TabsContent
					value="sound-effects"
					className="p-5 pt-0 mt-0 flex-1 flex flex-col min-h-0"
				>
					<SoundEffectsView />
				</TabsContent>
				<TabsContent
					value="saved"
					className="p-5 pt-0 mt-0 flex-1 flex flex-col min-h-0"
				>
					<SavedSoundsView />
				</TabsContent>
				<TabsContent
					value="ai-voice"
					className="p-5 pt-0 mt-0 flex-1 flex flex-col min-h-0"
				>
					<AIVoiceView />
				</TabsContent>
				<TabsContent
					value="songs"
					className="p-5 pt-0 mt-0 flex-1 flex flex-col min-h-0"
				>
					<SongsView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

/**
 * Renders the Sound Effects tab UI with search, filtering, infinite scrolling, and audio preview playback.
 *
 * Loads saved sounds on mount and restores the previous scroll position when available. Provides controls for searching sounds, toggling a commercial-license filter, paginating results via infinite scroll, playing sound previews (uses the platform abstraction to support local preview playback when available), and saving/unsaving sounds.
 *
 * @returns The rendered React element for the Sound Effects view.
 */
function SoundEffectsView() {
	const {
		topSoundEffects,
		isLoading,
		searchQuery,
		setSearchQuery,
		scrollPosition,
		setScrollPosition,
		loadSavedSounds,
		toggleSavedSound,
		showCommercialOnly,
		toggleCommercialFilter,
	} = useSoundsStore();
	const {
		results: searchResults,
		isLoading: isSearching,
		loadMore,
		hasNextPage,
		isLoadingMore,
		error: searchError,
	} = useSoundSearch(searchQuery, showCommercialOnly);
	const { playingId, togglePreview } = useAudioPreview();

	// Use infinite scroll hook
	const { scrollAreaRef, handleScroll: handleInfiniteScroll } =
		useInfiniteScroll({
			onLoadMore: loadMore,
			hasMore: hasNextPage,
			isLoading: isLoadingMore || isSearching,
			threshold: 200,
		});

	// Load saved sounds and restore scroll position when component mounts
	useEffect(() => {
		loadSavedSounds();

		if (scrollAreaRef.current && scrollPosition > 0) {
			const timeoutId = setTimeout(() => {
				const viewport = scrollAreaRef.current?.querySelector(
					"[data-radix-scroll-area-viewport]"
				) as HTMLElement;
				if (viewport) {
					viewport.scrollTop = scrollPosition;
				}
			}, 100); // Small delay to ensure content is rendered

			return () => clearTimeout(timeoutId);
		}
	}, [loadSavedSounds, scrollPosition, scrollAreaRef.current]); // Only run on mount

	// Track scroll position changes and handle infinite scroll
	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		const { scrollTop } = event.currentTarget;
		setScrollPosition(scrollTop);
		handleInfiniteScroll(event);
	};

	// Use your existing design, just swap the data source
	const displayedSounds = useMemo(() => {
		const sounds = searchQuery ? searchResults : topSoundEffects;
		return sounds;
	}, [searchQuery, searchResults, topSoundEffects]);

	return (
		<div className="flex h-full flex-col gap-3">
			<div className="shrink-0 space-y-2 border-b border-border/50 pb-3">
				<div className="flex items-center gap-2">
					<Input
						placeholder="Search sound effects"
						aria-label="Search sound effects"
						className="h-8 min-w-0 flex-1 bg-panel-accent text-xs"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className={cn("size-8", showCommercialOnly && "text-primary")}
								aria-label="Sound effect license filter"
								title="License filter"
							>
								<ListFilter className="size-4">
									<title>Filter sound effect licenses</title>
								</ListFilter>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuCheckboxItem
								checked={showCommercialOnly}
								onCheckedChange={toggleCommercialFilter}
							>
								Commercial use allowed
							</DropdownMenuCheckboxItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="grid grid-cols-3 gap-1">
					{SOUND_EFFECT_CATEGORIES.map((category) => (
						<button
							key={category.id}
							type="button"
							className={cn(
								"h-7 truncate rounded px-2 text-[10px] transition-colors",
								searchQuery === category.query
									? "bg-primary/15 text-primary"
									: "bg-foreground/5 text-muted-foreground hover:text-foreground"
							)}
							aria-pressed={searchQuery === category.query}
							onClick={() => setSearchQuery(category.query)}
							onKeyDown={(event) => {
								if (event.key === " ") {
									event.preventDefault();
									setSearchQuery(category.query);
								}
							}}
						>
							{category.label}
						</button>
					))}
				</div>
				<div className="text-[10px] text-muted-foreground">
					{showCommercialOnly ? "Commercial-safe results" : "All licenses"}
				</div>
			</div>

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ScrollArea
					className="flex-1 h-full"
					ref={scrollAreaRef}
					onScrollCapture={handleScroll}
				>
					<div className="flex flex-col pr-2">
						{isLoading && !searchQuery && (
							<div className="text-muted-foreground text-sm">
								Loading sounds...
							</div>
						)}
						{isSearching && searchQuery && (
							<div className="text-muted-foreground text-sm">Searching...</div>
						)}
						{searchError && searchQuery && (
							<div className="text-destructive text-sm">
								{searchError.includes("API key")
									? "API key not configured. Please add your Freesound API key to enable sound search."
									: `Search error: ${searchError}`}
							</div>
						)}
						{displayedSounds.map((sound) => (
							<AudioLibraryItem
								key={sound.id}
								sound={sound}
								assetKind="sound-effect"
								isPlaying={playingId === sound.id}
								onPlay={() => togglePreview({ sound })}
								onToggleSaved={() => toggleSavedSound(sound, "sound-effect")}
							/>
						))}
						{!isLoading &&
							!isSearching &&
							!searchError &&
							displayedSounds.length === 0 && (
								<div className="text-muted-foreground text-sm">
									{searchQuery
										? "No sounds found"
										: "Enter a search term to find sounds"}
								</div>
							)}
						{isLoadingMore && (
							<div className="text-muted-foreground text-sm text-center py-4">
								Loading more sounds...
							</div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

function savedSoundToEffect({
	savedSound,
}: {
	savedSound: SavedSound;
}): SoundEffect {
	return {
		id: savedSound.id,
		name: savedSound.name,
		description: "",
		url: "",
		previewUrl: savedSound.previewUrl,
		downloadUrl: savedSound.downloadUrl,
		duration: savedSound.duration,
		filesize: 0,
		type: "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: savedSound.username,
		tags: savedSound.tags,
		license: savedSound.license,
		created: savedSound.savedAt,
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	};
}

function SavedSoundsView() {
	const {
		savedSounds,
		isLoadingSavedSounds,
		savedSoundsError,
		loadSavedSounds,
		toggleSavedSound,
	} = useSoundsStore();
	const { playingId, togglePreview } = useAudioPreview();

	// Load saved sounds when tab becomes active
	useEffect(() => {
		loadSavedSounds();
	}, [loadSavedSounds]);

	if (isLoadingSavedSounds) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-muted-foreground text-sm">
					Loading saved sounds...
				</div>
			</div>
		);
	}

	if (savedSoundsError) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-destructive text-sm">
					Error: {savedSoundsError}
				</div>
			</div>
		);
	}

	if (savedSounds.length === 0) {
		return (
			<div className="bg-panel h-full p-4 flex flex-col items-center justify-center gap-3">
				<HeartIcon
					className="w-10 h-10 text-muted-foreground"
					strokeWidth={1.5}
				>
					<title>Saved sounds</title>
				</HeartIcon>
				<div className="flex flex-col gap-2 text-center">
					<p className="text-lg font-medium">No saved sounds</p>
					<p className="text-sm text-muted-foreground text-balance">
						Click the heart icon on any sound to save it here
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5 mt-1 h-full">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{savedSounds.length} saved{" "}
					{savedSounds.length === 1 ? "sound" : "sounds"}
				</p>
			</div>

			<div className="relative h-full overflow-hidden">
				<ScrollArea className="flex-1 h-full">
					<div className="flex flex-col gap-4">
						{savedSounds.map((savedSound) => {
							const sound = savedSoundToEffect({ savedSound });
							const assetKind = savedSound.kind ?? "sound-effect";
							return (
								<AudioLibraryItem
									key={`${assetKind}-${savedSound.id}`}
									sound={sound}
									assetKind={assetKind}
									isPlaying={playingId === savedSound.id}
									onPlay={() => togglePreview({ sound })}
									onToggleSaved={() => toggleSavedSound(sound, assetKind)}
								/>
							);
						})}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}
