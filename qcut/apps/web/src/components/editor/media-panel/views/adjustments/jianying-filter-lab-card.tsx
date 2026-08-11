import {
	CloudOff,
	Layers3,
	LoaderCircle,
	Palette,
	ShieldCheck,
	Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	JianyingFilterImplementation,
	JianyingFilterLabFilterSummary,
} from "@/types/electron";
import { useJianyingFilterThumbnail } from "./use-jianying-filter-thumbnail";

export const JIANYING_FILTER_IMPLEMENTATION_LABELS: Record<
	JianyingFilterImplementation,
	string
> = {
	"single-lut": "单 LUT",
	"dual-lut": "双 LUT",
	shader: "Shader",
	"face-ai": "人脸 AI",
	unknown: "待识别",
};

const VERIFICATION_LABELS = {
	unverified: "未验证",
	close: "接近",
	verified: "已验证",
} as const;

function verificationDetails({
	filter,
}: {
	filter: JianyingFilterLabFilterSummary;
}) {
	const { verification } = filter;
	const metrics = [
		verification.rgbRmse === undefined
			? undefined
			: `RGB RMSE ${verification.rgbRmse}`,
		verification.psnr === undefined ? undefined : `PSNR ${verification.psnr}`,
		verification.ssim === undefined ? undefined : `SSIM ${verification.ssim}`,
		verification.deltaE === undefined
			? undefined
			: `DeltaE ${verification.deltaE}`,
		verification.maskEdgeMae === undefined
			? undefined
			: `Mask edge ${verification.maskEdgeMae}`,
		verification.temporalMotionDelta === undefined
			? undefined
			: `Temporal ${verification.temporalMotionDelta}`,
	].filter((value): value is string => Boolean(value));
	return metrics.length > 0
		? `${VERIFICATION_LABELS[verification.status]} · ${metrics.join(" · ")}`
		: VERIFICATION_LABELS[verification.status];
}

function cacheLabel({ filter }: { filter: JianyingFilterLabFilterSummary }) {
	if (filter.available) return "可用";
	if (filter.cacheStatus === "cached") return "已缓存";
	if (filter.cacheStatus === "partial") return "缓存不完整";
	return "未缓存";
}

export function JianyingFilterLabCard({
	filter,
	loading,
	favorite,
	onApply,
	onToggleFavorite,
}: {
	filter: JianyingFilterLabFilterSummary;
	loading: boolean;
	favorite: boolean;
	onApply: ({ filter }: { filter: JianyingFilterLabFilterSummary }) => void;
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
	return (
		<div
			className={cn(
				"flex h-16 w-full items-center rounded-md border bg-card transition-colors",
				filter.available
					? "border-border/60 hover:border-primary/40"
					: "border-dashed border-border/60"
			)}
			data-testid={`jianying-filter-${filter.resourceId}`}
		>
			<button
				type="button"
				className={cn(
					"flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
					filter.available ? "hover:bg-accent" : "opacity-65 hover:opacity-85"
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
						"grid size-9 shrink-0 place-items-center overflow-hidden rounded-sm bg-foreground/7",
						filter.available ? "text-primary" : "text-muted-foreground"
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
				<span className="min-w-0 flex-1">
					<span className="block truncate text-xs font-medium">
						{filter.title}
					</span>
					<span className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
						<span className="shrink-0 rounded-sm bg-foreground/8 px-1 py-0.5">
							{cacheLabel({ filter })}
						</span>
						<span className="shrink-0 rounded-sm bg-foreground/8 px-1 py-0.5">
							{filter.renderer
								? `${filter.renderer.passCount} Pass`
								: JIANYING_FILTER_IMPLEMENTATION_LABELS[filter.implementation]}
						</span>
						<span className="shrink-0" title={verificationDetails({ filter })}>
							{VERIFICATION_LABELS[filter.verification.status]}
						</span>
						{filter.version ? (
							<span className="truncate font-mono">
								{filter.version.slice(0, 7)}
							</span>
						) : null}
					</span>
				</span>
			</button>
			<button
				type="button"
				className={cn(
					"mr-1.5 grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
					favorite && "text-amber-500"
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
				<Star className={cn("size-3.5", favorite && "fill-current")} />
			</button>
		</div>
	);
}
