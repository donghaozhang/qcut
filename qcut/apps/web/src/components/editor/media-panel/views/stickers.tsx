"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import {
	AlertCircle,
	Clock,
	Grid3X3,
	Hash,
	Loader2,
	Search,
	Upload,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStickersStore } from "@/stores/stickers-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import {
	buildIconSvgUrl,
	getCollection,
	POPULAR_COLLECTIONS,
} from "@/lib/stickers/iconify-api";
import { downloadStickerAsFile } from "@/lib/stickers/sticker-downloader";
import type { IconSet } from "@/lib/stickers/iconify-api";
import { cn } from "@/lib/utils";

// Types
interface StickerItemProps {
	icon: string;
	name: string;
	collection: string;
	onSelect: (iconId: string, name: string) => void;
	isSelected?: boolean;
}

/** Single sticker icon tile with loading/error states and click-to-select. */
function StickerItem({
	icon,
	name,
	collection,
	onSelect,
	isSelected,
}: StickerItemProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [imageUrl, setImageUrl] = useState<string>("");

	useEffect(() => {
		// Reset state for new icon
		setIsLoading(true);
		setHasError(false);

		try {
			const svgUrl = buildIconSvgUrl(collection, icon, {
				// Force white for maximum contrast in dark UI
				color: "#FFFFFF",
				width: 32,
				height: 32,
			});
			// debugLog("[StickerItem] Built SVG URL:", { collection, icon, svgUrl });
			setImageUrl(svgUrl);
		} catch (error) {
			debugError("[StickerItem] Error building SVG URL:", error);
			setHasError(true);
			setIsLoading(false);
		}
	}, [icon, collection]);

	const handleClick = () => {
		const iconId = `${collection}:${icon}`;
		onSelect(iconId, name || icon);
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className={cn(
							"relative flex h-14 w-14 flex-col items-center justify-center rounded-md border border-border/80 bg-slate-800/50 transition-colors hover:border-primary hover:bg-slate-700/70 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
							isSelected && "border-primary bg-slate-700/70"
						)}
						onClick={handleClick}
						disabled={hasError || !imageUrl}
						data-testid="sticker-item"
					>
						{isLoading && (
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						)}
						{hasError && !isLoading && (
							<AlertCircle className="h-6 w-6 text-destructive" />
						)}
						{imageUrl && (
							<img
								src={imageUrl}
								alt={name || icon}
								loading="lazy"
								className={cn(
									"h-8 w-8 object-contain",
									(isLoading || hasError) && "hidden"
								)}
								onLoad={() => {
									setIsLoading(false);
								}}
								onError={() => {
									setHasError(true);
									setIsLoading(false);
								}}
							/>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="text-sm font-medium">
						{name || icon} ({collection})
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

// Fallback icons for when API calls fail or return no data
const FALLBACK_ICONS: Record<string, string[]> = {
	"heroicons": ["home", "user", "cog", "heart", "star", "check"],
	"tabler": ["home", "user", "settings", "heart", "star", "check"],
	"material-symbols": [
		"home",
		"person",
		"settings",
		"favorite",
		"star",
		"check",
	],
	"simple-icons": [
		"github",
		"google",
		"facebook",
		"twitter",
		"instagram",
		"youtube",
	],
};

// CollectionContent Component
interface CollectionContentProps {
	collectionPrefix: string;
	collections: IconSet[];
	onSelect: (iconId: string, name: string) => void;
}

/** Renders the icon grid for a single Iconify collection. */
function CollectionContent({
	collectionPrefix,
	collections,
	onSelect,
}: CollectionContentProps) {
	const [collectionIcons, setCollectionIcons] = useState<string[]>([]);
	const [loadingCollection, setLoadingCollection] = useState(true);

	useEffect(() => {
		const fetchCollectionIcons = async () => {
			setLoadingCollection(true);
			try {
				// First, check if we have this collection in our store
				const collection = collections.find(
					(c) => c.prefix === collectionPrefix
				);

				// Try to get sample icons from POPULAR_COLLECTIONS first
				const popularCollection = POPULAR_COLLECTIONS.find(
					(c) => c.prefix === collectionPrefix
				);

				if (popularCollection?.samples) {
					setCollectionIcons(popularCollection.samples);
				} else {
					// Try to fetch actual icons from the API
					try {
						const collectionInfo = await getCollection(collectionPrefix);

						// Get icons from the collection
						let icons: string[] = [];

						// Try uncategorized first
						if (
							collectionInfo.uncategorized &&
							collectionInfo.uncategorized.length > 0
						) {
							icons = collectionInfo.uncategorized;
						}
						// Then try categories
						else if (collectionInfo.categories) {
							const categoryArrays = Object.values(collectionInfo.categories);
							if (categoryArrays.length > 0) {
								// Flatten all categories and take first 30
								icons = categoryArrays.flat().slice(0, 30);
							}
						}

						// If still no icons, try a fallback based on collection prefix
						if (icons.length === 0) {
							icons = FALLBACK_ICONS[collectionPrefix] || [];
						}

						setCollectionIcons(icons.slice(0, 20)); // Limit to 20 for performance
					} catch (error) {
						// Use fallback icons on error
						setCollectionIcons(FALLBACK_ICONS[collectionPrefix] || []);
					}
				}
			} catch (error) {
				setCollectionIcons([]);
			} finally {
				setLoadingCollection(false);
			}
		};

		fetchCollectionIcons();
	}, [collectionPrefix, collections]);

	if (loadingCollection) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (collectionIcons.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<AlertCircle className="mb-2 h-8 w-8 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">
					No icons available for this collection
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-6 gap-2.5 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 [mask-image:linear-gradient(to_bottom,black_92%,transparent)]">
			{collectionIcons.map((iconName) => (
				<StickerItem
					key={`${collectionPrefix}:${iconName}`}
					icon={iconName}
					name={iconName}
					collection={collectionPrefix}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

/** Stickers panel — search, browse collections, and add icon stickers to the timeline. */
export function StickersView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCollection, setSelectedCollection] = useState<string>("all");
	const [isSearching, setIsSearching] = useState(false);

	const {
		collections,
		searchResults,
		recentStickers,
		isLoading,
		error,
		fetchCollections,
		searchIcons,
		addRecentSticker,
	} = useStickersStore();

	const { addMediaItem } = useMediaStore();
	const { activeProject } = useProjectStore();
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Load collections on mount
	useEffect(() => {
		if (collections.length === 0) {
			fetchCollections();
		}
	}, [collections.length, fetchCollections]);

	// Search functionality with debounce
	useEffect(() => {
		if (!searchQuery.trim()) {
			return;
		}

		const timeoutId = setTimeout(async () => {
			setIsSearching(true);
			try {
				await searchIcons(searchQuery);
			} catch (error) {
				toast.error("Failed to search icons");
			} finally {
				setIsSearching(false);
			}
		}, 300);

		return () => clearTimeout(timeoutId);
	}, [searchQuery, searchIcons]);

	const handleStickerSelect = useCallback(
		async (iconId: string, name: string) => {
			debugLog("[StickersView] handleStickerSelect called:", { iconId, name });

			if (!activeProject) {
				toast.error("No project selected");
				return;
			}

			try {
				const svgFile = await downloadStickerAsFile(iconId, name);
				const fileUrl = createObjectURL(svgFile, "stickers-svg-upload");

				const mediaId = await addMediaItem(activeProject.id, {
					name: svgFile.name,
					type: "image" as const,
					file: svgFile,
					url: fileUrl,
					thumbnailUrl: fileUrl,
					width: 512,
					height: 512,
					duration: 0,
				});

				// Add as overlay sticker (renders on video preview, draggable)
				const { addOverlaySticker } = useStickersOverlayStore.getState();
				const stickerId = addOverlaySticker(mediaId, {
					position: { x: 50, y: 50 },
				});

				// Add to timeline for timing control (separate sticker track)
				const sticker = useStickersOverlayStore
					.getState()
					.overlayStickers.get(stickerId);
				if (sticker) {
					const { timelineStickerIntegration } = await import(
						"@/lib/stickers/timeline-sticker-integration"
					);
					await timelineStickerIntegration.addStickerToTimeline(sticker, 0, 5);
				}

				addRecentSticker(iconId, name);
				toast.success(`Added ${name} as sticker`);
			} catch (error) {
				debugError("[StickersView] Error adding sticker:", error);
				toast.error("Failed to add sticker to project");
			}
		},
		[activeProject, addMediaItem, addRecentSticker]
	);

	/** Handle user-uploaded sticker files (PNG, JPG, SVG, GIF, WebP) */
	const handleFileUpload = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files || files.length === 0) return;
			if (!activeProject) {
				toast.error("No project selected");
				return;
			}

			for (const file of files) {
				if (!file.type.startsWith("image/")) {
					toast.error(`${file.name} is not an image file`);
					continue;
				}

				try {
					const fileUrl = createObjectURL(file, "stickers-user-upload");

					// Get image dimensions
					const dimensions = await new Promise<{
						width: number;
						height: number;
					}>((resolve) => {
						const img = new Image();
						img.onload = () =>
							resolve({ width: img.naturalWidth, height: img.naturalHeight });
						img.onerror = () => resolve({ width: 512, height: 512 });
						img.src = fileUrl;
					});

					const mediaId = await addMediaItem(activeProject.id, {
						name: file.name,
						type: "image" as const,
						file,
						url: fileUrl,
						thumbnailUrl: fileUrl,
						width: dimensions.width,
						height: dimensions.height,
						duration: 0,
					});

					// Add as overlay sticker (renders on video preview, draggable)
					const { addOverlaySticker } = useStickersOverlayStore.getState();
					const stickerId = addOverlaySticker(mediaId, {
						position: { x: 50, y: 50 },
					});

					// Add to timeline for timing control (separate sticker track)
					const sticker = useStickersOverlayStore
						.getState()
						.overlayStickers.get(stickerId);
					if (sticker) {
						const { timelineStickerIntegration } = await import(
							"@/lib/stickers/timeline-sticker-integration"
						);
						await timelineStickerIntegration.addStickerToTimeline(
							sticker,
							0,
							5
						);
					}

					toast.success(`Added ${file.name} as sticker`);
				} catch (error) {
					debugError("[StickersView] Error uploading sticker:", error);
					toast.error(`Failed to add ${file.name}`);
				}
			}

			// Reset input so the same file can be re-uploaded
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[activeProject, addMediaItem]
	);

	const renderSearchResults = () => {
		if (isSearching) {
			return (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			);
		}

		if (searchResults.length === 0 && searchQuery) {
			return (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<Search className="mb-4 h-12 w-12 text-muted-foreground" />
					<p className="text-lg font-medium">No icons found</p>
					<p className="text-muted-foreground">
						Try searching with different keywords
					</p>
				</div>
			);
		}

		return (
			<div className="grid grid-cols-6 gap-2.5 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 [mask-image:linear-gradient(to_bottom,black_92%,transparent)]">
				{searchResults.map((result) => {
					const [collection, iconName] = result.split(":");
					return (
						<StickerItem
							key={result}
							icon={iconName}
							name={iconName}
							collection={collection}
							onSelect={handleStickerSelect}
						/>
					);
				})}
			</div>
		);
	};

	const renderRecentStickers = () => {
		if (recentStickers.length === 0) {
			return (
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<Clock className="mb-2 h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						No recent stickers yet
					</p>
				</div>
			);
		}

		return (
			<div className="grid grid-cols-6 gap-2.5 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 [mask-image:linear-gradient(to_bottom,black_92%,transparent)]">
				{recentStickers.map((sticker) => {
					const [collection, iconName] = sticker.iconId.split(":");
					return (
						<StickerItem
							key={sticker.iconId}
							icon={iconName}
							name={sticker.name}
							collection={collection}
							onSelect={handleStickerSelect}
						/>
					);
				})}
			</div>
		);
	};

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<AlertCircle className="mb-4 h-12 w-12 text-destructive" />
				<p className="text-lg font-medium">Failed to load stickers</p>
				<p className="text-muted-foreground">{error}</p>
				<Button
					onClick={() => fetchCollections()}
					className="mt-4"
					variant="outline"
				>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col" data-testid="stickers-panel">
			{/* Search Bar + Upload */}
			<div className="border-b p-4">
				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
						<Input
							placeholder="Search stickers..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10 pr-10"
						/>
						{searchQuery && (
							<button
								type="button"
								className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 transform p-0 hover:bg-accent rounded"
								onClick={() => setSearchQuery("")}
							>
								<X className="h-4 w-4" />
							</button>
						)}
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="outline"
									className="h-9 w-9 shrink-0"
									onClick={() => fileInputRef.current?.click()}
								>
									<Upload className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Upload your own sticker</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
						multiple
						className="hidden"
						onChange={handleFileUpload}
					/>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				{searchQuery ? (
					<ScrollArea className="h-full">{renderSearchResults()}</ScrollArea>
				) : (
					<Tabs
						value={selectedCollection}
						onValueChange={setSelectedCollection}
						className="h-full"
					>
						<TabsList className="grid w-full grid-cols-4">
							<TabsTrigger value="recent" className="flex items-center gap-2">
								<Clock className="h-4 w-4" />
								Recent
							</TabsTrigger>
							<TabsTrigger value="all" className="flex items-center gap-2">
								<Grid3X3 className="h-4 w-4" />
								All
							</TabsTrigger>
							<TabsTrigger
								value="simple-icons"
								className="flex items-center gap-2"
							>
								<Hash className="h-4 w-4" />
								Brands
							</TabsTrigger>
							<TabsTrigger value="tabler" className="flex items-center gap-2">
								<Hash className="h-4 w-4" />
								Tabler
							</TabsTrigger>
						</TabsList>

						<TabsContent value="recent" className="mt-0 h-full">
							<ScrollArea className="h-full">
								{renderRecentStickers()}
							</ScrollArea>
						</TabsContent>

						<TabsContent value="all" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<div className="p-4 space-y-6">
									{POPULAR_COLLECTIONS.map((collection) => (
										<div key={collection.prefix}>
											<div className="mb-3 flex items-center gap-2">
												<h3 className="text-lg font-semibold">
													{collection.name}
												</h3>
												<Badge variant="secondary">{collection.prefix}</Badge>
											</div>
											<CollectionContent
												collectionPrefix={collection.prefix}
												collections={collections}
												onSelect={handleStickerSelect}
											/>
										</div>
									))}
								</div>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="simple-icons" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<CollectionContent
									collectionPrefix="simple-icons"
									collections={collections}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>

						<TabsContent value="tabler" className="mt-0 h-full">
							<ScrollArea className="h-full">
								<CollectionContent
									collectionPrefix="tabler"
									collections={collections}
									onSelect={handleStickerSelect}
								/>
							</ScrollArea>
						</TabsContent>
					</Tabs>
				)}
			</div>

			{/* Footer */}
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
