import {
	BetweenHorizontalStart,
	MousePointer2,
	MoveHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	type TimelineEditMode,
	useTimelineEditModeStore,
} from "@/stores/timeline/timeline-edit-mode-store";
import { cn } from "@/lib/utils";

const EDIT_MODES: Array<{
	icon: LucideIcon;
	label: string;
	mode: TimelineEditMode;
}> = [
	{ icon: MousePointer2, label: "Select and trim", mode: "select" },
	{ icon: BetweenHorizontalStart, label: "Roll edit", mode: "roll" },
	{ icon: MoveHorizontal, label: "Slip edit", mode: "slip" },
];

export function TimelineEditModeControl() {
	const editMode = useTimelineEditModeStore((state) => state.editMode);
	const setEditMode = useTimelineEditModeStore((state) => state.setEditMode);

	return (
		<div
			className="flex h-7 items-center overflow-hidden rounded border border-border bg-muted/30"
			role="group"
			aria-label="Timeline edit mode"
			data-testid="timeline-edit-mode-control"
		>
			{EDIT_MODES.map(({ icon: Icon, label, mode }) => {
				const active = editMode === mode;
				const selectMode = () => setEditMode({ mode });
				return (
					<Tooltip key={mode}>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								className={cn(
									"h-7 w-7 rounded-none border-r border-border last:border-r-0",
									active && "bg-primary/20 text-primary"
								)}
								onClick={selectMode}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									selectMode();
								}}
								aria-label={label}
								aria-pressed={active}
								data-testid={`timeline-edit-mode-${mode}`}
							>
								<Icon className="h-3.5 w-3.5">
									<title>{label}</title>
								</Icon>
							</Button>
						</TooltipTrigger>
						<TooltipContent>{label}</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
