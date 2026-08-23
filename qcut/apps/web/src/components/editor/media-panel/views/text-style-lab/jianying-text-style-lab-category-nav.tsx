import { cn } from "@/lib/utils";
import type {
	JianyingTextStyleCategoryId,
	JianyingTextStyleLabListResult,
} from "@/types/electron";
import { selectTrialStyles } from "./text-style-lab-selection";

export type LabView = "trial" | "all" | JianyingTextStyleCategoryId;

function CategoryButton({
	count,
	label,
	selected,
	view,
	onSelect,
}: {
	count: number;
	label: string;
	selected: boolean;
	view: LabView;
	onSelect: (id: LabView) => void;
}) {
	return (
		<button
			type="button"
			aria-label={`${label}，${count} 个本地花字`}
			aria-pressed={selected}
			className={cn(
				"mb-0.5 flex h-7 w-full items-center rounded-sm px-2 text-left text-[11px] transition-colors",
				selected
					? "bg-white/10 text-cyan-300"
					: "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
			)}
			onClick={() => onSelect(view)}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			<span className="truncate">{label}</span>
		</button>
	);
}

export function JianyingTextStyleLabCategoryNav({
	result,
	view,
	onSelect,
}: {
	result: JianyingTextStyleLabListResult;
	view: LabView;
	onSelect: (id: LabView) => void;
}) {
	const trialCount = selectTrialStyles({ styles: result.styles }).length;
	return (
		<div className="pl-2 pt-0.5">
			<CategoryButton
				count={trialCount}
				label="五款预览"
				selected={view === "trial"}
				view="trial"
				onSelect={onSelect}
			/>
			<CategoryButton
				count={result.count}
				label="全部"
				selected={view === "all"}
				view="all"
				onSelect={onSelect}
			/>
			{result.categories.map((category) => (
				<CategoryButton
					key={category.id}
					count={category.count}
					label={category.label}
					selected={view === category.id}
					view={category.id}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}
