"use client";

import { useMemo } from "react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface AutoSaveIndicatorProps {
	className?: string;
}

export function AutoSaveIndicator({ className }: AutoSaveIndicatorProps) {
	const autoSaveStatus = useTimelineStore((state) => state.autoSaveStatus);
	const isAutoSaving = useTimelineStore((state) => state.isAutoSaving);
	const lastAutoSaveAt = useTimelineStore((state) => state.lastAutoSaveAt);
	const { t } = useTranslation();

	const message = useMemo(() => {
		if (isAutoSaving) {
			return t("editor.autosave.saving");
		}

		if (autoSaveStatus === "Auto-saved" && lastAutoSaveAt) {
			return t("editor.autosave.saved");
		}

		if (autoSaveStatus === "Auto-save idle" || !autoSaveStatus) {
			return t("editor.autosave.idle");
		}

		return autoSaveStatus;
	}, [autoSaveStatus, isAutoSaving, lastAutoSaveAt, t]);

	return (
		<span
			data-testid="auto-save-indicator"
			className={cn("text-xs text-muted-foreground", className)}
			aria-live="polite"
		>
			{message}
		</span>
	);
}
