import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Cpu,
	RefreshCw,
	Search,
} from "lucide-react";
import type { JianyingFilterCatalogCard } from "../../../../../../../../electron/jianying-filter-catalog-export";
import type { JianyingFilterLab } from "./jianying-filter-lab";
import { JianyingFilterLabControls } from "./jianying-filter-lab-controls";
import { useJianyingFilterThumbnail } from "./use-jianying-filter-thumbnail";

const PAGE_SIZE = 36;
const RENDERER_LABELS = {
	fog: "雾化 · 4 Pass",
	lut: "3D LUT",
	direct: "3DL",
	sharpen: "锐化 · 2 Pass",
	vignette: "纹理暗角 · 3 Pass",
	soften: "柔化 · 2 Pass",
	"detail-chain": "细节增强 · 5 Pass",
	"tiled-alpha": "LUT · Alpha 混合",
	spring: "柔光 · 4 Pass",
	"edge-camera": "边缘与色散 · 7 Pass",
	"edge-glow": "边缘柔光 · 11 Pass",
	"mask-invariant": "等价双 LUT · 1 Pass",
	"mask-invariant-sharpen": "等价双 LUT · 2 Pass",
};

function IndependentLutTile({
	card,
	disabled,
	pending,
	onApply,
}: {
	card: JianyingFilterCatalogCard;
	disabled: boolean;
	pending: boolean;
	onApply: (card: JianyingFilterCatalogCard) => void;
}) {
	const thumbnail = useJianyingFilterThumbnail({
		resourceId: card.resourceId,
		hasThumbnail: true,
	});
	return (
		<button
			type="button"
			aria-label={`应用 ${card.title} QCut Metal`}
			disabled={disabled}
			className="min-w-0 overflow-hidden rounded-md border border-border text-left hover:border-primary disabled:opacity-50"
			onClick={() => onApply(card)}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			<div
				ref={thumbnail.containerRef}
				className="grid aspect-square place-items-center bg-muted"
			>
				{thumbnail.state === "ready" ? (
					<img
						src={thumbnail.url}
						alt={card.title}
						className="size-full object-cover"
					/>
				) : (
					<Cpu className="size-5" aria-hidden="true" />
				)}
			</div>
			<div className="h-12 p-2 text-xs">
				<div className="truncate" title={card.title}>
					{card.title}
				</div>
				<div className="text-[10px] text-muted-foreground">
					{pending ? "加载中…" : RENDERER_LABELS[card.independentKind ?? "lut"]}
				</div>
			</div>
		</button>
	);
}

export function IndependentLutLibrary({
	activeEffect,
	onApplyMultiPass,
	onEffectEnabledChange,
	onEffectIntensityChange,
	onEffectIntensityCommit,
}: ComponentProps<typeof JianyingFilterLab>) {
	const [cards, setCards] = useState<JianyingFilterCatalogCard[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("");
	const [page, setPage] = useState(0);
	const [pending, setPending] = useState("");
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		const api = window.electronAPI?.qcutIndependentFilter;
		if (!api?.list) {
			setLoading(false);
			return;
		}
		api
			.list({ refresh: attempt > 0 })
			.then((result) => {
				if (!cancelled)
					setCards(
						result.cards.filter(
							(card) => card.resourceId !== "7160594413847203085"
						)
					);
			})
			.catch((cause: unknown) => {
				if (!cancelled)
					setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [attempt]);
	const categories = useMemo(
		() => [...new Set(cards.flatMap((card) => card.categories))],
		[cards]
	);
	const matches = useMemo(
		() =>
			cards.filter(
				(card) =>
					(!category || card.categories.includes(category)) &&
					`${card.title} ${card.resourceId}`
						.toLocaleLowerCase()
						.includes(query.trim().toLocaleLowerCase())
			),
		[cards, category, query]
	);
	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
	const active =
		activeEffect?.name.endsWith(" · QCut Metal") &&
		activeEffect.name !== "迷雾 · QCut Metal"
			? activeEffect
			: undefined;
	const apply = async (card: JianyingFilterCatalogCard) => {
		const api = window.electronAPI?.qcutIndependentFilter;
		if (!api || !card.version || pending) return;
		setPending(card.resourceId);
		setError("");
		try {
			const settings = await api.load({
				resourceId: card.resourceId,
				version: card.version,
			});
			onApplyMultiPass?.({ settings, layerName: settings.name });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPending("");
		}
	};
	return (
		<section
			className="space-y-2 border-t border-border pt-3"
			data-testid="independent-lut-library"
		>
			<div className="flex items-center justify-between text-xs">
				<span role="status">
					{loading ? "扫描本地滤镜…" : `本地滤镜 · ${cards.length}`}
				</span>
				<button
					type="button"
					aria-label="刷新本地 LUT"
					title="刷新本地 LUT"
					disabled={loading}
					className="grid size-7 place-items-center"
					onClick={() => setAttempt((value) => value + 1)}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<RefreshCw className="size-3.5" aria-hidden="true" />
				</button>
			</div>
			{active &&
				onEffectEnabledChange &&
				onEffectIntensityChange &&
				onEffectIntensityCommit && (
					<JianyingFilterLabControls
						effect={active}
						onEnabledChange={onEffectEnabledChange}
						onIntensityChange={onEffectIntensityChange}
						onIntensityCommit={onEffectIntensityCommit}
					/>
				)}
			<div className="flex items-center gap-2 rounded-md border border-border px-2">
				<Search className="size-3.5 shrink-0" aria-hidden="true" />
				<input
					type="search"
					aria-label="搜索 QCut 本地 LUT"
					placeholder="搜索滤镜"
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setPage(0);
					}}
					className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
				/>
			</div>
			<select
				aria-label="QCut LUT 分类"
				value={category}
				onChange={(event) => {
					setCategory(event.target.value);
					setPage(0);
				}}
				className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
			>
				<option value="">全部分类</option>
				{categories.map((name) => (
					<option key={name} value={name}>
						{name}
					</option>
				))}
			</select>
			{error && (
				<p role="alert" className="break-words text-xs text-destructive">
					{error}
				</p>
			)}
			{!loading && !matches.length && (
				<p className="py-4 text-center text-xs text-muted-foreground">
					暂无匹配滤镜
				</p>
			)}
			<div className="grid grid-cols-3 gap-2">
				{visible.map((card) => (
					<IndependentLutTile
						key={`${card.resourceId}/${card.version}`}
						card={card}
						disabled={Boolean(pending) || !onApplyMultiPass}
						pending={pending === card.resourceId}
						onApply={(entry) => {
							void apply(entry);
						}}
					/>
				))}
			</div>
			<div className="flex items-center justify-between text-xs">
				<button
					type="button"
					aria-label="上一页 LUT"
					title="上一页"
					disabled={current === 0}
					className="grid size-8 place-items-center disabled:opacity-30"
					onClick={() => setPage(current - 1)}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<ChevronLeft className="size-4" aria-hidden="true" />
				</button>
				<span>
					{current + 1} / {pages} · {matches.length}
				</span>
				<button
					type="button"
					aria-label="下一页 LUT"
					title="下一页"
					disabled={current + 1 >= pages}
					className="grid size-8 place-items-center disabled:opacity-30"
					onClick={() => setPage(current + 1)}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<ChevronRight className="size-4" aria-hidden="true" />
				</button>
			</div>
		</section>
	);
}
