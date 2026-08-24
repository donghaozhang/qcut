import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	transitionEffectCategories,
	transitionStandaloneCategories,
	type TransitionCategoryItem,
} from "./transition-categories";
import {
	getJianyingLocalGroupCount,
	JIANYING_LOCAL_TRANSITION_GROUPS,
	type TransitionLabGroup,
	type TransitionLabSource,
} from "./transition-lab-filters";
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

function SectionHeader({
	active,
	controls,
	expanded,
	label,
	onToggle,
}: {
	active: boolean;
	controls: string;
	expanded: boolean;
	label: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-8 w-full min-w-0 items-center gap-1 rounded px-2 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
				active
					? "text-primary"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
			)}
			aria-controls={controls}
			aria-expanded={expanded}
			onClick={onToggle}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			<span className="min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
			<ChevronDownIcon
				className={cn(
					"size-3 shrink-0 transition-transform",
					!expanded && "-rotate-90"
				)}
				aria-hidden="true"
			/>
		</button>
	);
}

export function TransitionSidebar({
	category,
	labGroup,
	labSource,
	onSelect,
	onSelectLabGroup,
}: {
	category: TransitionCategory;
	labGroup: TransitionLabGroup;
	labSource: TransitionLabSource;
	onSelect: ({ category }: { category: TransitionCategory }) => void;
	onSelectLabGroup: ({ group }: { group: TransitionLabGroup }) => void;
}) {
	const [effectsExpanded, setEffectsExpanded] = useState(category !== "lab");
	const [labExpanded, setLabExpanded] = useState(category === "lab");
	const effectCategoryActive = transitionEffectCategories.some(
		(item) => item.id === category
	);
	const toggleEffects = () => {
		const expanding = !effectsExpanded;
		setEffectsExpanded(expanding);
		if (expanding) setLabExpanded(false);
	};
	const toggleLab = () => {
		if (category !== "lab") {
			onSelect({ category: "lab" });
			setEffectsExpanded(false);
			setLabExpanded(true);
			return;
		}
		setLabExpanded((expanded) => !expanded);
	};

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

			<div className="space-y-1 pt-2">
				<div>
					<SectionHeader
						active={effectCategoryActive}
						controls="transition-effect-categories"
						expanded={effectsExpanded}
						label="转场效果"
						onToggle={toggleEffects}
					/>
					{effectsExpanded ? (
						<div
							id="transition-effect-categories"
							className="mt-0.5 space-y-0.5"
						>
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

				<div>
					<SectionHeader
						active={category === "lab"}
						controls="transition-lab-categories"
						expanded={labExpanded}
						label="转场实验室"
						onToggle={toggleLab}
					/>
					{labExpanded ? (
						<div
							id="transition-lab-categories"
							className="mt-0.5 space-y-0.5"
							data-testid="transition-lab-categories"
						>
							{JIANYING_LOCAL_TRANSITION_GROUPS.map((group) => {
								const count = getJianyingLocalGroupCount({ group: group.id });
								const active =
									category === "lab" &&
									labSource === "jianying-local" &&
									labGroup === group.id;
								return (
									<button
										key={group.id}
										type="button"
										className={cn(
											"flex h-8 w-full min-w-0 items-center rounded px-2 pl-5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
											active
												? "bg-primary/15 font-medium text-primary"
												: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
										)}
										aria-label={`${group.label} ${count} 个转场`}
										aria-pressed={active}
										onClick={() => onSelectLabGroup({ group: group.id })}
										onKeyDown={(event) => {
											if (event.key === "Escape") event.currentTarget.blur();
										}}
									>
										<span className="min-w-0 truncate whitespace-nowrap">
											{group.label}
										</span>
									</button>
								);
							})}
						</div>
					) : null}
				</div>
			</div>
		</aside>
	);
}
