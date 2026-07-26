import {
	createDefaultCodexRunner,
	CodexCliUnavailableError,
	findAvailablePlugin,
	findInstalledPlugin,
	isOfficialGitMarketplace,
	MARKETPLACE_NAME,
	OFFICIAL_MARKETPLACE,
	PLUGIN_NAME,
	type CodexPluginList,
	type CodexPluginRecord,
	type RunCodex,
} from "./codex-plugin-cli.js";
import {
	comparePluginVersions,
	fetchDefaultPluginReleases,
	normalizePluginVersion,
	selectLatestPluginRelease,
	type FetchPluginReleases,
} from "./codex-plugin-release.js";

export type CodexPluginUpdatePhase =
	| "idle"
	| "checking"
	| "not-installed"
	| "up-to-date"
	| "available"
	| "updating"
	| "restart-required"
	| "unavailable"
	| "error";

export interface CodexPluginUpdateState {
	phase: CodexPluginUpdatePhase;
	codexAvailable: boolean;
	installed: boolean;
	installedVersion?: string;
	latestVersion?: string;
	latestTag?: string;
	marketplaceName?: string;
	marketplaceSourceType?: string;
	message?: string;
	error?: string;
}

export interface CodexPluginUpdateController {
	start(): void;
	stop(): void;
	getState(): CodexPluginUpdateState;
	checkForUpdates(): Promise<CodexPluginUpdateState>;
	installUpdate(): Promise<CodexPluginUpdateState>;
}

interface LoggerLike {
	log(message?: unknown, ...optionalParams: unknown[]): void;
	error(message?: unknown, ...optionalParams: unknown[]): void;
	warn(message?: unknown, ...optionalParams: unknown[]): void;
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function resolveCheckedPhase({
	installed,
	updateAvailable,
}: {
	installed: boolean;
	updateAvailable: boolean;
}): CodexPluginUpdatePhase {
	if (!installed) return "not-installed";
	return updateAvailable ? "available" : "up-to-date";
}

function resolveCheckedMessage({
	installed,
	installedVersion,
	latestVersion,
	updateAvailable,
}: {
	installed: boolean;
	installedVersion: string;
	latestVersion: string;
	updateAvailable: boolean;
}): string {
	if (!installed) {
		return `QCut Plugin v${latestVersion} is available to install`;
	}
	if (updateAvailable) {
		return `QCut Plugin v${latestVersion} is available`;
	}
	return `QCut Plugin v${installedVersion} is up to date`;
}

export function createCodexPluginUpdateController({
	logger,
	sendToRenderer,
	runCodex = createDefaultCodexRunner(),
	fetchPluginReleases = fetchDefaultPluginReleases,
	checkIntervalMs = CHECK_INTERVAL_MS,
}: {
	logger: LoggerLike;
	sendToRenderer: ({
		channel,
		data,
	}: {
		channel: string;
		data: unknown;
	}) => void;
	runCodex?: RunCodex;
	fetchPluginReleases?: FetchPluginReleases;
	checkIntervalMs?: number;
}): CodexPluginUpdateController {
	let interval: NodeJS.Timeout | undefined;
	let started = false;
	let checkPromise: Promise<CodexPluginUpdateState> | undefined;
	let installPromise: Promise<CodexPluginUpdateState> | undefined;
	let installedRecord: CodexPluginRecord | undefined;
	let marketplaceRecord: CodexPluginRecord | undefined;
	let state: CodexPluginUpdateState = {
		phase: "idle",
		codexAvailable: false,
		installed: false,
	};

	const publishState = ({
		nextState,
	}: {
		nextState: CodexPluginUpdateState;
	}): CodexPluginUpdateState => {
		state = { ...nextState };
		sendToRenderer({
			channel: "codex-plugin-update-state-changed",
			data: state,
		});
		return state;
	};

	const publishError = ({ error }: { error: unknown }) => {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("[CodexPluginUpdater] Error:", message);
		return publishState({
			nextState: {
				...state,
				phase: "error",
				message: "QCut Plugin update failed",
				error: message,
			},
		});
	};

	const loadPluginList = async (): Promise<CodexPluginList> =>
		(await runCodex({
			args: ["plugin", "list", "--available", "--json"],
		})) as CodexPluginList;

	const checkForUpdates = async (): Promise<CodexPluginUpdateState> => {
		if (installPromise) return installPromise;
		if (checkPromise) return checkPromise;
		publishState({
			nextState: {
				...state,
				phase: "checking",
				message: "Checking QCut Plugin",
				error: undefined,
			},
		});

		checkPromise = Promise.all([loadPluginList(), fetchPluginReleases()])
			.then(([list, releases]) => {
				const latest = selectLatestPluginRelease({ releases });
				if (!latest) throw new Error("No public QCut Plugin release found");
				installedRecord = findInstalledPlugin({ list });
				marketplaceRecord = installedRecord ?? findAvailablePlugin({ list });
				const installedVersion = normalizePluginVersion({
					version: installedRecord?.version,
				});
				const updateAvailable =
					!installedVersion ||
					comparePluginVersions({
						left: installedVersion,
						right: latest.version,
					}) < 0;
				logger.log(
					`[CodexPluginUpdater] installed=${installedVersion || "none"} latest=${latest.version}`
				);
				return publishState({
					nextState: {
						phase: resolveCheckedPhase({
							installed: Boolean(installedRecord),
							updateAvailable,
						}),
						codexAvailable: true,
						installed: Boolean(installedRecord),
						installedVersion: installedVersion || undefined,
						latestVersion: latest.version,
						latestTag: latest.tag,
						marketplaceName: marketplaceRecord?.marketplaceName,
						marketplaceSourceType:
							marketplaceRecord?.marketplaceSource?.sourceType,
						message: resolveCheckedMessage({
							installed: Boolean(installedRecord),
							installedVersion,
							latestVersion: latest.version,
							updateAvailable,
						}),
						error: undefined,
					},
				});
			})
			.catch((error: unknown) => {
				if (error instanceof CodexCliUnavailableError) {
					return publishState({
						nextState: {
							...state,
							phase: "unavailable",
							codexAvailable: false,
							installed: false,
							message: error.message,
							error: undefined,
						},
					});
				}
				return publishError({ error });
			})
			.finally(() => {
				checkPromise = undefined;
			});
		return checkPromise;
	};

	const installFromOfficialRelease = async ({
		latestTag,
	}: {
		latestTag: string;
	}): Promise<void> => {
		await runCodex({
			args: [
				"plugin",
				"marketplace",
				"add",
				OFFICIAL_MARKETPLACE,
				"--ref",
				latestTag,
				"--json",
			],
		});
		await runCodex({
			args: ["plugin", "add", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`, "--json"],
		});
	};

	const replaceOfficialMarketplace = async ({
		record,
		latestTag,
	}: {
		record: CodexPluginRecord;
		latestTag: string;
	}): Promise<void> => {
		const previousVersion = normalizePluginVersion({ version: record.version });
		await runCodex({
			args: [
				"plugin",
				"marketplace",
				"remove",
				record.marketplaceName,
				"--json",
			],
		});
		try {
			await installFromOfficialRelease({ latestTag });
		} catch (error: unknown) {
			try {
				await runCodex({
					args: ["plugin", "marketplace", "remove", MARKETPLACE_NAME, "--json"],
				});
			} catch (cleanupError: unknown) {
				logger.warn(
					"[CodexPluginUpdater] Failed to clean up partial update:",
					cleanupError
				);
			}
			if (previousVersion) {
				try {
					await installFromOfficialRelease({
						latestTag: `qcut-plugin-v${previousVersion}`,
					});
				} catch (rollbackError: unknown) {
					logger.warn("[CodexPluginUpdater] Rollback failed:", rollbackError);
				}
			}
			throw error;
		}
	};

	const installUpdate = async (): Promise<CodexPluginUpdateState> => {
		if (installPromise) return installPromise;
		installPromise = (async () => {
			const checked =
				state.phase === "available" || state.phase === "not-installed"
					? state
					: await checkForUpdates();
			if (checked.phase !== "available" && checked.phase !== "not-installed") {
				return checked;
			}
			if (!checked.latestTag || !checked.latestVersion) return checked;
			publishState({
				nextState: {
					...checked,
					phase: "updating",
					message: "Updating QCut Plugin",
					error: undefined,
				},
			});

			if (!marketplaceRecord) {
				await installFromOfficialRelease({ latestTag: checked.latestTag });
			} else if (isOfficialGitMarketplace({ record: marketplaceRecord })) {
				await replaceOfficialMarketplace({
					record: marketplaceRecord,
					latestTag: checked.latestTag,
				});
			} else if (marketplaceRecord.marketplaceSource?.sourceType === "local") {
				await runCodex({
					args: [
						"plugin",
						"add",
						`${PLUGIN_NAME}@${marketplaceRecord.marketplaceName}`,
						"--json",
					],
				});
			} else {
				await runCodex({
					args: [
						"plugin",
						"marketplace",
						"upgrade",
						marketplaceRecord.marketplaceName,
						"--json",
					],
				});
				await runCodex({
					args: [
						"plugin",
						"add",
						`${PLUGIN_NAME}@${marketplaceRecord.marketplaceName}`,
						"--json",
					],
				});
			}

			const list = await loadPluginList();
			installedRecord = findInstalledPlugin({ list });
			marketplaceRecord = installedRecord ?? findAvailablePlugin({ list });
			const installedVersion = normalizePluginVersion({
				version: installedRecord?.version,
			});
			if (
				!installedVersion ||
				comparePluginVersions({
					left: installedVersion,
					right: checked.latestVersion,
				}) < 0
			) {
				throw new Error(
					`QCut Plugin remains on ${installedVersion || "an unknown version"}`
				);
			}
			return publishState({
				nextState: {
					...checked,
					phase: "restart-required",
					codexAvailable: true,
					installed: true,
					installedVersion,
					marketplaceName: installedRecord?.marketplaceName,
					marketplaceSourceType: installedRecord?.marketplaceSource?.sourceType,
					message: `QCut Plugin v${installedVersion} installed; start a new Codex task`,
					error: undefined,
				},
			});
		})()
			.catch((error: unknown) => publishError({ error }))
			.finally(() => {
				installPromise = undefined;
			});
		return installPromise;
	};

	return {
		start: () => {
			if (started) return;
			started = true;
			void checkForUpdates();
			interval = setInterval(() => void checkForUpdates(), checkIntervalMs);
			interval.unref();
		},
		stop: () => {
			if (interval) clearInterval(interval);
			interval = undefined;
			started = false;
		},
		getState: () => ({ ...state }),
		checkForUpdates,
		installUpdate,
	};
}
