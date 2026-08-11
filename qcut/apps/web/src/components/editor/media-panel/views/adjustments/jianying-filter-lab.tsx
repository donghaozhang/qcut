import { useMemo, useState } from "react";
import {
	FlaskConical,
	LoaderCircle,
	Palette,
	RefreshCw,
	Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ColorCubeLut } from "@/types/timeline";
import type {
	JianyingFilterLabLutSummary,
	JianyingLutRole,
} from "@/types/electron";
import { useJianyingFilterLab } from "./use-jianying-filter-lab";

type RoleFilter = "all" | JianyingLutRole;

const ROLE_OPTIONS: Array<{ id: RoleFilter; label: string }> = [
	{ id: "all", label: "全部" },
	{ id: "single", label: "单 LUT" },
	{ id: "background", label: "背景" },
	{ id: "skin", label: "肤色" },
];

const ALL_CATEGORIES = "all";
const UNCATEGORIZED = "__uncategorized";

const ROLE_LABELS: Record<JianyingLutRole, string> = {
	single: "单 LUT",
	background: "背景",
	skin: "肤色",
};

function displayTitle({ entry }: { entry: JianyingFilterLabLutSummary }) {
	return entry.title?.trim() || `滤镜 ${entry.resourceId.slice(-6)}`;
}

function displayLutName({ entry }: { entry: JianyingFilterLabLutSummary }) {
	const title = displayTitle({ entry });
	return entry.role === "single"
		? title
		: `${title} · ${ROLE_LABELS[entry.role]}`;
}

export function JianyingFilterLab({
	targetName,
	onApply,
}: {
	targetName?: string;
	onApply: ({
		name,
		cube,
		entry,
	}: {
		name: string;
		cube: ColorCubeLut;
		entry: JianyingFilterLabLutSummary;
	}) => void;
}) {
	const { checking, luts, categoryOrder, error, refresh } =
		useJianyingFilterLab();
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<RoleFilter>("all");
	const [category, setCategory] = useState(ALL_CATEGORIES);
	const [loadingLutId, setLoadingLutId] = useState("");
	// Jianying's own panel order, kept to categories that actually contain
	// local LUTs; "未分类" only appears when metadata is missing for some.
	const categoryOptions = useMemo(() => {
		const present = new Set(luts.flatMap((entry) => entry.categories ?? []));
		const options: Array<{ id: string; label: string }> = [
			{ id: ALL_CATEGORIES, label: "全部" },
		];
		for (const name of categoryOrder) {
			if (present.has(name)) options.push({ id: name, label: name });
		}
		if (luts.some((entry) => !entry.categories?.length)) {
			options.push({ id: UNCATEGORIZED, label: "未分类" });
		}
		return options;
	}, [luts, categoryOrder]);
	// A refresh can drop the selected category (cache changed) — fall back
	// to 全部 instead of silently filtering everything out.
	const activeCategory = categoryOptions.some(({ id }) => id === category)
		? category
		: ALL_CATEGORIES;
	const visibleLuts = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return luts.filter((entry) => {
			if (role !== "all" && entry.role !== role) return false;
			if (activeCategory === UNCATEGORIZED) {
				if (entry.categories?.length) return false;
			} else if (activeCategory !== ALL_CATEGORIES) {
				if (!entry.categories?.includes(activeCategory)) return false;
			}
			if (!normalizedQuery) return true;
			return [
				entry.title,
				entry.resourceId,
				entry.fileName,
				entry.version,
				...(entry.categories ?? []),
			]
				.filter((value): value is string => Boolean(value))
				.some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
		});
	}, [luts, query, role, activeCategory]);

	const applyEntry = async ({
		entry,
	}: {
		entry: JianyingFilterLabLutSummary;
	}) => {
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) {
			toast.error("滤镜实验室仅在 QCut 桌面版中可用");
			return;
		}
		setLoadingLutId(entry.lutId);
		try {
			const loaded = await api.load({ lutId: entry.lutId });
			onApply({
				name: displayLutName({ entry: loaded }),
				cube: loaded.cube,
				entry: loaded,
			});
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "无法加载剪映 LUT");
		} finally {
			setLoadingLutId("");
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
						aria-label="搜索本机剪映 LUT"
						className="h-8 w-full rounded-sm border border-border/70 bg-background pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					disabled={checking}
					title="重新扫描本机剪映 LUT"
					aria-label="重新扫描本机剪映 LUT"
					onClick={() => void refresh()}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
				</Button>
			</div>

			{categoryOptions.length > 1 ? (
				<div
					className="flex gap-1 overflow-x-auto pb-0.5"
					role="tablist"
					aria-label="剪映滤镜分类"
					data-testid="jianying-filter-lab-categories"
				>
					{categoryOptions.map((option) => (
						<button
							key={option.id}
							type="button"
							role="tab"
							aria-selected={activeCategory === option.id}
							className={cn(
								"h-7 shrink-0 whitespace-nowrap rounded-sm border px-2 text-[10px] transition-colors",
								activeCategory === option.id
									? "border-primary/50 bg-primary/15 text-primary"
									: "border-border/60 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							)}
							onClick={() => setCategory(option.id)}
							onKeyDown={(event) => {
								if (event.key === "Escape") event.currentTarget.blur();
							}}
						>
							{option.label}
						</button>
					))}
				</div>
			) : null}

			<div
				className="grid grid-cols-4 gap-1"
				role="tablist"
				aria-label="剪映 LUT 类型"
			>
				{ROLE_OPTIONS.map((option) => (
					<button
						key={option.id}
						type="button"
						role="tab"
						aria-selected={role === option.id}
						className={cn(
							"h-7 min-w-0 rounded-sm border px-1 text-[10px] transition-colors",
							role === option.id
								? "border-primary/50 bg-primary/15 text-primary"
								: "border-border/60 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
						)}
						onClick={() => setRole(option.id)}
						onKeyDown={(event) => {
							if (event.key === "Escape") event.currentTarget.blur();
						}}
					>
						<span className="block truncate">{option.label}</span>
					</button>
				))}
			</div>

			<div className="flex h-5 items-center gap-1.5 text-[10px] text-muted-foreground">
				<FlaskConical className="size-3" aria-hidden="true" />
				<span className="min-w-0 flex-1 truncate">
					{checking
						? "正在扫描本机缓存"
						: error || `${visibleLuts.length} 个 LUT`}
				</span>
				{targetName ? (
					<span className="max-w-[42%] truncate" title={targetName}>
						{targetName}
					</span>
				) : null}
			</div>

			{!checking && !error && visibleLuts.length === 0 ? (
				<div className="grid h-28 place-items-center border-y border-border/50 px-4 text-center text-xs text-muted-foreground">
					{luts.length === 0 ? "没有找到本机剪映 LUT" : "没有匹配的 LUT"}
				</div>
			) : null}

			<div className="space-y-1.5">
				{visibleLuts.map((entry) => {
					const loading = loadingLutId === entry.lutId;
					return (
						<button
							key={entry.lutId}
							type="button"
							className="flex h-14 w-full items-center gap-2 rounded-md border border-border/60 bg-card px-2 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
							disabled={Boolean(loadingLutId)}
							aria-label={`应用 ${displayLutName({ entry })}`}
							onClick={() => void applyEntry({ entry })}
							onKeyDown={(event) => {
								if (event.key === "Escape") event.currentTarget.blur();
							}}
						>
							<span className="grid size-9 shrink-0 place-items-center rounded-sm bg-foreground/7 text-primary">
								{loading ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<Palette className="size-4" />
								)}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-xs font-medium">
									{displayTitle({ entry })}
								</span>
								<span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
									<span className="rounded-sm bg-foreground/8 px-1 py-0.5">
										{ROLE_LABELS[entry.role]}
									</span>
									<span>{entry.size}³</span>
									<span className="truncate font-mono">
										{entry.version.slice(0, 7)}
									</span>
								</span>
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
