import { useEffect, useMemo, useState } from "react";
import {
	AlertTriangle,
	ArrowLeft,
	Check,
	ChevronRight,
	FlaskConical,
	ImageOff,
	Layers3,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
	JianyingTextAnimationLabSummary,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextStyleCategoryId,
	JianyingTextStyleLabListResult,
	JianyingTextStyleLabStyleSummary,
} from "@/types/electron";
import { useJianyingTextStyleLab } from "./use-jianying-text-style-lab";
import { useJianyingTextAnimationLab } from "./use-jianying-text-animation-lab";
import { JianyingTextAnimationPicker } from "./jianying-text-animation-picker";
import { updateTextStyleLabAnimationSelection } from "./text-style-lab-mapping";

const TRIAL_STYLE_COUNT = 5;
const CATEGORY_STYLE_LIMIT = 20;
export type LabView = "trial" | "all" | JianyingTextStyleCategoryId;
type CoverState = "loading" | "ready" | "error" | "missing";

function displayTitle({ style }: { style: JianyingTextStyleLabStyleSummary }) {
	return style.title ?? `本机花字 ${style.resourceId.slice(-6)}`;
}

function selectTrialStyles({
	styles,
}: {
	styles: JianyingTextStyleLabStyleSummary[];
}) {
	return styles
		.filter(
			(style) =>
				style.approximation &&
				style.fillKind === "solid" &&
				style.textureLayerCount === 0
		)
		.sort((left, right) => {
			const titleDelta =
				Number(Boolean(right.title)) - Number(Boolean(left.title));
			return (
				titleDelta ||
				displayTitle({ style: left }).localeCompare(
					displayTitle({ style: right }),
					"zh-CN"
				)
			);
		})
		.slice(0, TRIAL_STYLE_COUNT);
}

function compatibilityLabel({
	style,
}: {
	style: JianyingTextStyleLabStyleSummary;
}) {
	if (style.compatibility === "flat-compatible") return "可直接映射";
	if (style.compatibility === "approximated") return "QCut 近似";
	if (style.compatibility === "native-runtime") return "本机原版渲染";
	return "仅参考预览";
}

function fillKindLabel({ style }: { style: JianyingTextStyleLabStyleSummary }) {
	if (style.packageKind !== "TextStyle") return "运行时";
	if (style.fillKind === "solid") return "纯色";
	if (style.fillKind === "gradient") return "渐变";
	if (style.fillKind === "texture") return "纹理";
	return "未知";
}

function packageKindLabel({
	style,
}: {
	style: JianyingTextStyleLabStyleSummary;
}) {
	if (style.packageKind === "TextStyle") return fillKindLabel({ style });
	if (style.packageKind === "InfoSticker") return "动态组件";
	if (style.packageKind === "ScriptInfoSticker") return "脚本组件";
	if (style.packageKind === "AmazingFeature") return "引擎组件";
	return "运行时";
}

function useStyleCover({ style }: { style: JianyingTextStyleLabStyleSummary }) {
	const [state, setState] = useState<CoverState>(
		style.hasCover ? "loading" : "missing"
	);
	const [url, setUrl] = useState("");

	useEffect(() => {
		if (!style.hasCover) {
			setState("missing");
			setUrl("");
			return;
		}
		const api = window.electronAPI?.jianyingTextStyleLab;
		if (!api) {
			setState("error");
			return;
		}
		let active = true;
		let objectUrl = "";
		setState("loading");
		void api
			.cover({ styleId: style.styleId })
			.then((result) => {
				if (!active) return;
				objectUrl = URL.createObjectURL(
					new Blob([new Uint8Array(result.bytes)], { type: result.mimeType })
				);
				setUrl(objectUrl);
				setState("ready");
			})
			.catch(() => {
				if (active) setState("error");
			});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [style.hasCover, style.styleId]);

	return { state, url };
}

function TextStyleLabCard({
	style,
	selected,
	onApply,
}: {
	style: JianyingTextStyleLabStyleSummary;
	selected: boolean;
	onApply: ({ style }: { style: JianyingTextStyleLabStyleSummary }) => void;
}) {
	const cover = useStyleCover({ style });
	const canApply = Boolean(style.approximation || style.runtimeReference);
	const title = displayTitle({ style });

	return (
		<button
			type="button"
			aria-label={canApply ? `应用花字 ${title}` : `${title} 仅供预览`}
			aria-pressed={selected}
			className={cn(
				"group min-w-0 rounded-md border bg-[#292929] p-1.5 text-left transition-colors",
				selected
					? "border-cyan-400 bg-cyan-400/10"
					: "border-white/5 hover:border-white/20 hover:bg-[#303030]",
				!canApply && "cursor-not-allowed opacity-65"
			)}
			disabled={!canApply}
			data-testid="jianying-text-style-lab-card"
			onClick={() => onApply({ style })}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			<div className="relative aspect-square overflow-hidden rounded-sm bg-[#202020]">
				{cover.state === "ready" ? (
					<img
						alt=""
						className="h-full w-full object-cover"
						draggable={false}
						src={cover.url}
					/>
				) : null}
				{cover.state === "loading" ? (
					<div className="flex h-full items-center justify-center">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : null}
				{cover.state === "error" || cover.state === "missing" ? (
					<div className="flex h-full items-center justify-center">
						<ImageOff className="size-5 text-muted-foreground" />
					</div>
				) : null}
				<div className="absolute left-1 top-1 flex items-center gap-1">
					<span
						className={cn(
							"flex size-4 items-center justify-center rounded-sm bg-black/70",
							style.compatibility === "flat-compatible"
								? "text-emerald-300"
								: style.compatibility === "approximated"
									? "text-amber-300"
									: style.compatibility === "native-runtime"
										? "text-cyan-300"
										: "text-muted-foreground"
						)}
						title={compatibilityLabel({ style })}
					>
						{style.compatibility === "flat-compatible" ? (
							<Check className="size-3" />
						) : style.compatibility === "approximated" ? (
							<AlertTriangle className="size-3" />
						) : (
							<Layers3 className="size-3" />
						)}
					</span>
				</div>
				{selected ? (
					<span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-sm bg-cyan-400 text-black">
						<Check className="size-3.5" />
					</span>
				) : null}
			</div>
			<div className="mt-1.5 truncate text-xs text-foreground" title={title}>
				{title}
			</div>
			<div className="mt-0.5 flex min-w-0 items-center justify-between gap-1 text-[10px] text-muted-foreground">
				<span className="truncate">{packageKindLabel({ style })}</span>
				{style.packageKind === "TextStyle" ? (
					<span className="shrink-0">
						{style.strokeCount} 描边 · {style.shadowCount} 阴影
					</span>
				) : style.runtimeReference ? (
					<span className="shrink-0">本机原版</span>
				) : (
					<span className="shrink-0">仅预览</span>
				)}
			</div>
		</button>
	);
}

/**
 * Theme groups for the category rail. Fifteen flat categories overflow the
 * left panel, so they fold into the four groupings Jianying itself implies —
 * charts, styles, effects, colours — and each group remembers its own state.
 */
export const CATEGORY_GROUPS = [
	{ id: "charts", label: "榜单", members: ["popular", "latest"] },
	{ id: "styles", label: "风格", members: ["summer", "variety", "guofeng"] },
	{ id: "effects", label: "效果", members: ["glow", "gradient", "texture"] },
	{
		id: "colors",
		label: "颜色",
		members: [
			"red",
			"yellow",
			"black-white",
			"blue",
			"pink",
			"green",
			"purple",
		],
	},
] as const;

function CategoryGroup({
	group,
	categories,
	view,
	expanded,
	onToggle,
	onSelect,
}: {
	group: (typeof CATEGORY_GROUPS)[number];
	categories: { id: string; label: string; count: number }[];
	view: LabView;
	expanded: boolean;
	onToggle: () => void;
	onSelect: (id: LabView) => void;
}) {
	const members = group.members
		.map((id) => categories.find((category) => category.id === id))
		.filter((category): category is NonNullable<typeof category> =>
			Boolean(category)
		);
	if (members.length === 0) return null;
	const holdsActive = members.some((category) => category.id === view);
	return (
		<div className="mb-1">
			<button
				type="button"
				aria-expanded={expanded}
				className={cn(
					"flex h-6 w-full items-center gap-1 rounded-sm px-1.5 text-[10px] uppercase tracking-wide",
					holdsActive && !expanded
						? "text-cyan-200"
						: "text-muted-foreground hover:bg-white/[0.06]"
				)}
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onToggle();
					}
				}}
			>
				<ChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform",
						expanded && "rotate-90"
					)}
				>
					<title>{expanded ? "收起" : "展开"}</title>
				</ChevronRight>
				<span className="truncate">{group.label}</span>
				<span className="ml-auto text-[10px]">{members.length}</span>
			</button>
			{expanded
				? members.map((category) => (
						<button
							key={category.id}
							type="button"
							aria-label={`${category.label}，${Math.min(category.count, CATEGORY_STYLE_LIMIT)} 个本地花字`}
							aria-pressed={view === category.id}
							className={cn(
								"mb-0.5 flex h-7 w-full items-center justify-between rounded-sm pl-4 pr-2 text-[11px]",
								view === category.id
									? "bg-cyan-400/10 text-cyan-200"
									: "text-muted-foreground hover:bg-white/[0.06]"
							)}
							onClick={() => onSelect(category.id as LabView)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									onSelect(category.id as LabView);
								}
							}}
						>
							<span className="truncate">{category.label}</span>
							<span className="text-[10px] text-muted-foreground">
								{Math.min(category.count, CATEGORY_STYLE_LIMIT)}
							</span>
						</button>
					))
				: null}
		</div>
	);
}

/**
 * The lab's category rail. It renders nested under the 花字实验室 entry in the
 * text panel's own left rail rather than inside the lab, so the lab expands
 * the way every other library group does — the panel keeps only the grid.
 */
export function JianyingTextStyleLabCategoryNav({
	expandedGroups,
	result,
	view,
	onSelect,
	onToggleGroup,
}: {
	expandedGroups: Record<string, boolean>;
	result: JianyingTextStyleLabListResult;
	view: LabView;
	onSelect: (id: LabView) => void;
	onToggleGroup: (groupId: string) => void;
}) {
	const trialCount = selectTrialStyles({ styles: result.styles }).length;
	return (
		<div className="pl-2">
			{(["trial", "all"] as const).map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={view === option}
					className={cn(
						"mb-1 flex h-7 w-full items-center justify-between rounded-sm px-2 text-[11px]",
						view === option
							? "bg-white/10 text-foreground"
							: "text-muted-foreground hover:bg-white/[0.06]"
					)}
					onClick={() => onSelect(option)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							onSelect(option);
						}
					}}
				>
					<span>{option === "trial" ? "五款预览" : "全部"}</span>
					<span className="text-[10px] text-muted-foreground">
						{option === "trial" ? trialCount : result.count}
					</span>
				</button>
			))}
			{CATEGORY_GROUPS.map((group) => (
				<CategoryGroup
					key={group.id}
					group={group}
					categories={result.categories}
					view={view}
					expanded={expandedGroups[group.id] ?? false}
					onToggle={() => onToggleGroup(group.id)}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

export function JianyingTextStyleLabPanel({
	onApply,
	onClose,
	view,
	lab,
}: {
	onApply: ({
		animations,
		style,
	}: {
		animations?: JianyingTextAnimationReferences;
		style: JianyingTextStyleLabStyleSummary;
	}) => void;
	/** Returns to the template list; the panel owns no open state of its own. */
	onClose: () => void;
	/** Category selection lives in the panel's own nav rail, one level up. */
	view: LabView;
	lab: ReturnType<typeof useJianyingTextStyleLab>;
}) {
	const [query, setQuery] = useState("");
	const [selectedStyleId, setSelectedStyleId] = useState("");
	const [selectedAnimations, setSelectedAnimations] =
		useState<JianyingTextAnimationReferences>({});
	const { checking, result, error, refresh } = lab;
	const animationLab = useJianyingTextAnimationLab({ enabled: true });
	const trialStyles = useMemo(
		() => selectTrialStyles({ styles: result.styles }),
		[result.styles]
	);
	const visibleStyles = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const source = (() => {
			if (normalizedQuery || view === "all") return result.styles;
			if (view === "trial") return trialStyles;
			return result.styles
				.filter(({ categoryIds }) => categoryIds.includes(view))
				.slice(0, CATEGORY_STYLE_LIMIT);
		})();
		if (!normalizedQuery) return source;
		return source.filter((style) =>
			[
				displayTitle({ style }),
				style.resourceId,
				packageKindLabel({ style }),
				compatibilityLabel({ style }),
				...style.categoryIds,
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(normalizedQuery)
		);
	}, [query, result.styles, trialStyles, view]);
	const activeCategory =
		view === "trial" || view === "all"
			? undefined
			: result.categories.find(({ id }) => id === view);
	const selectedStyle = result.styles.find(
		({ styleId }) => styleId === selectedStyleId
	);
	const animationPickerVisible = Boolean(
		selectedStyle?.runtimeReference && selectedStyle.packageKind === "TextStyle"
	);

	const applyStyle = ({
		style,
	}: {
		style: JianyingTextStyleLabStyleSummary;
	}) => {
		if (!(style.approximation || style.runtimeReference)) return;
		if (style.styleId !== selectedStyleId) {
			// Seed from the style's bundled slots so a later single-slot pick
			// doesn't wipe them: buildTextStyleLabUpdates gives a supplied
			// animations object full priority over runtimeReference.animations.
			setSelectedAnimations(style.runtimeReference?.animations ?? {});
		}
		setSelectedStyleId(style.styleId);
		onApply({ style });
	};
	const applyAnimation = ({
		animation,
		slot,
	}: {
		animation?: JianyingTextAnimationLabSummary;
		slot: JianyingTextAnimationSlot;
	}) => {
		if (!selectedStyle?.runtimeReference) return;
		const nextAnimations = updateTextStyleLabAnimationSelection({
			animation,
			animations: selectedAnimations,
			slot,
		});
		setSelectedAnimations(nextAnimations);
		onApply({ animations: nextAnimations, style: selectedStyle });
	};

	return (
		<div
			className="flex h-full min-h-0 flex-col gap-2"
			data-testid="jianying-text-style-lab-panel"
		>
			<div className="flex h-7 shrink-0 items-center gap-1.5">
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-6"
					aria-label="返回文字模板"
					onClick={onClose}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							onClose();
						}
					}}
				>
					<ArrowLeft className="size-3.5">
						<title>返回文字模板</title>
					</ArrowLeft>
				</Button>
				<FlaskConical className="size-3.5 shrink-0 text-cyan-300" />
				<h2 className="truncate font-medium text-foreground text-sm">
					花字实验室
				</h2>
			</div>
			<div className="flex items-center gap-2">
				<label className="relative min-w-0 flex-1">
					<Search className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-3.5 text-muted-foreground" />
					<Input
						aria-label="搜索花字实验室"
						className="h-8 bg-black/20 pl-8 text-xs"
						placeholder="搜索花字名称/结构"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-8"
					aria-label="刷新本机花字缓存"
					disabled={checking}
					onClick={() => void refresh({ force: true })}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							void refresh({ force: true });
						}
					}}
				>
					<RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
				</Button>
			</div>
			<div className="flex min-h-0 flex-1 gap-2">
				<section className="min-w-0 flex-1">
					<div className="flex h-7 items-center justify-between gap-2 border-white/10 border-b pb-2">
						<span className="text-xs font-medium text-foreground">
							{activeCategory?.label ??
								(view === "trial" ? "五款预览" : "全部花字")}
						</span>
						<span className="text-[10px] text-muted-foreground">
							{visibleStyles.length}
							{activeCategory ? ` / ${activeCategory.count}` : ""} 本地缓存 ·{" "}
							{result.packageCount} 包
						</span>
					</div>
					{error ? (
						<div className="flex h-56 items-center justify-center text-xs text-amber-300">
							<AlertTriangle className="mr-2 size-4" />
							{error}
						</div>
					) : null}
					{!error && checking && result.count === 0 ? (
						<div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
							<Loader2 className="mr-2 size-4 animate-spin" />
							正在读取本机花字缓存
						</div>
					) : null}
					{!error && (!checking || result.count > 0) ? (
						<div
							className={cn(
								"mt-2 grid auto-rows-max content-start grid-cols-2 gap-2 overflow-y-auto pr-1",
								animationPickerVisible ? "max-h-[16rem]" : "flex-1"
							)}
						>
							{visibleStyles.map((style) => (
								<TextStyleLabCard
									key={style.styleId}
									style={style}
									selected={selectedStyleId === style.styleId}
									onApply={applyStyle}
								/>
							))}
						</div>
					) : null}
					{animationPickerVisible ? (
						<JianyingTextAnimationPicker
							animations={animationLab.result.animations}
							checking={animationLab.checking}
							error={animationLab.error}
							selected={selectedAnimations}
							onChange={applyAnimation}
							onRefresh={() => void animationLab.refresh({ force: true })}
						/>
					) : null}
				</section>
			</div>
		</div>
	);
}
