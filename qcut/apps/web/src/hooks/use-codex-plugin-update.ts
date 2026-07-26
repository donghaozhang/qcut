import { useCallback, useEffect, useMemo, useState } from "react";
import {
	PlatformCapability,
	platform,
	type PlatformCodexPluginUpdatesAPI,
	type PlatformCodexPluginUpdateState,
} from "@qcut/platform-core";

const EMPTY_STATE: PlatformCodexPluginUpdateState = {
	phase: "idle",
	codexAvailable: false,
	installed: false,
};

function resolvePluginUpdates(): PlatformCodexPluginUpdatesAPI | undefined {
	try {
		const currentPlatform = platform();
		if (!currentPlatform.hasCapability(PlatformCapability.Updates)) {
			return undefined;
		}
		return currentPlatform.updates.plugin;
	} catch {
		return undefined;
	}
}

function errorState({
	error,
}: {
	error: unknown;
}): PlatformCodexPluginUpdateState {
	const message = error instanceof Error ? error.message : String(error);
	return {
		phase: "error",
		codexAvailable: true,
		installed: false,
		message: "QCut Plugin update failed",
		error: message,
	};
}

export function useCodexPluginUpdate() {
	const pluginUpdates = useMemo(resolvePluginUpdates, []);
	const [state, setState] =
		useState<PlatformCodexPluginUpdateState>(EMPTY_STATE);

	useEffect(() => {
		if (!pluginUpdates) return;
		const unsubscribe = pluginUpdates.onStateChanged(setState);
		let active = true;
		void pluginUpdates
			.getState()
			.then((nextState) => {
				if (active) setState(nextState);
			})
			.catch((error: unknown) => {
				if (active) setState(errorState({ error }));
			});
		return () => {
			active = false;
			unsubscribe();
		};
	}, [pluginUpdates]);

	const checkForUpdates = useCallback(async () => {
		if (!pluginUpdates) return EMPTY_STATE;
		const nextState = await pluginUpdates
			.checkForUpdates()
			.catch((error: unknown) => errorState({ error }));
		setState(nextState);
		return nextState;
	}, [pluginUpdates]);

	const installUpdate = useCallback(async () => {
		if (!pluginUpdates) return EMPTY_STATE;
		const nextState = await pluginUpdates
			.installUpdate()
			.catch((error: unknown) => errorState({ error }));
		setState(nextState);
		return nextState;
	}, [pluginUpdates]);

	return {
		state,
		available: Boolean(pluginUpdates),
		checkForUpdates,
		installUpdate,
	};
}
