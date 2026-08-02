"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const CATALOG_TABS = [
	{
		catalogKey: "public",
		label: "QCut 原创",
		testId: "sticker-lab-catalog-public",
	},
	{
		catalogKey: "private",
		label: "剪映参照 · 内部",
		testId: "sticker-lab-catalog-private",
	},
] as const;

export function getStickerCatalogPanelId({
	catalogKey,
}: {
	catalogKey: "public" | "private";
}): string {
	return `sticker-lab-catalog-panel-${catalogKey}`;
}

export function getStickerCatalogTabId({
	catalogKey,
}: {
	catalogKey: "public" | "private";
}): string {
	return `sticker-lab-catalog-tab-${catalogKey}`;
}

export function StickerCatalogTabs({
	activeCatalogKey,
	onSelect,
}: {
	activeCatalogKey: "public" | "private";
	onSelect: ({ catalogKey }: { catalogKey: "public" | "private" }) => void;
}) {
	const tabRefs = useRef(new Map<"public" | "private", HTMLButtonElement>());

	const selectAndFocus = ({ tabIndex }: { tabIndex: number }) => {
		const tab = CATALOG_TABS.at(tabIndex);
		if (!tab) return;
		onSelect({ catalogKey: tab.catalogKey });
		tabRefs.current.get(tab.catalogKey)?.focus();
	};

	const handleKeyDown = ({
		event,
		tabIndex,
	}: {
		event: ReactKeyboardEvent<HTMLButtonElement>;
		tabIndex: number;
	}) => {
		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") {
			nextIndex = (tabIndex + 1) % CATALOG_TABS.length;
		}
		if (event.key === "ArrowLeft") {
			nextIndex = (tabIndex - 1 + CATALOG_TABS.length) % CATALOG_TABS.length;
		}
		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = CATALOG_TABS.length - 1;
		if (nextIndex === null) return;

		event.preventDefault();
		selectAndFocus({ tabIndex: nextIndex });
	};

	return (
		<div
			className="mt-1.5 flex gap-1"
			role="tablist"
			aria-label="贴纸实验室目录"
			aria-orientation="horizontal"
		>
			{CATALOG_TABS.map((tab, tabIndex) => {
				const isSelected = tab.catalogKey === activeCatalogKey;
				return (
					<button
						key={tab.catalogKey}
						ref={(node) => {
							if (node) {
								tabRefs.current.set(tab.catalogKey, node);
								return;
							}
							tabRefs.current.delete(tab.catalogKey);
						}}
						id={getStickerCatalogTabId({ catalogKey: tab.catalogKey })}
						type="button"
						role="tab"
						aria-selected={isSelected}
						aria-controls={getStickerCatalogPanelId({
							catalogKey: tab.catalogKey,
						})}
						tabIndex={isSelected ? 0 : -1}
						data-testid={tab.testId}
						className={cn(
							"rounded-full px-2 py-0.5 text-[10px] transition-colors",
							isSelected
								? "bg-primary/15 font-medium text-primary"
								: "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
						)}
						onClick={() => onSelect({ catalogKey: tab.catalogKey })}
						onKeyDown={(event) => handleKeyDown({ event, tabIndex })}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
