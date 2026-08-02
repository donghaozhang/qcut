import { resolve } from "node:path";
import {
	searchFreesound,
	type SoundSearchResult,
} from "../sounds/freesound-client.js";
import { searchSoundEffectsLab } from "../sounds/sound-effects-lab-client.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export type SoundSearchSource = "freesound" | "lab" | "all";

export interface SoundSearchDependencies {
	searchFreesound: typeof searchFreesound;
	searchSoundEffectsLab: typeof searchSoundEffectsLab;
}

const DEFAULT_DEPENDENCIES: SoundSearchDependencies = {
	searchFreesound,
	searchSoundEffectsLab,
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
					source: {
						manifestPath: options.manifest
							? resolve(options.manifest)
							: undefined,
						manifestUrl: options.manifestUrl,
					},
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
