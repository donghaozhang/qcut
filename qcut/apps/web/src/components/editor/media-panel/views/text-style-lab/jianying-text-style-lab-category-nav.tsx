import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	JianyingTextStyleCategoryId,
	JianyingTextStyleLabCategoryGroupSummary,
	JianyingTextStyleLabListResult,
} from "@/types/electron";
import { selectTrialStyles } from "./text-style-lab-selection";

export type LabView = "trial" | "all" | JianyingTextStyleCategoryId;

export const CATEGORY_GROUPS = [
	{ id: "charts", label: "榜单", members: ["popular", "latest"] },
	{ id: "styles", label: "风格", members: ["summer", "variety", "guofeng"] },
	{ id: "effects", label: "效果", members: ["glow", "gradient", "texture"] },
	{
		id: "colors",
		label: "颜色",
		members: [
			"red",
			"yellow",
			"black-white",
			"blue",
			"pink",
			"green",
			"purple",
		],
	},
] as const;

function resolvedCategoryGroups({
	result,
}: {
	result: JianyingTextStyleLabListResult;
}): JianyingTextStyleLabCategoryGroupSummary[] {
	if (result.categoryGroups && result.categoryGroups.length > 0) {
		return result.categoryGroups;
	}
	const groups = CATEGORY_GROUPS.map(({ id, label, members }) => {
		const categoryIds = members.filter((member) =>
			result.categories.some(({ id: categoryId }) => categoryId === member)
		) as JianyingTextStyleCategoryId[];
		return {
			id,
			label,
			categoryIds,
			count: result.styles.filter(({ categoryIds: styleCategoryIds }) =>
				categoryIds.some((categoryId) => styleCategoryIds.includes(categoryId))
			).length,
		};
	}).filter(({ categoryIds }) => categoryIds.length > 0);
	const groupedIds = new Set(groups.flatMap(({ categoryIds }) => categoryIds));
	const ungroupedIds = result.categories
		.map(({ id }) => id)
		.filter((id) => !groupedIds.has(id));
	if (ungroupedIds.length === 0) return groups;
	return [
		...groups,
		{
			id: "other",
			label: "其他",
			categoryIds: ungroupedIds,
			count: result.styles.filter(({ categoryIds }) =>
				ungroupedIds.some((categoryId) => categoryIds.includes(categoryId))
			).length,
		},
	];
}

function CategoryGroup({
	group,
	categories,
	view,
	expanded,
	onToggle,
	onSelect,
}: {
	group: JianyingTextStyleLabCategoryGroupSummary;
	categories: { id: string; label: string; count: number }[];
	view: LabView;
	expanded: boolean;
	onToggle: () => void;
	onSelect: (id: LabView) => void;
}) {
	const members = group.categoryIds
		.map((id) => categories.find((category) => category.id === id))
		.filter((category): category is NonNullable<typeof category> =>
			Boolean(category)
		);
	if (members.length === 0) return null;
	const holdsActive = members.some((category) => category.id === view);
	return (
		<div className="mb-1">
			<button
				type="button"
				aria-expanded={expanded}
				className={cn(
					"flex h-6 w-full items-center gap-1 rounded-sm px-1.5 text-[10px] uppercase tracking-wide",
					holdsActive && !expanded
						? "text-cyan-200"
						: "text-muted-foreground hover:bg-white/[0.06]"
				)}
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onToggle();
					}
				}}
			>
				<ChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform",
						expanded && "rotate-90"
					)}
				>
					<title>{expanded ? "收起" : "展开"}</title>
				</ChevronRight>
				<span className="truncate">{group.label}</span>
				<span className="ml-auto text-[10px]">{group.count}</span>
			</button>
			{expanded
				? members.map((category) => (
						<button
							key={category.id}
							type="button"
							aria-label={`${category.label}，${category.count} 个本地花字`}
							aria-pressed={view === category.id}
							className={cn(
								"mb-0.5 flex h-7 w-full items-center justify-between rounded-sm pl-4 pr-2 text-[11px]",
								view === category.id
									? "bg-cyan-400/10 text-cyan-200"
									: "text-muted-foreground hover:bg-white/[0.06]"
							)}
							onClick={() => onSelect(category.id as LabView)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onSelect(category.id as LabView);
								}
							}}
						>
							<span className="truncate">{category.label}</span>
							<span className="text-[10px] text-muted-foreground">
								{category.count}
							</span>
						</button>
					))
				: null}
		</div>
	);
}

export function JianyingTextStyleLabCategoryNav({
	expandedGroups,
	result,
	view,
	onSelect,
	onToggleGroup,
}: {
	expandedGroups: Record<string, boolean>;
	result: JianyingTextStyleLabListResult;
	view: LabView;
	onSelect: (id: LabView) => void;
	onToggleGroup: (groupId: string) => void;
}) {
	const trialCount = selectTrialStyles({ styles: result.styles }).length;
	const groups = resolvedCategoryGroups({ result });
	return (
		<div className="pl-2">
			{(["trial", "all"] as const).map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={view === option}
					className={cn(
						"mb-1 flex h-7 w-full items-center justify-between rounded-sm px-2 text-[11px]",
						view === option
							? "bg-white/10 text-foreground"
							: "text-muted-foreground hover:bg-white/[0.06]"
					)}
					onClick={() => onSelect(option)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onSelect(option);
						}
					}}
				>
					<span>{option === "trial" ? "五款预览" : "全部"}</span>
					<span className="text-[10px] text-muted-foreground">
						{option === "trial" ? trialCount : result.count}
					</span>
				</button>
			))}
			{groups.map((group) => (
				<CategoryGroup
					key={group.id}
					group={group}
					categories={result.categories}
					view={view}
					expanded={expandedGroups[group.id] ?? false}
					onToggle={() => onToggleGroup(group.id)}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}
