import {
	Download,
	FlaskConical,
	Gem,
	Loader2,
	Lock,
	RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
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
 * tabs and every card shows the official cover. QCut ships none of the
 * effects — installed entries come from the local Jianying caches, the rest
 * download on demand through the main process, and every package renders
 * through the local Jianying runtime.
 */

type DownloadState = "downloading" | "failed";

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
	downloadState,
}: {
	definition: JianyingEffectDefinition;
	downloadState: DownloadState | undefined;
}) {
	return (
		<div className="relative aspect-video w-full overflow-hidden bg-foreground/5">
			{definition.coverUrl ? (
				<img
					src={definition.coverUrl}
					alt={definition.name}
					loading="lazy"
					className="h-full w-full object-cover"
					draggable={false}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					<FlaskConical className="size-4" />
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
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null
	);

	const effects = status?.effects ?? [];
	const categories = status?.categories ?? [];

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

	const query = searchQuery.trim().toLowerCase();
	const activeCategory =
		categories.find((category) => category.id === selectedCategoryId) ??
		categories[0];
	// A search covers everything, like Jianying's 搜索全部特效 box.
	const visibleEffects = query
		? effects.filter((effect) => effect.name.toLowerCase().includes(query))
		: activeCategory
			? effects.filter(
					(effect) =>
						effect.panel === activeCategory.panel &&
						effect.categoryIds.includes(activeCategory.id)
				)
			: effects;

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
					const panelCategories = categories.filter(
						(category) => category.panel === panel
					);
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
										onClick={() => setSelectedCategoryId(category.id)}
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
