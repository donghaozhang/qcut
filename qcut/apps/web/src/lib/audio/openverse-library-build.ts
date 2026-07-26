/**
 * Build-time mapping from Openverse audio records to bundled library tracks.
 *
 * Only apps/web/scripts/harvest-openverse-audio.ts imports this at build time;
 * nothing in the runtime bundle references it. It lives under src/ so the
 * classification rules can be unit tested next to the rest of the audio code.
 *
 * Openverse aggregates Jamendo, Freesound and Wikimedia Commons. We keep only
 * tracks whose license permits commercial use AND derivative works without a
 * copyleft obligation — putting a track under a video is a derivative work, so
 * ShareAlike would force the user's own video under a CC licence. That leaves
 * CC0, the Public Domain Mark, and CC BY (attribution only).
 */

import type { AudioCdnManifest, AudioCdnTrack } from "./audio-cdn-catalog";

/**
 * Licenses that are safe to offer as editor background music.
 * `by` still obliges the user to credit the artist, which the card surfaces.
 */
export const ALLOWED_OPENVERSE_LICENSES = ["cc0", "pdm", "by"] as const;

/**
 * Bundled-library IDs occupy their own band below the CDN catalog band
 * (<= -100_000) so bundled, CDN and Freesound tracks can never collide.
 */
export const BUNDLED_LIBRARY_ID_CEILING = -1_000_000;
export const BUNDLED_LIBRARY_ID_FLOOR = -9_999_999;

const MIN_TRACK_SECONDS = 20;
const MAX_TRACK_SECONDS = 10 * 60;

/**
 * Container formats the renderer can actually decode. Wikimedia Commons also
 * hosts `.mid` scores, which are instructions rather than audio — Web Audio
 * cannot decode them, so they would sit in the library as tracks that never
 * play.
 */
const PLAYABLE_EXTENSIONS = new Set([
	"mp3",
	"ogg",
	"oga",
	"opus",
	"wav",
	"flac",
	"m4a",
	"aac",
]);

function isPlayableAudioUrl({ url }: { url: string }): boolean {
	const path = url.split("?")[0] ?? "";
	const match = /\.([a-z0-9]+)$/i.exec(path);
	// Jamendo streams from a query-string endpoint with no extension at all;
	// those are always mp3, so only reject a extension we recognise as unplayable.
	if (!match) return true;
	return PLAYABLE_EXTENSIONS.has(match[1].toLocaleLowerCase());
}

/**
 * Wikimedia Commons indexes speech, wildlife and pronunciation clips beside
 * its public-domain music, and unlike Jamendo it sets no `category`. These
 * title markers keep non-music out of a music library; the words are specific
 * enough that they never appear in a real track title.
 */
const NON_MUSIC_TITLE = new RegExp(
	[
		"pronunciation",
		"pronounced",
		"interview",
		"speech",
		"lecture",
		"podcast",
		"audiobook",
		"audio ?book",
		"spoken",
		"testimony",
		"press conference",
		"weather report",
		"news bulletin",
		"bird ?call",
		"birdsong",
		"animal call",
		"sound ?effect",
		"white noise",
		"morse",
		"radio broadcast",
	].join("|"),
	"i"
);

export interface OpenverseAudioRecord {
	id?: unknown;
	title?: unknown;
	url?: unknown;
	creator?: unknown;
	creator_url?: unknown;
	foreign_landing_url?: unknown;
	license?: unknown;
	license_version?: unknown;
	license_url?: unknown;
	provider?: unknown;
	category?: unknown;
	genres?: unknown;
	tags?: unknown;
	duration?: unknown;
	indexed_on?: unknown;
	audio_set?: unknown;
}

interface ClassifiedTrack {
	tags: string[];
	moods: string[];
	scenes: string[];
}

/**
 * A classification rule fires when any of its `terms` appears in the track's
 * genre/tag vocabulary. `tags` feed the category matcher in
 * getCatalogAudio(); `moods` and `scenes` feed the card metadata chips and
 * must stay inside the vocabulary localized by localizeAudioLibraryTag().
 */
interface ClassificationRule {
	terms: readonly string[];
	tags?: readonly string[];
	moods?: readonly string[];
	scenes?: readonly string[];
}

const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
	// --- Energy / tempo -----------------------------------------------------
	{
		terms: ["speed_veryhigh", "speed_high"],
		tags: ["dynamic", "beat"],
		moods: ["energetic"],
		scenes: ["motion"],
	},
	{
		terms: ["speed_verylow", "speed_low"],
		tags: ["healing"],
		moods: ["calm"],
		scenes: ["focus"],
	},
	// --- Genre families -----------------------------------------------------
	{
		terms: ["ambient", "relaxation", "newage", "soundscape", "meditation"],
		tags: ["healing", "instrumental"],
		moods: ["calm", "peaceful"],
		scenes: ["focus", "sleep", "study"],
	},
	{
		terms: ["chillout", "lounge", "downtempo", "trip-hop", "lofi"],
		tags: ["vlog", "light"],
		moods: ["smooth", "warm"],
		scenes: ["lifestyle", "vlog", "study"],
	},
	{
		terms: [
			"classical",
			"orchestra",
			"orchestral",
			"symphonic",
			"symphony",
			"chamber",
			"sonata",
			"concerto",
			"quartet",
			"quintet",
			"nocturne",
			"prelude",
			"fugue",
			"fuge",
			"baroque",
			"opus",
			// Public-domain scans are titled by musical form, often with no other
			// usable metadata ("IMSLP365277-PMLP02280-Mazurka H-Dur Op 63 Nr 1").
			"mazurka",
			"polonaise",
			"minuet",
			"menuett",
			"etude",
			"impromptu",
			"adagio",
			"andante",
			"allegro",
			"scherzo",
			"rhapsody",
			"serenade",
			"bagatelle",
			"toccata",
			"cantata",
			"oratorio",
			"requiem",
			"overture",
			"variations",
			"harpsichord",
			"clavier",
		],
		tags: ["emotional", "instrumental", "graduation"],
		moods: ["reflective", "dramatic"],
		scenes: ["story", "documentary"],
	},
	// Wikimedia Commons carries public-domain recordings with no genre or tag
	// metadata at all — the composer's name in the title is the only signal.
	{
		terms: [
			"bach",
			"beethoven",
			"brahms",
			"chopin",
			"debussy",
			"dvorak",
			"grieg",
			"handel",
			"haydn",
			"liszt",
			"mahler",
			"mendelssohn",
			"mozart",
			"paganini",
			"rachmaninoff",
			"ravel",
			"satie",
			"schubert",
			"schumann",
			"sibelius",
			"tchaikovsky",
			"vivaldi",
			"wagner",
		],
		tags: ["emotional", "instrumental", "healing"],
		moods: ["reflective", "delicate"],
		scenes: ["story", "documentary"],
	},
	{
		terms: ["soundtrack", "epic", "trailer", "cinematic"],
		tags: ["emotional", "graduation"],
		moods: ["dramatic", "confident"],
		scenes: ["trailer", "story", "recap"],
	},
	{
		terms: ["electronic", "house", "techno", "dance", "edm", "trance"],
		tags: ["dynamic", "social", "beat"],
		moods: ["energetic", "modern"],
		scenes: ["city", "social", "night"],
	},
	{
		terms: ["hiphop", "hip-hop", "rap", "trap"],
		tags: ["beat", "social"],
		moods: ["confident", "modern"],
		scenes: ["city", "social"],
	},
	{
		terms: ["rock", "metal", "punk", "grunge"],
		tags: ["dynamic"],
		moods: ["energetic"],
		scenes: ["motion"],
	},
	{
		terms: ["folk", "songwriter", "acoustic", "acousticguitar", "country"],
		tags: ["light", "travel"],
		moods: ["warm", "fresh"],
		scenes: ["outdoor", "travel", "lifestyle"],
	},
	{
		terms: ["jazz", "blues", "swing", "bossanova"],
		tags: ["light", "vlog"],
		moods: ["smooth", "warm"],
		scenes: ["interior", "lifestyle"],
	},
	{
		terms: ["world", "celtic", "latin", "reggae", "afro", "ethnic"],
		tags: ["travel"],
		moods: ["playful", "bright"],
		scenes: ["travel", "outdoor"],
	},
	{
		terms: ["funk", "disco", "groove", "groovy", "soul", "rnb"],
		tags: ["dynamic", "social"],
		moods: ["playful", "confident"],
		scenes: ["social", "fashion"],
	},
	{
		terms: ["pop"],
		tags: ["social", "light"],
		moods: ["positive"],
		scenes: ["social", "vlog"],
	},
	// --- Mood tags ----------------------------------------------------------
	{
		terms: ["happy", "positive", "optimistic", "fun", "uplifting"],
		tags: ["light"],
		moods: ["positive", "uplifting"],
		scenes: ["vlog", "lifestyle"],
	},
	{
		terms: ["sad", "melancholic", "melancholy", "emotional", "love", "ballad"],
		tags: ["emotional"],
		moods: ["nostalgic", "reflective"],
		scenes: ["story", "memory"],
	},
	{
		terms: ["peaceful", "quiet", "calm", "relaxed", "soft"],
		tags: ["healing"],
		moods: ["peaceful", "subtle"],
		scenes: ["sleep", "focus"],
	},
	{
		terms: ["energetic", "party", "powerful", "dynamic"],
		tags: ["dynamic", "beat"],
		moods: ["energetic"],
		scenes: ["social", "motion"],
	},
	{
		terms: ["dark", "suspense", "tension", "dramatic"],
		tags: ["emotional"],
		moods: ["dramatic"],
		scenes: ["trailer", "story"],
	},
	{
		terms: ["retro", "vintage", "nostalgic", "80s", "70s"],
		tags: ["emotional"],
		moods: ["nostalgic"],
		scenes: ["memory", "recap"],
	},
	// --- Instrumentation ----------------------------------------------------
	{
		terms: ["piano"],
		tags: ["emotional", "healing"],
		moods: ["delicate", "reflective"],
		scenes: ["story", "memory"],
	},
	{
		terms: ["strings", "violin", "cello"],
		tags: ["emotional"],
		moods: ["delicate", "dramatic"],
		scenes: ["story"],
	},
	{
		terms: ["guitar", "electricguitar"],
		tags: ["light"],
		moods: ["warm"],
		scenes: ["lifestyle"],
	},
	// --- Seasonal / occasion ------------------------------------------------
	{
		terms: ["winter", "christmas", "snow", "cold", "xmas"],
		tags: ["winter"],
		moods: ["calm"],
		scenes: ["winter"],
	},
	{
		terms: ["summer", "sunny", "beach", "tropical"],
		tags: ["travel", "light"],
		moods: ["bright", "fresh"],
		scenes: ["outdoor", "travel"],
	},
	{
		terms: ["graduation", "ceremony", "anthem", "triumphant", "inspiring"],
		tags: ["graduation"],
		moods: ["uplifting", "confident"],
		scenes: ["graduation", "recap"],
	},
	{
		terms: ["travel", "adventure", "journey", "road"],
		tags: ["travel"],
		moods: ["bright"],
		scenes: ["travel", "road-trip"],
	},
	// --- Regional (only from explicit signals; never inferred) ---------------
	{
		terms: ["kpop", "k-pop", "korean"],
		tags: ["kpop"],
		moods: ["modern"],
		scenes: ["social"],
	},
	{
		terms: ["mandopop", "chinese", "mandarin", "cantopop", "guzheng", "erhu"],
		tags: ["mandopop", "chinese-pop"],
		moods: ["warm"],
		scenes: ["story"],
	},
];

function toStringArray({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	const result: string[] = [];
	for (const item of value) {
		if (typeof item === "string") {
			result.push(item);
			continue;
		}
		// Openverse tags arrive as { name, accuracy, unstable__provider }.
		if (item && typeof item === "object" && "name" in item) {
			const name = (item as { name?: unknown }).name;
			if (typeof name === "string") result.push(name);
		}
	}
	return result;
}

function normalizeTerm({ term }: { term: string }): string {
	return term.trim().toLocaleLowerCase();
}

/**
 * Build the term vocabulary a track is classified against: genres, provider
 * tags and the words of the title, all lowercased.
 */
export function openverseTrackVocabulary({
	record,
}: {
	record: OpenverseAudioRecord;
}): Set<string> {
	const vocabulary = new Set<string>();
	for (const genre of toStringArray({ value: record.genres })) {
		vocabulary.add(normalizeTerm({ term: genre }));
	}
	for (const tag of toStringArray({ value: record.tags })) {
		vocabulary.add(normalizeTerm({ term: tag }));
	}
	if (typeof record.title === "string") {
		for (const word of record.title.toLocaleLowerCase().split(/[^a-z0-9]+/)) {
			if (word) vocabulary.add(word);
		}
	}
	return vocabulary;
}

export function classifyOpenverseTrack({
	record,
}: {
	record: OpenverseAudioRecord;
}): ClassifiedTrack {
	const vocabulary = openverseTrackVocabulary({ record });
	const tags = new Set<string>();
	const moods = new Set<string>();
	const scenes = new Set<string>();

	for (const rule of CLASSIFICATION_RULES) {
		if (!rule.terms.some((term) => vocabulary.has(term))) continue;
		for (const tag of rule.tags ?? []) tags.add(tag);
		for (const mood of rule.moods ?? []) moods.add(mood);
		for (const scene of rule.scenes ?? []) scenes.add(scene);
	}

	// Jamendo marks vocals explicitly; treat everything else as instrumental
	// only when it says so, never by assumption.
	if (vocabulary.has("instrumental") && !vocabulary.has("vocal")) {
		tags.add("instrumental");
	}
	if (vocabulary.has("vocal")) tags.delete("instrumental");

	// Every music track should appear under the three generic feeds
	// (recommended / popular / latest), whose matchTags are ["music"].
	tags.add("music");
	// A track that matched nothing specific is still usable as neutral
	// background scoring; give it the everyday bucket rather than orphaning it.
	if (tags.size === 1) {
		tags.add("vlog");
		moods.add("neutral");
		scenes.add("vlog");
	}

	return {
		tags: [...tags].sort(),
		moods: [...moods].sort(),
		scenes: [...scenes].sort(),
	};
}

/**
 * Deterministic 32-bit FNV-1a so re-harvesting keeps IDs stable — favorites
 * and saved sounds reference tracks by ID.
 */
function hashString({ value }: { value: string }): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

export function bundledTrackId({
	openverseId,
}: {
	openverseId: string;
}): number {
	const span = BUNDLED_LIBRARY_ID_CEILING - BUNDLED_LIBRARY_ID_FLOOR;
	return (
		BUNDLED_LIBRARY_ID_CEILING - (hashString({ value: openverseId }) % span)
	);
}

function albumIdFromLandingUrl({ url }: { url: unknown }): string | undefined {
	if (typeof url !== "string") return undefined;
	const match = /jamendo\.com\/album\/(\d+)/.exec(url);
	return match?.[1];
}

/**
 * Album art straight from Jamendo's own CDN. Routing artwork through the
 * Openverse thumbnail proxy would burn the shared API rate limit on every
 * grid render.
 */
function artworkUrlForRecord({
	record,
}: {
	record: OpenverseAudioRecord;
}): string | undefined {
	const audioSet =
		record.audio_set && typeof record.audio_set === "object"
			? (record.audio_set as { foreign_landing_url?: unknown })
			: undefined;
	const albumId = albumIdFromLandingUrl({ url: audioSet?.foreign_landing_url });
	if (!albumId) return undefined;
	return `https://usercontent.jamendo.com/?type=album&id=${albumId}&width=300`;
}

const GRADIENTS: readonly (readonly [string, string])[] = [
	["#23616f", "#c8e6dc"],
	["#43236f", "#ff5d8f"],
	["#1f3a5f", "#7fb2e5"],
	["#6f3b23", "#f2c078"],
	["#2f6f3b", "#bfe6a0"],
	["#5c2350", "#e8a0d8"],
	["#243b55", "#8fd3c7"],
	["#6f5a23", "#f0e3a0"],
];

function artworkColorsFor({ id }: { id: number }): readonly [string, string] {
	return GRADIENTS[Math.abs(id) % GRADIENTS.length];
}

function licenseUrlFor({
	record,
}: {
	record: OpenverseAudioRecord;
}): string | undefined {
	if (typeof record.license_url === "string" && record.license_url) {
		return record.license_url;
	}
	const license =
		typeof record.license === "string" ? record.license : undefined;
	const version =
		typeof record.license_version === "string" ? record.license_version : "4.0";
	if (!license) return undefined;
	if (license === "cc0") {
		return "https://creativecommons.org/publicdomain/zero/1.0/";
	}
	if (license === "pdm")
		return "https://creativecommons.org/publicdomain/mark/1.0/";
	return `https://creativecommons.org/licenses/${license}/${version}/`;
}

/**
 * Convert one Openverse record into a catalog track, or null when the record
 * is unusable (wrong licence, missing audio, implausible duration).
 */
export function openverseRecordToTrack({
	record,
}: {
	record: OpenverseAudioRecord;
}): AudioCdnTrack | null {
	const openverseId = typeof record.id === "string" ? record.id : undefined;
	const title = typeof record.title === "string" ? record.title.trim() : "";
	const url = typeof record.url === "string" ? record.url : "";
	const creator =
		typeof record.creator === "string" && record.creator.trim()
			? record.creator.trim()
			: "";
	const license = typeof record.license === "string" ? record.license : "";
	const durationMs =
		typeof record.duration === "number" && Number.isFinite(record.duration)
			? record.duration
			: 0;
	const durationSeconds = Math.round(durationMs / 1000);

	if (!openverseId || !title || !creator) return null;
	if (NON_MUSIC_TITLE.test(title)) return null;
	if (!/^https?:\/\//i.test(url)) return null;
	if (!isPlayableAudioUrl({ url })) return null;
	if (
		!(ALLOWED_OPENVERSE_LICENSES as readonly string[]).includes(
			license.toLocaleLowerCase()
		)
	) {
		return null;
	}
	if (
		durationSeconds < MIN_TRACK_SECONDS ||
		durationSeconds > MAX_TRACK_SECONDS
	) {
		return null;
	}

	const id = bundledTrackId({ openverseId });
	const { tags, moods, scenes } = classifyOpenverseTrack({ record });
	const licenseUrl = licenseUrlFor({ record });

	return {
		id,
		kind: "music",
		name: title,
		description: "",
		tags,
		duration: durationSeconds,
		previewUrl: url,
		downloadUrl: url,
		artworkUrl: artworkUrlForRecord({ record }),
		artworkColors: artworkColorsFor({ id }),
		moods,
		scenes,
		loopable: false,
		downloads: 0,
		// Consumed by resolveFreesoundLicense(), which keys off the licence URL.
		license: licenseUrl,
		username: creator,
		created:
			typeof record.indexed_on === "string"
				? record.indexed_on
				: new Date(0).toISOString(),
	};
}

function dedupeKey({ track }: { track: AudioCdnTrack }): string {
	return `${track.name.toLocaleLowerCase()}|${(track.username ?? "").toLocaleLowerCase()}`;
}

/**
 * Build the bundled manifest: map, drop unusable records, dedupe by identity
 * and by (title, artist), and resolve the rare hash collision by walking the
 * ID down until it is free.
 */
export function buildBundledAudioManifest({
	records,
	generatedAt,
}: {
	records: readonly OpenverseAudioRecord[];
	generatedAt: string;
}): AudioCdnManifest {
	const byKey = new Map<string, AudioCdnTrack>();
	const usedIds = new Set<number>();

	for (const record of records) {
		const track = openverseRecordToTrack({ record });
		if (!track) continue;
		const key = dedupeKey({ track });
		if (byKey.has(key)) continue;

		let id = track.id;
		while (usedIds.has(id)) {
			id =
				id - 1 < BUNDLED_LIBRARY_ID_FLOOR ? BUNDLED_LIBRARY_ID_CEILING : id - 1;
		}
		usedIds.add(id);
		byKey.set(key, { ...track, id });
	}

	const tracks = [...byKey.values()].sort((left, right) =>
		left.name.localeCompare(right.name)
	);
	return { version: 1, generatedAt, tracks };
}
