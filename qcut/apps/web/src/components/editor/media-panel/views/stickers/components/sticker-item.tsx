"use client";

import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
} from "@qcut/editor-core";
import { useEffect, useMemo, useState } from "react";
import {
	AlertCircle,
	Check,
	CloudDownload,
	Heart,
	Loader2,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildIconSvgUrl } from "@/lib/stickers/iconify-api";
import { resolveIconifyStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug/debug-config";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { StickerItemProps } from "../types/stickers.types";

export function StickerItem({
	icon,
	name,
	collection,
	onSelect,
	isSelected,
}: StickerItemProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [imageUrl, setImageUrl] = useState<string>("");
	const asset = useMemo(
		() =>
			resolveIconifyStickerAssetEntry({ collectionPrefix: collection, icon }),
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

	useEffect(() => {
		// Reset state for new icon
		setIsLoading(true);
		setHasError(false);

		try {
			// Force white icons for maximum contrast on dark UI
			const svgUrl = buildIconSvgUrl(collection, icon, {
				color: "#FFFFFF",
				width: 32,
				height: 32,
			});
			setImageUrl(svgUrl);
		} catch (error) {
			debugLog(
				`[StickerItem] Failed to build SVG URL for ${collection}:${icon}:`,
				error
			);
			setHasError(true);
			setIsLoading(false);
		}
	}, [icon, collection]);

	const handleClick = () => {
		const iconId = `${collection}:${icon}`;
		debugLog(`[StickerItem] Sticker clicked: ${iconId}`, {
			name: name || icon,
			imageUrl,
			hasError,
			isLoading,
		});
		onSelect(iconId, name || icon);
	};
	const handleFavorite = () => {
		toggleFavorite({ kind: "sticker", id: asset.id });
	};
	const statusIcon = (() => {
		if (
			runtime.downloadStatus === "downloading" ||
			runtime.cacheStatus === "caching"
		) {
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
		if (runtime.cacheStatus === "cached") {
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
		<div className="group relative size-14">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className={cn(
							"relative flex size-14 flex-col items-center justify-center overflow-hidden rounded-md border border-border/80 bg-slate-800/50 transition-colors hover:border-primary hover:bg-slate-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
							isSelected && "border-primary bg-slate-700/70"
						)}
						onClick={handleClick}
						onKeyDown={(event) => {
							if (event.key === " ") {
								event.preventDefault();
								handleClick();
							}
						}}
						disabled={hasError || !imageUrl}
						aria-pressed={Boolean(isSelected)}
						aria-label={(name || icon) + " (" + collection + ")"}
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
								className={cn(
									"h-8 w-8 object-contain",
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
						<span className="absolute bottom-1 right-1 rounded-sm bg-background/80 p-0.5">
							{statusIcon}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="text-sm font-medium">
						{name || icon} ({collection})
					</p>
					<p className="text-xs text-muted-foreground">{asset.license.name}</p>
				</TooltipContent>
			</Tooltip>
			<button
				type="button"
				className={cn(
					"absolute right-0.5 top-0.5 z-10 flex size-5 items-center justify-center rounded-sm bg-background/85 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
					favorite && "text-amber-300 opacity-100"
				)}
				aria-label={
					favorite
						? `Remove ${name || icon} from favorites`
						: `Favorite ${name || icon}`
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
