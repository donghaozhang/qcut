export type LocalSoundEffectsLabSource =
	| { kind: "manifest"; manifestPath: string }
	| { kind: "private-manifest" };

export function buildLocalSoundEffectsLabSource({
	isEnabled,
	manifestPath,
}: {
	isEnabled: boolean;
	manifestPath?: string;
}): LocalSoundEffectsLabSource | null {
	if (!isEnabled) return null;

	const normalizedManifestPath = manifestPath?.trim();
	return normalizedManifestPath
		? { kind: "manifest", manifestPath: normalizedManifestPath }
		: { kind: "private-manifest" };
}

export function getLocalSoundEffectsLabSource(): LocalSoundEffectsLabSource | null {
	return buildLocalSoundEffectsLabSource({
		isEnabled: import.meta.env.VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB === "true",
		manifestPath: import.meta.env.VITE_QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH,
	});
}
