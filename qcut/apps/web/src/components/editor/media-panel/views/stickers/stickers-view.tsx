"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Clock, Heart, Library } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import {
	STICKER_CATEGORIES,
	getStickerCategoryItems,
	searchStickerCatalog,
	type StickerCategoryId,
} from "@/lib/stickers/sticker-catalog";
import { cn } from "@/lib/utils";
import { useStickersStore } from "@/stores/stickers-store";
import { StickerCatalogGrid } from "./components/sticker-catalog-grid";
import { StickersFavorites } from "./components/stickers-favorites";
import { StickersRecent } from "./components/stickers-recent";
import { StickersSearch } from "./components/stickers-search";
import { StickersSearchResults } from "./components/stickers-search-results";
import { useStickerSelect } from "./hooks/use-sticker-select";

type StickerLibraryMode = "library" | "recent" | "favorites";

const LIBRARY_MODES = [
	{ id: "library", label: "贴纸库", icon: Library },
	{ id: "recent", label: "最近", icon: Clock },
	{ id: "favorites", label: "收藏", icon: Heart },
] as const satisfies ReadonlyArray<{
	id: StickerLibraryMode;
	label: string;
	icon: typeof Library;
}>;

export function StickersView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] =
		useState<StickerCategoryId>("interaction");
	const [mode, setMode] = useState<StickerLibraryMode>("library");
	const [isSearching, setIsSearching] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const {
		searchResults,
		recentStickers,
		error,
		searchIcons,
		clearError,
		clearSearchResults,
	} = useStickersStore();
	const { handleStickerSelect, handleStickerUpload, cleanupObjectUrls } =
		useStickerSelect();
	const debouncedSearchQuery = useDebounce(searchQuery, 300);
	const activeCategory = STICKER_CATEGORIES.find(
		(category) => category.id === selectedCategory
	);
	const categoryItems = useMemo(
		() => getStickerCategoryItems({ category: selectedCategory }),
		[selectedCategory]
	);
	const curatedSearchResults = useMemo(
		() =>
			searchQuery.trim()
				? searchStickerCatalog({ query: searchQuery }).map(
						(sticker) => sticker.id
					)
				: [],
		[searchQuery]
	);
	const combinedSearchResults = useMemo(
		() => [...new Set([...curatedSearchResults, ...searchResults])],
		[curatedSearchResults, searchResults]
	);

	useEffect(() => cleanupObjectUrls, [cleanupObjectUrls]);

	useEffect(() => {
		if (!debouncedSearchQuery.trim()) {
			clearSearchResults();
			setIsSearching(false);
			return;
		}

		const abortController = new AbortController();
		const performSearch = async () => {
			setIsSearching(true);
			try {
				await searchIcons(debouncedSearchQuery, abortController.signal);
			} catch (searchError) {
				if (searchError instanceof Error && searchError.name === "AbortError") {
					return;
				}
				toast.error("Failed to search icons");
			} finally {
				if (!abortController.signal.aborted) setIsSearching(false);
			}
		};

		performSearch();
		return () => abortController.abort();
	}, [clearSearchResults, debouncedSearchQuery, searchIcons]);

	const handleFileChange = async ({
		currentTarget,
	}: ChangeEvent<HTMLInputElement>) => {
		const files = [...(currentTarget.files ?? [])];
		currentTarget.value = "";
		await Promise.all(files.map((file) => handleStickerUpload({ file })));
	};

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-panel text-foreground"
			data-testid="stickers-panel"
		>
			<StickersSearch
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				onUploadClick={() => fileInputRef.current?.click()}
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
				multiple
				className="hidden"
				onChange={handleFileChange}
			/>

			<div className="grid grid-cols-3 border-b border-border/50 bg-foreground/[0.02] p-1">
				{LIBRARY_MODES.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							className={cn(
								"flex h-7 items-center justify-center gap-1.5 rounded text-[11px] transition-colors",
								mode === item.id
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							)}
							aria-pressed={mode === item.id}
							onClick={() => {
								setMode(item.id);
								setSearchQuery("");
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
						>
							<Icon className="size-3.5" />
							<span>{item.label}</span>
						</button>
					);
				})}
			</div>

			{error && (
				<div className="mx-3 mt-2 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
					<AlertCircle className="size-3.5 shrink-0">
						<title>Sticker library error</title>
					</AlertCircle>
					<span className="min-w-0 flex-1 truncate">{error}</span>
					<Button
						type="button"
						variant="text"
						size="sm"
						className="h-6 px-2"
						onClick={clearError}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						Dismiss
					</Button>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-hidden">
				{searchQuery ? (
					<div className="h-full overflow-y-auto">
						<StickersSearchResults
							searchResults={combinedSearchResults}
							searchQuery={searchQuery}
							isSearching={isSearching}
							onSelect={handleStickerSelect}
						/>
					</div>
				) : mode === "recent" ? (
					<div className="h-full overflow-y-auto">
						<StickersRecent
							recentStickers={recentStickers}
							onSelect={handleStickerSelect}
						/>
					</div>
				) : mode === "favorites" ? (
					<div className="h-full overflow-y-auto">
						<StickersFavorites onSelect={handleStickerSelect} />
					</div>
				) : (
					<div className="flex h-full min-h-0">
						<aside className="w-[118px] shrink-0 overflow-y-auto border-r border-border/50 p-2">
							<div className="mb-2 flex h-7 items-center gap-2 px-2 text-[11px] font-semibold text-foreground">
								<Library className="size-3.5">
									<title>Sticker library categories</title>
								</Library>
								<span>贴纸库</span>
							</div>
							<div className="space-y-0.5">
								{STICKER_CATEGORIES.map((category) => {
									const Icon = category.icon;
									return (
										<button
											key={category.id}
											type="button"
											className={cn(
												"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
												selectedCategory === category.id
													? "bg-primary/15 text-primary"
													: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
											)}
											aria-pressed={selectedCategory === category.id}
											aria-label={`${category.localizedLabel} / ${category.label}`}
											data-testid={`sticker-category-${category.id}`}
											onClick={() => setSelectedCategory(category.id)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.currentTarget.click();
												}
											}}
										>
											<Icon className="size-3.5 shrink-0" />
											<span className="truncate">
												{category.localizedLabel}
											</span>
										</button>
									);
								})}
							</div>
						</aside>

						<section className="flex min-w-0 flex-1 flex-col">
							<div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3 text-[11px]">
								<span className="font-medium">
									{activeCategory?.localizedLabel ?? "贴纸"}
								</span>
								<span className="tabular-nums text-muted-foreground">
									{categoryItems.length} 个贴纸
								</span>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto p-3">
								<StickerCatalogGrid
									items={categoryItems}
									onSelect={handleStickerSelect}
								/>
							</div>
						</section>
					</div>
				)}
			</div>

			<div className="border-t border-border/50 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
				Open-source artwork by Fluent Emoji via Iconify
			</div>
		</div>
	);
}
