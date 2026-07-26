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

/** True for anything that carries its own license URL (Freesound, Jamendo). */
function hasLicenseUrl({ license }: { license: string }): boolean {
	return /^https?:\/\//i.test(license);
}

const CC_BY_URL = /\/licenses\/by\/(\d+\.\d+)\/(?:([a-z]{2})\/)?$/i;

/**
 * SPDX id for a CC BY deed URL. Jurisdiction ports ("…/by/2.5/it/") have no
 * plain SPDX identifier, so they fall back to the descriptive name rather than
 * claiming a version the work is not under — the credit line quotes this next
 * to the deed URL, so the two must agree.
 */
function ccBySpdxId({
	licenseUrl,
}: {
	licenseUrl: string;
}): string | undefined {
	const match = CC_BY_URL.exec(licenseUrl.trim());
	if (!match || match[2]) return undefined;
	return `CC-BY-${match[1]}`;
}

export function resolveFreesoundLicense({
	licenseUrl,
	creator,
}: {
	licenseUrl: string;
	creator?: string;
}): AssetLicense {
	const normalized = licenseUrl.toLocaleLowerCase();
	const credit = creator ? `Credit ${creator}` : "Credit the original creator";
	// The Public Domain Mark labels works already out of copyright; it is not a
	// license grant, so it must not be reported as CC0.
	if (normalized.includes("publicdomain/mark")) {
		return {
			name: "Public Domain Mark",
			commercialUse: "allowed",
			attributionRequired: false,
			sourceUrl: licenseUrl,
		};
	}
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
			attributionText: credit,
			sourceUrl: licenseUrl,
		};
	}
	// ShareAlike would push the user's own video under a CC license and
	// NoDerivatives forbids editing at all, so both are flagged as restricted
	// even though they permit commercial use on paper.
	if (normalized.includes("by-sa")) {
		return {
			name: "Creative Commons Attribution-ShareAlike",
			commercialUse: "restricted",
			attributionRequired: true,
			attributionText: credit,
			sourceUrl: licenseUrl,
		};
	}
	if (normalized.includes("by-nd")) {
		return {
			name: "Creative Commons Attribution-NoDerivatives",
			commercialUse: "restricted",
			attributionRequired: true,
			attributionText: credit,
			sourceUrl: licenseUrl,
		};
	}
	if (normalized.includes("/by/")) {
		const spdxId = ccBySpdxId({ licenseUrl });
		return {
			name: spdxId
				? `Creative Commons Attribution ${spdxId.replace("CC-BY-", "")}`
				: "Creative Commons Attribution",
			spdxId,
			commercialUse: "allowed",
			attributionRequired: true,
			attributionText: credit,
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
	// QCut CDN catalog tracks share source "qcut" but live on absolute URLs,
	// so delivery must stay remote for them.
	const isBundled =
		isBuiltIn && !/^https?:/i.test(sound.previewUrl ?? sound.url ?? "");
	// Catalog tracks also share source "qcut" while carrying a real Creative
	// Commons license URL; that license wins, or the card would tell the user
	// a CC BY song is QCut-licensed and needs no credit.
	const carriesOwnLicense = hasLicenseUrl({ license: sound.license ?? "" });
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: String(sound.id),
		kind,
		version: 1,
		name: sound.name,
		category: category ?? (kind === "music" ? "music" : "sound-effects"),
		tags: uniqueSoundTags({ tags: sound.tags }),
		delivery: isBundled ? "bundled" : "remote",
		files,
		license:
			isBuiltIn && !carriesOwnLicense
				? QCUT_BUILT_IN_LICENSE
				: resolveFreesoundLicense({
						licenseUrl: sound.license,
						creator: sound.username,
					}),
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
