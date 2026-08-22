import { useCallback, useEffect, useRef, useState } from "react";
import {
	getSoundEffectsLabOfflinePackStatus,
	installSoundEffectsLabOfflinePack,
	removeSoundEffectsLabOfflinePack,
} from "@/lib/audio/sound-effects-lab-offline-pack";
import type {
	PrivateSoundEffectsLabManifest,
	SoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";

export type SoundEffectsLabOfflinePackUiState =
	| "checking"
	| "failed"
	| "installed"
	| "installing"
	| "not-installed"
	| "removing"
	| "unavailable"
	| "update-available";

export interface SoundEffectsLabOfflinePackController {
	cachedBytes: number;
	completedItems: number;
	error: string | null;
	install: () => Promise<boolean>;
	installedAt?: number;
	persistentStorage: boolean;
	progress: number;
	remove: () => Promise<boolean>;
	state: SoundEffectsLabOfflinePackUiState;
	totalBytes: number;
	totalItems: number;
}

interface ControllerState {
	cachedBytes: number;
	completedItems: number;
	error: string | null;
	installedAt?: number;
	persistentStorage: boolean;
	progress: number;
	state: SoundEffectsLabOfflinePackUiState;
	totalBytes: number;
	totalItems: number;
}

const UNAVAILABLE_STATE: ControllerState = {
	cachedBytes: 0,
	completedItems: 0,
	error: null,
	persistentStorage: false,
	progress: 0,
	state: "unavailable",
	totalBytes: 0,
	totalItems: 0,
};

function privateCatalog({
	catalog,
}: {
	catalog: SoundEffectsLabManifest | null;
}): PrivateSoundEffectsLabManifest | null {
	return catalog?.schemaVersion === 2 ? catalog : null;
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error
		? error.message
		: "Sound Effects Lab offline pack operation failed";
}

export function useSoundEffectsLabOfflinePack({
	catalog,
	ownerEmail,
}: {
	catalog: SoundEffectsLabManifest | null;
	ownerEmail: string | null;
}): SoundEffectsLabOfflinePackController {
	const privateManifest = privateCatalog({ catalog });
	const busyRef = useRef(false);
	const mountedRef = useRef(true);
	const [state, setState] = useState<ControllerState>(UNAVAILABLE_STATE);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (busyRef.current) return;
		if (!privateManifest || !ownerEmail) {
			setState(UNAVAILABLE_STATE);
			return;
		}
		let disposed = false;
		setState({
			...UNAVAILABLE_STATE,
			state: "checking",
			totalItems: privateManifest.items.length,
		});
		void getSoundEffectsLabOfflinePackStatus({
			catalog: privateManifest,
			ownerEmail,
		})
			.then((status) => {
				if (disposed) return;
				setState({
					cachedBytes: status.cachedBytes,
					completedItems:
						status.state === "installed" ? privateManifest.items.length : 0,
					error: null,
					installedAt: status.installedAt,
					persistentStorage: status.persistentStorage,
					progress: status.state === "installed" ? 1 : 0,
					state:
						status.state === "installed"
							? "installed"
							: status.state === "update-available"
								? "update-available"
								: "not-installed",
					totalBytes: status.totalBytes,
					totalItems: privateManifest.items.length,
				});
			})
			.catch((error) => {
				if (disposed) return;
				setState({
					...UNAVAILABLE_STATE,
					error: errorMessage({ error }),
					state: "failed",
					totalItems: privateManifest.items.length,
				});
			});
		return () => {
			disposed = true;
		};
	}, [ownerEmail, privateManifest]);

	const install = useCallback(async (): Promise<boolean> => {
		if (!privateManifest || !ownerEmail || busyRef.current) return false;
		busyRef.current = true;
		const totalBytes = privateManifest.items.reduce(
			(total, item) => total + item.byteSize,
			0
		);
		setState({
			cachedBytes: 0,
			completedItems: 0,
			error: null,
			persistentStorage: false,
			progress: 0,
			state: "installing",
			totalBytes,
			totalItems: privateManifest.items.length,
		});
		try {
			const result = await installSoundEffectsLabOfflinePack({
				catalog: privateManifest,
				onProgress: ({ completedItems, progress, totalItems }) => {
					if (!mountedRef.current) return;
					setState((current) => ({
						...current,
						cachedBytes: Math.round(totalBytes * progress),
						completedItems,
						progress,
						totalItems,
					}));
				},
				ownerEmail,
			});
			if (mountedRef.current) {
				setState({
					cachedBytes: result.cachedBytes,
					completedItems: privateManifest.items.length,
					error: null,
					installedAt: result.installedAt,
					persistentStorage: result.persistentStorage,
					progress: 1,
					state: "installed",
					totalBytes,
					totalItems: privateManifest.items.length,
				});
			}
			return true;
		} catch (error) {
			if (mountedRef.current) {
				setState((current) => ({
					...current,
					error: errorMessage({ error }),
					state: "failed",
				}));
			}
			return false;
		} finally {
			busyRef.current = false;
		}
	}, [ownerEmail, privateManifest]);

	const remove = useCallback(async (): Promise<boolean> => {
		if (!ownerEmail || busyRef.current) return false;
		busyRef.current = true;
		setState((current) => ({
			...current,
			completedItems: 0,
			error: null,
			progress: 0,
			state: "removing",
		}));
		try {
			await removeSoundEffectsLabOfflinePack({
				onProgress: ({ completedItems, progress, totalItems }) => {
					if (!mountedRef.current) return;
					setState((current) => ({
						...current,
						completedItems,
						progress,
						totalItems,
					}));
				},
				ownerEmail,
			});
			if (mountedRef.current) {
				setState({
					...UNAVAILABLE_STATE,
					state: privateManifest ? "not-installed" : "unavailable",
					totalBytes:
						privateManifest?.items.reduce(
							(total, item) => total + item.byteSize,
							0
						) ?? 0,
					totalItems: privateManifest?.items.length ?? 0,
				});
			}
			return true;
		} catch (error) {
			if (mountedRef.current) {
				setState((current) => ({
					...current,
					error: errorMessage({ error }),
					state: "failed",
				}));
			}
			return false;
		} finally {
			busyRef.current = false;
		}
	}, [ownerEmail, privateManifest]);

	return { ...state, install, remove };
}
