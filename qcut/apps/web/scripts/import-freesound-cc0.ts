/**
 * Import CC0 sound effects from Freesound into the audio CDN catalog.
 *
 * Reads <source-dir>/sfx-sources.json (curated entries with a Freesound
 * search query each), finds the most-downloaded CC0 match, downloads its
 * HQ ogg preview, re-encodes to opus under <source-dir>/tracks/<slug>.ogg,
 * renders icon-style cover art, and upserts the entries into
 * <source-dir>/tracks.json.
 *
 * CC0 (Creative Commons 0) dedicates the sounds to the public domain, so
 * bundling and redistribution require no attribution — the original
 * Freesound creator is still credited via the track's `username`.
 *
 * Usage:
 *   bun apps/web/scripts/import-freesound-cc0.ts [--source-dir <dir>] [--force] [--only <slug>]
 *
 * Requires a Freesound API key: FREESOUND_API_KEY env or the embedded
 * default key in dist/electron/config/default-keys.js.
 */
import { existsSync } from "node:fs";
import {
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { AUDIO_CDN_TRACK_ID_MAX } from "../src/lib/audio/audio-cdn-catalog";

const MAX_CONCURRENT_IMPORTS = 3;
const ARTWORK_SIZE = 256;
const WEBP_QUALITY = 82;
const CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const DEFAULT_DURATION_FILTER = "[0.2 TO 8]";

interface SfxSource {
	id: number;
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	query: string;
	durationFilter?: string;
	tags: string[];
	moods: string[];
	scenes: string[];
	freesoundId?: number;
}

interface FreesoundResult {
	id: number;
	name: string;
	username: string;
	duration: number;
	previews: Record<string, string>;
	num_downloads: number;
	avg_rating: number;
}

function flagValue({ flag }: { flag: string }): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index < 0) return undefined;
	const value = process.argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const sourceDir = path.resolve(
	flagValue({ flag: "--source-dir" }) ??
		path.join(import.meta.dir, "../audio-cdn")
);
const force = process.argv.includes("--force");
const only = flagValue({ flag: "--only" });

function trackSlug({ name }: { name: string }): string {
	return name.toLocaleLowerCase().replaceAll(" ", "-");
}

async function resolveApiKey(): Promise<string> {
	if (process.env.FREESOUND_API_KEY) return process.env.FREESOUND_API_KEY;
	const defaultKeysPath = path.join(
		repoRoot,
		"dist/electron/config/default-keys.js"
	);
	const module = (await import(defaultKeysPath)) as {
		FREESOUND_API_KEY?: string;
		default?: { FREESOUND_API_KEY?: string };
	};
	const key = module.FREESOUND_API_KEY ?? module.default?.FREESOUND_API_KEY;
	if (!key) throw new Error("No Freesound API key available");
	return key;
}

async function searchBestCc0Match({
	source,
	apiKey,
}: {
	source: SfxSource;
	apiKey: string;
}): Promise<FreesoundResult> {
	if (source.freesoundId) {
		const response = await fetch(
			`https://freesound.org/apiv2/sounds/${source.freesoundId}/?fields=id,name,username,duration,previews,num_downloads,avg_rating,license&token=${apiKey}`
		);
		if (!response.ok) {
			throw new Error(`Freesound lookup failed: ${response.status}`);
		}
		const pinned = (await response.json()) as FreesoundResult & {
			license?: string;
		};
		// Pinned IDs are published under the CC0 label, so anything else must
		// be rejected here rather than silently relicensed.
		if (!pinned.license?.includes("publicdomain/zero")) {
			throw new Error(
				`Freesound #${source.freesoundId} is not CC0 (${pinned.license ?? "unknown"})`
			);
		}
		if (!pinned.previews?.["preview-hq-ogg"]) {
			throw new Error(`Freesound #${source.freesoundId} has no HQ OGG preview`);
		}
		return pinned;
	}
	const filter = `license:"Creative Commons 0" duration:${
		source.durationFilter ?? DEFAULT_DURATION_FILTER
	}`;
	const url = new URL("https://freesound.org/apiv2/search/text/");
	url.searchParams.set("query", source.query);
	url.searchParams.set("filter", filter);
	url.searchParams.set("sort", "downloads_desc");
	url.searchParams.set(
		"fields",
		"id,name,username,duration,previews,num_downloads,avg_rating"
	);
	url.searchParams.set("page_size", "5");
	url.searchParams.set("token", apiKey);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Freesound search failed: ${response.status}`);
	}
	const body = (await response.json()) as { results?: FreesoundResult[] };
	const match = body.results?.find(
		(result) => result.previews?.["preview-hq-ogg"]
	);
	if (!match) {
		throw new Error(`No CC0 match for query "${source.query}"`);
	}
	return match;
}

async function downloadAndEncode({
	previewUrl,
	outputPath,
}: {
	previewUrl: string;
	outputPath: string;
}): Promise<void> {
	const response = await fetch(previewUrl);
	if (!response.ok) {
		throw new Error(`Preview download failed: ${response.status}`);
	}
	const stagingFile = path.join(
		tmpdir(),
		`qcut-freesound-${path.basename(outputPath)}-${process.pid}.src.ogg`
	);
	await writeFile(stagingFile, new Uint8Array(await response.arrayBuffer()));
	try {
		// Encode to a temporary sibling and rename so interrupted runs never
		// leave a partial file that resume logic would treat as complete.
		const temporaryPath = `${outputPath}.tmp.ogg`;
		const child = Bun.spawn(
			[
				"ffmpeg",
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				stagingFile,
				"-c:a",
				"libopus",
				"-b:a",
				"72k",
				temporaryPath,
			],
			{ stderr: "pipe", stdout: "ignore" }
		);
		const [stderrText, exitCode] = await Promise.all([
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (exitCode !== 0) {
			throw new Error(`ffmpeg failed: ${stderrText}`);
		}
		await rename(temporaryPath, outputPath);
	} finally {
		await rm(stagingFile, { force: true });
	}
}

async function probeDuration({ file }: { file: string }): Promise<number> {
	const child = Bun.spawn(
		[
			"ffprobe",
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			file,
		],
		{ stdout: "pipe", stderr: "pipe" }
	);
	const output = await new Response(child.stdout).text();
	await child.exited;
	const duration = Number.parseFloat(output.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not probe duration of ${file}`);
	}
	return Math.round(duration * 100) / 100;
}

async function generateArtwork({
	source,
	outputPath,
}: {
	source: SfxSource;
	outputPath: string;
}): Promise<void> {
	const stagingDir = path.join(
		tmpdir(),
		`qcut-sfx-art-${trackSlug({ name: source.name })}-${process.pid}`
	);
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	try {
		const prompt = [
			`Icon-style cover illustration for a sound effect called "${source.name}". ${source.description}`,
			source.moods.length > 0 ? `Mood: ${source.moods.join(", ")}.` : "",
			source.scenes.length > 0 ? `Scene: ${source.scenes.join(", ")}.` : "",
			"Square composition, cinematic lighting, rich color, high detail.",
			"No text, no letters, no words, no logos, no watermarks.",
		]
			.filter(Boolean)
			.join(" ");
		const child = Bun.spawn(
			[
				"bun",
				"run",
				"electron/native-pipeline/cli/cli.ts",
				"generate-image",
				"-t",
				prompt,
				"-m",
				"flux_dev",
				"--aspect-ratio",
				"1:1",
				"--output-dir",
				stagingDir,
				"--json",
			],
			{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
		);
		const [stderrText, exitCode] = await Promise.all([
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (exitCode !== 0) {
			throw new Error(`generate-image failed: ${stderrText}`);
		}
		const entries = await readdir(stagingDir, { recursive: true });
		let imagePath = entries.find((entry) =>
			/\.(png|jpg|jpeg|webp)$/i.test(entry)
		);
		if (!imagePath) {
			const resultFile = entries.find((entry) => entry.endsWith(".json"));
			if (!resultFile) throw new Error("generate-image produced no output");
			const result = JSON.parse(
				await readFile(path.join(stagingDir, resultFile), "utf8")
			) as { output?: Record<string, unknown> };
			const url = [
				result.output?.image_url,
				result.output?.url,
				result.output?.video_url,
			].find((value): value is string => typeof value === "string");
			if (!url) throw new Error("generate-image result has no output URL");
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Cover download failed: ${response.status}`);
			}
			imagePath = `generated${path.extname(new URL(url).pathname) || ".jpg"}`;
			await writeFile(
				path.join(stagingDir, imagePath),
				new Uint8Array(await response.arrayBuffer())
			);
		}
		const image = await loadImage(path.join(stagingDir, imagePath));
		const cropSize = Math.min(image.width, image.height);
		const canvas = createCanvas(ARTWORK_SIZE, ARTWORK_SIZE);
		const context = canvas.getContext("2d");
		context.drawImage(
			image,
			(image.width - cropSize) / 2,
			(image.height - cropSize) / 2,
			cropSize,
			cropSize,
			0,
			0,
			ARTWORK_SIZE,
			ARTWORK_SIZE
		);
		const temporaryPath = `${outputPath}.tmp.webp`;
		await writeFile(temporaryPath, await canvas.encode("webp", WEBP_QUALITY));
		await rename(temporaryPath, outputPath);
	} finally {
		await rm(stagingDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const sources = JSON.parse(
		await readFile(path.join(sourceDir, "sfx-sources.json"), "utf8")
	) as SfxSource[];
	const selected = sources.filter(
		(source) => !only || trackSlug({ name: source.name }) === only
	);
	if (selected.length === 0) {
		console.error("No sources selected");
		process.exit(1);
	}
	for (const source of selected) {
		if (!Number.isInteger(source.id) || source.id > AUDIO_CDN_TRACK_ID_MAX) {
			console.error(
				`Source "${source.name}" id ${source.id} must be <= ${AUDIO_CDN_TRACK_ID_MAX}`
			);
			process.exit(1);
		}
	}
	const apiKey = await resolveApiKey();
	await mkdir(path.join(sourceDir, "tracks"), { recursive: true });
	await mkdir(path.join(sourceDir, "artwork"), { recursive: true });

	const produced = new Map<
		number,
		{ creator?: string; duration: number; hasArtwork: boolean }
	>();
	const failures: string[] = [];
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(MAX_CONCURRENT_IMPORTS, selected.length) },
		async () => {
			while (nextIndex < selected.length) {
				const source = selected[nextIndex];
				nextIndex += 1;
				const slug = trackSlug({ name: source.name });
				const audioPath = path.join(sourceDir, "tracks", `${slug}.ogg`);
				const artworkPath = path.join(sourceDir, "artwork", `${slug}.webp`);
				try {
					let creator: string | undefined;
					if (force || !existsSync(audioPath)) {
						const match = await searchBestCc0Match({ source, apiKey });
						creator = match.username;
						await downloadAndEncode({
							previewUrl: match.previews["preview-hq-ogg"],
							outputPath: audioPath,
						});
						console.log(
							`🔊 ${slug}.ogg  (freesound #${match.id} by ${match.username})`
						);
					}
					if (force || !existsSync(artworkPath)) {
						await generateArtwork({ source, outputPath: artworkPath });
						console.log(`🖼️  ${slug}.webp`);
					}
					produced.set(source.id, {
						creator,
						duration: await probeDuration({ file: audioPath }),
						hasArtwork: existsSync(artworkPath),
					});
				} catch (error) {
					failures.push(slug);
					console.error(
						`❌ ${slug}: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			}
		}
	);
	await Promise.all(workers);

	// Upsert produced entries into tracks.json, preserving existing entries.
	// Resumed entries (audio already on disk) keep their previous creator,
	// download counters, and creation time instead of being reset.
	const tracksPath = path.join(sourceDir, "tracks.json");
	const existing = existsSync(tracksPath)
		? (JSON.parse(await readFile(tracksPath, "utf8")) as {
				id: number;
				username?: string;
				downloads?: number;
				created?: string;
			}[])
		: [];
	const existingById = new Map(existing.map((entry) => [entry.id, entry]));
	const producedIds = new Set(produced.keys());
	const generatedAt = new Date().toISOString();
	const newEntries = selected
		.filter((source) => produced.has(source.id))
		.map((source) => {
			const slug = trackSlug({ name: source.name });
			const result = produced.get(source.id);
			const previous = existingById.get(source.id);
			return {
				id: source.id,
				kind: "sound-effect" as const,
				name: source.name,
				localizedName: source.localizedName,
				description: source.description,
				localizedDescription: source.localizedDescription,
				tags: source.tags,
				moods: source.moods,
				scenes: source.scenes,
				loopable: false,
				duration: result?.duration ?? 0,
				file: `tracks/${slug}.ogg`,
				...(result?.hasArtwork ? { artworkFile: `artwork/${slug}.webp` } : {}),
				downloads: previous?.downloads ?? 0,
				license: CC0_LICENSE_URL,
				username: result?.creator ?? previous?.username ?? "Freesound (CC0)",
				created: previous?.created ?? generatedAt,
			};
		});
	const merged = [
		...existing.filter((entry) => !producedIds.has(entry.id)),
		...newEntries,
	];
	await writeFile(tracksPath, `${JSON.stringify(merged, null, "\t")}\n`);
	console.log(
		`📄 tracks.json: ${merged.length} entries (${newEntries.length} sfx upserted); failures: ${failures.length}`
	);
	if (failures.length > 0) {
		console.error(`Failed: ${failures.join(", ")}`);
		process.exit(1);
	}
}
