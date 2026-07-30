"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
import { AIStickerGenerator } from "./components/ai-sticker-generator";
import { LocalStickerReferencePanel } from "./components/local-sticker-reference-panel";
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
import { useLocalStickerCatalog } from "./hooks/use-local-sticker-catalog";
import { useStickerSelect } from "./hooks/use-sticker-select";

export function StickersView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] =
		useState<StickerCategoryId>("popular");
	const [mode, setMode] = useState<StickerPanelMode>("library");
	const [isSearching, setIsSearching] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const localStickerCatalog = useLocalStickerCatalog();

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
	const handleLocalReferenceSelect = async ({ file }: { file: File }) => {
		const mediaItemId = await handleStickerUpload({ file });
		if (!mediaItemId) {
			throw new Error("Unable to add sticker lab asset");
		}
	};

	const selectMode = ({ mode: nextMode }: { mode: StickerPanelMode }) => {
		setMode(nextMode);
		setSearchQuery("");
	};

	const selectCategory = ({ category }: { category: StickerCategoryId }) => {
		setSelectedCategory(category);
		setMode("library");
		setSearchQuery("");
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
				onStoreClick={() =>
					selectMode({ mode: mode === "store" ? "library" : "store" })
				}
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
					<AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
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
						关闭
					</Button>
				</div>
			)}

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<StickerSidebar
					mode={mode}
					selectedCategory={selectedCategory}
					showReferenceLab={localStickerCatalog.isAvailable}
					onSelectCategory={selectCategory}
					onSelectMode={selectMode}
				/>

				<section className="min-w-0 flex-1 overflow-hidden">
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
					) : mode === "store" ? (
						<StickerStorefront
							onDownload={handleStickerDownload}
							onSelect={handleStickerSelect}
						/>
					) : mode === "recent" ? (
						<div className="h-full overflow-y-auto">
							<StickersRecent
								recentStickers={recentStickers}
								onDownload={handleStickerDownload}
								onSelect={handleStickerSelect}
							/>
						</div>
					) : mode === "favorites" ? (
						<div className="h-full overflow-y-auto">
							<StickersFavorites
								onDownload={handleStickerDownload}
								onSelect={handleStickerSelect}
							/>
						</div>
					) : mode === "ai" ? (
						<AIStickerGenerator onAddGeneratedSticker={handleStickerUpload} />
					) : mode === "reference-lab" ? (
						<LocalStickerReferencePanel
							catalog={localStickerCatalog.catalog}
							error={localStickerCatalog.error}
							isLoading={localStickerCatalog.isLoading}
							onSelect={handleLocalReferenceSelect}
						/>
					) : (
						<div className="flex h-full min-h-0 flex-col">
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
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
