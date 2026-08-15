"use client";

import { UserSquareIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Single-entry navigation, mirroring Jianying's 数字人 rail. Kept as a rail
 * rather than dropped so the panel matches its siblings and has somewhere to
 * put future figure sources.
 */
export function DigitalHumanSidebar() {
	const { t } = useTranslation();

	return (
		<aside className="w-[128px] shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2">
			<button
				type="button"
				className={cn(
					"flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px]",
					"bg-primary/15 font-medium text-primary"
				)}
				aria-pressed
				data-testid="digital-human-sidebar-entry"
			>
				<UserSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
				<span>{t("digitalHuman.sidebar.title")}</span>
			</button>
		</aside>
	);
}
