import { Check, CircleOff, Tags } from "lucide-react";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
	TIMELINE_COLOR_LABELS,
	type TimelineColorLabel,
} from "@/lib/timeline/timeline-color-labels";
import { cn } from "@/lib/utils";

const COLOR_NAME_KEYS: Record<TimelineColorLabel, TranslationKey> = {
	violet: "timeline.color.violet",
	blue: "timeline.color.blue",
	green: "timeline.color.green",
	yellow: "timeline.color.yellow",
	red: "timeline.color.red",
	rose: "timeline.color.rose",
	orange: "timeline.color.orange",
	mango: "timeline.color.mango",
};

export function TimelineColorLabelMenu({
	currentColorLabel,
	onColorLabelChange,
	onSelectSameColor,
}: {
	currentColorLabel?: TimelineColorLabel;
	onColorLabelChange: (input: { colorLabel?: TimelineColorLabel }) => void;
	onSelectSameColor: () => void;
}) {
	const { t } = useTranslation();

	return (
		<>
			<ContextMenuItem
				disabled={!currentColorLabel}
				onSelect={() => onSelectSameColor()}
			>
				<Tags />
				{t("timeline.menu.selectSameColor")}
			</ContextMenuItem>
			<div
				aria-label={t("timeline.menu.clipColor")}
				className="flex h-9 items-center gap-1 px-2"
				role="group"
			>
				{TIMELINE_COLOR_LABELS.map(({ value, color }) => {
					const selected = currentColorLabel === value;
					return (
						<ContextMenuItem
							aria-checked={selected}
							aria-label={t(COLOR_NAME_KEYS[value])}
							className={cn(
								"size-6 justify-center rounded-full p-0 focus:opacity-100",
								selected &&
									"ring-2 ring-foreground ring-offset-1 ring-offset-popover"
							)}
							key={value}
							onSelect={() => onColorLabelChange({ colorLabel: value })}
							role="menuitemradio"
						>
							<span
								className="grid size-4 place-items-center rounded-full border border-white/30"
								style={{ backgroundColor: color }}
							>
								{selected ? <Check className="size-3 text-white" /> : null}
							</span>
						</ContextMenuItem>
					);
				})}
				<ContextMenuItem
					aria-label={t("timeline.menu.clearClipColor")}
					className="size-6 justify-center rounded-full p-0 focus:opacity-100"
					onSelect={() => onColorLabelChange({ colorLabel: undefined })}
				>
					<CircleOff className="size-4 text-muted-foreground" />
				</ContextMenuItem>
			</div>
			<ContextMenuSeparator />
		</>
	);
}
