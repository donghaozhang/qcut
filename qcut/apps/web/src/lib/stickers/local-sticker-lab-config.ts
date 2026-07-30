export type LocalStickerLabSource =
	| {
			kind: "manifest";
			manifestPath: string;
	  }
	| {
			kind: "legacy";
			filePath: string;
	  };

export function buildLocalStickerLabSource({
	isEnabled,
	legacyFilePath,
	manifestPath,
}: {
	isEnabled: boolean;
	legacyFilePath?: string;
	manifestPath?: string;
}): LocalStickerLabSource | null {
	if (!isEnabled) return null;

	const normalizedManifestPath = manifestPath?.trim();
	if (normalizedManifestPath) {
		return { kind: "manifest", manifestPath: normalizedManifestPath };
	}

	const normalizedLegacyPath = legacyFilePath?.trim();
	if (!normalizedLegacyPath) return null;
	return { kind: "legacy", filePath: normalizedLegacyPath };
}

export function getLocalStickerLabSource(): LocalStickerLabSource | null {
	return buildLocalStickerLabSource({
		isEnabled: import.meta.env.VITE_QCUT_ENABLE_LOCAL_STICKER_LAB === "true",
		legacyFilePath: import.meta.env.VITE_QCUT_LOCAL_STICKER_REFERENCE_PATH,
		manifestPath: import.meta.env.VITE_QCUT_LOCAL_STICKER_MANIFEST_PATH,
	});
}
