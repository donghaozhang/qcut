"use client";

import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
} from "@qcut/editor-core";
import {
	AlertCircle,
	Check,
	CloudDownload,
	Heart,
	Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { debugLog } from "@/lib/debug/debug-config";
import {
	buildIconSvgUrl,
	iconCollectionUsesPalette,
} from "@/lib/stickers/iconify-api";
import { findStickerCatalogItem } from "@/lib/stickers/sticker-catalog";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { StickerItemProps } from "../types/stickers.types";

export function StickerItem({
	icon,
	name,
	collection,
	onDownload,
	onSelect,
	isSelected,
	layout = "compact",
}: StickerItemProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [imageUrl, setImageUrl] = useState("");
	const catalogItem = useMemo(
		() => findStickerCatalogItem({ collection, icon }),
		[collection, icon]
	);
	const asset = useMemo(
		() => resolveStickerAssetEntry({ collectionPrefix: collection, icon }),
		[collection, icon]
	);
	const favoriteIdentity = assetManifestIdentity({
		kind: asset.kind,
		id: asset.id,
	});
	const assetKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	const favorite = useAssetLibraryStore(
		(state) => state.favorites[favoriteIdentity] === true
	);
	const persistedRuntime = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey[assetKey]
	);
	const toggleFavorite = useAssetLibraryStore((state) => state.toggleFavorite);
	const runtime = persistedRuntime ?? createInitialAssetRuntimeState({ asset });
	const displayName = name || icon;
	const iconId = `${collection}:${icon}`;
	const isBusy =
		runtime.downloadStatus === "downloading" ||
		runtime.cacheStatus === "caching";
	const isCached = runtime.cacheStatus === "cached";

	useEffect(() => {
		setIsLoading(true);
		setHasError(false);
		try {
			setImageUrl(
				catalogItem?.source.kind === "bundled"
					? catalogItem.source.url
					: buildIconSvgUrl(collection, icon, {
							color: iconCollectionUsesPalette({ prefix: collection })
								? undefined
								: "#FFFFFF",
							width: layout === "catalog" ? 64 : 32,
							height: layout === "catalog" ? 64 : 32,
						})
			);
		} catch (error) {
			debugLog(`[StickerItem] Failed to build image URL for ${iconId}:`, error);
			setHasError(true);
			setIsLoading(false);
		}
	}, [catalogItem, collection, icon, iconId, layout]);

	const handleSelect = () => onSelect(iconId, displayName);
	const handleDownload = () => onDownload?.(iconId, displayName);
	const handleFavorite = () => {
		toggleFavorite({ kind: "sticker", id: asset.id });
	};
	const statusIcon = (() => {
		if (isBusy) {
			return (
				<Loader2 className="size-3 animate-spin">
					<title>Downloading sticker</title>
				</Loader2>
			);
		}
		if (
			runtime.downloadStatus === "failed" ||
			runtime.cacheStatus === "failed"
		) {
			return (
				<AlertCircle className="size-3 text-destructive">
					<title>Sticker download failed</title>
				</AlertCircle>
			);
		}
		if (isCached) {
			return (
				<Check className="size-3 text-emerald-300">
					<title>Sticker cached</title>
				</Check>
			);
		}
		return (
			<CloudDownload className="size-3 text-muted-foreground">
				<title>Download sticker</title>
			</CloudDownload>
		);
	})();

	return (
		<div
			className={cn(
				"group relative min-w-0",
				layout === "catalog" ? "aspect-square w-full" : "size-14"
			)}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className={cn(
							"relative flex size-full items-center justify-center overflow-hidden rounded-md border border-border/80 bg-foreground/[0.04] transition-colors hover:border-primary hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
							isSelected && "border-primary bg-slate-700/70"
						)}
						onClick={handleSelect}
						onKeyDown={(event) => {
							if (event.key === " ") {
								event.preventDefault();
								handleSelect();
							}
						}}
						disabled={hasError || !imageUrl}
						aria-pressed={Boolean(isSelected)}
						aria-label={`${displayName} (${collection})`}
						data-testid="sticker-item"
						data-sticker-id={iconId}
					>
						{isLoading && (
							<Loader2 className="size-5 animate-spin text-muted-foreground">
								<title>Loading sticker</title>
							</Loader2>
						)}
						{hasError && !isLoading && (
							<AlertCircle className="size-5 text-destructive">
								<title>Sticker preview unavailable</title>
							</AlertCircle>
						)}
						{imageUrl && (
							<img
								src={imageUrl}
								alt={displayName}
								className={cn(
									"object-contain",
									layout === "catalog" ? "size-12" : "size-8",
									(isLoading || hasError) && "hidden"
								)}
								onLoad={() => setIsLoading(false)}
								onError={() => {
									setHasError(true);
									setIsLoading(false);
								}}
								draggable={false}
							/>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="text-sm font-medium">{displayName}</p>
					<p className="text-xs text-muted-foreground">{asset.license.name}</p>
				</TooltipContent>
			</Tooltip>
			{layout === "catalog" && (
				<button
					type="button"
					className="absolute bottom-0.5 right-0.5 z-10 flex size-5 items-center justify-center rounded-sm bg-background/85 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
					aria-label={
						isCached ? `${displayName} cached` : `Download ${displayName}`
					}
					title={isCached ? "Available offline" : "Download sticker"}
					disabled={isCached || isBusy || !onDownload}
					onClick={handleDownload}
					onKeyDown={(event) => {
						if (event.key === " ") {
							event.preventDefault();
							handleDownload();
						}
					}}
				>
					{statusIcon}
				</button>
			)}
			<button
				type="button"
				className={cn(
					"absolute right-0.5 top-0.5 z-10 flex size-5 items-center justify-center rounded-sm bg-background/85 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
					favorite && "text-amber-300 opacity-100"
				)}
				aria-label={
					favorite
						? `Remove ${displayName} from favorites`
						: `Favorite ${displayName}`
				}
				title={favorite ? "Remove from favorites" : "Add to favorites"}
				onClick={handleFavorite}
				onKeyDown={(event) => {
					if (event.key === " ") {
						event.preventDefault();
						handleFavorite();
					}
				}}
			>
				<Heart className={cn("size-3", favorite && "fill-current")}>
					<title>{favorite ? "Favorited" : "Favorite sticker"}</title>
				</Heart>
			</button>
		</div>
	);
}
