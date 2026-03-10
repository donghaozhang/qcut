import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PlatformCapability, platform } from "@qcut/platform-core";
import {
	extractHighlights,
	fetchReleaseNotes,
	isVersionDismissed,
	dismissVersion,
} from "@/lib/project/release-notes";

interface UpdateState {
	phase: "idle" | "available" | "downloading" | "ready";
	version: string;
	percent: number;
	highlights: string[];
}

/** Extract plain-text bullet lines from raw release notes as a last-resort fallback. */
function extractFallbackLines(releaseNotes: string, maxItems = 3): string[] {
	const lines = releaseNotes
		.split(/\r?\n/)
		.map((line) => line.replace(/^[-*]\s*/, "").trim())
		.filter((line) => line.length > 0);

	return lines.slice(0, maxItems);
}

/**
 * Global update notification listener.
 * Mount once at the root level (e.g., in __root.tsx).
 * Listens for auto-updater events and shows toast notifications.
 */
export function UpdateNotification() {
	const hasUpdates = (() => {
		try {
			return platform().hasCapability(PlatformCapability.Updates);
		} catch {
			return false;
		}
	})();

	const [state, setState] = useState<UpdateState>({
		phase: "idle",
		version: "",
		percent: 0,
		highlights: [],
	});

	const handleInstall = useCallback(() => {
		if (!hasUpdates) return;
		platform()
			.updates.installUpdate()
			.catch(() => {
				toast.error("Failed to install update. Please restart manually.");
			});
	}, [hasUpdates]);

	const handleDismiss = useCallback((version: string) => {
		dismissVersion(version);
		setState((prev) => ({ ...prev, phase: "idle" }));
	}, []);

	useEffect(() => {
		if (!hasUpdates) return;
		const api = platform().updates;

		const unsubAvailable = api.onUpdateAvailable(async (data) => {
			if (isVersionDismissed(data.version)) return;

			const notes = await fetchReleaseNotes(data.version);
			const localHighlights = notes ? extractHighlights(notes.content) : [];
			const remoteReleaseNotes =
				typeof data.releaseNotes === "string" ? data.releaseNotes : "";
			const remoteHighlights =
				remoteReleaseNotes.length > 0
					? extractHighlights(remoteReleaseNotes)
					: [];
			const hasLocalHighlights = localHighlights.length > 0;
			const hasRemoteHighlights = remoteHighlights.length > 0;
			const fallbackHighlights = extractFallbackLines(remoteReleaseNotes);
			let highlights = fallbackHighlights;
			if (hasRemoteHighlights) {
				highlights = remoteHighlights;
			}
			if (hasLocalHighlights) {
				highlights = localHighlights;
			}

			setState({
				phase: "available",
				version: data.version,
				percent: 0,
				highlights,
			});

			toast.info(`Update v${data.version} available`, {
				description:
					highlights.length > 0
						? highlights[0]
						: "A new version is ready to download.",
				duration: 10_000,
			});
		});

		const unsubProgress = api.onDownloadProgress((data) => {
			setState((prev) => ({
				...prev,
				phase: "downloading",
				percent: Math.round(data.percent),
			}));
		});

		const unsubDownloaded = api.onUpdateDownloaded((data) => {
			setState((prev) => ({
				...prev,
				phase: "ready",
				version: data.version,
			}));

			toast.success("Update ready to install", {
				description: `v${data.version} will be installed on restart.`,
				action: {
					label: "Restart Now",
					onClick: () => {
						platform()
							.updates.installUpdate()
							.catch(() => {
								toast.error(
									"Failed to install update. Please restart manually."
								);
							});
					},
				},
				duration: 15_000,
			});
		});

		return () => {
			unsubAvailable();
			unsubProgress();
			unsubDownloaded();
		};
	}, [hasUpdates]);

	// Render a persistent banner only when update is ready
	if (state.phase === "ready") {
		return (
			<div
				className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg"
				role="alert"
				aria-live="polite"
			>
				<div className="flex items-start gap-3">
					<div className="flex-1">
						<p className="text-sm font-medium">
							QCut v{state.version} is ready
						</p>
						{state.highlights.length > 0 && (
							<ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
								{state.highlights.map((h, i) => (
									<li key={i}>- {h}</li>
								))}
							</ul>
						)}
					</div>
					<div className="flex gap-2 shrink-0">
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground"
							onClick={() => handleDismiss(state.version)}
						>
							Later
						</button>
						<button
							type="button"
							className="text-xs font-medium text-primary hover:underline"
							onClick={handleInstall}
						>
							Restart
						</button>
					</div>
				</div>
			</div>
		);
	}

	// Show download progress bar
	if (state.phase === "downloading") {
		return (
			<div
				className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-3 shadow-lg"
				role="status"
				aria-live="polite"
			>
				<p className="text-xs text-muted-foreground mb-1">
					Downloading v{state.version}... {state.percent}%
				</p>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className="h-full bg-primary transition-all duration-300"
						style={{ width: `${state.percent}%` }}
					/>
				</div>
			</div>
		);
	}

	return null;
}
