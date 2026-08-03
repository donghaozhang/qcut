"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { CircleArrowUp, Download, RefreshCw, RotateCw } from "lucide-react";
import type { PlatformUpdateState } from "@qcut/platform-core";
import { AboutUpdatesDialog } from "@/components/about-updates-dialog";
import { Button } from "@/components/ui/button";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function buttonLabel({
	state,
	t,
}: {
	state: PlatformUpdateState;
	t: ReturnType<typeof useTranslation>["t"];
}): string {
	switch (state.phase) {
		case "checking":
			return t("updates.checking");
		case "available":
			return t("updates.availableButton", { version: state.version ?? "" });
		case "downloading":
			return t("updates.downloadingButton", { percent: state.percent });
		case "ready":
			return t("updates.installButton");
		default:
			return t("updates.checkNow");
	}
}

function ButtonIcon({ state }: { state: PlatformUpdateState }) {
	if (state.phase === "available") return <CircleArrowUp />;
	if (state.phase === "downloading") return <Download />;
	if (state.phase === "ready") return <RotateCw />;
	return (
		<RefreshCw className={state.phase === "checking" ? "animate-spin" : ""} />
	);
}

export function AppUpdateButton({
	className,
	dark = false,
}: {
	className?: string;
	dark?: boolean;
}) {
	const { t } = useTranslation();
	const { state, available, checkForUpdates } = useAppUpdate();
	const [dialogOpen, setDialogOpen] = useState(false);
	const hasActionableUpdate = ["available", "downloading", "ready"].includes(
		state.phase
	);

	const openUpdates = useCallback(() => {
		setDialogOpen(true);
		if (!hasActionableUpdate && state.phase !== "checking") {
			void checkForUpdates();
		}
	}, [checkForUpdates, hasActionableUpdate, state.phase]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			openUpdates();
		},
		[openUpdates]
	);

	if (!available) return null;

	return (
		<>
			<Button
				type="button"
				variant={hasActionableUpdate ? "primary" : "outline"}
				size="sm"
				className={cn(
					"h-8 shrink-0 border-yellow-500/60 px-3 shadow-sm",
					hasActionableUpdate && "bg-yellow-500 text-black hover:bg-yellow-400",
					dark &&
						!hasActionableUpdate &&
						"border-white/35 bg-black/30 text-white hover:bg-white/15 hover:text-white",
					className
				)}
				onClick={openUpdates}
				onKeyDown={handleKeyDown}
				aria-live="polite"
				data-testid="global-app-update-button"
			>
				<ButtonIcon state={state} />
				<span>{buttonLabel({ state, t })}</span>
			</Button>
			<AboutUpdatesDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</>
	);
}
