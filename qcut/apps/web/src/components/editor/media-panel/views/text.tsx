import { DraggableMediaItem } from "@/components/ui/draggable-item";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { resolveTextTemplateAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { getTextTemplateCatalogThumbnailUrl } from "@/lib/text/text-resource-catalog";
import {
	downloadTextTemplateResource,
	resolveTextTemplatePackForTimeline,
	resolveTextTemplateForTimeline,
} from "@/lib/text/text-template-resource";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useSearchStore } from "@/stores/search-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	assetManifestVersionKey,
	type AssetRuntimeState,
} from "@qcut/editor-core";
import {
	ChevronDown,
	Download,
	FileText,
	Gem,
	Heart,
	Layers3,
	Maximize2,
	Search,
} from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	getTextDefinitionsForLibraryCategory,
	getTextTemplateDownloadStatus,
	getTextTemplateResourceAccess,
	isTextTemplateDownloaded,
	isTextTemplateFavorite,
	loadTextLibraryState,
	markTextTemplateDownloaded,
	markTextTemplateDownloadFailed,
	markTextTemplateUsed,
	storeTextLibraryState,
	toggleFavoriteTextTemplate,
	type TextTemplateDownloadStatus,
	type TextTemplateResourceAccess,
	type TextLibraryState,
} from "@/lib/text/text-library-state";
import { rankTextTemplateSearchResults } from "@/lib/text/text-library-search";
import {
	compareTextTemplatesByMarketplaceOrder,
	loadTextTemplateMarketplaceRemoteConfig,
	type TextTemplateMarketplaceMetadataOverrides,
} from "@/lib/text/text-marketplace-metadata";
import {
	generateSmartTextSuggestions,
	getSmartTextCategoryId,
	isSmartTextCategory,
	type SmartTextSuggestion,
} from "@/lib/text/smart-text-generation";
import {
	applyTextTemplatePackCopy,
	buildTextTemplatePack,
	type TextTemplatePack,
	type TextTemplatePackCopySlot,
} from "@/lib/text/text-template-packs";
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
import type {
	MarkdownElement,
	TextElement,
	TextItemDragData,
} from "@/types/timeline";
import { toast } from "sonner";
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

const TEXT_TEMPLATE_GRID_COLUMNS = {
	compact: 2,
	narrow: 3,
	standard: 4,
	expanded: 5,
} as const;

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

export function buildTextTemplateDragData({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextItemDragData {
	const template = buildTextTemplate({ definition });
	const templatePack = buildTextTemplatePack({ definition });
	return {
		id: template.id,
		type: template.type,
		name: template.name,
		content: template.content,
		textTemplate: template,
		textTemplatePack: templatePack
			? {
					id: templatePack.id,
					name: templatePack.name,
					category: templatePack.category,
					copySlots: templatePack.copySlots,
					elements: templatePack.elements,
				}
			: undefined,
	};
}

export function getTextTemplatePackCopyDefaults({
	copySlots,
}: {
	copySlots: readonly TextTemplatePackCopySlot[];
}): string[] {
	return copySlots.map((slot) => slot.defaultContent);
}

export function getTextTemplateAccessibilityLabel({
	isPack,
	templateName,
}: {
	isPack: boolean;
	templateName: string;
}): string {
	return isPack
		? `添加组合文字模板 ${templateName}`
		: `添加文字模板 ${templateName}`;
}

export function applyTextTemplatePackCopyValues({
	copyValues,
	pack,
}: {
	copyValues: readonly string[];
	pack: TextTemplatePack;
}): TextTemplatePack {
	return applyTextTemplatePackCopy({
		contents: copyValues,
		pack,
	}) as TextTemplatePack;
}

function TextTemplate({
	definition,
	downloadStatus,
	isDownloaded,
	isFavorite,
	resourceAccess,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
}: {
	definition: TextTemplateDefinition;
	downloadStatus: TextTemplateDownloadStatus;
	isDownloaded: boolean;
	isFavorite: boolean;
	resourceAccess: TextTemplateResourceAccess;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
}) {
	const template = useMemo(
		() => buildTextTemplate({ definition }),
		[definition]
	);
	const dragData = useMemo(
		() => buildTextTemplateDragData({ definition }),
		[definition]
	);
	const editableTemplatePack = useMemo(
		() => buildTextTemplatePack({ definition }),
		[definition]
	);
	const [copyDialogOpen, setCopyDialogOpen] = useState(false);
	const [copyValues, setCopyValues] = useState<string[]>(() =>
		getTextTemplatePackCopyDefaults({
			copySlots: editableTemplatePack?.copySlots ?? [],
		})
	);
	const isTemplatePack = Boolean(editableTemplatePack);
	const templateAccessibilityLabel = getTextTemplateAccessibilityLabel({
		isPack: isTemplatePack,
		templateName: template.name,
	});
	const resolveTemplate = async () => {
		return resolveTextTemplateForTimeline({
			definition,
			enabled: isDownloaded,
			fallbackTemplate: template,
		});
	};
	const addToTimeline = async ({
		currentTime,
		customCopyValues,
	}: {
		currentTime?: number;
		customCopyValues?: readonly string[];
	} = {}) => {
		if (resourceAccess === "svip-required") {
			toast.error("这个文字样式需要 SVIP。");
			return;
		}
		const time = currentTime ?? usePlaybackStore.getState().currentTime;
		const resolvedTemplate = await resolveTemplate();
		const fallbackTemplatePack = buildTextTemplatePack({
			baseTemplate: resolvedTemplate,
			definition,
			currentTime: time,
		});
		const timedTemplatePack = await resolveTextTemplatePackForTimeline({
			currentTime: time,
			definition,
			enabled: isDownloaded,
			fallbackPack: fallbackTemplatePack,
			fallbackTemplate: resolvedTemplate,
		});
		const copiedTemplatePack =
			timedTemplatePack && customCopyValues
				? applyTextTemplatePackCopy({
						contents: customCopyValues,
						pack: timedTemplatePack,
					})
				: timedTemplatePack;
		const added = copiedTemplatePack
			? useTimelineStore.getState().addTextGroupAtTime({
					elements: copiedTemplatePack.elements,
					currentTime: time,
				})
			: useTimelineStore.getState().addTextAtTime(resolvedTemplate, time);
		if (added) {
			onUseTemplate({ templateId: definition.id });
		}
	};
	const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
		event.dataTransfer.setData(
			"application/x-media-item",
			JSON.stringify(dragData)
		);
		event.dataTransfer.effectAllowed = "copy";
	};
	const handleActivate = () => {
		void addToTimeline();
	};
	const handleOpenCopyDialog = () => {
		if (!editableTemplatePack) return;
		setCopyValues(
			getTextTemplatePackCopyDefaults({
				copySlots: editableTemplatePack.copySlots,
			})
		);
		setCopyDialogOpen(true);
	};
	const handleCopyValueChange = ({
		index,
		value,
	}: {
		index: number;
		value: string;
	}) => {
		setCopyValues((current) =>
			current.map((copyValue, copyIndex) =>
				copyIndex === index ? value : copyValue
			)
		);
	};
	const handleInsertWithCopy = () => {
		setCopyDialogOpen(false);
		void addToTimeline({ customCopyValues: copyValues });
	};
	const downloadLabel = getTextTemplateDownloadLabel({
		downloadStatus,
		isDownloaded,
		resourceAccess,
	});

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
				aria-label={templateAccessibilityLabel}
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
					className="relative aspect-[1.05] overflow-hidden rounded-md bg-zinc-800 shadow-[0_1px_0_rgba(255,255,255,.08),0_10px_22px_rgba(0,0,0,.22)] ring-1 ring-white/5 transition-transform group-hover:scale-[1.02]"
					onDragStart={handleDragStart}
				>
					<TextTemplateThumbnail
						definition={definition}
						template={template}
						thumbnailUrl={getTextTemplateCatalogThumbnailUrl({ definition })}
					/>
					{editableTemplatePack && (
						<div className="absolute left-1 top-5 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-cyan-200 shadow-sm ring-1 ring-white/10">
							<Layers3 aria-hidden="true" className="h-3 w-3">
								<title>{`组合模板，${editableTemplatePack.elements.length}层`}</title>
							</Layers3>
						</div>
					)}
					{editableTemplatePack &&
						editableTemplatePack.copySlots.length > 0 && (
							<button
								type="button"
								aria-label="替换模板文案"
								className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-colors hover:bg-black/80 group-focus-within:opacity-100 group-hover:opacity-100"
								onClick={(event) => {
									event.stopPropagation();
									handleOpenCopyDialog();
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
								}}
							>
								<FileText aria-hidden="true" className="h-3.5 w-3.5">
									<title>替换模板文案</title>
								</FileText>
							</button>
						)}
					{definition.premium && (
						<div className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-sm">
							<Gem aria-hidden="true" className="h-2.5 w-2.5">
								<title>会员素材</title>
							</Gem>
						</div>
					)}
					<button
						type="button"
						aria-label={isFavorite ? "取消收藏" : "收藏"}
						className={cn(
							"absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-colors hover:bg-black/75 group-focus-within:opacity-100 group-hover:opacity-100",
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
						aria-label={downloadLabel}
						disabled={downloadStatus === "downloading"}
						className={cn(
							"absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/80",
							isDownloaded && "bg-white/85 text-slate-900 hover:bg-white",
							downloadStatus === "downloading" &&
								"cursor-wait bg-cyan-400 text-slate-950 hover:bg-cyan-400",
							downloadStatus === "failed" &&
								"bg-rose-500 text-white hover:bg-rose-600"
						)}
						onClick={(event) => {
							event.stopPropagation();
							onDownload({ definition });
						}}
						onKeyDown={(event) => {
							event.stopPropagation();
						}}
					>
						<Download aria-hidden="true" className="h-3.5 w-3.5">
							<title>{downloadLabel}</title>
						</Download>
					</button>
				</div>
				<span className="sr-only" title={template.name}>
					{template.name}
				</span>
			</div>
			{editableTemplatePack && (
				<TextTemplateCopyDialog
					copySlots={editableTemplatePack.copySlots}
					copyValues={copyValues}
					open={copyDialogOpen}
					templateName={template.name}
					onCopyValueChange={handleCopyValueChange}
					onInsert={handleInsertWithCopy}
					onOpenChange={setCopyDialogOpen}
				/>
			)}
		</div>
	);
}

function TextTemplateCopyDialog({
	copySlots,
	copyValues,
	onCopyValueChange,
	onInsert,
	onOpenChange,
	open,
	templateName,
}: {
	copySlots: readonly TextTemplatePackCopySlot[];
	copyValues: readonly string[];
	onCopyValueChange: (props: { index: number; value: string }) => void;
	onInsert: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	templateName: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm border-border/70 bg-background">
				<DialogHeader>
					<DialogTitle className="text-base">替换模板文案</DialogTitle>
					<DialogDescription>{templateName}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					{copySlots.map((slot, index) => (
						<label key={slot.id} className="block space-y-1">
							<span className="text-[0.72rem] text-muted-foreground">
								{slot.label}
							</span>
							<input
								type="text"
								value={copyValues[index] ?? slot.defaultContent}
								className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-cyan-400"
								onChange={(event) =>
									onCopyValueChange({
										index,
										value: event.target.value,
									})
								}
							/>
						</label>
					))}
				</div>
				<DialogFooter>
					<button
						type="button"
						className="h-8 rounded-md bg-cyan-400 px-3 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-300"
						onClick={onInsert}
						onKeyDown={(event) => {
							if (!isActivationKey({ event })) return;
							event.preventDefault();
							onInsert();
						}}
					>
						插入模板
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TemplateGrid({
	columnCountOverride,
	definitions,
	libraryState,
	onDownload,
	onToggleFavorite,
	onUseTemplate,
	runtimeByAssetKey,
}: {
	columnCountOverride?: number;
	definitions: readonly TextTemplateDefinition[];
	libraryState: TextLibraryState;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
}) {
	const gridRef = useRef<HTMLDivElement | null>(null);
	const [gridWidth, setGridWidth] = useState(0);
	const columnCount =
		columnCountOverride ?? getTextTemplateGridColumnCount({ width: gridWidth });

	useEffect(() => {
		const element = gridRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const [entry] = entries;
			if (!entry) return;
			setGridWidth(entry.contentRect.width);
		});
		observer.observe(element);
		setGridWidth(element.getBoundingClientRect().width);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={gridRef}
			className="grid gap-2.5 py-2"
			style={{
				gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
			}}
		>
			{definitions.map((definition) => {
				const downloadStatus = getTextTemplateRuntimeDownloadStatus({
					definition,
					runtimeByAssetKey,
					state: libraryState,
				});
				return (
					<TextTemplate
						key={definition.id}
						definition={definition}
						downloadStatus={downloadStatus}
						isDownloaded={downloadStatus === "cached"}
						isFavorite={isTextTemplateFavorite({
							definition,
							state: libraryState,
						})}
						resourceAccess={getTextTemplateResourceAccess({
							definition,
							state: libraryState,
						})}
						onDownload={onDownload}
						onToggleFavorite={onToggleFavorite}
						onUseTemplate={onUseTemplate}
					/>
				);
			})}
		</div>
	);
}

export function getTextTemplateRuntimeDownloadStatus({
	definition,
	runtimeByAssetKey,
	state,
}: {
	definition: TextTemplateDefinition;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
	state: TextLibraryState;
}): TextTemplateDownloadStatus {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const assetKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	if (asset.delivery !== "remote") {
		return getTextTemplateResourceAccess({ definition, state }) ===
			"svip-required"
			? "failed"
			: "cached";
	}
	const runtime = runtimeByAssetKey[assetKey];
	if (
		runtime?.downloadStatus === "downloading" ||
		runtime?.downloadStatus === "queued" ||
		runtime?.cacheStatus === "caching"
	) {
		return "downloading";
	}
	if (
		runtime?.downloadStatus === "downloaded" &&
		runtime.cacheStatus === "cached"
	) {
		return "cached";
	}
	if (
		runtime?.downloadStatus === "failed" ||
		runtime?.cacheStatus === "failed"
	) {
		return "failed";
	}
	return isTextTemplateDownloaded({
		definition,
		state,
	})
		? "cached"
		: getTextTemplateDownloadStatus({
				definition,
				state,
			});
}

export function getTextTemplateGridColumnCount({
	width,
}: {
	width: number;
}): number {
	if (width >= 460) return TEXT_TEMPLATE_GRID_COLUMNS.expanded;
	if (width >= 320) return TEXT_TEMPLATE_GRID_COLUMNS.standard;
	if (width >= 240) return TEXT_TEMPLATE_GRID_COLUMNS.narrow;
	return TEXT_TEMPLATE_GRID_COLUMNS.compact;
}

export function getExpandedTextTemplateGridColumnCount(): number {
	return TEXT_TEMPLATE_GRID_COLUMNS.expanded;
}

function getTextTemplateDownloadLabel({
	downloadStatus,
	isDownloaded,
	resourceAccess,
}: {
	downloadStatus: TextTemplateDownloadStatus;
	isDownloaded: boolean;
	resourceAccess: TextTemplateResourceAccess;
}): string {
	if (isDownloaded) return "已下载";
	if (downloadStatus === "failed" && resourceAccess === "svip-required") {
		return "需要SVIP";
	}
	if (downloadStatus === "downloading") return "下载中";
	if (downloadStatus === "failed") return "重试下载";
	return "下载";
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
	className,
	expandedGroupIds,
	onSelectCategory,
	onSelectGroup,
}: {
	activeCategoryId: TextTemplateCategoryId;
	className?: string;
	expandedGroupIds: ReadonlySet<TextTemplateGroupId>;
	onSelectCategory: (props: { categoryId: TextTemplateCategoryId }) => void;
	onSelectGroup: (props: { group: TextTemplateGroup }) => void;
}) {
	return (
		<nav
			aria-label="文字分类"
			className={cn(
				"w-[5.5rem] shrink-0 space-y-0.5 overflow-y-auto pr-2",
				className
			)}
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

function TextLibrarySearchField({
	onSearchQueryChange,
	searchQuery,
}: {
	onSearchQueryChange: (props: { query: string }) => void;
	searchQuery: string;
}) {
	return (
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
				onChange={(event) => onSearchQueryChange({ query: event.target.value })}
			/>
		</label>
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

function ExpandedTextLibraryDialog({
	activeHeading,
	activeCategoryId,
	definitions,
	emptyMessage,
	expandedGroupIds,
	libraryState,
	onDownload,
	onOpenChange,
	onSearchQueryChange,
	onSelectCategory,
	onSelectGroup,
	onSelectStatusFilter,
	onSelectStyleFilter,
	onToggleFavorite,
	onUseTemplate,
	open,
	runtimeByAssetKey,
	searchQuery,
	smartTextStatus,
	statusFilter,
	styleFilter,
}: {
	activeHeading: string;
	activeCategoryId: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	emptyMessage: string;
	expandedGroupIds: ReadonlySet<TextTemplateGroupId>;
	libraryState: TextLibraryState;
	onDownload: (props: { definition: TextTemplateDefinition }) => void;
	onOpenChange: (open: boolean) => void;
	onSearchQueryChange: (props: { query: string }) => void;
	onSelectCategory: (props: { categoryId: TextTemplateCategoryId }) => void;
	onSelectGroup: (props: { group: TextTemplateGroup }) => void;
	onSelectStatusFilter: (filter: TextLibraryStatusFilter) => void;
	onSelectStyleFilter: (filter: TextLibraryStyleFilter) => void;
	onToggleFavorite: (props: { templateId: string }) => void;
	onUseTemplate: (props: { templateId: string }) => void;
	open: boolean;
	runtimeByAssetKey: Readonly<Record<string, AssetRuntimeState>>;
	searchQuery: string;
	smartTextStatus: string;
	statusFilter: TextLibraryStatusFilter;
	styleFilter: TextLibraryStyleFilter;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[min(1080px,calc(100vw-2rem))] border-border/70 bg-background p-0">
				<DialogHeader className="px-4 pt-4">
					<div className="flex items-center justify-between gap-4 pr-8">
						<DialogTitle className="text-base">{activeHeading}</DialogTitle>
						<span className="text-xs text-muted-foreground">
							{smartTextStatus}
						</span>
					</div>
					<DialogDescription className="sr-only">
						展开文字素材库
					</DialogDescription>
				</DialogHeader>
				<div className="flex max-h-[76vh] min-h-[520px] min-w-0 gap-3 px-4 pb-4">
					<TextLibraryNav
						activeCategoryId={activeCategoryId}
						className="w-[7rem] border-r border-border/70 pr-3"
						expandedGroupIds={expandedGroupIds}
						onSelectCategory={onSelectCategory}
						onSelectGroup={onSelectGroup}
					/>
					<div className="min-w-0 flex-1 overflow-y-auto">
						<div className="sticky top-0 z-10 space-y-2 bg-background/95 pb-2">
							<TextLibrarySearchField
								searchQuery={searchQuery}
								onSearchQueryChange={onSearchQueryChange}
							/>
							<FilterBar
								activeFilter={statusFilter}
								filters={TEXT_LIBRARY_STATUS_FILTERS}
								onSelectFilter={onSelectStatusFilter}
							/>
							<FilterBar
								activeFilter={styleFilter}
								filters={TEXT_LIBRARY_STYLE_FILTERS}
								onSelectFilter={onSelectStyleFilter}
							/>
						</div>
						{definitions.length > 0 ? (
							<TemplateGrid
								columnCountOverride={getExpandedTextTemplateGridColumnCount()}
								definitions={definitions}
								libraryState={libraryState}
								onDownload={onDownload}
								onToggleFavorite={onToggleFavorite}
								onUseTemplate={onUseTemplate}
								runtimeByAssetKey={runtimeByAssetKey}
							/>
						) : (
							<div className="py-16 text-center text-xs text-muted-foreground">
								{emptyMessage}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
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

function applySmartTextSuggestions({
	categoryId,
	definitions,
	suggestions,
}: {
	categoryId: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	suggestions: readonly SmartTextSuggestion[];
}): TextTemplateDefinition[] {
	if (!isSmartTextCategory({ categoryId }) || suggestions.length === 0) {
		return [...definitions];
	}
	return definitions.map((definition, index) => {
		const suggestion = suggestions[index % suggestions.length];
		return {
			...definition,
			content: suggestion.content,
			keywords: [
				...definition.keywords,
				suggestion.source,
				suggestion.sourceText,
				"project text",
				"项目文本",
			],
		};
	});
}

export function sortTextDefinitionsForBrowsing({
	categoryId,
	definitions,
	marketplaceOverrides,
}: {
	categoryId: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
}): TextTemplateDefinition[] {
	if (categoryId === "favorites" || categoryId === "recent") {
		return [...definitions];
	}
	return [...definitions].sort((left, right) =>
		compareTextTemplatesByMarketplaceOrder({
			left,
			overrides: marketplaceOverrides,
			right,
		})
	);
}

export function TextView() {
	const tracks = useTimelineStore((state) => state.tracks);
	const transcriptions = useSearchStore((state) => state.transcriptions);
	const runtimeByAssetKey = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey
	);
	const updateRuntimeState = useAssetLibraryStore(
		(state) => state.updateRuntimeState
	);
	const online = useOnlineStatus();
	const [activeCategoryId, setActiveCategoryId] =
		useState<TextTemplateCategoryId>(DEFAULT_TEXT_TEMPLATE_CATEGORY_ID);
	const [expandedGroupIds, setExpandedGroupIds] = useState<
		ReadonlySet<TextTemplateGroupId>
	>(() => new Set(["new-text", "fancy"]));
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] =
		useState<TextLibraryStatusFilter>("all");
	const [styleFilter, setStyleFilter] = useState<TextLibraryStyleFilter>("all");
	const [expandedLibraryOpen, setExpandedLibraryOpen] = useState(false);
	const [libraryState, setLibraryState] = useState<TextLibraryState>(() =>
		loadTextLibraryState()
	);
	const [marketplaceOverrides, setMarketplaceOverrides] =
		useState<TextTemplateMarketplaceMetadataOverrides>({});
	const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
	useEffect(() => {
		storeTextLibraryState({ state: libraryState });
	}, [libraryState]);
	useEffect(() => {
		let cancelled = false;
		loadTextTemplateMarketplaceRemoteConfig().then((result) => {
			if (cancelled || result.source === "empty") return;
			setMarketplaceOverrides(result.overrides);
		});
		return () => {
			cancelled = true;
		};
	}, []);
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
	const smartTextCategoryId = getSmartTextCategoryId({
		categoryId: activeCategory.id,
	});
	const smartTextSuggestions = useMemo(() => {
		if (!smartTextCategoryId) return [];
		return generateSmartTextSuggestions({
			categoryId: smartTextCategoryId,
			tracks,
			transcriptions,
			maxSuggestions: activeDefinitions.length,
		});
	}, [activeDefinitions.length, smartTextCategoryId, tracks, transcriptions]);
	const projectAwareDefinitions = useMemo(
		() =>
			applySmartTextSuggestions({
				categoryId: activeCategory.id,
				definitions: activeDefinitions,
				suggestions: smartTextSuggestions,
			}),
		[activeCategory.id, activeDefinitions, smartTextSuggestions]
	);
	const visibleDefinitions = useMemo(() => {
		const searchBase = normalizedSearchQuery
			? rankTextTemplateSearchResults({
					definitions: TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
					marketplaceOverrides,
					query: normalizedSearchQuery,
					state: libraryState,
				})
			: sortTextDefinitionsForBrowsing({
					categoryId: activeCategory.id,
					definitions: projectAwareDefinitions,
					marketplaceOverrides,
				});
		return searchBase.filter(
			(definition) =>
				matchesStatusFilter({
					definition,
					filter: statusFilter,
					state: libraryState,
				}) && matchesStyleFilter({ definition, filter: styleFilter })
		);
	}, [
		activeCategory.id,
		libraryState,
		marketplaceOverrides,
		normalizedSearchQuery,
		projectAwareDefinitions,
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
	const smartTextStatus =
		isSmartTextCategory({ categoryId: activeCategory.id }) &&
		!normalizedSearchQuery
			? smartTextSuggestions.length > 0
				? `已生成 ${smartTextSuggestions.length} 条`
				: "添加字幕后生成"
			: `${visibleDefinitions.length} 个样式`;
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
	const handleDownload = async ({
		definition,
	}: {
		definition: TextTemplateDefinition;
	}) => {
		const access = getTextTemplateResourceAccess({
			definition,
			state: libraryState,
		});
		const asset = resolveTextTemplateAssetEntry({ definition });
		if (access !== "allowed") {
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "SVIP_REQUIRED",
					state: current,
				})
			);
			toast.error("这个文字样式需要 SVIP。");
			return;
		}
		if (asset.delivery !== "remote") {
			const resource = await downloadTextTemplateResource({ definition });
			updateRuntimeState({
				asset,
				patch: {
					cacheHitCount: resource.cacheHitCount,
					cachedBytes: resource.cachedBytes,
					cachedFileCount: resource.cachedFileCount,
					cachedFiles: resource.files,
					cacheKey: resource.cacheKey,
					cacheStatus: "cached",
					downloadStatus: "downloaded",
					error: "",
					progress: 1,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloaded({ definition, state: current })
			);
			toast.success(`${definition.name} 已可使用。`);
			return;
		}
		if (!online) {
			updateRuntimeState({
				asset,
				patch: {
					cacheStatus: "failed",
					downloadStatus: "failed",
					error: "OFFLINE",
					progress: 0,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "OFFLINE",
					state: current,
				})
			);
			toast.error("当前离线，无法下载文字资源。");
			return;
		}
		const runtime = useAssetLibraryStore.getState().getRuntimeState({ asset });
		if (
			runtime.downloadStatus === "downloading" ||
			runtime.cacheStatus === "caching"
		) {
			return;
		}
		updateRuntimeState({
			asset,
			patch: {
				cacheStatus: "caching",
				downloadStatus: "downloading",
				error: "",
				progress: 0,
			},
		});
		try {
			const resource = await downloadTextTemplateResource({
				definition,
				onProgress: ({ progress }) =>
					updateRuntimeState({
						asset,
						patch: {
							cacheStatus: "caching",
							downloadStatus: "downloading",
							progress,
						},
					}),
			});
			updateRuntimeState({
				asset,
				patch: {
					cacheHitCount: resource.cacheHitCount,
					cachedBytes: resource.cachedBytes,
					cachedFileCount: resource.cachedFileCount,
					cachedFiles: resource.files,
					cacheKey: resource.cacheKey,
					cacheStatus: "cached",
					downloadStatus: "downloaded",
					error: "",
					progress: 1,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloaded({ definition, state: current })
			);
			toast.success(`${definition.name} 已下载。`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			updateRuntimeState({
				asset,
				patch: {
					cacheStatus: "failed",
					downloadStatus: "failed",
					error: message,
					progress: 0,
				},
			});
			setLibraryState((current) =>
				markTextTemplateDownloadFailed({
					definition,
					errorCode: "DOWNLOAD_FAILED",
					state: current,
				})
			);
			toast.error(`文字资源下载失败：${message}`);
		}
	};
	const handleToggleFavorite = ({ templateId }: { templateId: string }) => {
		setLibraryState((current) =>
			toggleFavoriteTextTemplate({ state: current, templateId })
		);
	};
	const handleSearchQueryChange = ({ query }: { query: string }) => {
		setSearchQuery(query);
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
					<TextLibrarySearchField
						searchQuery={searchQuery}
						onSearchQueryChange={handleSearchQueryChange}
					/>
					<div className="flex h-6 items-center justify-between gap-2">
						<h2 className="truncate text-sm font-medium text-foreground">
							{activeHeading}
						</h2>
						<div className="flex shrink-0 items-center gap-1.5">
							<span className="text-[0.68rem] text-muted-foreground">
								{smartTextStatus}
							</span>
							<button
								type="button"
								aria-label="展开文字素材库"
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								onClick={() => setExpandedLibraryOpen(true)}
							>
								<Maximize2 aria-hidden="true" className="h-3.5 w-3.5">
									<title>展开文字素材库</title>
								</Maximize2>
							</button>
						</div>
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
						runtimeByAssetKey={runtimeByAssetKey}
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
			<ExpandedTextLibraryDialog
				activeHeading={activeHeading}
				activeCategoryId={activeCategoryId}
				definitions={visibleDefinitions}
				emptyMessage={emptyMessage}
				expandedGroupIds={expandedGroupIds}
				libraryState={libraryState}
				onDownload={handleDownload}
				onOpenChange={setExpandedLibraryOpen}
				onSearchQueryChange={handleSearchQueryChange}
				onSelectCategory={handleSelectCategory}
				onSelectGroup={handleSelectGroup}
				onSelectStatusFilter={setStatusFilter}
				onSelectStyleFilter={setStyleFilter}
				onToggleFavorite={handleToggleFavorite}
				onUseTemplate={handleUseTemplate}
				open={expandedLibraryOpen}
				runtimeByAssetKey={runtimeByAssetKey}
				searchQuery={searchQuery}
				smartTextStatus={smartTextStatus}
				statusFilter={statusFilter}
				styleFilter={styleFilter}
			/>
		</div>
	);
}
