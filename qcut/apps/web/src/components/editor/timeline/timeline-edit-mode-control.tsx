import {
	ArrowRightLeft,
	BetweenHorizontalStart,
	ChevronDown,
	MousePointer2,
	MoveHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Action } from "@/constants/actions";
import { useActionShortcutLabels } from "@/hooks/keyboard/use-action-shortcut-label";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
	type TimelineEditMode,
	useTimelineEditModeStore,
} from "@/stores/timeline/timeline-edit-mode-store";
import { cn } from "@/lib/utils";

const EDIT_MODES: Array<{
	icon: LucideIcon;
	labelKey: TranslationKey;
	mode: TimelineEditMode;
	action: Action;
}> = [
	{
		icon: MousePointer2,
		labelKey: "timeline.editMode.select",
		mode: "select",
		action: "edit-mode-select",
	},
	{
		icon: BetweenHorizontalStart,
		labelKey: "timeline.editMode.roll",
		mode: "roll",
		action: "edit-mode-roll",
	},
	{
		icon: MoveHorizontal,
		labelKey: "timeline.editMode.slip",
		mode: "slip",
		action: "edit-mode-slip",
	},
	{
		icon: ArrowRightLeft,
		labelKey: "timeline.editMode.slide",
		mode: "slide",
		action: "edit-mode-slide",
	},
];

/**
 * Jianying-style tool picker: a button showing the active edit tool plus a
 * dropdown listing every tool with its keyboard shortcut.
 */
export function TimelineEditModeControl() {
	const { t } = useTranslation();
	const { shortcutFor, withShortcut } = useActionShortcutLabels();
	const editMode = useTimelineEditModeStore((state) => state.editMode);
	const setEditMode = useTimelineEditModeStore((state) => state.setEditMode);
	const current =
		EDIT_MODES.find((candidate) => candidate.mode === editMode) ??
		EDIT_MODES[0];
	const CurrentIcon = current.icon;

	return (
		<div
			className="flex h-7 items-center overflow-hidden rounded border border-border bg-muted/30"
			role="group"
			aria-label="Timeline edit mode"
			data-testid="timeline-edit-mode-control"
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="h-7 w-7 rounded-none text-primary"
						onClick={() => setEditMode({ mode: current.mode })}
						aria-label={t(current.labelKey)}
						data-testid="timeline-edit-mode-current"
					>
						<CurrentIcon className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{withShortcut(t(current.labelKey), current.action)}
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="h-7 w-4 rounded-none border-l border-border"
						aria-label={t("timeline.editMode.pick")}
						data-testid="timeline-edit-mode-trigger"
					>
						<ChevronDown className="h-3 w-3" />
					</Button>
				</DropdownMenuTrigger>
				{/* The timeline stacks above the default z-50 popover layer, so
				    raise the menu like gap-menu does or its lower half is
				    hidden behind the track rows. */}
				<DropdownMenuContent align="start" className="z-[250]">
					{EDIT_MODES.map(({ icon: Icon, labelKey, mode, action }) => {
						const shortcut = shortcutFor(action);
						return (
							<DropdownMenuItem
								key={mode}
								onSelect={() => setEditMode({ mode })}
								className={cn("gap-2", editMode === mode && "text-primary")}
								data-testid={`timeline-edit-mode-${mode}`}
							>
								<Icon className="h-3.5 w-3.5" />
								{t(labelKey)}
								{shortcut ? (
									<DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
								) : null}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
