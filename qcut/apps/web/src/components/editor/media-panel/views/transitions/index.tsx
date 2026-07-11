import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { transitionCategories } from "./transition-categories";
import {
	filterTransitionPresets,
	type TransitionCategory,
	type TransitionPreset,
} from "./transition-presets";
import { TransitionCard } from "./transition-card";
import { getTransitionApplyState } from "./transition-apply-state";

function encodeDragPayload({ preset }: { preset: TransitionPreset }): string {
	return JSON.stringify({
		kind: "qcut-transition-preset",
		id: preset.id,
		type: preset.type,
		defaultDuration: preset.defaultDuration,
	});
}

export function TransitionsView() {
	const [category, setCategory] = useState<TransitionCategory>("all");
	const [query, setQuery] = useState("");
	const [selectedPresetId, setSelectedPresetId] = useState("dissolve");
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);

	const visiblePresets = useMemo(
		() => filterTransitionPresets({ category, query }),
		[category, query]
	);
	const selectedPreset =
		visiblePresets.find((preset) => preset.id === selectedPresetId) ??
		visiblePresets[0];
	const applyState = getTransitionApplyState({ selectedElements, tracks });
	const canApply = applyState.status === "ready";

	const handleApply = ({ preset }: { preset: TransitionPreset }) => {
		if (applyState.status !== "ready") {
			toast.error(applyState.message);
			return;
		}

		toast.info(`${preset.name} is ready for the selected cut point.`);
	};

	const handleDragStart = ({
		event,
		preset,
	}: {
		event: DragEvent<HTMLDivElement>;
		preset: TransitionPreset;
	}) => {
		event.dataTransfer.effectAllowed = "copy";
		event.dataTransfer.setData(
			"application/qcut-transition",
			encodeDragPayload({ preset })
		);
		event.dataTransfer.setData("text/plain", preset.name);
	};

	return (
		<div className="flex h-full min-h-0 bg-panel text-foreground">
			<aside className="w-[104px] shrink-0 border-r border-border/50 p-2">
				<div className="space-y-1">
					{transitionCategories.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								className={cn(
									"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors",
									category === item.id
										? "bg-primary/15 text-primary"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								)}
								aria-pressed={category === item.id}
								onClick={() => setCategory(item.id)}
							>
								<Icon className="h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{item.label}</span>
							</button>
						);
					})}
				</div>
			</aside>
			<section className="flex min-w-0 flex-1 flex-col">
				<div className="border-b border-border/50 p-3">
					<div className="relative">
						<SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search transitions"
							className="h-8 pl-8 text-xs"
							aria-label="Search transitions"
						/>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
						<span>{visiblePresets.length} presets</span>
						<span className={cn(canApply && "text-primary")}>
							{applyState.message}
						</span>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{visiblePresets.length > 0 ? (
						<div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
							{visiblePresets.map((preset) => (
								<TransitionCard
									key={preset.id}
									preset={preset}
									selected={selectedPreset?.id === preset.id}
									canApply={canApply}
									onSelect={({ preset: nextPreset }) =>
										setSelectedPresetId(nextPreset.id)
									}
									onApply={handleApply}
									onDragStart={handleDragStart}
								/>
							))}
						</div>
					) : (
						<div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 text-center text-xs text-muted-foreground">
							No transitions match this search.
						</div>
					)}
				</div>
				<div className="border-t border-border/50 p-3">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-8 w-full text-xs"
						disabled={!canApply || !selectedPreset}
						onClick={() =>
							selectedPreset && handleApply({ preset: selectedPreset })
						}
					>
						Apply Selected Transition
					</Button>
				</div>
			</section>
		</div>
	);
}

export default TransitionsView;
