"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Clock, Heart, Shapes, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/use-debounce";
import { useStickersStore } from "@/stores/stickers-store";
import { POPULAR_COLLECTIONS } from "@/lib/stickers/iconify-api";
import { StickersSearch } from "./components/stickers-search";
import { StickersSearchResults } from "./components/stickers-search-results";
import { StickersRecent } from "./components/stickers-recent";
import { StickersFavorites } from "./components/stickers-favorites";
import { StickersCollection } from "./components/stickers-collection";
import { useStickerSelect } from "./hooks/use-sticker-select";
import { toast } from "sonner";

const STICKER_CATEGORY_COLLECTIONS = {
	motion: ["line-md", "svg-spinners"],
	essentials: ["tabler", "material-symbols", "heroicons"],
	brands: ["simple-icons"],
} as const;

function StickerCollectionGroup({
	collectionPrefixes,
	onSelect,
}: {
	collectionPrefixes: readonly string[];
	onSelect: (iconId: string, name: string) => void;
}) {
	return (
		<div className="space-y-5 p-3">
			{collectionPrefixes.map((collectionPrefix) => {
				const collection = POPULAR_COLLECTIONS.find(
					(candidate) => candidate.prefix === collectionPrefix
				);
				if (!collection) return null;
				return (
					<section key={collection.prefix}>
						<div className="mb-2 flex items-center justify-between gap-2 px-1">
							<h3 className="truncate text-xs font-semibold">
								{collection.name}
							</h3>
							<span className="shrink-0 text-[10px] text-muted-foreground">
								{collection.license?.spdx ?? "License unknown"}
							</span>
						</div>
						<StickersCollection
							collectionPrefix={collection.prefix}
							onSelect={onSelect}
						/>
					</section>
				);
			})}
		</div>
	);
}

export function StickersView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("motion");
	const [isSearching, setIsSearching] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { searchResults, recentStickers, error, searchIcons, clearError } =
		useStickersStore();

	const { handleStickerSelect, handleStickerUpload, cleanupObjectUrls } =
		useStickerSelect();

	useEffect(() => {
		return cleanupObjectUrls;
	}, [cleanupObjectUrls]);

	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	useEffect(() => {
		if (!debouncedSearchQuery.trim()) {
			return;
		}

		const abortController = new AbortController();
		const performSearch = async () => {
			setIsSearching(true);
			try {
				await searchIcons(debouncedSearchQuery, abortController.signal);
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") return;
				toast.error("Failed to search icons");
			} finally {
				setIsSearching(false);
			}
		};

		performSearch();
		return () => abortController.abort();
	}, [debouncedSearchQuery, searchIcons]);

	const handleFileChange = async ({
		currentTarget,
	}: ChangeEvent<HTMLInputElement>) => {
		const files = [...(currentTarget.files ?? [])];
		currentTarget.value = "";
		await files.reduce(
			(previous, file) =>
				previous.then(async () => {
					await handleStickerUpload({ file });
				}),
			Promise.resolve()
		);
	};

	return (
		<div className="flex h-full flex-col" data-testid="stickers-panel">
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
					>
						Dismiss
					</Button>
				</div>
			)}

			<div className="flex-1 overflow-hidden">
				{searchQuery ? (
					<ScrollArea className="h-full">
						<StickersSearchResults
							searchResults={searchResults}
							searchQuery={searchQuery}
							isSearching={isSearching}
							onSelect={handleStickerSelect}
						/>
					</ScrollArea>
				) : (
					<Tabs
						value={selectedCategory}
						onValueChange={setSelectedCategory}
						className="h-full"
					>
						<TabsList className="grid w-full grid-cols-5 rounded-none border-b border-border/50 bg-transparent px-2">
							<TabsTrigger value="motion" className="min-w-0 gap-1 text-[11px]">
								<Sparkles className="size-3.5 shrink-0">
									<title>Animated stickers</title>
								</Sparkles>
								<span className="truncate">Motion</span>
							</TabsTrigger>
							<TabsTrigger
								value="essentials"
								className="min-w-0 gap-1 text-[11px]"
							>
								<Shapes className="size-3.5 shrink-0">
									<title>Essential stickers</title>
								</Shapes>
								<span className="truncate">Essentials</span>
							</TabsTrigger>
							<TabsTrigger value="brands" className="min-w-0 gap-1 text-[11px]">
								<Shapes className="size-3.5 shrink-0">
									<title>Brand stickers</title>
								</Shapes>
								<span className="truncate">Brands</span>
							</TabsTrigger>
							<TabsTrigger value="recent" className="min-w-0 gap-1 text-[11px]">
								<Clock className="size-3.5 shrink-0">
									<title>Recent</title>
								</Clock>
								<span className="truncate">Recent</span>
							</TabsTrigger>
							<TabsTrigger
								value="favorites"
								className="min-w-0 gap-1 text-[11px]"
							>
								<Heart className="size-3.5 shrink-0">
									<title>Favorite stickers</title>
								</Heart>
								<span className="truncate">Favorites</span>
							</TabsTrigger>
						</TabsList>

						<TabsContent value="motion" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<StickerCollectionGroup
									collectionPrefixes={STICKER_CATEGORY_COLLECTIONS.motion}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="essentials" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<StickerCollectionGroup
									collectionPrefixes={STICKER_CATEGORY_COLLECTIONS.essentials}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="brands" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<StickerCollectionGroup
									collectionPrefixes={STICKER_CATEGORY_COLLECTIONS.brands}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="recent" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<StickersRecent
									recentStickers={recentStickers}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="favorites" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<StickersFavorites onSelect={handleStickerSelect} />
							</ScrollArea>
						</TabsContent>
					</Tabs>
				)}
			</div>

			<div className="border-t p-2 text-center text-xs text-muted-foreground">
				Icons provided by{" "}
				<a
					href="https://iconify.design"
					target="_blank"
					rel="noopener noreferrer"
					className="text-primary hover:underline"
				>
					Iconify
				</a>
			</div>
		</div>
	);
}
