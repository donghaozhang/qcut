import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
	PlatformCapability,
	platform,
	type PlatformUpdatePreferences,
	type PlatformUpdateState,
} from "@qcut/platform-core";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const EMPTY_STATE: PlatformUpdateState = {
	phase: "idle",
	currentVersion: "",
	percent: 0,
	transferred: 0,
	total: 0,
	automaticDownload: false,
};

const EMPTY_PREFERENCES: PlatformUpdatePreferences = {
	automaticUpdates: false,
	maxAutomaticDownloadBytes: 0,
};

function statusLabel({ state }: { state: PlatformUpdateState }): string {
	switch (state.phase) {
		case "checking":
			return "Checking for updates...";
		case "available":
			return `QCut v${state.version} is available`;
		case "downloading":
			return `Downloading v${state.version} · ${state.percent}%`;
		case "ready":
			return `QCut v${state.version} is ready to install`;
		case "up-to-date":
			return `QCut v${state.currentVersion} is up to date`;
		case "error":
			return state.error ?? state.message ?? "Updates unavailable";
		default:
			return state.currentVersion
				? `Current version · ${state.currentVersion}`
				: "Updates unavailable";
	}
}

export function UpdateSettingsSection() {
	const [state, setState] = useState<PlatformUpdateState>(EMPTY_STATE);
	const [preferences, setPreferences] =
		useState<PlatformUpdatePreferences>(EMPTY_PREFERENCES);
	const hasUpdates = (() => {
		try {
			return platform().hasCapability(PlatformCapability.Updates);
		} catch {
			return false;
		}
	})();

	useEffect(() => {
		if (!hasUpdates) return;
		const updates = platform().updates;
		const unsubscribe = updates.onStateChanged(setState);
		let active = true;
		void Promise.all([updates.getState(), updates.getPreferences()]).then(
			([nextState, nextPreferences]) => {
				if (!active) return;
				setState(nextState);
				setPreferences(nextPreferences);
			}
		);

		return () => {
			active = false;
			unsubscribe();
		};
	}, [hasUpdates]);

	const setAutomaticUpdates = useCallback(
		async ({ enabled }: { enabled: boolean }) => {
			if (!hasUpdates) return;
			setPreferences((current) => ({
				...current,
				automaticUpdates: enabled,
			}));
			const saved = await platform().updates.setPreferences({
				automaticUpdates: enabled,
			});
			setPreferences(saved);
		},
		[hasUpdates]
	);

	const checkNow = useCallback(() => {
		if (!hasUpdates) return;
		void platform().updates.checkForUpdates().then(setState);
	}, [hasUpdates]);

	const downloadNow = useCallback(() => {
		if (!hasUpdates) return;
		void platform().updates.downloadUpdate().then(setState);
	}, [hasUpdates]);

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
					<h3 className="text-sm font-medium">Software updates</h3>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{statusLabel({ state })}
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
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${state.phase === "checking" ? "animate-spin" : ""}`}
					/>
					Check now
				</Button>
			</div>

			<div className="flex items-center justify-between gap-3 py-2">
				<label htmlFor="automatic-updates" className="min-w-0">
					<span className="block text-sm">Automatic updates</span>
					<span className="block text-xs text-muted-foreground">
						Download updates up to 1 GB
					</span>
				</label>
				<Switch
					id="automatic-updates"
					checked={preferences.automaticUpdates}
					disabled={!hasUpdates}
					onCheckedChange={(enabled) => void setAutomaticUpdates({ enabled })}
				/>
			</div>

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
					Download v{state.version}
				</Button>
			)}
		</section>
	);
}
