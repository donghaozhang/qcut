import {
	CrownIcon,
	DownloadIcon,
	MousePointerClickIcon,
} from "lucide-react";
import type { DragEvent, KeyboardEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransitionPreset } from "./transition-presets";
import {
	TransitionPreview,
	type TransitionPreviewSources,
} from "./transition-preview";

interface TransitionCardProps {
	preset: TransitionPreset;
	selected: boolean;
	canApply: boolean;
	available: boolean;
	previewSources?: TransitionPreviewSources;
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
	available,
	previewSources,
	onSelect,
	onApply,
	onDragStart,
}: TransitionCardProps) {
	const [isPreviewing, setIsPreviewing] = useState(false);
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
				"group flex h-[132px] min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
				available ? "cursor-grab" : "cursor-pointer",
				selected && "border-primary"
			)}
			draggable={available}
			aria-pressed={selected}
			role="button"
			tabIndex={0}
			onClick={() => onSelect({ preset })}
			onKeyDown={(event) => handleKeyDown({ event })}
			onDragStart={(event) =>
				available && onDragStart({ event, preset })
			}
			onMouseEnter={() => setIsPreviewing(true)}
			onMouseLeave={() => setIsPreviewing(false)}
			onFocus={() => setIsPreviewing(true)}
			onBlur={() => setIsPreviewing(false)}
			data-testid={`transition-card-${preset.id}`}
		>
			<div className="relative h-[78px] shrink-0">
				<TransitionPreview
					preset={preset}
					isPlaying={isPreviewing}
					sources={previewSources}
				/>
				<div className="absolute left-1.5 top-1.5 flex gap-1">
					{preset.premium && (
						<Badge className="gap-0.5 border-amber-500/40 bg-amber-500/20 px-1 py-0 text-[9px] text-amber-100">
							<CrownIcon className="h-2.5 w-2.5" />
							Pro
						</Badge>
					)}
					{available ? (
						<Badge className="border-cyan-400/30 bg-cyan-950/80 px-1 py-0 text-[9px] text-cyan-100">
							Ready
						</Badge>
					) : (
						<Badge className="gap-0.5 border-white/20 bg-black/60 px-1 py-0 text-[9px] text-white">
							<DownloadIcon className="h-2.5 w-2.5" />
							Asset
						</Badge>
					)}
				</div>
			</div>
			<div className="flex min-h-0 flex-1 items-center gap-1.5 p-1.5">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[11px] font-medium text-foreground">
						{preset.name}
					</div>
					<div className="truncate text-[9px] text-muted-foreground">
						{preset.defaultDuration.toFixed(2)}s
					</div>
				</div>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
					disabled={!canApply || !available}
					title={`Apply ${preset.name}`}
					aria-label={`Apply ${preset.name}`}
					onClick={(event) => {
						event.stopPropagation();
						onApply({ preset });
					}}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<MousePointerClickIcon className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}
