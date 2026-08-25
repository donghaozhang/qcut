import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function PortraitCollapsibleGroup({
	active,
	children,
	label,
	onOpenChange,
	open,
	testId,
}: {
	active: boolean;
	children: ReactNode;
	label: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	testId: string;
}) {
	return (
		<Collapsible
			open={open}
			onOpenChange={onOpenChange}
			className="border-b border-border/70"
			data-active={active}
			data-testid={testId}
		>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex h-10 w-full items-center gap-2 px-0.5 text-left text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<span
						className={cn(
							"flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
							active
								? "border-cyan-500 bg-cyan-500 text-white"
								: "border-muted-foreground/60 bg-muted/30"
						)}
						aria-hidden="true"
					>
						{active ? <Check className="size-2.5" strokeWidth={3} /> : null}
					</span>
					<span>{label}</span>
					<ChevronDown
						className={cn(
							"size-3 text-muted-foreground transition-transform",
							!open && "-rotate-90"
						)}
					/>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
				<div className="pb-5 pl-5 pt-2">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
