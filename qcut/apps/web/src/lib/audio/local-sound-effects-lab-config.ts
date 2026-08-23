export type LocalSoundEffectsLabSource =
	| { kind: "manifest"; manifestPath: string }
	| { kind: "private-manifest" };

export function isSoundEffectsLabEnabled({
	configuredValue,
}: {
	configuredValue?: string;
}): boolean {
	return configuredValue?.trim().toLowerCase() !== "false";
}

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
		isEnabled: isSoundEffectsLabEnabled({
			configuredValue: import.meta.env.VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB,
		}),
		manifestPath: import.meta.env.VITE_QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH,
	});
}
