"use client";

import { cn } from "@/lib/utils";
import { TabGroup, tabGroups, useMediaPanelStore } from "./store";

const groupKeys = Object.keys(tabGroups) as TabGroup[];

export function GroupBar() {
	const { activeGroup, setActiveGroup } = useMediaPanelStore();

	return (
		<div
			className="flex items-center bg-panel-accent border-b border-border/50"
			data-testid="group-bar"
			role="tablist"
			aria-label="Media panel groups"
		>
			{groupKeys.map((groupKey) => {
				const group = tabGroups[groupKey];
				const isActive = activeGroup === groupKey;
				return (
					<button
						type="button"
						role="tab"
						aria-selected={isActive}
						aria-label={group.label}
						className={cn(
							"flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 cursor-pointer transition-colors",
							isActive
								? "text-primary border-b-2 border-primary"
								: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						)}
						onClick={() => setActiveGroup(groupKey)}
						key={groupKey}
						data-testid={`group-${groupKey}`}
					>
						<group.icon className="size-4! shrink-0" aria-hidden="true" />
						<span className="text-[0.6rem] leading-tight whitespace-nowrap">
							{group.label}
						</span>
					</button>
				);
			})}
		</div>
	);
}
