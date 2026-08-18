import { useMemo, useState } from "react";
import { assetManifestIdentity } from "@qcut/editor-core";
import { FlaskConical, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	loadJianyingFilterRecents,
	rememberJianyingFilter,
} from "@/lib/filters/jianying-filter-lab-preferences";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type {
	ColorCubeLut,
	ColorLutSettings,
	ColorMultiPassSettings,
} from "@/types/timeline";
import type {
	JianyingFilterImplementation,
	JianyingFilterLabFilterSummary,
	JianyingFilterLabLutSummary,
} from "@/types/electron";
import { JIANYING_FILTER_IMPLEMENTATION_LABELS } from "./jianying-filter-lab-labels";
import { JianyingFilterLabSidebar } from "./jianying-filter-lab-sidebar";
import { JianyingFilterLabTile } from "./jianying-filter-lab-tile";
import { JianyingFilterLabControls } from "./jianying-filter-lab-controls";
import { useJianyingFilterLab } from "./use-jianying-filter-lab";

type CatalogView = "available" | "cached" | "favorites" | "recent" | "all";
type ImplementationFilter = "all" | JianyingFilterImplementation;

const ALL_CATEGORIES = "all";
const UNCATEGORIZED = "__uncategorized";
const INITIAL_VISIBLE_FILTERS = 120;

const CATALOG_VIEWS: Array<{ id: CatalogView; label: string }> = [
	{ id: "available", label: "可用" },
	{ id: "cached", label: "已缓存" },
	{ id: "favorites", label: "收藏" },
	{ id: "recent", label: "最近" },
	{ id: "all", label: "全部目录" },
];

const IMPLEMENTATION_OPTIONS: Array<{
	id: ImplementationFilter;
	label: string;
}> = [
	{ id: "all", label: "全部类型" },
	{ id: "single-lut", label: "单 LUT" },
	{ id: "dual-lut", label: "双 LUT" },
	{ id: "shader", label: "Shader" },
	{ id: "face-ai", label: "人脸 AI" },
	{ id: "unknown", label: "待识别" },
];

function unavailableMessage({
	filter,
}: {
	filter: JianyingFilterLabFilterSummary;
}) {
	if (filter.cacheStatus === "uncached") {
		return filter.downloadable
			? `「${filter.title}」尚未下载，点击卡片右侧的下载按钮获取`
			: `在剪映中使用一次「${filter.title}」后，返回这里重新扫描`;
	}
	if (filter.cacheStatus === "partial") {
		return `「${filter.title}」的本地缓存版本不完整或已经过期`;
	}
	if (filter.implementation === "dual-lut") {
		return `「${filter.title}」需要背景、肤色 LUT 与 skin mask 一起渲染`;
	}
	if (filter.implementation === "face-ai") {
		return `「${filter.title}」依赖人脸或皮肤算法，不能作为普通 LUT 应用`;
	}
	if (filter.implementation === "shader") {
		return `「${filter.title}」是 Shader 效果包，尚未接入对应渲染器`;
	}
	return `「${filter.title}」的实现类型尚未确认`;
}

function filterMatchesQuery({
	filter,
	query,
}: {
	filter: JianyingFilterLabFilterSummary;
	query: string;
}) {
	if (!query) return true;
	return [
		filter.title,
		filter.resourceId,
		filter.version,
		JIANYING_FILTER_IMPLEMENTATION_LABELS[filter.implementation],
		...filter.categories,
	]
		.filter((value): value is string => Boolean(value))
		.some((value) => value.toLocaleLowerCase().includes(query));
}

function filterMatchesCatalogView({
	filter,
	view,
}: {
	filter: JianyingFilterLabFilterSummary;
	view: CatalogView;
}) {
	if (view === "available") return filter.available;
	if (view === "cached") return filter.cacheStatus !== "uncached";
	return true;
}

export function JianyingFilterLab({
	targetName,
	activeEffect,
	onApply,
	onApplyMultiPass,
	onEffectEnabledChange,
	onEffectIntensityChange,
	onEffectIntensityCommit,
}: {
	targetName?: string;
	activeEffect?:
		| ColorLutSettings
		| Pick<ColorMultiPassSettings, "enabled" | "name" | "intensity">
		| null;
	onApply: ({
		name,
		cube,
		skinCube,
		entry,
		localRuntimeReady,
	}: {
		name: string;
		cube: ColorCubeLut;
		skinCube?: ColorCubeLut;
		entry: JianyingFilterLabLutSummary;
		localRuntimeReady?: boolean;
	}) => void;
	onApplyMultiPass?: ({
		settings,
	}: {
		settings: ColorMultiPassSettings;
	}) => void;
	onEffectEnabledChange?: ({ enabled }: { enabled: boolean }) => void;
	onEffectIntensityChange?: ({ value }: { value: number }) => void;
	onEffectIntensityCommit?: () => void;
}) {
	const {
		checking,
		count,
		cachedCount,
		availableCount,
		filters,
		categories,
		error,
		refresh,
		download,
		downloading,
	} = useJianyingFilterLab();
	const [query, setQuery] = useState("");
	const [catalogView, setCatalogView] = useState<CatalogView>("available");
	const [implementation, setImplementation] =
		useState<ImplementationFilter>("all");
	const [category, setCategory] = useState(ALL_CATEGORIES);
	const [loadingResourceId, setLoadingResourceId] = useState("");
	const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_FILTERS);
	const [recentIds, setRecentIds] = useState(loadJianyingFilterRecents);
	const favorites = useAssetLibraryStore((state) => state.favorites);
	const toggleFavorite = useAssetLibraryStore((state) => state.toggleFavorite);
	const favoriteIds = useMemo(
		() =>
			new Set(
				filters
					.filter(
						({ resourceId }) =>
							favorites[
								assetManifestIdentity({
									kind: "filter",
									id: `jianying:${resourceId}`,
								})
							] === true
					)
					.map(({ resourceId }) => resourceId)
			),
		[favorites, filters]
	);

	const categoryOptions = useMemo(() => {
		const options = [
			{
				id: ALL_CATEGORIES,
				label: "全部",
				total: count,
				available: availableCount,
			},
			...categories.map((entry) => ({
				id: entry.name,
				label: entry.name,
				...entry,
			})),
		];
		const uncategorized = filters.filter(
			({ categories: names }) => names.length === 0
		);
		if (uncategorized.length > 0) {
			options.push({
				id: UNCATEGORIZED,
				label: "未分类",
				total: uncategorized.length,
				available: uncategorized.filter(({ available }) => available).length,
			});
		}
		return options;
	}, [availableCount, categories, count, filters]);
	const activeCategory = categoryOptions.some(({ id }) => id === category)
		? category
		: ALL_CATEGORIES;
	// The accessible names here are the panel's contract: a category tab reads
	// "夏日 1/2", a view tab reads "已缓存". Keep them stable when restyling.
	const sidebarGroups = useMemo(
		() => [
			{
				id: "views",
				label: "浏览",
				activeId: catalogView,
				entries: CATALOG_VIEWS.map(({ id, label }) => ({ id, label })),
				onSelect: ({ id }: { id: string }) => {
					setCatalogView(id as CatalogView);
					setVisibleLimit(INITIAL_VISIBLE_FILTERS);
				},
			},
			{
				id: "categories",
				label: "滤镜库",
				activeId: activeCategory,
				entries: categoryOptions.map((option) => ({
					id: option.id,
					label: option.label,
					count: `${option.available}/${option.total}`,
				})),
				onSelect: ({ id }: { id: string }) => {
					setCategory(id);
					setVisibleLimit(INITIAL_VISIBLE_FILTERS);
				},
			},
		],
		[activeCategory, catalogView, categoryOptions]
	);
	const matchingFilters = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const recentOrder = new Map(recentIds.map((id, index) => [id, index]));
		const matched = filters.filter((filter) => {
			if (!filterMatchesCatalogView({ filter, view: catalogView }))
				return false;
			if (catalogView === "favorites" && !favoriteIds.has(filter.resourceId)) {
				return false;
			}
			if (catalogView === "recent" && !recentOrder.has(filter.resourceId)) {
				return false;
			}
			if (
				implementation !== "all" &&
				filter.implementation !== implementation
			) {
				return false;
			}
			if (activeCategory === UNCATEGORIZED) {
				if (filter.categories.length > 0) return false;
			} else if (
				activeCategory !== ALL_CATEGORIES &&
				!filter.categories.includes(activeCategory)
			) {
				return false;
			}
			return filterMatchesQuery({ filter, query: normalizedQuery });
		});
		if (catalogView === "recent") {
			matched.sort(
				(left, right) =>
					(recentOrder.get(left.resourceId) ?? Number.MAX_SAFE_INTEGER) -
					(recentOrder.get(right.resourceId) ?? Number.MAX_SAFE_INTEGER)
			);
		}
		return matched;
	}, [
		activeCategory,
		catalogView,
		favoriteIds,
		filters,
		implementation,
		query,
		recentIds,
	]);
	const visibleFilters = matchingFilters.slice(0, visibleLimit);

	const applyFilter = async ({
		filter,
	}: {
		filter: JianyingFilterLabFilterSummary;
	}) => {
		if (!filter.available) {
			toast.info(unavailableMessage({ filter }));
			return;
		}
		const reference = filter.luts.find(({ role }) =>
			filter.implementation === "dual-lut"
				? role === "background"
				: role === "single"
		);
		const skinReference = filter.luts.find(({ role }) => role === "skin");
		if (
			!filter.renderer &&
			(!reference || (filter.implementation === "dual-lut" && !skinReference))
		) {
			toast.error("该滤镜缺少完整的可加载 LUT");
			return;
		}
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) {
			toast.error("滤镜实验室仅在 QCut 桌面版中可用");
			return;
		}
		setLoadingResourceId(filter.resourceId);
		try {
			if (filter.renderer) {
				if (!onApplyMultiPass) {
					throw new Error("多 Pass Shader 应用接口不可用");
				}
				const loaded = await api.loadRenderer({
					resourceId: filter.resourceId,
				});
				onApplyMultiPass({ settings: loaded });
				setRecentIds((current) =>
					rememberJianyingFilter({ resourceId: filter.resourceId, current })
				);
				return;
			}
			if (!reference) {
				throw new Error("该滤镜缺少可加载 LUT");
			}
			const [loaded, loadedSkin, localRuntime] = await Promise.all([
				api.load({ lutId: reference.lutId }),
				skinReference ? api.load({ lutId: skinReference.lutId }) : undefined,
				skinReference && typeof api.inspectLocalRuntime === "function"
					? api.inspectLocalRuntime()
					: undefined,
			]);
			onApply({
				name: filter.title,
				cube: loaded.cube,
				...(loadedSkin ? { skinCube: loadedSkin.cube } : {}),
				...(localRuntime
					? { localRuntimeReady: localRuntime.state === "ready" }
					: {}),
				entry: loaded,
			});
			setRecentIds((current) =>
				rememberJianyingFilter({ resourceId: filter.resourceId, current })
			);
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "无法加载剪映 LUT");
		} finally {
			setLoadingResourceId("");
		}
	};

	return (
		<div className="space-y-2.5" data-testid="jianying-filter-lab">
			<div className="flex items-center gap-1.5">
				<div className="relative min-w-0 flex-1">
					<Search
						className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						value={query}
						placeholder="搜索滤镜"
						aria-label="搜索剪映滤镜目录"
						className="h-8 w-full rounded-sm border border-border/70 bg-background pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
						onChange={(event) => {
							setQuery(event.target.value);
							setVisibleLimit(INITIAL_VISIBLE_FILTERS);
						}}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					disabled={checking}
					title="重新扫描本机剪映缓存"
					aria-label="重新扫描本机剪映缓存"
					onClick={() => void refresh()}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
				</Button>
			</div>

			<div className="flex items-center gap-1.5">
				<select
					value={implementation}
					aria-label="筛选滤镜实现类型"
					className="h-7 min-w-0 flex-1 rounded-sm border border-border/60 bg-background px-1 text-[10px] text-foreground outline-none focus:border-primary/60"
					onChange={(event) => {
						setImplementation(event.target.value as ImplementationFilter);
						setVisibleLimit(INITIAL_VISIBLE_FILTERS);
					}}
				>
					{IMPLEMENTATION_OPTIONS.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
			</div>

			<div className="flex h-5 items-center gap-1.5 text-[10px] text-muted-foreground">
				<FlaskConical className="size-3" aria-hidden="true" />
				<span className="min-w-0 flex-1 truncate">
					{checking
						? "正在扫描本机缓存"
						: error ||
							`显示 ${matchingFilters.length} · 可用 ${availableCount}/${count} · 缓存 ${cachedCount}`}
				</span>
				{targetName ? (
					<span className="max-w-[36%] truncate" title={targetName}>
						{targetName}
					</span>
				) : null}
			</div>

			{activeEffect &&
			onEffectEnabledChange &&
			onEffectIntensityChange &&
			onEffectIntensityCommit ? (
				<JianyingFilterLabControls
					effect={activeEffect}
					onEnabledChange={onEffectEnabledChange}
					onIntensityChange={onEffectIntensityChange}
					onIntensityCommit={onEffectIntensityCommit}
				/>
			) : null}

			<div className="flex min-w-0 gap-2">
				<JianyingFilterLabSidebar groups={sidebarGroups} />

				<div className="min-w-0 flex-1 space-y-2">
					{!checking && !error && matchingFilters.length === 0 ? (
						<div className="grid h-28 place-items-center rounded-md border border-border/50 px-4 text-center text-xs text-muted-foreground">
							{filters.length === 0 ? "没有找到剪映滤镜目录" : "没有匹配的滤镜"}
						</div>
					) : null}

					<div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
						{visibleFilters.map((filter) => (
							<JianyingFilterLabTile
								key={filter.resourceId}
								filter={filter}
								loading={loadingResourceId === filter.resourceId}
								favorite={favoriteIds.has(filter.resourceId)}
								downloading={downloading.has(filter.resourceId)}
								onApply={({ filter: selectedFilter }) =>
									void applyFilter({ filter: selectedFilter })
								}
								onDownload={({ filter: selectedFilter }) =>
									void download({ resourceId: selectedFilter.resourceId })
								}
								onToggleFavorite={({ filter: selectedFilter }) =>
									toggleFavorite({
										kind: "filter",
										id: `jianying:${selectedFilter.resourceId}`,
									})
								}
							/>
						))}
					</div>

					{visibleFilters.length < matchingFilters.length ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 w-full"
							onClick={() => setVisibleLimit((current) => current + 120)}
						>
							显示更多
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}
