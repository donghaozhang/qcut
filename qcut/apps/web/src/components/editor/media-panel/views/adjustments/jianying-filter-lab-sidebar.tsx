import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FilterLabSidebarEntry {
	id: string;
	label: string;
	/** Rendered muted after the label; also part of the accessible name. */
	count?: string;
}

export interface FilterLabSidebarGroup {
	id: string;
	label: string;
	entries: FilterLabSidebarEntry[];
	activeId: string;
	onSelect: ({ id }: { id: string }) => void;
}

function SidebarGroup({
	group,
	collapsed,
	onToggle,
}: {
	group: FilterLabSidebarGroup;
	collapsed: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="min-w-0">
			<button
				type="button"
				aria-expanded={!collapsed}
				className="flex w-full items-center gap-0.5 rounded-sm px-1 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Escape") event.currentTarget.blur();
				}}
			>
				<ChevronDown
					className={cn(
						"size-3 shrink-0 transition-transform",
						collapsed && "-rotate-90"
					)}
					aria-hidden="true"
				/>
				<span className="min-w-0 truncate">{group.label}</span>
			</button>
			{collapsed ? null : (
				<div
					role="tablist"
					aria-label={group.label}
					className="flex flex-col gap-px"
				>
					{group.entries.map((entry) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							aria-selected={group.activeId === entry.id}
							title={entry.label}
							className={cn(
								"flex min-w-0 items-baseline gap-1 rounded-sm px-1.5 py-1 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
								group.activeId === entry.id
									? "bg-primary/15 text-primary"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							)}
							onClick={() => group.onSelect({ id: entry.id })}
							onKeyDown={(event) => {
								if (event.key === "Escape") event.currentTarget.blur();
							}}
						>
							<span className="min-w-0 flex-1 truncate">{entry.label}</span>
							{entry.count ? (
								<span className="shrink-0 text-[9px] tabular-nums opacity-70">
									{entry.count}
								</span>
							) : null}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Category rail for the filter lab. Sticky rather than independently
 * scrollable: the surrounding panel owns the scroll, so the rail rides along
 * and stays visible instead of introducing a second scrollbar in a narrow
 * column.
 */
export function JianyingFilterLabSidebar({
	groups,
}: {
	groups: FilterLabSidebarGroup[];
}) {
	const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
		() => new Set()
	);
	return (
		<div
			className="sticky top-0 flex w-[82px] shrink-0 flex-col gap-1.5 self-start"
			data-testid="jianying-filter-lab-categories"
		>
			{groups.map((group) => (
				<SidebarGroup
					key={group.id}
					group={group}
					collapsed={collapsedIds.has(group.id)}
					onToggle={() =>
						setCollapsedIds((current) => {
							const next = new Set(current);
							if (!next.delete(group.id)) next.add(group.id);
							return next;
						})
					}
				/>
			))}
		</div>
	);
}
