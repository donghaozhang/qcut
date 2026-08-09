import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JianyingTransitionRuntimeStatus } from "@/types/electron";
import {
	getJianyingLocalGroupCount,
	JIANYING_LOCAL_TRANSITION_GROUPS,
	TRANSITION_LAB_SOURCE_OPTIONS,
	type TransitionLabGroup,
	type TransitionLabSource,
} from "./transition-lab-filters";

export function TransitionLabControls({
	source,
	group,
	checking,
	status,
	error,
	onSourceChange,
	onGroupChange,
	onRefresh,
}: {
	source: TransitionLabSource;
	group: TransitionLabGroup;
	checking: boolean;
	status: JianyingTransitionRuntimeStatus | null;
	error: string;
	onSourceChange: ({ source }: { source: TransitionLabSource }) => void;
	onGroupChange: ({ group }: { group: TransitionLabGroup }) => void;
	onRefresh: () => void;
}) {
	const showLocalControls = source === "jianying-local";
	return (
		<div className="mt-2 border-t border-border/50 pt-2">
			<div
				className="grid grid-cols-3 gap-1"
				role="tablist"
				aria-label="转场实验室来源"
			>
				{TRANSITION_LAB_SOURCE_OPTIONS.map((option) => (
					<button
						key={option.id}
						type="button"
						role="tab"
						aria-selected={source === option.id}
						className={cn(
							"flex h-8 min-w-0 items-center justify-center gap-1 rounded border px-1 text-[9px] transition-colors",
							source === option.id
								? "border-primary/50 bg-primary/15 text-primary"
								: "border-border/60 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
						)}
						onClick={() => onSourceChange({ source: option.id })}
						onKeyDown={(event) => {
							if (event.key === "Escape") event.currentTarget.blur();
						}}
					>
						<span className="min-w-0 truncate">{option.label}</span>
						<span className="shrink-0 tabular-nums opacity-70">
							{option.count}
						</span>
					</button>
				))}
			</div>
			{showLocalControls ? (
				<div
					className="mt-1.5 grid grid-cols-3 gap-1"
					role="tablist"
					aria-label="本机剪映转场分类"
				>
					{JIANYING_LOCAL_TRANSITION_GROUPS.map((option) => (
						<button
							key={option.id}
							type="button"
							role="tab"
							aria-selected={group === option.id}
							className={cn(
								"flex h-7 min-w-0 items-center justify-between gap-1 rounded border px-1.5 text-[10px] transition-colors",
								group === option.id
									? "border-primary/50 bg-primary/15 text-primary"
									: "border-border/60 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							)}
							onClick={() => onGroupChange({ group: option.id })}
							onKeyDown={(event) => {
								if (event.key === "Escape") event.currentTarget.blur();
							}}
						>
							<span className="min-w-0 truncate">{option.label}</span>
							<span className="shrink-0 tabular-nums opacity-70">
								{getJianyingLocalGroupCount({ group: option.id })}
							</span>
						</button>
					))}
				</div>
			) : null}
			{source !== "qcut" ? (
				<div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
					<span
						className="min-w-0 flex-1 truncate"
						title={status?.message ?? error}
					>
						{checking ? "正在检查本机剪映资源" : (status?.message ?? error)}
					</span>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="size-6 shrink-0"
						disabled={checking}
						title="重新检查本机剪映资源"
						aria-label="重新检查本机剪映资源"
						onClick={onRefresh}
						onKeyDown={(event) => {
							if (event.key === "Escape") event.currentTarget.blur();
						}}
					>
						<RefreshCwIcon
							className={cn("size-3", checking && "animate-spin")}
						/>
					</Button>
				</div>
			) : null}
		</div>
	);
}
