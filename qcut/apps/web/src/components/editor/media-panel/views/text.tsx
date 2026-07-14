import { DraggableMediaItem } from "@/components/ui/draggable-item";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { cn } from "@/lib/utils";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	ChevronDown,
	Download,
	FileText,
	Gem,
	Heart,
	Search,
} from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	getTextDefinitionsForLibraryCategory,
	isTextTemplateDownloaded,
	isTextTemplateFavorite,
	loadTextLibraryState,
	markTextTemplateDownloaded,
	markTextTemplateUsed,
	storeTextLibraryState,
	toggleFavoriteTextTemplate,
	type TextLibraryState,
} from "@/lib/text/text-library-state";
import {
	DEFAULT_TEXT_TEMPLATE_CATEGORY_ID,
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
	TEXT_TEMPLATE_GROUPS,
	buildTextTemplate,
	type TextTemplateCategoryId,
	type TextTemplateDefinition,
	type TextTemplateGroup,
	type TextTemplateGroupId,
} from "@/lib/text/text-template-registry";
import type { MarkdownElement, TextElement } from "@/types/timeline";
import { TextTemplateThumbnail } from "./text-template-thumbnail";

type TextLibraryStatusFilter =
	| "all"
	| "free"
	| "premium"
	| "downloaded"
	| "favorites";

type TextLibraryStyleFilter =
	| "all"
	| "fire"
	| "glitch"
	| "sticker"
	| "pixel"
	| "guofeng"
	| "glow"
	| "blue"
	| "red";

const TEXT_LIBRARY_STATUS_FILTERS: readonly {
	id: TextLibraryStatusFilter;
	label: string;
}[] = [
	{ id: "all", label: "全部" },
	{ id: "free", label: "免费" },
	{ id: "premium", label: "SVIP" },
	{ id: "downloaded", label: "已下载" },
	{ id: "favorites", label: "收藏" },
];

const TEXT_LIBRARY_STYLE_FILTERS: readonly {
	id: TextLibraryStyleFilter;
	label: string;
}[] = [
	{ id: "all", label: "全部风格" },
	{ id: "fire", label: "火焰" },
	{ id: "glitch", label: "故障" },
	{ id: "sticker", label: "贴纸" },
	{ id: "pixel", label: "像素" },
	{ id: "guofeng", label: "国风" },
	{ id: "glow", label: "发光" },
	{ id: "blue", label: "蓝色" },
	{ id: "red", label: "红色" },
];

const markdownData: MarkdownElement = {
	id: "default-markdown",
	type: "markdown",
	name: "Default markdown",
	markdownContent: "# Title\n\nStart writing your markdown content...",
	duration: TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	theme: "dark",
	fontSize: 18,
	fontFamily: "Arial",
	padding: 16,
	backgroundColor: "rgba(0, 0, 0, 0.85)",
	textColor: "#ffffff",
	scrollMode: "static",
	scrollSpeed: 30,
	x: 0,
	y: 0,
	width: 720,
	height: 420,
	rotation: 0,
	opacity: 1,
};

function buildTemplateSearchText({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	return [
		definition.id,
		definition.name,
		definition.content,
		definition.category,
		definition.groupId,
		definition.variantId,
		...definition.keywords,
	]
		.join(" ")
		.toLocaleLowerCase();
}

function TextTemplate({
	definition,
	isDownloaded,
	isFavorite,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
}: {
	definition: TextTemplateDefinition;
	isDownloaded: boolean;
	isFavorite: boolean;
	onDownload: (props: { templateId: string }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
}) {
	const template = useMemo(
		() => buildTextTemplate({ definition }),
		[definition]
	);
	const addToTimeline = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addTextAtTime(template, time);
		onUseTemplate({ templateId: definition.id });
	};
	const dragData = {
		id: template.id,
		type: template.type,
		name: template.name,
		content: template.content,
		textTemplate: template,
	};
	const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
		event.dataTransfer.setData(
			"application/x-media-item",
			JSON.stringify(dragData)
		);
		event.dataTransfer.effectAllowed = "copy";
	};
	const handleActivate = () => addToTimeline();

	return (
		<div
			className="group relative w-full"
			data-testid={
				template.id === "default-text" ? "text-overlay-button" : undefined
			}
		>
			<div
				role="button"
				tabIndex={0}
				aria-label={`Add ${template.name}`}
				className="relative cursor-default"
				onClick={handleActivate}
				onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					handleActivate();
				}}
			>
				<div
					draggable
					className="relative aspect-[1.05] overflow-hidden rounded-md bg-muted shadow-sm transition-transform group-hover:scale-[1.02]"
					onDragStart={handleDragStart}
				>
					<TextTemplateThumbnail definition={definition} template={template} />
					{definition.premium && (
						<div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-sm">
							<Gem aria-hidden="true" className="h-3 w-3">
								<title>会员素材</title>
							</Gem>
						</div>
					)}
					<button
						type="button"
						className={cn(
							"absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/75",
							isFavorite && "bg-rose-500 text-white hover:bg-rose-600"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onToggleFavorite({ templateId: definition.id });
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
						}}
					>
						<Heart
							aria-hidden="true"
							className={cn("h-3.5 w-3.5", isFavorite && "fill-current")}
						>
							<title>{isFavorite ? "取消收藏" : "收藏"}</title>
						</Heart>
					</button>
					<button
						type="button"
						className={cn(
							"absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80",
							isDownloaded && "bg-white/85 text-slate-900 hover:bg-white"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onDownload({ templateId: definition.id });
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
						}}
					>
						<Download aria-hidden="true" className="h-3.5 w-3.5">
							<title>{isDownloaded ? "已下载" : "下载"}</title>
						</Download>
					</button>
				</div>
				<span
					className="mt-1 block truncate text-[0.68rem] text-muted-foreground"
					title={template.name}
				>
					{template.name}
				</span>
			</div>
		</div>
	);
}

function TemplateGrid({
	definitions,
	libraryState,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
}: {
	definitions: readonly TextTemplateDefinition[];
	libraryState: TextLibraryState;
	onDownload: (props: { templateId: string }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
}) {
	return (
		<div className="grid grid-cols-5 gap-2 py-2">
			{definitions.map((definition) => (
				<TextTemplate
					key={definition.id}
					definition={definition}
					isDownloaded={isTextTemplateDownloaded({
						definition,
						state: libraryState,
					})}
					isFavorite={isTextTemplateFavorite({
						definition,
						state: libraryState,
					})}
					onDownload={onDownload}
					onToggleFavorite={onToggleFavorite}
					onUseTemplate={onUseTemplate}
				/>
			))}
		</div>
	);
}

function MarkdownTemplate({
	onAdd,
}: {
	onAdd: (currentTime?: number) => void;
}) {
	return (
		<div className="w-full">
			<DraggableMediaItem
				data-testid="markdown-overlay-button"
				name="Markdown"
				preview={
					<div className="flex h-full w-full items-center justify-center rounded-sm bg-muted p-2">
						<div className="flex flex-col items-center gap-1 text-muted-foreground">
							<FileText aria-hidden="true" className="h-5 w-5" />
							<span className="select-none text-center text-xs">Markdown</span>
						</div>
					</div>
				}
				dragData={{
					id: markdownData.id,
					type: markdownData.type,
					name: markdownData.name,
					markdownContent: markdownData.markdownContent,
				}}
				aspectRatio={1.4}
				onAddToTimeline={onAdd}
				onActivate={() => onAdd()}
				showLabel
				stopPropagation={false}
			/>
		</div>
	);
}

function isActivationKey({
	event,
}: {
	event: KeyboardEvent<HTMLButtonElement>;
}): boolean {
	return event.key === "Enter" || event.key === " ";
}

function TextLibraryNav({
	activeCategoryId,
	expandedGroupIds,
	onSelectCategory,
	onSelectGroup,
}: {
	activeCategoryId: TextTemplateCategoryId;
	expandedGroupIds: ReadonlySet<TextTemplateGroupId>;
	onSelectCategory: (props: { categoryId: TextTemplateCategoryId }) => void;
	onSelectGroup: (props: { group: TextTemplateGroup }) => void;
}) {
	return (
		<nav
			aria-label="文字分类"
			className="w-[5.5rem] shrink-0 space-y-0.5 overflow-y-auto pr-2"
		>
			{TEXT_TEMPLATE_GROUPS.map((group) => {
				const isExpanded = expandedGroupIds.has(group.id);
				const hasActiveCategory = group.categories.some(
					(category) => category.id === activeCategoryId
				);

				return (
					<div key={group.id} className="space-y-1">
						<button
							type="button"
							aria-expanded={isExpanded}
							className={cn(
								"flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-[0.72rem] font-medium text-muted-foreground transition-colors",
								hasActiveCategory && "bg-accent text-cyan-300 shadow-inner",
								!hasActiveCategory && "hover:bg-accent/70 hover:text-foreground"
							)}
							onClick={() => onSelectGroup({ group })}
							onKeyDown={(event) => {
								if (!isActivationKey({ event })) return;
								event.preventDefault();
								onSelectGroup({ group });
							}}
						>
							<span className="truncate">{group.label}</span>
							<ChevronDown
								aria-hidden="true"
								className={cn(
									"h-3 w-3 shrink-0 transition-transform",
									isExpanded ? "rotate-0" : "-rotate-90"
								)}
							/>
						</button>
						{isExpanded && (
							<div className="space-y-0.5 pl-2">
								{group.categories.map((category) => {
									const isActive = category.id === activeCategoryId;

									return (
										<button
											key={category.id}
											type="button"
											className={cn(
												"h-6 w-full truncate rounded-md px-2 text-left text-[0.7rem] transition-colors",
												isActive
													? "bg-accent text-cyan-300 shadow-inner"
													: "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
											)}
											onClick={() =>
												onSelectCategory({ categoryId: category.id })
											}
											onKeyDown={(event) => {
												if (!isActivationKey({ event })) return;
												event.preventDefault();
												onSelectCategory({ categoryId: category.id });
											}}
										>
											{category.label}
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</nav>
	);
}

function matchesStatusFilter({
	definition,
	filter,
	state,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibraryStatusFilter;
	state: TextLibraryState;
}): boolean {
	if (filter === "free") return !definition.premium;
	if (filter === "premium") return definition.premium;
	if (filter === "downloaded") {
		return isTextTemplateDownloaded({ definition, state });
	}
	if (filter === "favorites") {
		return isTextTemplateFavorite({ definition, state });
	}
	return true;
}

function matchesStyleFilter({
	definition,
	filter,
}: {
	definition: TextTemplateDefinition;
	filter: TextLibraryStyleFilter;
}): boolean {
	if (filter === "all") return true;
	const searchable = buildTemplateSearchText({ definition });
	return (
		definition.variantId === filter ||
		definition.category === filter ||
		searchable.includes(filter)
	);
}

function FilterBar<TFilter extends string>({
	filters,
	activeFilter,
	onSelectFilter,
}: {
	filters: readonly { id: TFilter; label: string }[];
	activeFilter: TFilter;
	onSelectFilter: (filter: TFilter) => void;
}) {
	return (
		<div className="flex gap-1 overflow-x-auto pb-1">
			{filters.map((filter) => (
				<button
					key={filter.id}
					type="button"
					className={cn(
						"h-6 shrink-0 rounded-md px-2 text-[0.68rem] transition-colors",
						filter.id === activeFilter
							? "bg-cyan-400 text-slate-950"
							: "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
					)}
					onClick={() => onSelectFilter(filter.id)}
					onKeyDown={(event) => {
						if (!isActivationKey({ event })) return;
						event.preventDefault();
						onSelectFilter(filter.id);
					}}
				>
					{filter.label}
				</button>
			))}
		</div>
	);
}

function getTextLibraryEmptyMessage({
	categoryId,
	hasActiveFilters,
}: {
	categoryId: TextTemplateCategoryId;
	hasActiveFilters: boolean;
}): string {
	if (hasActiveFilters) return "没有找到匹配的文字样式";
	if (categoryId === "favorites") return "还没有收藏文字样式";
	if (categoryId === "recent") return "还没有最近使用的文字样式";
	if (categoryId === "brand-kit") return "还没有品牌字资产";
	if (categoryId === "drafts") return "还没有保存的文字草稿";
	return "没有找到匹配的文字样式";
}

export function TextView() {
	const [activeCategoryId, setActiveCategoryId] =
		useState<TextTemplateCategoryId>(DEFAULT_TEXT_TEMPLATE_CATEGORY_ID);
	const [expandedGroupIds, setExpandedGroupIds] = useState<
		ReadonlySet<TextTemplateGroupId>
	>(() => new Set(["new-text", "fancy"]));
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] =
		useState<TextLibraryStatusFilter>("all");
	const [styleFilter, setStyleFilter] = useState<TextLibraryStyleFilter>("all");
	const [libraryState, setLibraryState] = useState<TextLibraryState>(() =>
		loadTextLibraryState()
	);
	const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
	useEffect(() => {
		storeTextLibraryState({ state: libraryState });
	}, [libraryState]);
	const activeCategory = useMemo(
		() =>
			TEXT_TEMPLATE_CATEGORIES.find(
				(category) => category.id === activeCategoryId
			) ?? TEXT_TEMPLATE_CATEGORIES[0],
		[activeCategoryId]
	);
	const activeDefinitions = useMemo(
		() =>
			getTextDefinitionsForLibraryCategory({
				category: activeCategory.id,
				definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
				state: libraryState,
			}),
		[activeCategory.id, libraryState]
	);
	const visibleDefinitions = useMemo(() => {
		const searchBase = normalizedSearchQuery
			? TEXT_TEMPLATE_LIBRARY_DEFINITIONS.filter((definition) =>
					buildTemplateSearchText({ definition }).includes(
						normalizedSearchQuery
					)
				)
			: activeDefinitions;
		return searchBase.filter(
			(definition) =>
				matchesStatusFilter({
					definition,
					filter: statusFilter,
					state: libraryState,
				}) && matchesStyleFilter({ definition, filter: styleFilter })
		);
	}, [
		activeDefinitions,
		libraryState,
		normalizedSearchQuery,
		statusFilter,
		styleFilter,
	]);
	const activeHeading = normalizedSearchQuery
		? `搜索结果 ${visibleDefinitions.length}`
		: activeCategory.label;
	const hasActiveFilters =
		Boolean(normalizedSearchQuery) ||
		statusFilter !== "all" ||
		styleFilter !== "all";
	const emptyMessage = getTextLibraryEmptyMessage({
		categoryId: activeCategory.id,
		hasActiveFilters,
	});
	const addMarkdown = (currentTime?: number) => {
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		useTimelineStore.getState().addMarkdownAtTime(markdownData, time);
	};
	const handleSelectCategory = ({
		categoryId,
	}: {
		categoryId: TextTemplateCategoryId;
	}) => {
		setActiveCategoryId(categoryId);
	};
	const handleSelectGroup = ({ group }: { group: TextTemplateGroup }) => {
		const firstCategory = group.categories[0];
		if (firstCategory) setActiveCategoryId(firstCategory.id);
		setExpandedGroupIds((current) => {
			const next = new Set(current);
			next.add(group.id);
			return next;
		});
	};
	const handleDownload = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			markTextTemplateDownloaded({ state: current, templateId })
		);
	};
	const handleToggleFavorite = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			toggleFavoriteTextTemplate({ state: current, templateId })
		);
	};
	const handleUseTemplate = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			markTextTemplateUsed({ state: current, templateId })
		);
	};

	return (
		<div className="flex h-full min-h-0 p-2" data-testid="text-panel">
			<TextLibraryNav
				activeCategoryId={activeCategoryId}
				expandedGroupIds={expandedGroupIds}
				onSelectCategory={handleSelectCategory}
				onSelectGroup={handleSelectGroup}
			/>
			<section className="min-w-0 flex-1 overflow-y-auto border-l border-border/70 pl-3">
				<div className="sticky top-0 z-10 space-y-2 bg-background/95 pb-2">
					<label className="relative block">
						<Search
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute left-3 top-1/2 h-4 w-4 text-muted-foreground"
						>
							<title>搜索</title>
						</Search>
						<input
							type="search"
							value={searchQuery}
							placeholder="搜索花字颜色/样式"
							className="h-8 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan-400"
							onChange={(event) => setSearchQuery(event.target.value)}
						/>
					</label>
					<div className="flex h-6 items-center justify-between">
						<h2 className="text-sm font-medium text-foreground">
							{activeHeading}
						</h2>
						<span className="text-[0.68rem] text-muted-foreground">
							{visibleDefinitions.length} 个样式
						</span>
					</div>
					<FilterBar
						activeFilter={statusFilter}
						filters={TEXT_LIBRARY_STATUS_FILTERS}
						onSelectFilter={setStatusFilter}
					/>
					<FilterBar
						activeFilter={styleFilter}
						filters={TEXT_LIBRARY_STYLE_FILTERS}
						onSelectFilter={setStyleFilter}
					/>
				</div>
				{visibleDefinitions.length > 0 ? (
					<TemplateGrid
						definitions={visibleDefinitions}
						libraryState={libraryState}
						onDownload={handleDownload}
						onToggleFavorite={handleToggleFavorite}
						onUseTemplate={handleUseTemplate}
					/>
				) : (
					<div className="py-12 text-center text-xs text-muted-foreground">
						{emptyMessage}
					</div>
				)}
				{!normalizedSearchQuery &&
					activeCategory.id === DEFAULT_TEXT_TEMPLATE_CATEGORY_ID && (
						<MarkdownTemplate onAdd={addMarkdown} />
					)}
			</section>
		</div>
	);
}
