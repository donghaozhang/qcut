export type LocalSoundEffectsLabSource =
	| { kind: "manifest"; manifestPath: string }
	| { kind: "missing-manifest" };

export function buildLocalSoundEffectsLabSource({
	isEnabled,
	manifestPath,
}: {
	isEnabled: boolean;
	manifestPath?: string;
}): LocalSoundEffectsLabSource | null {
	if (!isEnabled) return null;

	const normalizedManifestPath = manifestPath?.trim();
	if (!normalizedManifestPath) return { kind: "missing-manifest" };
	return { kind: "manifest", manifestPath: normalizedManifestPath };
}

export function getLocalSoundEffectsLabSource(): LocalSoundEffectsLabSource | null {
	return buildLocalSoundEffectsLabSource({
		isEnabled: import.meta.env.VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB === "true",
		manifestPath: import.meta.env.VITE_QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH,
	});
}
