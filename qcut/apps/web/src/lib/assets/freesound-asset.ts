import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetKind,
	type AssetLicense,
	type AssetManifestEntry,
	type AssetManifestFile,
} from "@qcut/editor-core";
import type { SoundEffect } from "@/types/sounds";
import { QCUT_BUILT_IN_LICENSE } from "./qcut-built-in-license";

function uniqueSoundTags({ tags }: { tags: readonly string[] }): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const tag of tags) {
		const trimmed = tag.trim();
		const key = trimmed.toLocaleLowerCase();
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

export function resolveFreesoundLicense({
	licenseUrl,
}: {
	licenseUrl: string;
}): AssetLicense {
	const normalized = licenseUrl.toLocaleLowerCase();
	if (normalized.includes("publicdomain") || normalized.includes("/zero/")) {
		return {
			name: "Creative Commons Zero",
			spdxId: "CC0-1.0",
			commercialUse: "allowed",
			attributionRequired: false,
			sourceUrl: licenseUrl,
		};
	}
	if (normalized.includes("by-nc")) {
		return {
			name: "Creative Commons Attribution-NonCommercial",
			commercialUse: "restricted",
			attributionRequired: true,
			attributionText: "Credit the Freesound creator",
			sourceUrl: licenseUrl,
		};
	}
	if (normalized.includes("/by/")) {
		return {
			name: "Creative Commons Attribution",
			commercialUse: "allowed",
			attributionRequired: true,
			attributionText: "Credit the Freesound creator",
			sourceUrl: licenseUrl,
		};
	}
	return {
		name: licenseUrl || "Unknown license",
		commercialUse: "unknown",
		attributionRequired: false,
		sourceUrl: licenseUrl || undefined,
	};
}

export function createAudioLibraryAssetEntry({
	sound,
	kind,
	category,
}: {
	sound: SoundEffect;
	kind: Extract<AssetKind, "sound-effect" | "music">;
	category?: string;
}): AssetManifestEntry {
	const files: AssetManifestFile[] = [];
	if (sound.previewUrl) {
		files.push({
			role: "preview",
			url: sound.previewUrl,
			mimeType: sound.previewUrl.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
		});
	}
	if (sound.downloadUrl) {
		files.push({
			role: "source",
			url: sound.downloadUrl,
			mimeType: sound.downloadUrl.endsWith(".ogg") ? "audio/ogg" : undefined,
		});
	}

	const isBuiltIn = sound.source === "qcut";
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: String(sound.id),
		kind,
		version: 1,
		name: sound.name,
		category: category ?? (kind === "music" ? "music" : "sound-effects"),
		tags: uniqueSoundTags({ tags: sound.tags }),
		delivery: isBuiltIn ? "bundled" : "remote",
		files,
		license: isBuiltIn
			? QCUT_BUILT_IN_LICENSE
			: resolveFreesoundLicense({ licenseUrl: sound.license }),
		metadata: {
			creator: sound.username,
			duration: sound.duration,
			rating: sound.rating,
			downloads: sound.downloads,
			bpm: sound.bpm,
			musicalKey: sound.musicalKey,
			moods: sound.moods,
			scenes: sound.scenes,
			loopable: sound.loopable,
		},
	};
}

export const createFreesoundAssetEntry = createAudioLibraryAssetEntry;
