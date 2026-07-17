/**
 * Produce CDN catalog content from track specs.
 *
 * Reads <source-dir>/track-specs.json (see the SourceSpec type), then for
 * each spec:
 *   1. generates the music via the native pipeline (generate-music),
 *   2. converts it to ogg/opus under <source-dir>/tracks/<slug>.ogg,
 *   3. generates square cover art and writes <source-dir>/artwork/<slug>.webp,
 *   4. assembles <source-dir>/tracks.json for release-audio-cdn.ts.
 *
 * Usage:
 *   bun apps/web/scripts/generate-audio-cdn-tracks.ts [--source-dir <dir>] [--force] [--only <slug>]
 *
 * Existing payloads are kept unless --force is passed, so interrupted runs
 * resume where they stopped. Requires FAL credentials (music + covers).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { AUDIO_CDN_TRACK_ID_MAX } from "../src/lib/audio/audio-cdn-catalog";

const MAX_CONCURRENT_TRACKS = 2;
const ARTWORK_SIZE = 256;
const WEBP_QUALITY = 82;

interface SourceSpec {
	id: number;
	kind: "music" | "sound-effect";
	name: string;
	localizedName: string;
	description: string;
	localizedDescription: string;
	prompt: string;
	tags: string[];
	bpm?: number;
	musicalKey?: string;
	moods: string[];
	scenes: string[];
	loopable?: boolean;
}

function flagValue({ flag }: { flag: string }): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
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

async function run({ command }: { command: string[] }): Promise<string> {
	const child = Bun.spawn(command, {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`${command.slice(0, 5).join(" ")} failed: ${stderr}`);
	}
	return stdout;
}

async function probeDuration({ file }: { file: string }): Promise<number> {
	const output = await run({
		command: [
			"ffprobe",
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			file,
		],
	});
	const duration = Number.parseFloat(output.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not probe duration of ${file}`);
	}
	return Math.round(duration * 100) / 100;
}

async function generateMusicPayload({
	spec,
	outputPath,
}: {
	spec: SourceSpec;
	outputPath: string;
}): Promise<void> {
	const stagingDir = path.join(
		tmpdir(),
		`qcut-cdn-music-${trackSlug({ name: spec.name })}-${process.pid}`
	);
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	try {
		await run({
			command: [
				"bun",
				"run",
				"electron/native-pipeline/cli/cli.ts",
				"generate-music",
				"-t",
				spec.prompt,
				"--instrumental",
				"--audio-format",
				"mp3",
				"--output-dir",
				stagingDir,
				"--json",
			],
		});
		const entries = await readdir(stagingDir, { recursive: true });
		const audioFile = entries.find((entry) => /\.(mp3|wav|ogg)$/i.test(entry));
		if (!audioFile) throw new Error("generate-music produced no audio file");
		await run({
			command: [
				"ffmpeg",
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				path.join(stagingDir, audioFile),
				"-c:a",
				"libopus",
				"-b:a",
				"96k",
				outputPath,
			],
		});
	} finally {
		await rm(stagingDir, { recursive: true, force: true });
	}
}

async function generateArtworkPayload({
	spec,
	outputPath,
}: {
	spec: SourceSpec;
	outputPath: string;
}): Promise<void> {
	const stagingDir = path.join(
		tmpdir(),
		`qcut-cdn-art-${trackSlug({ name: spec.name })}-${process.pid}`
	);
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	try {
		const prompt = [
			`Album cover art for an instrumental track titled "${spec.name}". ${spec.description}`,
			spec.moods.length > 0 ? `Mood: ${spec.moods.join(", ")}.` : "",
			spec.scenes.length > 0 ? `Scene: ${spec.scenes.join(", ")}.` : "",
			"Square composition, cinematic lighting, rich color, high detail.",
			"No text, no letters, no words, no logos, no watermarks.",
		]
			.filter(Boolean)
			.join(" ");
		await run({
			command: [
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
		});
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
		await writeFile(outputPath, await canvas.encode("webp", WEBP_QUALITY));
	} finally {
		await rm(stagingDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const specs = JSON.parse(
		await readFile(path.join(sourceDir, "track-specs.json"), "utf8")
	) as SourceSpec[];
	const selected = specs.filter(
		(spec) => !only || trackSlug({ name: spec.name }) === only
	);
	if (selected.length === 0) {
		console.error("No specs selected");
		process.exit(1);
	}
	for (const spec of selected) {
		if (!Number.isInteger(spec.id) || spec.id > AUDIO_CDN_TRACK_ID_MAX) {
			console.error(
				`Spec "${spec.name}" id ${spec.id} must be <= ${AUDIO_CDN_TRACK_ID_MAX}`
			);
			process.exit(1);
		}
	}

	await mkdir(path.join(sourceDir, "tracks"), { recursive: true });
	await mkdir(path.join(sourceDir, "artwork"), { recursive: true });

	const failures: string[] = [];
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(MAX_CONCURRENT_TRACKS, selected.length) },
		async () => {
			while (nextIndex < selected.length) {
				const spec = selected[nextIndex];
				nextIndex += 1;
				const slug = trackSlug({ name: spec.name });
				const audioPath = path.join(sourceDir, "tracks", `${slug}.ogg`);
				const artworkPath = path.join(sourceDir, "artwork", `${slug}.webp`);
				try {
					if (force || !existsSync(audioPath)) {
						await generateMusicPayload({ spec, outputPath: audioPath });
						console.log(`🎵 ${slug}.ogg`);
					}
					if (force || !existsSync(artworkPath)) {
						await generateArtworkPayload({ spec, outputPath: artworkPath });
						console.log(`🖼️  ${slug}.webp`);
					}
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

	// Assemble tracks.json from every spec whose payloads exist.
	const generatedAt = new Date().toISOString();
	const entries = [];
	for (const spec of specs) {
		const slug = trackSlug({ name: spec.name });
		const audioPath = path.join(sourceDir, "tracks", `${slug}.ogg`);
		const artworkPath = path.join(sourceDir, "artwork", `${slug}.webp`);
		if (!existsSync(audioPath)) continue;
		const { prompt: _prompt, ...manifestSpec } = spec;
		entries.push({
			...manifestSpec,
			loopable: spec.loopable ?? false,
			duration: await probeDuration({ file: audioPath }),
			file: `tracks/${slug}.ogg`,
			...(existsSync(artworkPath)
				? { artworkFile: `artwork/${slug}.webp` }
				: {}),
			downloads: 0,
			license: "qcut://license/built-in",
			username: "QCut Studio",
			created: generatedAt,
		});
	}
	await writeFile(
		path.join(sourceDir, "tracks.json"),
		`${JSON.stringify(entries, null, "\t")}\n`
	);
	console.log(
		`📄 tracks.json: ${entries.length} entries; failures: ${failures.length}`
	);
	if (failures.length > 0) {
		console.error(`Failed: ${failures.join(", ")}`);
		process.exit(1);
	}
}
