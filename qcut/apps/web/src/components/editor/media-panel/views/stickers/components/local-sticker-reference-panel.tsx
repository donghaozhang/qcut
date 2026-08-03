"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import {
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { PRIVATE_REFERENCE_PROVENANCE } from "@/lib/stickers/local-sticker-reference";
import {
	isRemoteStickerCatalog,
	type PrivateStickerCatalog,
	type StickerLabCatalog,
} from "@/lib/stickers/local-sticker-manifest";
import { cn } from "@/lib/utils";
import { LocalStickerReferenceItem } from "./local-sticker-reference-item";
import { buildPrivateStickerCategoryViews } from "./private-sticker-category-views";
import {
	getStickerCatalogPanelId,
	getStickerCatalogTabId,
	StickerCatalogTabs,
} from "./sticker-catalog-tabs";

const EMPTY_UNAVAILABLE_CATALOG_IDS: readonly string[] = [];
const EMPTY_PRIVATE_CATALOGS: readonly PrivateStickerCatalog[] = [];

export function LocalStickerReferencePanel({
	catalog,
	error,
	isLoading,
	onSelect,
	privateCatalogs = EMPTY_PRIVATE_CATALOGS,
	unavailablePrivateCatalogIds = EMPTY_UNAVAILABLE_CATALOG_IDS,
}: {
	catalog: StickerLabCatalog | null;
	error: string | null;
	isLoading: boolean;
	onSelect: ({ file }: { file: File }) => Promise<void>;
	privateCatalogs?: readonly PrivateStickerCatalog[];
	unavailablePrivateCatalogIds?: readonly string[];
}) {
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null
	);
	const [activeCatalogKey, setActiveCatalogKey] = useState<
		"public" | "private"
	>("public");
	const categoryTabRefs = useRef(new Map<string, HTMLButtonElement>());
	const privateCategories = useMemo(
		() => buildPrivateStickerCategoryViews({ catalogs: privateCatalogs }),
		[privateCatalogs]
	);
	const hasPrivateCatalog = privateCatalogs.length > 0;
	// A reference catalogue that failed to load takes its slice of the stickers
	// with it. Without this the panel is indistinguishable from a small one.
	const missingCatalogCount = unavailablePrivateCatalogIds.length;
	const isPrivateCatalogActive =
		activeCatalogKey === "private" && hasPrivateCatalog;
	const categories = isPrivateCatalogActive
		? privateCategories
		: (catalog?.categories ?? []);
	// Check the public catalogue first: its shape is a superset of the private
	// one, so the negated private guard would (structurally) swallow it.
	const provenance = isPrivateCatalogActive
		? PRIVATE_REFERENCE_PROVENANCE
		: catalog
			? isRemoteStickerCatalog(catalog)
				? catalog.provenance
				: catalog.version === 2
					? PRIVATE_REFERENCE_PROVENANCE
					: undefined
			: undefined;
	const selectedCategory =
		categories.find((category) => category.id === selectedCategoryId) ??
		categories[0];

	const switchCatalog = ({
		catalogKey,
	}: {
		catalogKey: "public" | "private";
	}) => {
		if (catalogKey === activeCatalogKey) return;
		setActiveCatalogKey(catalogKey);
		setSelectedCategoryId(null);
	};

	const selectAndFocusCategory = ({
		categoryIndex,
	}: {
		categoryIndex: number;
	}) => {
		const category = categories.at(categoryIndex);
		if (!category) return;
		setSelectedCategoryId(category.id);
		requestAnimationFrame(() => {
			categoryTabRefs.current.get(category.id)?.focus();
		});
	};

	const handleCategoryKeyDown = ({
		categoryIndex,
		event,
	}: {
		categoryIndex: number;
		event: ReactKeyboardEvent<HTMLButtonElement>;
	}) => {
		if (!categories.length) return;

		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") {
			nextIndex = (categoryIndex + 1) % categories.length;
		}
		if (event.key === "ArrowLeft") {
			nextIndex = (categoryIndex - 1 + categories.length) % categories.length;
		}
		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = categories.length - 1;
		if (nextIndex === null) return;

		event.preventDefault();
		selectAndFocusCategory({ categoryIndex: nextIndex });
	};
	const inactiveCatalogKey =
		activeCatalogKey === "public" ? "private" : "public";

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="local-sticker-reference-panel"
		>
			<div className="shrink-0 border-b border-border/40 px-3 py-2">
				<p className="text-xs font-medium">贴纸实验室</p>
				<p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
					实验素材按需载入，不随 QCut 安装包分发
				</p>
				{missingCatalogCount > 0 ? (
					<div
						className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-200/90"
						data-testid="sticker-lab-private-catalog-warning"
					>
						{missingCatalogCount} 个参照素材包未能载入
						{hasPrivateCatalog
							? "，当前只显示部分贴纸（"
							: "，剪映参照贴纸暂时无法显示（"}
						{unavailablePrivateCatalogIds.join("、")}）
					</div>
				) : null}
				{hasPrivateCatalog ? (
					<StickerCatalogTabs
						activeCatalogKey={activeCatalogKey}
						onSelect={switchCatalog}
					/>
				) : null}
			</div>

			{hasPrivateCatalog ? (
				<div
					id={getStickerCatalogPanelId({
						catalogKey: inactiveCatalogKey,
					})}
					role="tabpanel"
					aria-labelledby={getStickerCatalogTabId({
						catalogKey: inactiveCatalogKey,
					})}
					hidden
				/>
			) : null}
			<div
				className="flex min-h-0 flex-1 flex-col"
				id={
					hasPrivateCatalog
						? getStickerCatalogPanelId({ catalogKey: activeCatalogKey })
						: undefined
				}
				role={hasPrivateCatalog ? "tabpanel" : undefined}
				aria-labelledby={
					hasPrivateCatalog
						? getStickerCatalogTabId({ catalogKey: activeCatalogKey })
						: undefined
				}
			>
				{/* Public-catalog loading and errors must not mask the private
			    catalogue, which loads independently. */}
				{isLoading && !isPrivateCatalogActive ? (
					<div
						className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
						data-testid="local-sticker-catalog-loading"
					>
						<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						<span>正在读取贴纸实验目录</span>
					</div>
				) : error && !isPrivateCatalogActive ? (
					<div
						className="m-3 flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
						role="alert"
					>
						<AlertCircle
							className="mt-0.5 size-4 shrink-0"
							aria-hidden="true"
						/>
						<span className="min-w-0 break-words">{error}</span>
					</div>
				) : selectedCategory ? (
					<>
						<div
							className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 px-2 py-2"
							role="tablist"
							aria-label="贴纸实验室分类"
							aria-orientation="horizontal"
						>
							{categories.map((category, categoryIndex) => {
								const isSelected = category.id === selectedCategory.id;
								return (
									<button
										key={category.id}
										ref={(node) => {
											if (node) {
												categoryTabRefs.current.set(category.id, node);
												return;
											}
											categoryTabRefs.current.delete(category.id);
										}}
										id={`local-sticker-category-tab-${category.id}`}
										type="button"
										role="tab"
										aria-selected={isSelected}
										aria-controls={`local-sticker-category-panel-${category.id}`}
										aria-label={`${category.label}，${category.items.length} 个贴纸`}
										tabIndex={isSelected ? 0 : -1}
										className={cn(
											"shrink-0 rounded-full px-2 py-1 text-[10px] transition-colors",
											isSelected
												? "bg-primary/15 font-medium text-primary"
												: "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
										)}
										onClick={() => setSelectedCategoryId(category.id)}
										onKeyDown={(event) =>
											handleCategoryKeyDown({ categoryIndex, event })
										}
									>
										{category.label}
									</button>
								);
							})}
						</div>
						<div
							id={`local-sticker-category-panel-${selectedCategory.id}`}
							role="tabpanel"
							aria-labelledby={`local-sticker-category-tab-${selectedCategory.id}`}
							className="flex min-h-0 flex-1 flex-col"
						>
							<div className="flex h-8 shrink-0 items-center justify-between px-3 text-[10px] text-muted-foreground">
								<span>{selectedCategory.sourcePanel}</span>
								<span className="tabular-nums">
									{selectedCategory.items.length} 个贴纸
								</span>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto p-2">
								<div
									className="grid grid-cols-3 gap-2"
									data-testid="local-sticker-category-grid"
								>
									{selectedCategory.items.map((reference) => (
										<LocalStickerReferenceItem
											key={reference.id}
											provenance={provenance}
											reference={reference}
											onSelect={onSelect}
										/>
									))}
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
						暂无实验贴纸
					</div>
				)}
			</div>
		</div>
	);
}
