import { useEffect, useMemo, useState } from "react";
import { getLocalSoundEffectsLabSource } from "@/lib/audio/local-sound-effects-lab-config";
import {
	loadLocalSoundEffectsLabManifest,
	loadPrivateSoundEffectsLabManifest,
	type SoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";
import {
	createSoundEffectsLabAssetFetch,
	soundEffectsLabPrivateManifestUrl,
} from "@/lib/audio/local-sound-effect-reference";
import { debugError } from "@/lib/debug/debug-config";

export interface LocalSoundEffectsLabState {
	catalog: SoundEffectsLabManifest | null;
	error: string | null;
	isAvailable: boolean;
	isLoading: boolean;
}

export function useLocalSoundEffectsLab(): LocalSoundEffectsLabState {
	const source = useMemo(() => getLocalSoundEffectsLabSource(), []);
	const [state, setState] = useState<LocalSoundEffectsLabState>({
		catalog: null,
		error: null,
		isAvailable: source?.kind === "manifest",
		isLoading: source !== null,
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
				});
			} catch (error) {
				if (disposed) return;
				if (source.kind === "private-manifest") {
					debugError(
						"[SoundEffectsLab] Private reference catalog unavailable",
						error
					);
					setState({
						catalog: null,
						error: null,
						isAvailable: false,
						isLoading: false,
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
				});
			}
		};
		void loadCatalog();
		return () => {
			disposed = true;
			abortController.abort();
		};
	}, [source]);

	return state;
}
