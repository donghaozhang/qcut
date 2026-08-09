import {
	useCallback,
	useEffect,
	useId,
	useState,
	type KeyboardEvent,
} from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
	type PlatformUpdatePreferences,
	type PlatformUpdateState,
} from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useTranslation } from "@/lib/i18n";

const EMPTY_PREFERENCES: PlatformUpdatePreferences = {
	automaticUpdates: false,
	maxAutomaticDownloadBytes: 0,
};

function statusLabel({
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
			return t("updates.appAvailable", { version: state.version ?? "" });
		case "downloading":
			return t("updates.appDownloading", {
				version: state.version ?? "",
				percent: state.percent,
			});
		case "ready":
			return t("updates.appReady", { version: state.version ?? "" });
		case "up-to-date":
			return t("updates.appCurrent", { version: state.currentVersion });
		case "error":
			return state.error ?? state.message ?? t("updates.unavailable");
		default:
			return state.currentVersion
				? t("updates.currentVersion", { version: state.currentVersion })
				: t("updates.unavailable");
	}
}

export function UpdateSettingsSection() {
	const { t } = useTranslation();
	const automaticUpdatesId = useId();
	const {
		state,
		available: hasUpdates,
		checkForUpdates,
		downloadUpdate,
		installUpdate,
		getPreferences,
		setPreferences: savePreferences,
	} = useAppUpdate();
	const [preferences, setPreferences] =
		useState<PlatformUpdatePreferences>(EMPTY_PREFERENCES);

	useEffect(() => {
		if (!hasUpdates) return;
		let active = true;
		void getPreferences().then((nextPreferences) => {
			if (active) setPreferences(nextPreferences);
		});

		return () => {
			active = false;
		};
	}, [getPreferences, hasUpdates]);

	const setAutomaticUpdates = useCallback(
		async ({ enabled }: { enabled: boolean }) => {
			if (!hasUpdates) return;
			setPreferences((current) => ({
				...current,
				automaticUpdates: enabled,
			}));
			const saved = await savePreferences({
				preferences: { automaticUpdates: enabled },
			});
			setPreferences(saved);
		},
		[hasUpdates, savePreferences]
	);

	const checkNow = useCallback(() => {
		if (!hasUpdates) return;
		void checkForUpdates();
	}, [checkForUpdates, hasUpdates]);

	const downloadNow = useCallback(() => {
		if (!hasUpdates) return;
		void downloadUpdate().catch(() => toast.error(t("updates.downloadFailed")));
	}, [downloadUpdate, hasUpdates, t]);

	const installNow = useCallback(() => {
		if (!hasUpdates) return;
		void installUpdate().catch(() => toast.error(t("updates.installFailed")));
	}, [hasUpdates, installUpdate, t]);

	const handleButtonKeyDown = useCallback(
		({ event, action }: { event: KeyboardEvent; action: () => void }) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			action();
		},
		[]
	);

	return (
		<section className="border-b pb-5" data-testid="update-settings-section">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-sm font-medium">{t("updates.appTitle")}</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{statusLabel({ state, t })}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 shrink-0"
					disabled={!hasUpdates || state.phase === "checking"}
					onClick={checkNow}
					onKeyDown={(event) =>
						handleButtonKeyDown({ event, action: checkNow })
					}
					data-testid="app-update-check-button"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${state.phase === "checking" ? "animate-spin" : ""}`}
					/>
					{t("updates.checkNow")}
				</Button>
			</div>

			<div className="flex items-center justify-between gap-3 py-2">
				<label htmlFor={automaticUpdatesId} className="min-w-0">
					<span className="block text-sm">{t("updates.automatic")}</span>
					<span className="block text-xs text-muted-foreground">
						{t("updates.automaticDescription")}
					</span>
				</label>
				<Switch
					id={automaticUpdatesId}
					checked={preferences.automaticUpdates}
					disabled={!hasUpdates}
					onCheckedChange={(enabled) => void setAutomaticUpdates({ enabled })}
				/>
			</div>

			{state.phase === "downloading" && (
				<div
					className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={state.percent}
					aria-label={t("updates.appDownloading", {
						version: state.version ?? "",
						percent: state.percent,
					})}
				>
					<div
						className="h-full bg-primary transition-[width] duration-300"
						style={{ width: `${state.percent}%` }}
					/>
				</div>
			)}

			{state.phase === "available" && !state.automaticDownload && (
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="mt-2 h-8 w-full"
					onClick={downloadNow}
					onKeyDown={(event) =>
						handleButtonKeyDown({ event, action: downloadNow })
					}
				>
					<Download className="h-3.5 w-3.5" />
					{t("updates.downloadVersion", { version: state.version ?? "" })}
				</Button>
			)}

			{state.phase === "ready" && (
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="mt-2 h-8 w-full"
					onClick={installNow}
					onKeyDown={(event) =>
						handleButtonKeyDown({ event, action: installNow })
					}
				>
					<RefreshCw className="h-3.5 w-3.5" />
					{t("updates.restartInstall")}
				</Button>
			)}
		</section>
	);
}
