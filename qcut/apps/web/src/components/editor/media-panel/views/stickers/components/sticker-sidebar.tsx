import { Clock, Heart, Library, Sparkles } from "lucide-react";
import {
	STICKER_CATEGORIES,
	type StickerCategoryId,
} from "@/lib/stickers/sticker-catalog";
import { cn } from "@/lib/utils";

export type StickerPanelMode =
	| "ai"
	| "favorites"
	| "library"
	| "recent"
	| "store";

interface StickerSidebarProps {
	mode: StickerPanelMode;
	selectedCategory: StickerCategoryId;
	onSelectCategory: ({ category }: { category: StickerCategoryId }) => void;
	onSelectMode: ({ mode }: { mode: StickerPanelMode }) => void;
}

const MODE_ITEMS = [
	{ id: "library", label: "贴纸库", icon: Library },
	{ id: "ai", label: "AI生成", icon: Sparkles },
	{ id: "favorites", label: "收藏", icon: Heart },
	{ id: "recent", label: "最近", icon: Clock },
] as const;

function navigationButtonClass({ active }: { active: boolean }): string {
	return cn(
		"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
		active
			? "bg-primary/15 font-medium text-primary"
			: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
	);
}

function CategoryButton({
	category,
	mode,
	selectedCategory,
	onSelectCategory,
}: {
	category: (typeof STICKER_CATEGORIES)[number];
	mode: StickerPanelMode;
	selectedCategory: StickerCategoryId;
	onSelectCategory: ({ category }: { category: StickerCategoryId }) => void;
}) {
	const active = mode === "library" && selectedCategory === category.id;
	return (
		<button
			type="button"
			className={navigationButtonClass({ active })}
			aria-pressed={active}
			aria-label={`${category.localizedLabel} / ${category.label}`}
			data-testid={`sticker-category-${category.id}`}
			onClick={() => onSelectCategory({ category: category.id })}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.currentTarget.click();
				}
			}}
		>
			<span className="w-4 shrink-0 text-center text-sm" aria-hidden="true">
				{category.emoji}
			</span>
			<span className="whitespace-nowrap">{category.localizedLabel}</span>
		</button>
	);
}

export function StickerSidebar({
	mode,
	selectedCategory,
	onSelectCategory,
	onSelectMode,
}: StickerSidebarProps) {
	const featuredCategories = STICKER_CATEGORIES.filter(
		(category) => category.group === "featured"
	);
	const libraryCategories = STICKER_CATEGORIES.filter(
		(category) => category.group === "library"
	);
	const resourceCategories = STICKER_CATEGORIES.filter(
		(category) => category.group === "resources"
	);

	return (
		<aside className="w-[112px] shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2">
			<div className="space-y-0.5 border-b border-border/50 pb-2">
				{MODE_ITEMS.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							className={navigationButtonClass({ active: mode === item.id })}
							aria-pressed={mode === item.id}
							onClick={() => onSelectMode({ mode: item.id })}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
						>
							<Icon className="size-3.5 shrink-0" aria-hidden="true" />
							<span>{item.label}</span>
						</button>
					);
				})}
			</div>

			<div className="py-2">
				<div className="mb-1 flex h-7 items-center gap-2 px-2 text-[11px] font-semibold text-foreground">
					<Library className="size-3.5" aria-hidden="true" />
					<span>贴纸库</span>
				</div>
				{[...featuredCategories, ...libraryCategories].map((category) => (
					<CategoryButton
						key={category.id}
						category={category}
						mode={mode}
						onSelectCategory={onSelectCategory}
						selectedCategory={selectedCategory}
					/>
				))}
			</div>

			<div className="space-y-0.5 border-t border-border/50 pt-2">
				{resourceCategories.map((category) => (
					<CategoryButton
						key={category.id}
						category={category}
						mode={mode}
						onSelectCategory={onSelectCategory}
						selectedCategory={selectedCategory}
					/>
				))}
			</div>
		</aside>
	);
}
