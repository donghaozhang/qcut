export const DEFAULT_STICKER_LAB_MANIFEST_URL =
	"/sticker-lab/qcut-original-2026-07-31.json";

export type LocalStickerLabSource =
	| {
			kind: "manifest";
			manifestPath: string;
	  }
	| {
			kind: "legacy";
			filePath: string;
	  }
	| {
			kind: "remote-manifest";
			manifestUrl: string;
	  };

export function buildLocalStickerLabSource({
	isEnabled,
	legacyFilePath,
	manifestPath,
	manifestUrl,
}: {
	isEnabled: boolean;
	legacyFilePath?: string;
	manifestPath?: string;
	manifestUrl?: string;
}): LocalStickerLabSource | null {
	if (!isEnabled) return null;

	const normalizedManifestPath = manifestPath?.trim();
	if (normalizedManifestPath) {
		return { kind: "manifest", manifestPath: normalizedManifestPath };
	}

	const normalizedLegacyPath = legacyFilePath?.trim();
	if (normalizedLegacyPath) {
		return { kind: "legacy", filePath: normalizedLegacyPath };
	}

	return {
		kind: "remote-manifest",
		manifestUrl: manifestUrl?.trim() || DEFAULT_STICKER_LAB_MANIFEST_URL,
	};
}

export function getLocalStickerLabSource(): LocalStickerLabSource | null {
	return buildLocalStickerLabSource({
		isEnabled:
			import.meta.env.VITE_QCUT_ENABLE_STICKER_LAB === "true" ||
			import.meta.env.VITE_QCUT_ENABLE_LOCAL_STICKER_LAB === "true",
		legacyFilePath: import.meta.env.VITE_QCUT_LOCAL_STICKER_REFERENCE_PATH,
		manifestPath: import.meta.env.VITE_QCUT_LOCAL_STICKER_MANIFEST_PATH,
		manifestUrl: import.meta.env.VITE_QCUT_STICKER_LAB_MANIFEST_URL,
	});
}
