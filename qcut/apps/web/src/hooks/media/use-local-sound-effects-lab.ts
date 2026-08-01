import { useEffect, useMemo, useState } from "react";
import { getLocalSoundEffectsLabSource } from "@/lib/audio/local-sound-effects-lab-config";
import {
	loadLocalSoundEffectsLabManifest,
	type LocalSoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";

export interface LocalSoundEffectsLabState {
	catalog: LocalSoundEffectsLabManifest | null;
	error: string | null;
	isAvailable: boolean;
	isLoading: boolean;
}

export function useLocalSoundEffectsLab(): LocalSoundEffectsLabState {
	const source = useMemo(() => getLocalSoundEffectsLabSource(), []);
	const [state, setState] = useState<LocalSoundEffectsLabState>({
		catalog: null,
		error:
			source?.kind === "missing-manifest"
				? "Sound Effects Lab manifest path is not configured"
				: null,
		isAvailable: source !== null,
		isLoading: source?.kind === "manifest",
	});

	useEffect(() => {
		if (source?.kind !== "manifest") return;
		let disposed = false;
		const loadCatalog = async () => {
			try {
				const catalog = await loadLocalSoundEffectsLabManifest({
					manifestPath: source.manifestPath,
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
		};
	}, [source]);

	return state;
}
