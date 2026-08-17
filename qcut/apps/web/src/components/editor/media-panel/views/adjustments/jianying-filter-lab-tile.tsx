import {
	CloudOff,
	Download,
	Layers3,
	LoaderCircle,
	Palette,
	ShieldCheck,
	Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JianyingFilterLabFilterSummary } from "@/types/electron";
import {
	cacheLabel,
	JIANYING_FILTER_IMPLEMENTATION_LABELS,
	VERIFICATION_LABELS,
	verificationDetails,
} from "./jianying-filter-lab-labels";
import { useJianyingFilterThumbnail } from "./use-jianying-filter-thumbnail";

/**
 * Grid tile for one filter: thumbnail first, the way Jianying's own browser
 * presents them. The apply target is the whole tile; favourite and download
 * sit on top as overlays rather than nested buttons, which would be invalid.
 */
export function JianyingFilterLabTile({
	filter,
	loading,
	favorite,
	downloading = false,
	onApply,
	onDownload,
	onToggleFavorite,
}: {
	filter: JianyingFilterLabFilterSummary;
	loading: boolean;
	favorite: boolean;
	downloading?: boolean;
	onApply: ({ filter }: { filter: JianyingFilterLabFilterSummary }) => void;
	onDownload?: ({ filter }: { filter: JianyingFilterLabFilterSummary }) => void;
	onToggleFavorite: ({
		filter,
	}: {
		filter: JianyingFilterLabFilterSummary;
	}) => void;
}) {
	const thumbnail = useJianyingFilterThumbnail({
		resourceId: filter.resourceId,
		hasThumbnail: filter.hasThumbnail,
	});
	const canDownload =
		Boolean(onDownload) &&
		filter.downloadable &&
		filter.cacheStatus !== "cached";
	return (
		<div
			className="group relative min-w-0"
			data-testid={`jianying-filter-${filter.resourceId}`}
		>
			<button
				type="button"
				className={cn(
					"flex w-full min-w-0 flex-col gap-1 rounded-md text-left transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
					filter.available ? "hover:opacity-90" : "opacity-70 hover:opacity-90"
				)}
				disabled={loading}
				aria-label={
					filter.available
						? `应用 ${filter.title}`
						: `${cacheLabel({ filter })}滤镜 ${filter.title}`
				}
				onClick={() => onApply({ filter })}
				onKeyDown={(event) => {
					if (event.key === "Escape") event.currentTarget.blur();
				}}
			>
				<div
					ref={thumbnail.containerRef}
					className={cn(
						"grid aspect-square w-full place-items-center overflow-hidden rounded-md border bg-foreground/7",
						filter.available
							? "border-border/50 text-primary"
							: "border-dashed border-border/60 text-muted-foreground"
					)}
				>
					{thumbnail.state === "ready" ? (
						<img
							alt=""
							className="h-full w-full object-cover"
							draggable={false}
							src={thumbnail.url}
						/>
					) : loading ? (
						<LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
					) : filter.cacheStatus === "uncached" ? (
						<CloudOff className="size-4" aria-hidden="true" />
					) : filter.implementation === "dual-lut" ? (
						<Layers3 className="size-4" aria-hidden="true" />
					) : filter.verification.status === "verified" ? (
						<ShieldCheck className="size-4" aria-hidden="true" />
					) : (
						<Palette className="size-4" aria-hidden="true" />
					)}
				</div>
				<span className="block min-w-0 truncate text-[11px] font-medium leading-tight">
					{filter.title}
				</span>
				<span className="flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground">
					<span className="shrink-0 rounded-sm bg-foreground/8 px-1">
						{filter.renderer
							? `${filter.renderer.passCount} Pass`
							: JIANYING_FILTER_IMPLEMENTATION_LABELS[filter.implementation]}
					</span>
					<span className="truncate" title={verificationDetails({ filter })}>
						{VERIFICATION_LABELS[filter.verification.status]}
					</span>
				</span>
			</button>

			<button
				type="button"
				className={cn(
					"absolute left-1 top-1 grid size-6 place-items-center rounded-sm bg-background/70 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group-hover:opacity-100",
					favorite && "text-amber-500 opacity-100"
				)}
				aria-label={
					favorite ? `取消收藏 ${filter.title}` : `收藏 ${filter.title}`
				}
				title={favorite ? "取消收藏" : "收藏"}
				onClick={() => onToggleFavorite({ filter })}
				onKeyDown={(event) => {
					if (event.key === "Escape") event.currentTarget.blur();
				}}
			>
				<Star className={cn("size-3", favorite && "fill-current")} />
			</button>

			{canDownload ? (
				<button
					type="button"
					className="absolute right-1 top-1 grid size-6 place-items-center rounded-sm bg-background/70 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
					disabled={downloading}
					aria-label={`下载 ${filter.title}`}
					title={downloading ? "正在下载" : "下载滤镜包"}
					onClick={() => onDownload?.({ filter })}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					{downloading ? (
						<LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
					) : (
						<Download className="size-3" aria-hidden="true" />
					)}
				</button>
			) : null}
		</div>
	);
}
