import { useCallback, type KeyboardEvent } from "react";
import { Package, RefreshCw } from "lucide-react";
import type { PlatformCodexPluginUpdateState } from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { useCodexPluginUpdate } from "@/hooks/use-codex-plugin-update";
import { useTranslation } from "@/lib/i18n";

function pluginStatusLabel({
	state,
	t,
}: {
	state: PlatformCodexPluginUpdateState;
	t: ReturnType<typeof useTranslation>["t"];
}): string {
	switch (state.phase) {
		case "checking":
			return t("updates.pluginChecking");
		case "not-installed":
			return t("updates.pluginNotInstalled");
		case "available":
			return t("updates.pluginAvailable", {
				version: state.latestVersion ?? "",
			});
		case "updating":
			return t("updates.pluginUpdating");
		case "restart-required":
			return t("updates.pluginRestartRequired", {
				version: state.installedVersion ?? "",
			});
		case "up-to-date":
			return t("updates.pluginCurrent", {
				version: state.installedVersion ?? "",
			});
		case "unavailable":
			return t("updates.pluginUnavailable");
		case "error":
			return state.error ?? state.message ?? t("updates.pluginFailed");
		default:
			return state.installedVersion
				? t("updates.pluginCurrent", { version: state.installedVersion })
				: t("updates.pluginNotInstalled");
	}
}

export function CodexPluginUpdateSection() {
	const { t } = useTranslation();
	const { state, available, checkForUpdates, installUpdate } =
		useCodexPluginUpdate();

	const checkNow = useCallback(() => {
		void checkForUpdates();
	}, [checkForUpdates]);

	const updatePlugin = useCallback(() => {
		void installUpdate();
	}, [installUpdate]);

	const handleButtonKeyDown = useCallback(
		({ event, action }: { event: KeyboardEvent; action: () => void }) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			action();
		},
		[]
	);

	const canInstall =
		state.phase === "available" || state.phase === "not-installed";
	const actionLabel = state.installed
		? t("updates.pluginUpdate")
		: t("updates.pluginInstall");

	return (
		<section
			className="border-b pb-5"
			data-testid="codex-plugin-update-section"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="flex items-center gap-1.5 text-sm font-medium">
						<Package className="size-4" />
						{t("updates.pluginTitle")}
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						{pluginStatusLabel({ state, t })}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 shrink-0"
					disabled={!available || state.phase === "checking"}
					onClick={checkNow}
					onKeyDown={(event) =>
						handleButtonKeyDown({ event, action: checkNow })
					}
					data-testid="codex-plugin-check-button"
				>
					<RefreshCw
						className={`size-3.5 ${state.phase === "checking" ? "animate-spin" : ""}`}
					/>
					{t("updates.checkNow")}
				</Button>
			</div>

			{canInstall && (
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="mt-3 h-8 w-full"
					disabled={state.phase === "updating"}
					onClick={updatePlugin}
					onKeyDown={(event) =>
						handleButtonKeyDown({ event, action: updatePlugin })
					}
					data-testid="codex-plugin-update-button"
				>
					<Package className="size-3.5" />
					{actionLabel}
				</Button>
			)}
		</section>
	);
}
