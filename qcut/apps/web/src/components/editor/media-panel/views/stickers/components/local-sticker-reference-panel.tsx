"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { PRIVATE_REFERENCE_PROVENANCE } from "@/lib/stickers/local-sticker-reference";
import {
	isRemoteStickerCatalog,
	type StickerLabCatalog,
} from "@/lib/stickers/local-sticker-manifest";
import { LocalStickerReferenceItem } from "./local-sticker-reference-item";
import type { PrivateStickerCategoryView } from "./private-sticker-category-views";

const EMPTY_UNAVAILABLE_CATALOG_IDS: readonly string[] = [];
const EMPTY_PRIVATE_CATEGORIES: readonly PrivateStickerCategoryView[] = [];

export interface StickerLabSelection {
	catalogKey: "public" | "private";
	categoryId: string;
}

/**
 * The sidebar (highlight) and panel (grid) must agree on the visible
 * category, so both resolve the raw selection through this one function.
 * Falls back to the first public category, then the first private one —
 * a lab whose public manifest failed still opens on the reference slice.
 */
export function resolveStickerLabSelection({
	privateCategories,
	publicCategories,
	selection,
}: {
	privateCategories: readonly PrivateStickerCategoryView[];
	publicCategories: readonly { id: string }[];
	selection: StickerLabSelection | null;
}): StickerLabSelection | null {
	if (selection) {
		const categories =
			selection.catalogKey === "private" ? privateCategories : publicCategories;
		if (categories.some((category) => category.id === selection.categoryId)) {
			return selection;
		}
	}
	const publicFirst = publicCategories[0];
	if (publicFirst) return { catalogKey: "public", categoryId: publicFirst.id };
	const privateFirst = privateCategories[0];
	if (privateFirst) {
		return { catalogKey: "private", categoryId: privateFirst.id };
	}
	return null;
}

export function LocalStickerReferencePanel({
	catalog,
	error,
	isLoading,
	onSelect,
	privateCategories = EMPTY_PRIVATE_CATEGORIES,
	selection = null,
	unavailablePrivateCatalogIds = EMPTY_UNAVAILABLE_CATALOG_IDS,
}: {
	catalog: StickerLabCatalog | null;
	error: string | null;
	isLoading: boolean;
	onSelect: ({ file }: { file: File }) => Promise<void>;
	privateCategories?: readonly PrivateStickerCategoryView[];
	selection?: StickerLabSelection | null;
	unavailablePrivateCatalogIds?: readonly string[];
}) {
	const publicCategories = catalog?.categories ?? [];
	const resolvedSelection = resolveStickerLabSelection({
		privateCategories,
		publicCategories,
		selection,
	});
	const isPrivateSelection = resolvedSelection?.catalogKey === "private";
	const selectedCategory = isPrivateSelection
		? privateCategories.find(
				(category) => category.id === resolvedSelection?.categoryId
			)
		: publicCategories.find(
				(category) => category.id === resolvedSelection?.categoryId
			);
	// A reference catalogue that failed to load takes its slice of the stickers
	// with it. Without this the panel is indistinguishable from a small one.
	const missingCatalogCount = unavailablePrivateCatalogIds.length;
	const hasPrivateCatalog = privateCategories.length > 0;
	// Check the public catalogue first: its shape is a superset of the private
	// one, so the negated private guard would (structurally) swallow it.
	const provenance = isPrivateSelection
		? PRIVATE_REFERENCE_PROVENANCE
		: catalog
			? isRemoteStickerCatalog(catalog)
				? catalog.provenance
				: catalog.version === 2
					? PRIVATE_REFERENCE_PROVENANCE
					: undefined
			: undefined;

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="local-sticker-reference-panel"
		>
			{missingCatalogCount > 0 ? (
				<div
					className="m-2 shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-200/90"
					data-testid="sticker-lab-private-catalog-warning"
				>
					{missingCatalogCount} 个参照素材包未能载入
					{hasPrivateCatalog
						? "，当前只显示部分贴纸（"
						: "，剪映参照贴纸暂时无法显示（"}
					{unavailablePrivateCatalogIds.join("、")}）
				</div>
			) : null}
			{/* Public-catalog loading and errors must not mask the private
			    catalogue, which loads independently. */}
			{isLoading && !isPrivateSelection ? (
				<div
					className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
					data-testid="local-sticker-catalog-loading"
				>
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span>正在读取贴纸实验目录</span>
				</div>
			) : error && !isPrivateSelection ? (
				<div
					className="m-3 flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
					role="alert"
				>
					<AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span className="min-w-0 break-words">{error}</span>
				</div>
			) : selectedCategory ? (
				<>
					<div className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 px-3">
						<div className="flex min-w-0 items-baseline gap-2">
							<span className="text-[11px] font-medium">
								{selectedCategory.label}
							</span>
							<span className="truncate text-[10px] text-muted-foreground">
								{selectedCategory.sourcePanel}
							</span>
						</div>
						<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
							{selectedCategory.items.length} 个贴纸
						</span>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						<div
							className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2"
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
				</>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
					暂无实验贴纸
				</div>
			)}
		</div>
	);
}
