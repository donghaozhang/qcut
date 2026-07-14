"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import {
	STICKER_CATEGORIES,
	getStickerCategoryItems,
	searchStickerCatalog,
	type StickerCategoryId,
} from "@/lib/stickers/sticker-catalog";
import { useStickersStore } from "@/stores/stickers-store";
import { StickerCatalogGrid } from "./components/sticker-catalog-grid";
import {
	StickerSidebar,
	type StickerPanelMode,
} from "./components/sticker-sidebar";
import { StickersFavorites } from "./components/stickers-favorites";
import { StickersRecent } from "./components/stickers-recent";
import { StickersSearch } from "./components/stickers-search";
import { StickersSearchResults } from "./components/stickers-search-results";
import { StickerStorefront } from "./components/sticker-storefront";
import { useStickerSelect } from "./hooks/use-sticker-select";

export function StickersView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] =
		useState<StickerCategoryId>("interaction");
	const [mode, setMode] = useState<StickerPanelMode>("library");
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
	const {
		handleStickerDownload: downloadSticker,
		handleStickerSelect,
		handleStickerUpload,
		cleanupObjectUrls,
	} = useStickerSelect();
	const handleStickerDownload = async (iconId: string, name: string) => {
		await downloadSticker(iconId, name);
	};
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
				isStoreActive={mode === "store"}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				onStoreClick={() => {
					setMode("store");
					setSearchQuery("");
				}}
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
							onDownload={handleStickerDownload}
							onSelect={handleStickerSelect}
						/>
					</div>
				) : (
					<div className="flex h-full min-h-0">
						<StickerSidebar
							mode={mode}
							selectedCategory={selectedCategory}
							onSelectCategory={({ category }) => {
								setSelectedCategory(category);
								setMode("library");
							}}
							onSelectMode={({ mode: nextMode }) => {
								setMode(nextMode);
								setSearchQuery("");
							}}
						/>

						{mode === "store" ? (
							<div className="min-w-0 flex-1 overflow-y-auto">
								<StickerStorefront
									onDownload={handleStickerDownload}
									onSelect={handleStickerSelect}
								/>
							</div>
						) : mode === "recent" ? (
							<div className="min-w-0 flex-1 overflow-y-auto">
								<StickersRecent
									recentStickers={recentStickers}
									onDownload={handleStickerDownload}
									onSelect={handleStickerSelect}
								/>
							</div>
						) : mode === "favorites" ? (
							<div className="min-w-0 flex-1 overflow-y-auto">
								<StickersFavorites
									onDownload={handleStickerDownload}
									onSelect={handleStickerSelect}
								/>
							</div>
						) : (
							<section className="flex min-w-0 flex-1 flex-col">
								<div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3 text-[11px]">
									<span className="font-medium">
										{activeCategory?.localizedLabel ?? "贴纸"}
									</span>
									<span className="tabular-nums text-muted-foreground">
										{categoryItems.length} 个贴纸
									</span>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto p-2">
									<StickerCatalogGrid
										items={categoryItems}
										onDownload={handleStickerDownload}
										onSelect={handleStickerSelect}
									/>
								</div>
							</section>
						)}
					</div>
				)}
			</div>

			<div className="border-t border-border/50 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
				QCut Originals + Fluent Emoji via Iconify
			</div>
		</div>
	);
}
