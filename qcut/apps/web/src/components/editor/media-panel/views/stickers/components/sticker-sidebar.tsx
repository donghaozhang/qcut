import {
	ChevronDown,
	Clock,
	FlaskConical,
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
import type { StickerLabSelection } from "./local-sticker-reference-panel";

export type StickerPanelMode =
	| "ai"
	| "favorites"
	| "library"
	| "reference-lab"
	| "recent"
	| "store";

export interface StickerLabSidebarCategory {
	count: number;
	id: string;
	label: string;
}

export interface StickerLabSidebarProps {
	privateCategories: readonly StickerLabSidebarCategory[];
	publicCategories: readonly StickerLabSidebarCategory[];
	selection: StickerLabSelection | null;
	onSelectCategory: ({ selection }: { selection: StickerLabSelection }) => void;
}

interface StickerSidebarProps {
	mode: StickerPanelMode;
	/** Lab navigation model; null hides the entry (lab not configured). */
	referenceLab: StickerLabSidebarProps | null;
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

function LabCategoryGroup({
	catalogKey,
	categories,
	label,
	mode,
	selection,
	onSelectCategory,
}: {
	catalogKey: StickerLabSelection["catalogKey"];
	categories: readonly StickerLabSidebarCategory[];
	label: string;
	mode: StickerPanelMode;
	selection: StickerLabSelection | null;
	onSelectCategory: ({ selection }: { selection: StickerLabSelection }) => void;
}) {
	if (!categories.length) return null;
	return (
		<div>
			<p className="px-2 pb-0.5 pt-1.5 text-[10px] text-muted-foreground/70">
				{label}
			</p>
			<div className="space-y-0.5">
				{categories.map((category) => {
					const active =
						mode === "reference-lab" &&
						selection?.catalogKey === catalogKey &&
						selection.categoryId === category.id;
					return (
						<button
							key={category.id}
							type="button"
							className={navigationButtonClass({ active })}
							aria-pressed={active}
							aria-label={`${category.label}，${category.count} 个贴纸`}
							data-testid={`sticker-lab-category-${catalogKey}-${category.id}`}
							onClick={() =>
								onSelectCategory({
									selection: { catalogKey, categoryId: category.id },
								})
							}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
						>
							<span className="min-w-0 flex-1 truncate whitespace-nowrap">
								{/* Narrow rail: the QCut prefix is implied by the group
								    header, so drop it from the visible label only. Not
								    anchored — manifest labels lead with an emoji. */}
								{category.label.replace(/QCut\s*/, "")}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function StickerSidebar({
	mode,
	referenceLab,
	selectedCategory,
	onSelectCategory,
	onSelectMode,
}: StickerSidebarProps) {
	const [libraryExpanded, setLibraryExpanded] = useState(true);
	const [labExpanded, setLabExpanded] = useState(true);
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
			className="w-[128px] shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2"
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
			{referenceLab && (
				<div
					className="border-t border-border/50 pt-2"
					data-testid="sticker-reference-lab-entry"
				>
					<button
						type="button"
						className={cn(
							navigationButtonClass({ active: false }),
							mode === "reference-lab" && "font-semibold text-primary"
						)}
						aria-expanded={labExpanded}
						aria-label="贴纸实验室"
						aria-pressed={mode === "reference-lab"}
						onClick={() => {
							if (mode !== "reference-lab") {
								onSelectMode({ mode: "reference-lab" });
								setLabExpanded(true);
								return;
							}
							setLabExpanded((expanded) => !expanded);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						<FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
						{/* The rail is too narrow for 贴纸实验室 plus a chevron; the
						    stickers panel context already supplies the 贴纸 half. */}
						<span className="min-w-0 flex-1 truncate whitespace-nowrap">
							实验室
						</span>
						<ChevronDown
							className={cn(
								"size-3 shrink-0 transition-transform",
								!labExpanded && "-rotate-90"
							)}
							aria-hidden="true"
						/>
					</button>
					{labExpanded && (
						<div className="mt-0.5">
							<LabCategoryGroup
								catalogKey="public"
								categories={referenceLab.publicCategories}
								label="QCut 原创"
								mode={mode}
								selection={referenceLab.selection}
								onSelectCategory={referenceLab.onSelectCategory}
							/>
							<LabCategoryGroup
								catalogKey="private"
								categories={referenceLab.privateCategories}
								label="剪映参照 · 内部"
								mode={mode}
								selection={referenceLab.selection}
								onSelectCategory={referenceLab.onSelectCategory}
							/>
						</div>
					)}
				</div>
			)}
		</aside>
	);
}
