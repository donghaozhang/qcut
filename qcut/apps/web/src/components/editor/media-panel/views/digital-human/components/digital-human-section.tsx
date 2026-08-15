"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Collapsible block used for 形象 / 景别 / 背景. The header is the whole toggle,
 * so the chevron never becomes a separate tab stop.
 */
export function DigitalHumanSection({
	children,
	defaultOpen = true,
	testId,
	title,
	trailing,
}: {
	children: ReactNode;
	defaultOpen?: boolean;
	testId: string;
	title: string;
	trailing?: ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<section className="border-b border-border/30 last:border-b-0">
			<div className="flex items-center justify-between gap-2 px-3 pt-3">
				<button
					type="button"
					className="flex items-center gap-1 text-[11px] font-medium text-foreground/90 transition-colors hover:text-foreground"
					aria-expanded={isOpen}
					data-testid={`${testId}-toggle`}
					onClick={() => setIsOpen((open) => !open)}
				>
					<span>{title}</span>
					<ChevronDownIcon
						className={cn(
							"size-3 transition-transform",
							isOpen ? "" : "-rotate-90"
						)}
						aria-hidden="true"
					/>
				</button>
				{trailing}
			</div>
			{isOpen ? (
				<div className="px-3 pb-3 pt-2" data-testid={testId}>
					{children}
				</div>
			) : (
				<div className="pb-3" />
			)}
		</section>
	);
}
