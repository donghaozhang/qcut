import { resolve } from "node:path";
import { getKey } from "../infra/key-manager.js";
import {
	searchFreesound,
	type SoundSearchResult,
} from "../sounds/freesound-client.js";
import {
	downloadSoundEffectsLabAsset,
	searchSoundEffectsLab,
} from "../sounds/sound-effects-lab-client.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export type SoundSearchSource = "freesound" | "lab" | "all";

const LICENSE_SERVER_URL =
	process.env.QCUT_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";

/**
 * Without an explicit manifest the lab catalog comes from the license server,
 * which serves it only to a signed-in allowlisted account. The token is the
 * one `qcut system login` stores.
 */
function labManifestSource({ options }: { options: CLIRunOptions }) {
	if (options.manifest) return { manifestPath: resolve(options.manifest) };
	const token = getKey("QCUT_AUTH_TOKEN");
	return {
		manifestUrl:
			options.manifestUrl ??
			`${LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/sound-effects-lab/private-manifest`,
		...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
	};
}

export interface SoundSearchDependencies {
	searchFreesound: typeof searchFreesound;
	searchSoundEffectsLab: typeof searchSoundEffectsLab;
	downloadSoundEffectsLabAsset: typeof downloadSoundEffectsLabAsset;
}

const DEFAULT_DEPENDENCIES: SoundSearchDependencies = {
	searchFreesound,
	searchSoundEffectsLab,
	downloadSoundEffectsLabAsset,
};

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function parseSource({ value }: { value: unknown }): SoundSearchSource {
	if (value === undefined || value === null || value === "") return "all";
	if (value === "freesound" || value === "lab" || value === "all") return value;
	throw new Error("--source must be one of: freesound, lab, all");
}

/**
 * Searches both catalogs by default. A failure in one is reported alongside the
 * other's results rather than failing the command, because the two have
 * unrelated preconditions: Freesound needs an API key, the lab catalog needs a
 * local manifest or an allowlisted session.
 */
export async function handleSoundSearch(
	options: CLIRunOptions,
	_onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: SoundSearchDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const query = options.query?.trim();
	if (!query) return { success: false, error: "Missing --query" };

	let source: SoundSearchSource;
	try {
		source = parseSource({ value: options.source });
	} catch (error) {
		return { success: false, error: errorMessage({ error }) };
	}

	const limit =
		typeof options.limit === "number" && options.limit > 0
			? Math.floor(options.limit)
			: 24;
	const results: SoundSearchResult[] = [];
	const warnings: string[] = [];

	if (source === "freesound" || source === "all") {
		try {
			results.push(
				...(await dependencies.searchFreesound({ query, limit, signal }))
			);
		} catch (error) {
			warnings.push(`freesound: ${errorMessage({ error })}`);
		}
	}

	if (source === "lab" || source === "all") {
		try {
			results.push(
				...(await dependencies.searchSoundEffectsLab({
					query,
					limit,
					signal,
					source: labManifestSource({ options }),
				}))
			);
		} catch (error) {
			warnings.push(`sound-effects-lab: ${errorMessage({ error })}`);
		}
	}

	// Both sides failing means nothing was searched, which is an error rather
	// than an empty result set.
	if (results.length === 0 && warnings.length > 0 && source === "all") {
		return { success: false, error: warnings.join("; ") };
	}
	if (results.length === 0 && warnings.length > 0) {
		return { success: false, error: warnings[0] };
	}

	if (options.downloadDir) {
		const assetsUrl = `${LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/sound-effects-lab/assets`;
		const token = getKey("QCUT_AUTH_TOKEN");
		for (const entry of results) {
			if (!(entry.objectKey && entry.fileName)) continue;
			try {
				entry.localPath = await dependencies.downloadSoundEffectsLabAsset({
					objectKey: entry.objectKey,
					assetsUrl,
					headers: token ? { Authorization: `Bearer ${token}` } : undefined,
					destinationPath: resolve(options.downloadDir, entry.fileName),
					signal,
				});
			} catch (error) {
				warnings.push(`${entry.name}: ${errorMessage({ error })}`);
			}
		}
	}

	return {
		success: true,
		data: {
			query,
			total: results.length,
			results: results.slice(0, limit),
			...(warnings.length > 0 ? { warnings } : {}),
		},
	};
}
