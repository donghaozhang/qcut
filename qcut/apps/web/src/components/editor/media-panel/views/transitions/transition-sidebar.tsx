import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	transitionEffectCategories,
	transitionStandaloneCategories,
	type TransitionCategoryItem,
} from "./transition-categories";
import type { TransitionCategory } from "./transition-presets";

function CategoryButton({
	category,
	item,
	showIcon,
	onSelect,
}: {
	category: TransitionCategory;
	item: TransitionCategoryItem;
	showIcon: boolean;
	onSelect: ({ category }: { category: TransitionCategory }) => void;
}) {
	const Icon = item.icon;
	const active = category === item.id;
	return (
		<button
			type="button"
			className={cn(
				"flex h-8 w-full min-w-0 items-center rounded px-2 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
				showIcon ? "gap-2" : "pl-5",
				active
					? "bg-primary/15 font-medium text-primary"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
			)}
			aria-pressed={active}
			onClick={() => onSelect({ category: item.id })}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			{showIcon ? (
				<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			) : null}
			<span className="min-w-0 truncate whitespace-nowrap">{item.label}</span>
		</button>
	);
}

export function TransitionSidebar({
	category,
	onSelect,
}: {
	category: TransitionCategory;
	onSelect: ({ category }: { category: TransitionCategory }) => void;
}) {
	const [effectsExpanded, setEffectsExpanded] = useState(true);
	const effectCategoryActive = transitionEffectCategories.some(
		(item) => item.id === category
	);

	return (
		<aside
			className="w-[112px] shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2"
			data-testid="transition-sidebar"
		>
			<div className="space-y-0.5 border-b border-border/50 pb-2">
				{transitionStandaloneCategories.map((item) => (
					<CategoryButton
						key={item.id}
						category={category}
						item={item}
						showIcon
						onSelect={onSelect}
					/>
				))}
			</div>

			<div className="pt-2">
				<button
					type="button"
					className={cn(
						"flex h-8 w-full min-w-0 items-center gap-1 rounded px-2 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
						effectCategoryActive
							? "text-primary"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
					)}
					aria-controls="transition-effect-categories"
					aria-expanded={effectsExpanded}
					onClick={() => setEffectsExpanded((expanded) => !expanded)}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<span className="min-w-0 flex-1 truncate whitespace-nowrap">
						转场效果
					</span>
					<ChevronDownIcon
						className={cn(
							"size-3 shrink-0 transition-transform",
							!effectsExpanded && "-rotate-90"
						)}
						aria-hidden="true"
					/>
				</button>
				{effectsExpanded ? (
					<div id="transition-effect-categories" className="mt-0.5 space-y-0.5">
						{transitionEffectCategories.map((item) => (
							<CategoryButton
								key={item.id}
								category={category}
								item={item}
								showIcon={false}
								onSelect={onSelect}
							/>
						))}
					</div>
				) : null}
			</div>
		</aside>
	);
}
