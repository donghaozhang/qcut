import type { StagedUpdateInfo } from "./auto-update-controller.js";

/**
 * macOS-facing visibility for a staged (downloaded, waiting-for-restart)
 * update. On macOS closing the last window keeps QCut alive, so ShipIt may
 * never get a real quit; this module makes the pending install obvious:
 * dock badge, one system notification per version, and a quit-and-install
 * prompt when the user closes the main window.
 */
export interface StagedUpdateVisibilityDependencies {
	platform: NodeJS.Platform;
	setDockBadge: ({ text }: { text: string }) => void;
	showNotification: ({ title, body }: { title: string; body: string }) => void;
	promptQuitAndInstall: ({
		version,
	}: {
		version: string;
	}) => Promise<"install" | "close">;
	logger: {
		log(message?: unknown, ...optionalParams: unknown[]): void;
		warn(message?: unknown, ...optionalParams: unknown[]): void;
	};
}

export interface StagedUpdateVisibility {
	/** Badge the dock and notify once for a newly staged update. */
	onUpdateStaged({ staged }: { staged: StagedUpdateInfo }): void;
	/** Suppresses the close prompt once a real quit is underway. */
	setQuitting(): void;
	/**
	 * True when closing the main window should be intercepted to offer
	 * quit-and-install. Each staged version prompts at most once.
	 */
	shouldInterceptClose(): boolean;
	/** Shows the prompt for the currently staged version. */
	resolveClose(): Promise<"install" | "close">;
}

export function createStagedUpdateVisibility({
	platform,
	setDockBadge,
	showNotification,
	promptQuitAndInstall,
	logger,
}: StagedUpdateVisibilityDependencies): StagedUpdateVisibility {
	let staged: StagedUpdateInfo | undefined;
	let quitting = false;
	let promptInFlight = false;
	const notifiedVersions = new Set<string>();
	const promptedVersions = new Set<string>();

	return {
		onUpdateStaged: ({ staged: nextStaged }) => {
			staged = nextStaged;
			if (notifiedVersions.has(nextStaged.internalVersion)) return;
			notifiedVersions.add(nextStaged.internalVersion);
			// Each side effect fails independently: a dock-badge failure must not
			// suppress the notification (the version is already marked notified).
			if (platform === "darwin") {
				try {
					setDockBadge({ text: "1" });
				} catch (error: unknown) {
					const message =
						error instanceof Error ? error.message : String(error);
					logger.warn(
						"[AutoUpdater] Staged-update dock badge failed:",
						message
					);
				}
			}
			try {
				showNotification({
					title: "QCut update ready",
					body: `QCut ${nextStaged.version} will install the next time you quit the app.`,
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger.warn(
					"[AutoUpdater] Staged-update notification failed:",
					message
				);
			}
		},
		setQuitting: () => {
			quitting = true;
		},
		shouldInterceptClose: () => {
			if (platform !== "darwin" || quitting || promptInFlight) return false;
			if (!staged) return false;
			return !promptedVersions.has(staged.internalVersion);
		},
		resolveClose: async () => {
			if (!staged) return "close";
			promptInFlight = true;
			promptedVersions.add(staged.internalVersion);
			try {
				const choice = await promptQuitAndInstall({ version: staged.version });
				logger.log(
					`[AutoUpdater] Close prompt for ${staged.version}: ${choice}`
				);
				return choice;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger.warn("[AutoUpdater] Close prompt failed:", message);
				return "close";
			} finally {
				promptInFlight = false;
			}
		},
	};
}
