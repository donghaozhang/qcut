import { useCallback, useEffect, useMemo, useState } from "react";
import {
	PlatformCapability,
	platform,
	type PlatformUpdatePreferences,
	type PlatformUpdatesAPI,
	type PlatformUpdateState,
} from "@qcut/platform-core";

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

function resolveAppUpdates(): PlatformUpdatesAPI | undefined {
	try {
		const currentPlatform = platform();
		if (!currentPlatform.hasCapability(PlatformCapability.Updates)) {
			return undefined;
		}
		return currentPlatform.updates;
	} catch {
		return undefined;
	}
}

function errorState({
	error,
	currentState,
}: {
	error: unknown;
	currentState: PlatformUpdateState;
}): PlatformUpdateState {
	const message = error instanceof Error ? error.message : String(error);
	return {
		...currentState,
		phase: "error",
		automaticDownload: false,
		message: "QCut update failed",
		error: message,
	};
}

export function useAppUpdate() {
	const updates = useMemo(resolveAppUpdates, []);
	const [state, setState] = useState<PlatformUpdateState>(EMPTY_STATE);

	useEffect(() => {
		if (!updates) return;
		const unsubscribe = updates.onStateChanged(setState);
		let active = true;
		void updates
			.getState()
			.then((nextState) => {
				if (active) setState(nextState);
			})
			.catch((error: unknown) => {
				if (active)
					setState((current) => errorState({ error, currentState: current }));
			});
		return () => {
			active = false;
			unsubscribe();
		};
	}, [updates]);

	const runStateAction = useCallback(
		async ({
			action,
		}: {
			action: (api: PlatformUpdatesAPI) => Promise<PlatformUpdateState>;
		}) => {
			if (!updates) return EMPTY_STATE;
			try {
				const nextState = await action(updates);
				setState(nextState);
				return nextState;
			} catch (error: unknown) {
				const nextState = errorState({ error, currentState: state });
				setState(nextState);
				throw error;
			}
		},
		[state, updates]
	);

	const checkForUpdates = useCallback(
		() =>
			runStateAction({
				action: (api) => api.checkForUpdates(),
			}),
		[runStateAction]
	);

	const downloadUpdate = useCallback(
		() =>
			runStateAction({
				action: (api) => api.downloadUpdate(),
			}),
		[runStateAction]
	);

	const installUpdate = useCallback(async () => {
		if (!updates) return;
		try {
			await updates.installUpdate();
		} catch (error: unknown) {
			setState((current) => errorState({ error, currentState: current }));
			throw error;
		}
	}, [updates]);

	const getPreferences = useCallback(
		() => updates?.getPreferences() ?? Promise.resolve(EMPTY_PREFERENCES),
		[updates]
	);

	const setPreferences = useCallback(
		({ preferences }: { preferences: Partial<PlatformUpdatePreferences> }) =>
			updates?.setPreferences(preferences) ??
			Promise.resolve(EMPTY_PREFERENCES),
		[updates]
	);

	return {
		state,
		available: Boolean(updates),
		checkForUpdates,
		downloadUpdate,
		installUpdate,
		getPreferences,
		setPreferences,
	};
}
