import {
	Download,
	FlaskConical,
	Gem,
	Loader2,
	Lock,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EffectPreset } from "@/types/effects";
import type {
	JianyingEffectDefinition,
	JianyingEffectPanel,
} from "@/types/electron";
import { useJianyingEffectRuntime } from "./use-jianying-effect-runtime";

/**
 * Jianying-style effect browser: the sidebar mirrors Jianying's own category
 * tabs and every card shows the official cover, proxied and disk-cached by the
 * main process so signatures can expire without breaking tiles. QCut ships
 * none of the effects — installed entries come from the local Jianying caches,
 * the rest download on demand, and every package renders through the local
 * Jianying runtime.
 */

type DownloadState = "downloading" | "failed";

const COVER_CONCURRENCY = 6;

const PANEL_LABELS: Record<JianyingEffectPanel, string> = {
	effects2: "画面特效",
	"face-prop": "人物特效",
};

function labPreset({
	definition,
}: {
	definition: JianyingEffectDefinition;
}): EffectPreset {
	return {
		id: definition.id,
		name: definition.name,
		description: `${definition.name}由本机剪映运行时渲染，QCut 不内置或上传剪映特效文件。`,
		category: "basic",
		icon: "JY",
		parameters: {},
		engine: "jianying-local",
		packageHash: definition.packageHash,
		adjustParameters: definition.adjustParameters,
	};
}

function EffectCoverTile({
	definition,
	coverDataUrl,
	downloadState,
}: {
	definition: JianyingEffectDefinition;
	coverDataUrl: string | undefined;
	downloadState: DownloadState | undefined;
}) {
	return (
		<div className="relative aspect-video w-full overflow-hidden bg-foreground/5">
			{coverDataUrl ? (
				<img
					src={coverDataUrl}
					alt={definition.name}
					className="h-full w-full object-cover"
					draggable={false}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					{/* "" records a failed fetch; undefined means still loading. */}
					{definition.coverUrl && coverDataUrl === undefined ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<FlaskConical className="size-4" />
					)}
				</div>
			)}
			{definition.access === "vip" && (
				<Gem
					aria-label="VIP 特效"
					className="absolute top-1 left-1 size-3 text-sky-400 drop-shadow"
				/>
			)}
			{!definition.supported && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-white/85">
					<Lock className="size-3.5" />
					<span className="text-[9px]">需剪映算法</span>
				</div>
			)}
			{definition.supported &&
				!definition.installed &&
				(downloadState === "downloading" ? (
					<div className="absolute inset-0 flex items-center justify-center bg-black/40">
						<Loader2 className="size-4 animate-spin text-white" />
					</div>
				) : (
					<span className="absolute right-1 bottom-1 rounded-full bg-black/60 p-0.5">
						<Download aria-hidden="true" className="size-3 text-white" />
					</span>
				))}
			{downloadState === "failed" && (
				<span className="absolute inset-x-0 bottom-0 bg-red-600/80 py-0.5 text-center text-[9px] text-white">
					下载失败，点击重试
				</span>
			)}
		</div>
	);
}

export function JianyingEffectLabPanel({
	onApply,
	searchQuery = "",
}: {
	onApply: (preset: EffectPreset) => void;
	searchQuery?: string;
}) {
	const { checking, status, error, refresh } = useJianyingEffectRuntime();
	const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
	// Category ids repeat across panels, so the selection keeps both halves
	// of the identity — resolving by id alone can land on another panel's
	// category of the same id.
	const [selectedCategory, setSelectedCategory] = useState<{
		id: string;
		panel: string;
	} | null>(null);
	// "" marks a cover that failed so the pump advances instead of retrying
	// forever; anything else is a data URL from the main-process cache.
	const [covers, setCovers] = useState<Record<string, string>>({});
	const coversInFlight = useRef(new Set<string>());

	const effects = status?.effects ?? [];
	const categories = status?.categories ?? [];

	const query = searchQuery.trim().toLowerCase();
	const activeCategory =
		categories.find(
			(category) =>
				category.id === selectedCategory?.id &&
				category.panel === selectedCategory?.panel
		) ?? categories[0];
	// The catch-all tab is a complement, not a list: it holds exactly what no
	// named tab in its panel can show, so nothing is unreachable and nothing
	// is duplicated into it.
	const isCatchAll = activeCategory?.id.endsWith("-other") ?? false;
	const namedCategoryIds = new Set(
		categories
			.filter(
				(category) =>
					category.panel === activeCategory?.panel &&
					!category.id.endsWith("-other")
			)
			.flatMap((category) => category.categoryIds)
	);
	// A search covers everything, like Jianying's 搜索全部特效 box.
	const visibleEffects = query
		? effects.filter((effect) => effect.name.toLowerCase().includes(query))
		: activeCategory
			? effects.filter((effect) => {
					if (effect.panel !== activeCategory.panel) return false;
					if (isCatchAll) {
						return !effect.categoryIds.some((id) => namedCategoryIds.has(id));
					}
					return effect.categoryIds.some((id) =>
						activeCategory.categoryIds.includes(id)
					);
				})
			: effects;

	// Covers stream in through the main process at a small concurrency; the
	// disk cache makes revisits instant.
	useEffect(() => {
		const api = window.electronAPI?.jianyingEffects;
		if (!api?.cover) return;
		const pending = visibleEffects.filter(
			(effect) =>
				Boolean(effect.coverUrl) &&
				covers[effect.effectId] === undefined &&
				!coversInFlight.current.has(effect.effectId)
		);
		const capacity = COVER_CONCURRENCY - coversInFlight.current.size;
		if (pending.length === 0 || capacity <= 0) return;

		// No per-run cancellation: the effect re-runs on every cover update,
		// and cancelling the rest of the batch then would discard results that
		// nothing re-requests (deleting from the in-flight ref does not
		// re-trigger the effect). Results are keyed by effectId, so a late
		// write is idempotent even after the deps change.
		const batch = pending.slice(0, capacity);
		for (const effect of batch) {
			coversInFlight.current.add(effect.effectId);
		}
		void Promise.all(
			batch.map(async (effect) => {
				try {
					const result = await api.cover({ effectId: effect.effectId });
					setCovers((current) => ({
						...current,
						[effect.effectId]: result.dataUrl,
					}));
				} catch {
					setCovers((current) => ({ ...current, [effect.effectId]: "" }));
				} finally {
					coversInFlight.current.delete(effect.effectId);
				}
			})
		);
	}, [visibleEffects, covers]);

	const handleDownload = useCallback(
		async ({ definition }: { definition: JianyingEffectDefinition }) => {
			const api = window.electronAPI?.jianyingEffects;
			if (!api?.download) return;
			setDownloads((current) => ({
				...current,
				[definition.effectId]: "downloading",
			}));
			try {
				await api.download({ effectId: definition.effectId });
				setDownloads((current) => {
					const next = { ...current };
					delete next[definition.effectId];
					return next;
				});
				// A fresh status marks the effect installed.
				await refresh();
			} catch (cause) {
				setDownloads((current) => ({
					...current,
					[definition.effectId]: "failed",
				}));
				toast.error(
					cause instanceof Error ? cause.message : "特效包下载失败。"
				);
			}
		},
		[refresh]
	);

	const handleTileClick = useCallback(
		({ definition }: { definition: JianyingEffectDefinition }) => {
			if (!definition.installed) {
				if (downloads[definition.effectId] === "downloading") return;
				void handleDownload({ definition });
				return;
			}
			onApply(labPreset({ definition }));
		},
		[downloads, handleDownload, onApply]
	);

	if (checking) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-muted-foreground text-xs">
				<Loader2 className="size-4 animate-spin" />
				正在检测本机剪映运行时…
			</div>
		);
	}

	if (error || !status || status.state !== "ready") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
				<FlaskConical className="size-6 text-muted-foreground" />
				<p className="text-muted-foreground text-xs">
					{error || status?.message || "本机剪映特效不可用。"}
				</p>
				<Button size="sm" variant="outline" onClick={() => void refresh()}>
					<RefreshCw className="mr-1.5 size-3" />
					重新检测
				</Button>
			</div>
		);
	}

	const installedCount = visibleEffects.filter(
		(effect) => effect.supported && effect.installed
	).length;
	const downloadableCount = visibleEffects.filter(
		(effect) => effect.supported && !effect.installed
	).length;

	return (
		<div className="flex h-full min-h-0" data-testid="effect-lab-panel">
			<aside
				className="w-20 shrink-0 overflow-y-auto border-border/40 border-r py-1"
				data-testid="effect-lab-category-rail"
			>
				{(Object.keys(PANEL_LABELS) as JianyingEffectPanel[]).map((panel) => {
					const named = new Set(
						categories
							.filter(
								(category) =>
									category.panel === panel && !category.id.endsWith("-other")
							)
							.flatMap((category) => category.categoryIds)
					);
					const panelCategories = categories.filter((category) => {
						if (category.panel !== panel) return false;
						// A catch-all with nothing left over would be an empty tab.
						if (!category.id.endsWith("-other")) return true;
						return effects.some(
							(effect) =>
								effect.panel === panel &&
								!effect.categoryIds.some((id) => named.has(id))
						);
					});
					if (panelCategories.length === 0) return null;
					return (
						<div key={panel} className="mb-2">
							<div className="px-2 py-1 font-medium text-[10px] text-muted-foreground">
								{PANEL_LABELS[panel]}
							</div>
							{panelCategories.map((category) => {
								const isActive =
									activeCategory?.id === category.id &&
									activeCategory.panel === category.panel;
								return (
									<button
										key={`${panel}-${category.id}`}
										type="button"
										data-testid={`effect-lab-category-${category.id}`}
										className={cn(
											"block w-full truncate px-2 py-1 text-left text-[11px] transition-colors",
											isActive
												? "font-medium text-primary"
												: "text-foreground/75 hover:text-foreground"
										)}
										onClick={() =>
											setSelectedCategory({
												id: category.id,
												panel: category.panel,
											})
										}
									>
										{category.name}
									</button>
								);
							})}
						</div>
					);
				})}
			</aside>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
					<span>
						{query ? "搜索结果" : (activeCategory?.name ?? "全部")} · 已装{" "}
						{installedCount}
						{downloadableCount > 0 ? ` · 可下载 ${downloadableCount}` : ""}
					</span>
					<Button
						size="sm"
						variant="text"
						aria-label="重新检测本机剪映特效"
						onClick={() => void refresh()}
					>
						<RefreshCw aria-hidden="true" className="size-3" />
					</Button>
				</div>
				<div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-y-auto p-3 pt-0">
					{visibleEffects.map((definition) => (
						<button
							key={definition.id}
							type="button"
							disabled={!definition.supported}
							title={definition.unsupportedReason ?? definition.name}
							data-testid={`effect-lab-card-${definition.id}`}
							className={cn(
								"group flex flex-col overflow-hidden rounded border border-border/60 text-left transition-colors",
								definition.supported
									? "hover:border-primary/60"
									: "cursor-not-allowed opacity-60"
							)}
							onClick={() => handleTileClick({ definition })}
						>
							<EffectCoverTile
								definition={definition}
								coverDataUrl={covers[definition.effectId]}
								downloadState={downloads[definition.effectId]}
							/>
							<span className="truncate px-1.5 py-1 text-[10px]">
								{definition.name}
							</span>
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
