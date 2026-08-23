import {
	ChevronDown,
	FlaskConical,
	Library,
	Star,
	type LucideIcon,
} from "lucide-react";
import { useState, type RefCallback } from "react";
import { cn } from "@/lib/utils";
import {
	FILTER_CATEGORIES,
	type FilterCategoryId,
	type FilterCategoryOption,
} from "./filter-categories";

export type FilterLibraryMode = "library" | "favorites" | "lab";

interface FilterSidebarProps {
	category: FilterCategoryId;
	labSidebarRef: RefCallback<HTMLDivElement>;
	mode: FilterLibraryMode;
	onSelectCategory: ({
		category,
		mode,
	}: {
		category: FilterCategoryId;
		mode: Exclude<FilterLibraryMode, "lab">;
	}) => void;
	onSelectMode: ({ mode }: { mode: FilterLibraryMode }) => void;
}

const MODE_OPTIONS: Array<{
	id: FilterLibraryMode;
	icon: LucideIcon;
	label: string;
}> = [
	{ id: "library", icon: Library, label: "Filter library" },
	{ id: "favorites", icon: Star, label: "Favorites" },
	{ id: "lab", icon: FlaskConical, label: "滤镜实验室" },
];

function navigationButtonClass({ active }: { active: boolean }) {
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
	category: FilterCategoryOption;
	mode: Exclude<FilterLibraryMode, "lab">;
	selectedCategory: FilterCategoryId;
	onSelectCategory: FilterSidebarProps["onSelectCategory"];
}) {
	const Icon = category.icon;
	const active = selectedCategory === category.id;
	return (
		<button
			type="button"
			className={navigationButtonClass({ active })}
			aria-pressed={active}
			aria-label={`${category.label} / ${category.localizedLabel}`}
			title={category.label}
			data-testid={`filter-category-${category.id}`}
			onClick={() => onSelectCategory({ category: category.id, mode })}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				event.currentTarget.click();
			}}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="min-w-0 truncate whitespace-nowrap">
				{category.localizedLabel}
			</span>
		</button>
	);
}

export function FilterSidebar({
	category,
	labSidebarRef,
	mode,
	onSelectCategory,
	onSelectMode,
}: FilterSidebarProps) {
	const [expandedMode, setExpandedMode] = useState<FilterLibraryMode | null>(
		"library"
	);

	return (
		<aside
			className="flex w-36 shrink-0 flex-col overflow-hidden border-r border-border/50 px-1.5 py-2"
			data-testid="filter-sidebar"
		>
			{MODE_OPTIONS.map(({ id, icon: Icon, label }, index) => {
				const active = mode === id;
				const expanded = active && expandedMode === id;
				const categories = FILTER_CATEGORIES.filter(
					(item) => id === "library" || item.id !== "mine"
				);
				return (
					<div
						key={id}
						className={cn(
							"flex flex-col py-1.5",
							expanded ? "min-h-0 flex-1" : "shrink-0",
							index > 0 && "border-t border-border/50"
						)}
					>
						<button
							type="button"
							className={cn(
								navigationButtonClass({ active: false }),
								active && "font-semibold text-primary"
							)}
							aria-expanded={expanded}
							aria-label={label}
							aria-pressed={active}
							data-testid={`filter-mode-${id}`}
							onClick={() => {
								if (!active) {
									onSelectMode({ mode: id });
									setExpandedMode(id);
									return;
								}
								setExpandedMode((current) => (current === id ? null : id));
							}}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								event.currentTarget.click();
							}}
						>
							<Icon className="size-3.5 shrink-0" aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate whitespace-nowrap">
								{label}
							</span>
							<ChevronDown
								className={cn(
									"size-3 shrink-0 transition-transform",
									!expanded && "-rotate-90"
								)}
								aria-hidden="true"
							/>
						</button>
						{expanded && id !== "lab" ? (
							<div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
								{categories.map((item) => (
									<CategoryButton
										key={item.id}
										category={item}
										mode={id}
										selectedCategory={category}
										onSelectCategory={onSelectCategory}
									/>
								))}
							</div>
						) : null}
						{expanded && id === "lab" ? (
							<div
								ref={labSidebarRef}
								className="mt-1 min-h-0 min-w-0 flex-1 overflow-y-auto pl-1"
							/>
						) : null}
					</div>
				);
			})}
		</aside>
	);
}
