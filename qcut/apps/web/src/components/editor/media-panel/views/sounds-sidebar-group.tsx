import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Jianying-style collapsible group header for the sounds panel sidebar:
 * a label followed by a chevron that rotates when the group is collapsed.
 */
export function SidebarGroupHeader({
	title,
	collapsed,
	onToggle,
	actions,
}: {
	title: string;
	collapsed: boolean;
	onToggle: () => void;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-1 flex h-6 items-center px-1">
			<button
				type="button"
				className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-[10px] font-medium text-foreground hover:bg-foreground/5"
				aria-expanded={!collapsed}
				title={title}
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onToggle();
					}
				}}
			>
				<span className="truncate">{title}</span>
				<ChevronDown
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform",
						collapsed && "-rotate-90"
					)}
				/>
			</button>
			{actions}
		</div>
	);
}
