import {
	DEFAULT_UPDATE_PREFERENCES,
	readUpdatePreferences,
	type UpdatePreferences,
	writeUpdatePreferences,
} from "./update-preferences.js";
import {
	compareReleaseVersions,
	detectUpdateChannel,
	toReleaseVersion,
} from "./update-version.js";

export type UpdatePhase =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "ready"
	| "up-to-date"
	| "error";

export type AutomaticUpdateDecision = "automatic" | "disabled" | "too-large";

/** A downloaded update sitting on disk, waiting for the app to restart. */
export interface StagedUpdateInfo {
	version: string;
	internalVersion: string;
	releaseNotes?: string;
	releaseDate?: string;
	downloadSize?: number;
}

export interface UpdateState {
	phase: UpdatePhase;
	currentVersion: string;
	version?: string;
	internalVersion?: string;
	releaseNotes?: string;
	releaseDate?: string;
	downloadSize?: number;
	percent: number;
	transferred: number;
	total: number;
	automaticDownload: boolean;
	decision?: AutomaticUpdateDecision;
	message?: string;
	error?: string;
	/**
	 * Survives later checks: a failed hourly check must never hide an update
	 * that is already downloaded and installable.
	 */
	staged?: StagedUpdateInfo;
	/** Most recent background check/download failure while an update is staged. */
	lastCheckError?: string;
}

export interface UpdateInfoLike {
	version: string;
	releaseNotes?: unknown;
	releaseDate?: string;
	files?: Array<{ size?: number; url?: string }>;
	path?: string;
}

export interface DownloadProgressLike {
	percent: number;
	transferred: number;
	total: number;
}

export interface AutoUpdaterLike {
	autoDownload: boolean;
	autoInstallOnAppQuit: boolean;
	allowPrerelease: boolean;
	channel: string;
	updateConfigPath?: string | null;
	on(event: string, listener: (...args: unknown[]) => void): unknown;
	checkForUpdates(): Promise<unknown>;
	downloadUpdate(): Promise<string[]>;
	quitAndInstall(): void;
}

export interface AutoUpdateController {
	start(): void;
	stop(): void;
	checkForUpdates(): Promise<UpdateState>;
	downloadUpdate(): Promise<UpdateState>;
	installUpdate(): { success: boolean; message: string };
	getState(): UpdateState;
	getPreferences(): UpdatePreferences;
	setPreferences({
		preferences,
	}: {
		preferences: Partial<UpdatePreferences>;
	}): UpdatePreferences;
}

interface LoggerLike {
	log(message?: unknown, ...optionalParams: unknown[]): void;
	error(message?: unknown, ...optionalParams: unknown[]): void;
	warn(message?: unknown, ...optionalParams: unknown[]): void;
}

interface ReleaseNoteEntry {
	note?: unknown;
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function normalizeUpdateReleaseNotes({
	releaseNotes,
}: {
	releaseNotes: unknown;
}): string {
	if (typeof releaseNotes === "string") return releaseNotes.trim();
	if (!Array.isArray(releaseNotes)) return "";

	const notes: string[] = [];
	for (const entry of releaseNotes as ReleaseNoteEntry[]) {
		if (!entry || typeof entry !== "object") continue;
		if (typeof entry.note !== "string") continue;
		const note = entry.note.trim();
		if (note.length > 0) notes.push(note);
	}
	return notes.join("\n\n");
}

export function resolveUpdateDownloadSize({
	info,
}: {
	info: UpdateInfoLike;
}): number | undefined {
	const sizes = (info.files ?? [])
		.map((file) => file.size)
		.filter(
			(size): size is number =>
				typeof size === "number" && Number.isFinite(size) && size > 0
		);
	return sizes.length > 0 ? Math.max(...sizes) : undefined;
}

export function resolveAutomaticUpdateDecision({
	preferences,
	downloadSize,
}: {
	preferences: UpdatePreferences;
	downloadSize?: number;
}): AutomaticUpdateDecision {
	if (!preferences.automaticUpdates) return "disabled";
	if (
		downloadSize !== undefined &&
		downloadSize > preferences.maxAutomaticDownloadBytes
	) {
		return "too-large";
	}
	return "automatic";
}

export function createAutoUpdateController({
	updater,
	currentVersion,
	userDataPath,
	logger,
	sendToRenderer,
	onUpdateStaged,
	onBeforeQuitAndInstall,
	checkIntervalMs = CHECK_INTERVAL_MS,
}: {
	updater: AutoUpdaterLike;
	currentVersion: string;
	userDataPath: string;
	logger: LoggerLike;
	sendToRenderer: ({
		channel,
		data,
	}: {
		channel: string;
		data: unknown;
	}) => void;
	/** Fired once each time a downloaded update becomes installable. */
	onUpdateStaged?: ({ staged }: { staged: StagedUpdateInfo }) => void;
	/**
	 * Fired synchronously before quitAndInstall. On macOS the native updater
	 * closes windows BEFORE emitting before-quit, so any close-interception
	 * must be disarmed here, not in a before-quit handler.
	 */
	onBeforeQuitAndInstall?: () => void;
	checkIntervalMs?: number;
}): AutoUpdateController {
	let preferences = readUpdatePreferences({ userDataPath });
	let interval: NodeJS.Timeout | undefined;
	let started = false;
	let listenersRegistered = false;
	let checkPromise: Promise<UpdateState> | undefined;
	let downloadPromise: Promise<UpdateState> | undefined;
	let staged: StagedUpdateInfo | undefined;
	let state: UpdateState = {
		phase: "idle",
		currentVersion: toReleaseVersion({ packageVersion: currentVersion }),
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
	};

	const publishState = ({ nextState }: { nextState: UpdateState }): void => {
		state = { ...nextState, staged };
		sendToRenderer({ channel: "update-state-changed", data: state });
	};

	/** True when the already-staged update makes downloading `candidate` useless. */
	const stagedCovers = ({ candidate }: { candidate: string }): boolean => {
		if (!staged) return false;
		try {
			return (
				compareReleaseVersions({
					left: staged.internalVersion,
					right: candidate,
				}) >= 0
			);
		} catch {
			// Unparsable versions: only an exact match is provably redundant.
			return (
				staged.internalVersion === candidate || staged.version === candidate
			);
		}
	};

	/** Rebuilds the installable state from the staged update. */
	const stagedReadyState = ({
		stagedUpdate,
	}: {
		stagedUpdate: StagedUpdateInfo;
	}): UpdateState => ({
		...state,
		phase: "ready",
		version: stagedUpdate.version,
		internalVersion: stagedUpdate.internalVersion,
		releaseNotes: stagedUpdate.releaseNotes,
		releaseDate: stagedUpdate.releaseDate,
		downloadSize: stagedUpdate.downloadSize,
		percent: 100,
		automaticDownload: false,
		message: "Update ready to install",
		error: undefined,
		lastCheckError: undefined,
	});

	const publishError = ({
		error,
		source,
	}: {
		error: unknown;
		source?: "check" | "download";
	}): UpdateState => {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("[AutoUpdater] Error:", message);
		if (staged) {
			// The state machine may have progressed past the staged version to a
			// newer offer or an in-flight download; a failed background check must
			// not rewind that progress (it would also make downloadUpdate a no-op
			// until the next successful hourly check).
			const progressedPastStaged =
				(state.phase === "available" || state.phase === "downloading") &&
				state.internalVersion !== undefined &&
				!stagedCovers({ candidate: state.internalVersion });
			if (progressedPastStaged && source !== "download") {
				publishState({ nextState: { ...state, lastCheckError: message } });
				return state;
			}
			// The staged update on disk is still installable; surface the
			// background failure without demoting the ready state.
			publishState({
				nextState: {
					...stagedReadyState({ stagedUpdate: staged }),
					lastCheckError: message,
				},
			});
			return state;
		}
		publishState({
			nextState: {
				...state,
				phase: "error",
				automaticDownload: false,
				error: message,
				message: "Failed to update QCut",
			},
		});
		return state;
	};

	const downloadUpdate = async (): Promise<UpdateState> => {
		if (state.phase === "ready") return state;
		if (downloadPromise) return downloadPromise;
		const requested = state.internalVersion ?? state.version;
		if (requested !== undefined && stagedCovers({ candidate: requested })) {
			logger.log(
				`[AutoUpdater] Skipping download; ${requested} is already staged`
			);
			if (staged) {
				publishState({ nextState: stagedReadyState({ stagedUpdate: staged }) });
			}
			return state;
		}

		publishState({
			nextState: {
				...state,
				phase: "downloading",
				message: "Downloading update",
				error: undefined,
			},
		});

		downloadPromise = updater
			.downloadUpdate()
			.then(() => state)
			.catch((error: unknown) => publishError({ error, source: "download" }))
			.finally(() => {
				downloadPromise = undefined;
			});
		return downloadPromise;
	};

	const onUpdateAvailable = ({ info }: { info: UpdateInfoLike }): void => {
		if (stagedCovers({ candidate: info.version })) {
			// The hourly re-check reports the same (or an older) version that is
			// already downloaded; re-downloading it would be pure waste.
			logger.log(
				`[AutoUpdater] Update ${info.version} is already staged; keeping ready state`
			);
			if (staged) {
				publishState({ nextState: stagedReadyState({ stagedUpdate: staged }) });
			}
			return;
		}
		const downloadSize = resolveUpdateDownloadSize({ info });
		const decision = resolveAutomaticUpdateDecision({
			preferences,
			downloadSize,
		});
		const version = toReleaseVersion({ packageVersion: info.version });
		const releaseNotes = normalizeUpdateReleaseNotes({
			releaseNotes: info.releaseNotes,
		});

		logger.log(
			`[AutoUpdater] Update ${version} available; decision=${decision}; size=${downloadSize ?? "unknown"}`
		);
		publishState({
			nextState: {
				...state,
				phase: "available",
				version,
				internalVersion: info.version,
				releaseNotes,
				releaseDate: info.releaseDate,
				downloadSize,
				percent: 0,
				transferred: 0,
				total: downloadSize ?? 0,
				automaticDownload: decision === "automatic",
				decision,
				message:
					decision === "too-large"
						? "A large update is available"
						: "An update is available",
				error: undefined,
				lastCheckError: undefined,
			},
		});
		sendToRenderer({
			channel: "update-available",
			data: {
				version,
				releaseNotes,
				releaseDate: info.releaseDate,
				downloadSize,
				automaticDownload: decision === "automatic",
				decision,
			},
		});

		if (decision === "automatic") void downloadUpdate();
	};

	const registerListeners = (): void => {
		updater.on("checking-for-update", () => {
			logger.log("[AutoUpdater] Checking for updates");
		});
		updater.on("update-available", (...args: unknown[]) => {
			const info = args[0] as UpdateInfoLike;
			onUpdateAvailable({ info });
		});
		updater.on("update-not-available", () => {
			logger.log("[AutoUpdater] QCut is up to date");
			if (staged) {
				// The staged download is still newer than the running app; keep it
				// installable instead of reporting up-to-date.
				publishState({ nextState: stagedReadyState({ stagedUpdate: staged }) });
				return;
			}
			publishState({
				nextState: {
					...state,
					phase: "up-to-date",
					automaticDownload: false,
					message: "QCut is up to date",
					error: undefined,
				},
			});
		});
		updater.on("download-progress", (...args: unknown[]) => {
			const progress = args[0] as DownloadProgressLike;
			const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
			publishState({
				nextState: {
					...state,
					phase: "downloading",
					percent,
					transferred: progress.transferred,
					total: progress.total,
					message: "Downloading update",
				},
			});
			sendToRenderer({ channel: "download-progress", data: progress });
		});
		updater.on("update-downloaded", (...args: unknown[]) => {
			const info = args[0] as UpdateInfoLike;
			const version = toReleaseVersion({ packageVersion: info.version });
			const alreadyStaged = staged?.internalVersion === info.version;
			logger.log(`[AutoUpdater] Update ${version} is ready to install`);
			staged = {
				version,
				internalVersion: info.version,
				releaseNotes:
					normalizeUpdateReleaseNotes({ releaseNotes: info.releaseNotes }) ||
					state.releaseNotes,
				releaseDate: info.releaseDate ?? state.releaseDate,
				downloadSize: resolveUpdateDownloadSize({ info }) ?? state.downloadSize,
			};
			publishState({
				nextState: {
					...stagedReadyState({ stagedUpdate: staged }),
					transferred: state.total,
					lastCheckError: undefined,
				},
			});
			sendToRenderer({ channel: "update-downloaded", data: { version } });
			if (!alreadyStaged) onUpdateStaged?.({ staged });
		});
		updater.on("error", (...args: unknown[]) => {
			publishError({ error: args[0] });
		});
	};

	const checkForUpdates = async (): Promise<UpdateState> => {
		if (checkPromise) return checkPromise;
		// With an update staged, checks run silently in the background: the
		// ready state must stay visible (and installable) the whole time.
		if (!staged) {
			publishState({
				nextState: {
					...state,
					phase: "checking",
					message: "Checking for updates",
					error: undefined,
				},
			});
		}
		checkPromise = updater
			.checkForUpdates()
			.then(() => state)
			.catch((error: unknown) => publishError({ error, source: "check" }))
			.finally(() => {
				checkPromise = undefined;
			});
		return checkPromise;
	};

	return {
		start: () => {
			if (started) return;
			started = true;
			const channel = detectUpdateChannel({ version: currentVersion });
			updater.autoDownload = false;
			updater.autoInstallOnAppQuit = true;
			updater.allowPrerelease = channel !== "latest";
			updater.channel = channel;
			if (!listenersRegistered) {
				registerListeners();
				listenersRegistered = true;
			}
			logger.log(
				`[AutoUpdater] Started for ${state.currentVersion}; channel=${channel}; automatic=${preferences.automaticUpdates}`
			);
			void checkForUpdates();
			interval = setInterval(() => void checkForUpdates(), checkIntervalMs);
			interval.unref();
		},
		stop: () => {
			if (interval) clearInterval(interval);
			interval = undefined;
			started = false;
		},
		checkForUpdates,
		downloadUpdate,
		installUpdate: () => {
			if (state.phase !== "ready" && !staged) {
				return { success: false, message: "Update is not downloaded yet" };
			}
			onBeforeQuitAndInstall?.();
			updater.quitAndInstall();
			return { success: true, message: "Installing update" };
		},
		getState: () => ({ ...state }),
		getPreferences: () => ({ ...preferences }),
		setPreferences: ({ preferences: updates }) => {
			preferences = writeUpdatePreferences({
				userDataPath,
				preferences: {
					...DEFAULT_UPDATE_PREFERENCES,
					...preferences,
					...updates,
				},
			});
			if (
				preferences.automaticUpdates &&
				state.phase === "available" &&
				resolveAutomaticUpdateDecision({
					preferences,
					downloadSize: state.downloadSize,
				}) === "automatic"
			) {
				void downloadUpdate();
			}
			return { ...preferences };
		},
	};
}
