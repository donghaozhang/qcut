import { CrownIcon, DownloadIcon, MousePointerClickIcon } from "lucide-react";
import type { DragEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransitionPreset } from "./transition-presets";
import { TransitionPreview } from "./transition-preview";

interface TransitionCardProps {
	preset: TransitionPreset;
	selected: boolean;
	canApply: boolean;
	onSelect: ({ preset }: { preset: TransitionPreset }) => void;
	onApply: ({ preset }: { preset: TransitionPreset }) => void;
	onDragStart: ({
		event,
		preset,
	}: {
		event: DragEvent<HTMLDivElement>;
		preset: TransitionPreset;
	}) => void;
}

export function TransitionCard({
	preset,
	selected,
	canApply,
	onSelect,
	onApply,
	onDragStart,
}: TransitionCardProps) {
	const handleKeyDown = ({
		event,
	}: {
		event: KeyboardEvent<HTMLDivElement>;
	}) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		onSelect({ preset });
	};

	return (
		<div
			className={cn(
				"group flex h-[168px] min-w-0 cursor-grab flex-col overflow-hidden rounded-md border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
				selected && "border-primary"
			)}
			draggable
			aria-pressed={selected}
			role="button"
			tabIndex={0}
			onClick={() => onSelect({ preset })}
			onKeyDown={(event) => handleKeyDown({ event })}
			onDragStart={(event) => onDragStart({ event, preset })}
			data-testid={`transition-card-${preset.id}`}
		>
			<div className="relative h-[92px] shrink-0">
				<TransitionPreview preset={preset} />
				<div className="absolute left-1.5 top-1.5 flex gap-1">
					{preset.premium && (
						<Badge className="gap-1 border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[10px] text-amber-200">
							<CrownIcon className="h-3 w-3" />
							Pro
						</Badge>
					)}
					{preset.downloaded ? (
						<Badge className="border-cyan-400/30 bg-cyan-400/15 px-1.5 py-0 text-[10px] text-cyan-200">
							Ready
						</Badge>
					) : (
						<Badge className="gap-1 border-white/20 bg-black/30 px-1.5 py-0 text-[10px] text-white">
							<DownloadIcon className="h-3 w-3" />
							Asset
						</Badge>
					)}
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<div className="truncate text-xs font-medium text-foreground">
							{preset.name}
						</div>
						<div className="truncate text-[10px] text-muted-foreground">
							{preset.defaultDuration.toFixed(2)}s · {preset.category}
						</div>
					</div>
					<MousePointerClickIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</div>
				<Button
					type="button"
					variant={canApply ? "secondary" : "outline"}
					size="sm"
					className="mt-auto h-7 w-full text-[11px]"
					disabled={!canApply}
					onClick={(event) => {
						event.stopPropagation();
						onApply({ preset });
					}}
				>
					Apply
				</Button>
			</div>
		</div>
	);
}
