import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
	PlatformCapability,
	platform,
	type PlatformUpdateState,
} from "@qcut/platform-core";
import {
	extractHighlights,
	fetchReleaseNotes,
	isVersionDismissed,
	dismissVersion,
} from "@/lib/project/release-notes";

const EMPTY_STATE: PlatformUpdateState = {
	phase: "idle",
	currentVersion: "",
	percent: 0,
	transferred: 0,
	total: 0,
	automaticDownload: false,
};

function extractFallbackLines({
	releaseNotes,
	maxItems = 3,
}: {
	releaseNotes: string;
	maxItems?: number;
}): string[] {
	return releaseNotes
		.split(/\r?\n/)
		.map((line) => line.replace(/^[-*]\s*/, "").trim())
		.filter((line) => line.length > 0)
		.slice(0, maxItems);
}

function formatBytes({ bytes }: { bytes?: number }): string {
	if (!bytes || bytes <= 0) return "";
	const megabytes = bytes / (1024 * 1024);
	return megabytes >= 1024
		? `${(megabytes / 1024).toFixed(1)} GB`
		: `${Math.round(megabytes)} MB`;
}

async function resolveHighlights({
	state,
}: {
	state: Pick<PlatformUpdateState, "version" | "releaseNotes">;
}): Promise<string[]> {
	if (!state.version) return [];
	const notes = await fetchReleaseNotes(state.version);
	const localHighlights = notes ? extractHighlights(notes.content) : [];
	if (localHighlights.length > 0) return localHighlights;

	const releaseNotes = state.releaseNotes ?? "";
	const remoteHighlights = extractHighlights(releaseNotes);
	return remoteHighlights.length > 0
		? remoteHighlights
		: extractFallbackLines({ releaseNotes });
}

export function UpdateNotification() {
	const hasUpdates = (() => {
		try {
			return platform().hasCapability(PlatformCapability.Updates);
		} catch {
			return false;
		}
	})();
	const [state, setState] = useState<PlatformUpdateState>(EMPTY_STATE);
	const [highlights, setHighlights] = useState<string[]>([]);

	const applyState = useCallback((nextState: PlatformUpdateState) => {
		setState(nextState);
	}, []);

	const { version, releaseNotes } = state;

	useEffect(() => {
		let active = true;
		void resolveHighlights({ state: { version, releaseNotes } }).then(
			(resolved) => {
				if (active) {
					setHighlights(resolved);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [version, releaseNotes]);

	const handleInstall = useCallback(() => {
		if (!hasUpdates) return;
		platform()
			.updates.installUpdate()
			.catch(() => toast.error("Failed to install update"));
	}, [hasUpdates]);

	const handleDownload = useCallback(() => {
		if (!hasUpdates) return;
		platform()
			.updates.downloadUpdate()
			.catch(() => toast.error("Failed to download update"));
	}, [hasUpdates]);

	const handleDismiss = useCallback((version: string) => {
		dismissVersion(version);
		setState((current) => ({ ...current, phase: "idle" }));
	}, []);

	const handleButtonKeyDown = useCallback(
		({ event, action }: { event: KeyboardEvent; action: () => void }) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			action();
		},
		[]
	);

	useEffect(() => {
		if (!hasUpdates) return;
		const updates = platform().updates;
		const unsubscribe = updates.onStateChanged(applyState);
		let active = true;
		void updates.getState().then((snapshot) => {
			if (active) applyState(snapshot);
		});

		return () => {
			active = false;
			unsubscribe();
		};
	}, [applyState, hasUpdates]);

	if (
		state.phase === "available" &&
		state.version &&
		!state.automaticDownload &&
		!isVersionDismissed(state.version)
	) {
		const size = formatBytes({ bytes: state.downloadSize });
		return (
			<div
				className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-4 shadow-lg"
				role="alert"
				aria-live="polite"
			>
				<p className="text-sm font-medium">QCut v{state.version} available</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{state.decision === "too-large"
						? "Large update"
						: "Ready to download"}
					{size ? ` · ${size}` : ""}
				</p>
				<div className="mt-3 flex justify-end gap-2">
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground"
						onClick={() => handleDismiss(state.version ?? "")}
						onKeyDown={(event) =>
							handleButtonKeyDown({
								event,
								action: () => handleDismiss(state.version ?? ""),
							})
						}
					>
						Later
					</button>
					<button
						type="button"
						className="text-xs font-medium text-primary hover:underline"
						onClick={handleDownload}
						onKeyDown={(event) =>
							handleButtonKeyDown({ event, action: handleDownload })
						}
					>
						Download
					</button>
				</div>
			</div>
		);
	}

	if (state.phase === "downloading") {
		return (
			<div
				className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-3 shadow-lg"
				role="status"
				aria-live="polite"
			>
				<p className="mb-1 text-xs text-muted-foreground">
					Downloading v{state.version}... {state.percent}%
				</p>
				<div className="h-1.5 overflow-hidden rounded-full bg-muted">
					<div
						className="h-full bg-primary transition-all duration-300"
						style={{ width: `${state.percent}%` }}
					/>
				</div>
			</div>
		);
	}

	if (state.phase === "ready" && state.version) {
		return (
			<div
				className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-4 shadow-lg"
				role="alert"
				aria-live="polite"
			>
				<p className="text-sm font-medium">QCut v{state.version} is ready</p>
				{highlights.length > 0 && (
					<ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
						{highlights.map((highlight) => (
							<li key={highlight}>- {highlight}</li>
						))}
					</ul>
				)}
				<div className="mt-3 flex justify-end gap-2">
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground"
						onClick={() => handleDismiss(state.version ?? "")}
						onKeyDown={(event) =>
							handleButtonKeyDown({
								event,
								action: () => handleDismiss(state.version ?? ""),
							})
						}
					>
						Later
					</button>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
						onClick={handleInstall}
						onKeyDown={(event) =>
							handleButtonKeyDown({ event, action: handleInstall })
						}
					>
						<RefreshCw className="h-3.5 w-3.5" />
						Restart and install
					</button>
				</div>
			</div>
		);
	}

	return null;
}
