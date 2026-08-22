import { useEffect, useMemo, useState } from "react";
import { getLocalSoundEffectsLabSource } from "@/lib/audio/local-sound-effects-lab-config";
import {
	loadLocalSoundEffectsLabManifest,
	loadPrivateSoundEffectsLabManifest,
	SoundEffectsLabManifestHttpError,
	type SoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";
import {
	createSoundEffectsLabAssetFetch,
	soundEffectsLabPrivateManifestUrl,
} from "@/lib/audio/local-sound-effect-reference";
import {
	loadSoundEffectsLabOfflinePack,
	removeSoundEffectsLabOfflinePack,
} from "@/lib/audio/sound-effects-lab-offline-pack";
import { getSessionToken } from "@/lib/ai-video/core/license-relay";
import { debugError } from "@/lib/debug/debug-config";
import { useLicenseStore } from "@/stores/license-store";

export interface LocalSoundEffectsLabState {
	catalog: SoundEffectsLabManifest | null;
	error: string | null;
	isAvailable: boolean;
	isLoading: boolean;
	isOffline: boolean;
}

export function useLocalSoundEffectsLab(): LocalSoundEffectsLabState {
	const source = useMemo(() => getLocalSoundEffectsLabSource(), []);
	const ownerEmail = useLicenseStore(
		(state) => state.license?.user?.email ?? null
	);
	const [state, setState] = useState<LocalSoundEffectsLabState>({
		catalog: null,
		error: null,
		isAvailable: source?.kind === "manifest",
		isLoading: source !== null,
		isOffline: false,
	});

	useEffect(() => {
		if (!source) return;
		let disposed = false;
		const abortController = new AbortController();
		const loadCatalog = async () => {
			try {
				const catalog =
					source.kind === "manifest"
						? await loadLocalSoundEffectsLabManifest({
								manifestPath: source.manifestPath,
							})
						: await loadPrivateSoundEffectsLabManifest({
								fetchImpl: createSoundEffectsLabAssetFetch(),
								manifestUrl: soundEffectsLabPrivateManifestUrl(),
								signal: abortController.signal,
							});
				if (disposed) return;
				setState({
					catalog,
					error: null,
					isAvailable: true,
					isLoading: false,
					isOffline: false,
				});
			} catch (error) {
				if (disposed) return;
				if (source.kind === "private-manifest") {
					debugError(
						"[SoundEffectsLab] Private reference catalog unavailable",
						error
					);
					const accessDenied =
						error instanceof SoundEffectsLabManifestHttpError &&
						(error.status === 401 || error.status === 403);
					if (accessDenied) {
						if (ownerEmail) {
							try {
								await removeSoundEffectsLabOfflinePack({ ownerEmail });
							} catch (removalError) {
								debugError(
									"[SoundEffectsLab] Failed to revoke offline reference catalog",
									removalError
								);
							}
						}
						if (disposed) return;
						setState({
							catalog: null,
							error: null,
							isAvailable: false,
							isLoading: false,
							isOffline: false,
						});
						return;
					}
					let offlinePack: Awaited<
						ReturnType<typeof loadSoundEffectsLabOfflinePack>
					> = null;
					try {
						const sessionToken = ownerEmail ? await getSessionToken() : "";
						offlinePack =
							sessionToken && ownerEmail
								? await loadSoundEffectsLabOfflinePack({ ownerEmail })
								: null;
					} catch (offlineError) {
						debugError(
							"[SoundEffectsLab] Offline reference catalog unavailable",
							offlineError
						);
					}
					if (disposed) return;
					if (offlinePack) {
						setState({
							catalog: offlinePack.catalog,
							error: null,
							isAvailable: true,
							isLoading: false,
							isOffline: true,
						});
						return;
					}
					setState({
						catalog: null,
						error: null,
						isAvailable: false,
						isLoading: false,
						isOffline: false,
					});
					return;
				}
				setState({
					catalog: null,
					error:
						error instanceof Error
							? error.message
							: "Unable to load Sound Effects Lab manifest",
					isAvailable: true,
					isLoading: false,
					isOffline: false,
				});
			}
		};
		void loadCatalog();
		return () => {
			disposed = true;
			abortController.abort();
		};
	}, [ownerEmail, source]);

	return state;
}
