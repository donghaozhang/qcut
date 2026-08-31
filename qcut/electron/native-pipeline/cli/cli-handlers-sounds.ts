import { resolve, sep } from "node:path";
import {
	searchFreesound,
	type SoundSearchResult,
} from "../sounds/freesound-client.js";
import {
	downloadSoundEffectsLabAsset,
	searchSoundEffectsLab,
} from "../sounds/sound-effects-lab-client.js";
import {
	defaultSoundEffectsLabManifestSource,
	soundEffectsLabAssetsUrl,
} from "../sounds/sound-effects-lab-config.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export type SoundSearchSource = "freesound" | "lab" | "all";

/**
 * Without an explicit manifest the lab catalog comes from the license server,
 * which serves it only to a signed-in allowlisted account. The token is the
 * one `qcut system login` stores.
 *
 * The token is attached only for the license server's own origin: --manifest-url
 * accepts any address, and sending the session bearer to an arbitrary host would
 * hand it to whoever runs that host.
 */
function labManifestSource({ options }: { options: CLIRunOptions }) {
	return defaultSoundEffectsLabManifestSource({
		manifestPath: options.manifest,
		manifestUrl: options.manifestUrl,
	});
}

/**
 * Resolves a manifest-supplied file name inside the chosen directory.
 *
 * `fileName` comes from the catalog, so an absolute path or a `../` segment
 * would otherwise write downloaded bytes anywhere on disk.
 */
function assetDestination({
	downloadDir,
	fileName,
}: {
	downloadDir: string;
	fileName: string;
}): string {
	const root = resolve(downloadDir);
	const destination = resolve(root, fileName);
	if (destination !== root && !destination.startsWith(root + sep)) {
		throw new Error(
			`Catalog file name "${fileName}" would write outside ${root}`
		);
	}
	return destination;
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

	// Trim before downloading: anything past the limit is not returned, so
	// fetching its audio would be bytes the caller never sees.
	const returned = results.slice(0, limit);

	if (options.downloadDir) {
		const source = labManifestSource({ options });
		for (const entry of returned) {
			if (!(entry.objectKey && entry.fileName)) continue;
			try {
				entry.localPath = await dependencies.downloadSoundEffectsLabAsset({
					objectKey: entry.objectKey,
					assetsUrl: soundEffectsLabAssetsUrl(),
					headers: source.headers,
					destinationPath: assetDestination({
						downloadDir: options.downloadDir,
						fileName: entry.fileName,
					}),
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
			// Describes the payload below it, not the pre-trim tally, so a --json
			// consumer can trust total === results.length.
			total: returned.length,
			...(results.length > returned.length ? { hasMore: true } : {}),
			results: returned,
			...(warnings.length > 0 ? { warnings } : {}),
		},
	};
}
