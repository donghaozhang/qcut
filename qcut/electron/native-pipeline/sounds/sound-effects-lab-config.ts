import { resolve } from "node:path";
import { getKey } from "../infra/key-manager.js";

export const SOUND_EFFECTS_LAB_LICENSE_SERVER_URL =
	process.env.QCUT_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";

export interface SoundEffectsLabManifestSource {
	/** Absolute path to a manifest JSON file. */
	manifestPath?: string;
	/** URL of the private manifest, served by the license server. */
	manifestUrl?: string;
	fallbackManifestUrl?: string;
	headers?: Record<string, string>;
}

export function isSoundEffectsLabServerUrl({ url }: { url: string }): boolean {
	try {
		return (
			new URL(url).origin ===
			new URL(SOUND_EFFECTS_LAB_LICENSE_SERVER_URL).origin
		);
	} catch {
		return false;
	}
}

export function defaultSoundEffectsLabManifestSource({
	manifestPath,
	manifestUrl,
}: {
	manifestPath?: string;
	manifestUrl?: string;
} = {}): SoundEffectsLabManifestSource {
	const requestedPath =
		manifestPath ?? process.env.QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH;
	if (requestedPath) return { manifestPath: resolve(requestedPath) };

	const serverUrl = SOUND_EFFECTS_LAB_LICENSE_SERVER_URL.replace(/\/+$/, "");
	const requestedUrl =
		manifestUrl ??
		process.env.QCUT_SOUND_EFFECTS_LAB_MANIFEST_URL ??
		`${serverUrl}/api/sound-effects-lab/private-manifest/enriched?includeAliases=1`;
	const token = isSoundEffectsLabServerUrl({ url: requestedUrl })
		? getKey("QCUT_AUTH_TOKEN")
		: undefined;
	return {
		manifestUrl: requestedUrl,
		...(requestedUrl.includes("/private-manifest/enriched")
			? {
					fallbackManifestUrl: `${serverUrl}/api/sound-effects-lab/private-manifest`,
				}
			: {}),
		...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
	};
}

export function soundEffectsLabAssetsUrl(): string {
	return `${SOUND_EFFECTS_LAB_LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/sound-effects-lab/assets`;
}

export function hasSoundEffectsLabCredentials({
	source = defaultSoundEffectsLabManifestSource(),
}: {
	source?: SoundEffectsLabManifestSource;
} = {}): boolean {
	return Boolean(source.manifestPath || source.headers?.Authorization);
}
