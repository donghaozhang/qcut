import { useCallback, useState, type KeyboardEvent } from "react";
import { Package, RefreshCw } from "lucide-react";
import type { PlatformCodexPluginUpdatePhase } from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { useCodexPluginUpdate } from "@/hooks/use-codex-plugin-update";
import { useTranslation } from "@/lib/i18n";

function notificationStatus({
	phase,
	installedVersion,
	latestVersion,
	t,
}: {
	phase: PlatformCodexPluginUpdatePhase;
	installedVersion?: string;
	latestVersion?: string;
	t: ReturnType<typeof useTranslation>["t"];
}): string {
	if (phase === "updating") return t("updates.pluginUpdating");
	if (phase === "restart-required") {
		return t("updates.pluginRestartRequired", {
			version: installedVersion ?? "",
		});
	}
	return t("updates.pluginAvailable", { version: latestVersion ?? "" });
}

export function CodexPluginUpdateNotification() {
	const { t } = useTranslation();
	const { state, installUpdate } = useCodexPluginUpdate();
	const [dismissedVersion, setDismissedVersion] = useState<string>();
	const visibleVersion = state.latestVersion ?? state.installedVersion;

	const dismiss = useCallback(() => {
		setDismissedVersion(visibleVersion);
	}, [visibleVersion]);

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

	const isAvailable =
		state.phase === "available" || state.phase === "not-installed";
	const isUpdating = state.phase === "updating";
	const isComplete = state.phase === "restart-required";
	if (
		(!isAvailable && !isUpdating && !isComplete) ||
		(dismissedVersion && dismissedVersion === visibleVersion)
	) {
		return null;
	}

	const status = notificationStatus({
		phase: state.phase,
		installedVersion: state.installedVersion,
		latestVersion: state.latestVersion,
		t,
	});

	return (
		<div
			className="fixed bottom-28 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-4 shadow-lg"
			role={isUpdating ? "status" : "alert"}
			aria-live="polite"
			data-testid="codex-plugin-update-notification"
		>
			<div className="flex items-start gap-2.5">
				<Package className="mt-0.5 size-4 shrink-0 text-primary" />
				<div className="min-w-0">
					<p className="text-sm font-medium">{t("updates.pluginTitle")}</p>
					<p className="mt-1 text-xs text-muted-foreground">{status}</p>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				{!isUpdating && (
					<Button
						type="button"
						variant="text"
						size="sm"
						onClick={dismiss}
						onKeyDown={(event) =>
							handleButtonKeyDown({ event, action: dismiss })
						}
					>
						{t("updates.later")}
					</Button>
				)}
				{isAvailable && (
					<Button
						type="button"
						variant="primary"
						size="sm"
						onClick={updatePlugin}
						onKeyDown={(event) =>
							handleButtonKeyDown({ event, action: updatePlugin })
						}
					>
						<Package className="size-3.5" />
						{state.installed
							? t("updates.pluginUpdate")
							: t("updates.pluginInstall")}
					</Button>
				)}
				{isUpdating && (
					<RefreshCw className="my-1.5 size-4 animate-spin text-primary">
						<title>{t("updates.pluginUpdating")}</title>
					</RefreshCw>
				)}
			</div>
		</div>
	);
}
