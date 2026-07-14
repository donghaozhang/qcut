import {
	ChevronDown,
	Clock,
	Heart,
	Library,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { useState } from "react";
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

const AUXILIARY_MODE_ITEMS = [
	{ id: "favorites", label: "收藏", icon: Heart },
	{ id: "recent", label: "最近", icon: Clock },
] as const;

const AI_MODE_ITEM = { id: "ai", label: "AI生成", icon: Sparkles } as const;

function navigationButtonClass({ active }: { active: boolean }): string {
	return cn(
		"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
		active
			? "bg-primary/15 font-medium text-primary"
			: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
	);
}

function ModeButton({
	icon: Icon,
	id,
	label,
	mode,
	onSelectMode,
}: {
	icon: LucideIcon;
	id: Exclude<StickerPanelMode, "library" | "store">;
	label: string;
	mode: StickerPanelMode;
	onSelectMode: ({ mode }: { mode: StickerPanelMode }) => void;
}) {
	const active = mode === id;
	return (
		<button
			type="button"
			className={navigationButtonClass({ active })}
			aria-pressed={active}
			onClick={() => onSelectMode({ mode: id })}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.currentTarget.click();
				}
			}}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span>{label}</span>
		</button>
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
	const [libraryExpanded, setLibraryExpanded] = useState(true);
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
		<aside
			className="w-[112px] shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2"
			data-testid="sticker-sidebar"
		>
			<div className="space-y-0.5 border-b border-border/50 pb-2">
				{AUXILIARY_MODE_ITEMS.map((item) => (
					<ModeButton
						key={item.id}
						icon={item.icon}
						id={item.id}
						label={item.label}
						mode={mode}
						onSelectMode={onSelectMode}
					/>
				))}
			</div>

			<div className="py-2">
				<button
					type="button"
					className={cn(
						navigationButtonClass({ active: false }),
						mode === "library" && "font-semibold text-primary"
					)}
					aria-expanded={libraryExpanded}
					aria-pressed={mode === "library"}
					onClick={() => {
						if (mode !== "library") {
							onSelectMode({ mode: "library" });
							setLibraryExpanded(true);
							return;
						}
						setLibraryExpanded((expanded) => !expanded);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<Library className="size-3.5" aria-hidden="true" />
					<span className="min-w-0 flex-1">贴纸库</span>
					<ChevronDown
						className={cn(
							"size-3 shrink-0 transition-transform",
							!libraryExpanded && "-rotate-90"
						)}
						aria-hidden="true"
					/>
				</button>
				{libraryExpanded && (
					<div className="mt-0.5 space-y-0.5">
						<ModeButton
							icon={AI_MODE_ITEM.icon}
							id={AI_MODE_ITEM.id}
							label={AI_MODE_ITEM.label}
							mode={mode}
							onSelectMode={onSelectMode}
						/>
						{[...featuredCategories, ...libraryCategories].map((category) => (
							<CategoryButton
								key={category.id}
								category={category}
								mode={mode}
								onSelectCategory={onSelectCategory}
								selectedCategory={selectedCategory}
							/>
						))}
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
					</div>
				)}
			</div>
		</aside>
	);
}
