/**
 * Split configuration and recipe merging for long-video replicate analysis.
 *
 * Long local videos are split into payload- and duration-bounded parts (via the
 * shared editorial/video-split utilities), analyzed per part, and merged back
 * into a single VideoRecipe with shot timestamps shifted onto the original
 * timeline.
 *
 * @module electron/native-pipeline/replicate/replicate-split
 */

import type { VideoRecipe, ShotRecipe } from "./replicate-types.js";

/**
 * OpenRouter starts failing (502) well below the review flow's 35M-char limit
 * when a whole video rides in one base64 data URL, so replicate analysis uses
 * a more conservative default (~6MB of source video per request).
 */
const DEFAULT_MAX_REPLICATE_PAYLOAD_CHARS = 8 * 1024 * 1024;
/** Cap part length so each analysis request covers at most ~2 minutes. */
const DEFAULT_MAX_PART_SECONDS = 120;

export interface ReplicateSplitConfig {
	maxPayloadChars: number;
	maxPartSeconds: number;
}

/** Parses a positive integer env override, returning undefined otherwise. */
function positiveIntFromEnv(name: string): number | undefined {
	const raw = process.env[name];
	if (!raw) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Resolves split limits from env overrides
 * (`QCUT_REPLICATE_SPLIT_MAX_PAYLOAD_CHARS`,
 * `QCUT_REPLICATE_SPLIT_MAX_PART_SECONDS`) with built-in defaults.
 */
export function resolveReplicateSplitConfig(): ReplicateSplitConfig {
	return {
		maxPayloadChars:
			positiveIntFromEnv("QCUT_REPLICATE_SPLIT_MAX_PAYLOAD_CHARS") ??
			DEFAULT_MAX_REPLICATE_PAYLOAD_CHARS,
		maxPartSeconds:
			positiveIntFromEnv("QCUT_REPLICATE_SPLIT_MAX_PART_SECONDS") ??
			DEFAULT_MAX_PART_SECONDS,
	};
}

/**
 * Computes the part count for a split analysis, honoring both the payload
 * limit and the maximum per-part duration. Always at least 2 when called
 * (callers only split when the payload limit is exceeded).
 */
export function computeReplicatePartCount({
	estimatedPayloadChars,
	maxPayloadChars,
	durationSeconds,
	maxPartSeconds,
}: {
	estimatedPayloadChars: number;
	maxPayloadChars: number;
	durationSeconds: number;
	maxPartSeconds: number;
}): number {
	const payloadParts = Math.ceil(estimatedPayloadChars / maxPayloadChars);
	const durationParts = Math.ceil(durationSeconds / maxPartSeconds);
	return Math.max(2, payloadParts, durationParts);
}

/** Returns the most frequent value; earlier values win ties. */
function majorityValue<T>(values: T[]): T {
	const counts = new Map<T, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	let best = values[0];
	let bestCount = 0;
	for (const value of values) {
		const count = counts.get(value) ?? 0;
		if (count > bestCount) {
			best = value;
			bestCount = count;
		}
	}
	return best;
}

/** First defined, non-empty string among the given values. */
function firstDefined(values: Array<string | undefined>): string | undefined {
	return values.find((value) => typeof value === "string" && value.length > 0);
}

/**
 * Merges per-part recipes back into one recipe on the original timeline.
 *
 * Shot times are shifted by each part's start offset and re-indexed
 * sequentially; style fields use a majority vote across parts; audio flags are
 * OR-ed and transcripts concatenated in order.
 */
export function mergeVideoRecipes({
	parts,
	filename,
	totalDuration,
}: {
	parts: Array<{ recipe: VideoRecipe; offsetSeconds: number }>;
	filename: string;
	totalDuration: number;
}): VideoRecipe {
	if (parts.length === 0) {
		throw new Error("Cannot merge an empty list of part recipes");
	}

	const recipes = parts.map((part) => part.recipe);
	const first = recipes[0];

	const colorPalette: string[] = [];
	const seenColors = new Set<string>();
	for (const recipe of recipes) {
		for (const color of recipe.style.colorPalette) {
			const key = color.toLowerCase();
			if (seenColors.has(key)) continue;
			seenColors.add(key);
			colorPalette.push(color);
			if (colorPalette.length >= 5) break;
		}
		if (colorPalette.length >= 5) break;
	}

	const transcripts = recipes
		.map((recipe) => recipe.audio.transcript)
		.filter(
			(transcript): transcript is string =>
				typeof transcript === "string" && transcript.length > 0
		);

	const shots: ShotRecipe[] = parts
		.flatMap((part) =>
			part.recipe.shots.map((shot) => {
				const startTime = shot.startTime + part.offsetSeconds;
				const endTime = shot.endTime + part.offsetSeconds;
				return { ...shot, startTime, endTime, duration: endTime - startTime };
			})
		)
		.sort((left, right) => left.startTime - right.startTime)
		.map((shot, index) => ({ ...shot, index }));

	return {
		version: 1,
		source: {
			filename,
			duration: totalDuration,
			resolution: first.source.resolution,
			fps: first.source.fps,
		},
		style: {
			genre: majorityValue(recipes.map((recipe) => recipe.style.genre)),
			mood: majorityValue(recipes.map((recipe) => recipe.style.mood)),
			colorPalette,
			pacing: majorityValue(recipes.map((recipe) => recipe.style.pacing)),
		},
		audio: {
			hasBGM: recipes.some((recipe) => recipe.audio.hasBGM),
			bgmStyle: firstDefined(recipes.map((recipe) => recipe.audio.bgmStyle)),
			hasVoiceover: recipes.some((recipe) => recipe.audio.hasVoiceover),
			voiceoverLanguage: firstDefined(
				recipes.map((recipe) => recipe.audio.voiceoverLanguage)
			),
			transcript: transcripts.length > 0 ? transcripts.join("\n") : undefined,
		},
		shots,
	};
}
