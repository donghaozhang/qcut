import { ListFilter, Search } from "lucide-react";
import { useState } from "react";
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
import { useAudioPreview } from "@/hooks/media/use-audio-preview";
import { cn } from "@/lib/utils";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { AudioLibraryItem } from "./sounds-audio-item";

const MUSIC_CATEGORIES = [
	{
		id: "cinematic",
		label: "Cinematic",
		query: "cinematic instrumental soundtrack",
	},
	{
		id: "upbeat",
		label: "Upbeat",
		query: "upbeat positive instrumental music",
	},
	{ id: "ambient", label: "Ambient", query: "ambient background music" },
	{ id: "acoustic", label: "Acoustic", query: "acoustic instrumental music" },
	{
		id: "electronic",
		label: "Electronic",
		query: "electronic instrumental music",
	},
	{ id: "lofi", label: "Lo-fi", query: "lofi chill instrumental" },
] as const;

export function SongsView() {
	const [query, setQuery] = useState("");
	const [categoryId, setCategoryId] = useState<string>(MUSIC_CATEGORIES[0].id);
	const [commercialOnly, setCommercialOnly] = useState(true);
	const category = MUSIC_CATEGORIES.find((item) => item.id === categoryId);
	const effectiveQuery =
		query.trim() || category?.query || "instrumental music";
	const {
		results,
		isLoading,
		isLoadingMore,
		error,
		hasNextPage,
		totalCount,
		loadMore,
	} = useAudioLibrarySearch({
		query: effectiveQuery,
		type: "songs",
		commercialOnly,
	});
	const { playingId, togglePreview } = useAudioPreview();
	const toggleSavedSound = useSoundsStore((state) => state.toggleSavedSound);

	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="songs-view">
			<div className="shrink-0 space-y-2 border-b border-border/50 pb-3">
				<div className="flex gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground">
							<title>Search music</title>
						</Search>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search music"
							aria-label="Search music"
							className="h-8 pl-8 text-xs"
						/>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className={cn("size-8", commercialOnly && "text-primary")}
								aria-label="Music license filter"
								title="License filter"
							>
								<ListFilter className="size-4">
									<title>Filter music licenses</title>
								</ListFilter>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuCheckboxItem
								checked={commercialOnly}
								onCheckedChange={setCommercialOnly}
							>
								Commercial use allowed
							</DropdownMenuCheckboxItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="grid grid-cols-3 gap-1">
					{MUSIC_CATEGORIES.map((item) => (
						<button
							key={item.id}
							type="button"
							className={cn(
								"h-7 truncate rounded px-2 text-[10px] transition-colors",
								categoryId === item.id && !query.trim()
									? "bg-primary/15 text-primary"
									: "bg-foreground/5 text-muted-foreground hover:text-foreground"
							)}
							aria-pressed={categoryId === item.id && !query.trim()}
							onClick={() => {
								setCategoryId(item.id);
								setQuery("");
							}}
							onKeyDown={(event) => {
								if (event.key === " ") {
									event.preventDefault();
									setCategoryId(item.id);
									setQuery("");
								}
							}}
						>
							{item.label}
						</button>
					))}
				</div>
				<div className="flex items-center justify-between text-[10px] text-muted-foreground">
					<span>
						{commercialOnly ? "Commercial-safe results" : "All licenses"}
					</span>
					<span className="tabular-nums">{totalCount} tracks</span>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="pr-2">
					{isLoading && (
						<div className="py-10 text-center text-xs text-muted-foreground">
							Searching music...
						</div>
					)}
					{error && (
						<div className="my-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
							{error}
						</div>
					)}
					{!isLoading && !error && results.length === 0 && (
						<div className="py-10 text-center text-xs text-muted-foreground">
							No music matched this search.
						</div>
					)}
					{results.map((sound) => (
						<AudioLibraryItem
							key={sound.id}
							sound={sound}
							assetKind="music"
							isPlaying={playingId === sound.id}
							onPlay={() => togglePreview({ sound })}
							onToggleSaved={() => toggleSavedSound(sound, "music")}
						/>
					))}
					{hasNextPage && !isLoading && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="my-3 w-full"
							disabled={isLoadingMore}
							onClick={() => loadMore()}
							onKeyDown={(event) => {
								if (event.key === " ") {
									event.preventDefault();
									void loadMore();
								}
							}}
						>
							{isLoadingMore ? "Loading..." : "Load more"}
						</Button>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
