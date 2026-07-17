/**
 * Generate cover artwork for the bundled audio catalog.
 *
 * For every BUILT_IN_AUDIO track this renders one square cover image through
 * the native pipeline (generate-image), then downscales it to a 256px webp at
 * public/audio/builtin/artwork/<slug>.webp — the path the catalog builder
 * derives for `artworkUrl`.
 *
 * Usage:
 *   bun apps/web/scripts/generate-builtin-audio-artwork.ts [--force] [--model <key>] [--only <slug>] [--procedural]
 *
 * Existing covers are kept unless --force is passed, so re-runs only fill
 * gaps. The default mode requires the image-provider API keys used by
 * `bun run pipeline`; --procedural renders deterministic generative covers
 * locally from each track's artworkColors (no API keys needed) and is meant
 * as a stand-in until AI covers are regenerated with --force.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { BUILT_IN_AUDIO } from "../src/lib/audio/audio-library-catalog";

const MAX_CONCURRENT_GENERATIONS = 2;
const ARTWORK_SIZE = 256;
const WEBP_QUALITY = 82;

const repoRoot = path.resolve(import.meta.dir, "../../..");
const outputDirectory = path.resolve(
	import.meta.dir,
	"../public/audio/builtin/artwork"
);

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const procedural = args.has("--procedural");
const modelFlagIndex = process.argv.indexOf("--model");
const model =
	modelFlagIndex >= 0 ? process.argv[modelFlagIndex + 1] : "flux_dev";
const onlyFlagIndex = process.argv.indexOf("--only");
const only = onlyFlagIndex >= 0 ? process.argv[onlyFlagIndex + 1] : undefined;

function trackSlug({ name }: { name: string }): string {
	return name.toLocaleLowerCase().replaceAll(" ", "-");
}

function coverPrompt({
	track,
}: {
	track: (typeof BUILT_IN_AUDIO)[number];
}): string {
	const moods = (track.moods ?? []).join(", ");
	const scenes = (track.scenes ?? []).join(", ");
	const subject =
		track.kind === "music"
			? `Album cover art for an instrumental track titled "${track.name}". ${track.description}`
			: `Icon-style cover illustration for a sound effect called "${track.name}". ${track.description}`;
	return [
		subject,
		moods ? `Mood: ${moods}.` : "",
		scenes ? `Scene: ${scenes}.` : "",
		"Square composition, cinematic lighting, rich color, high detail.",
		"No text, no letters, no words, no logos, no watermarks.",
	]
		.filter(Boolean)
		.join(" ");
}

async function run({
	command,
	cwd,
}: {
	command: string[];
	cwd?: string;
}): Promise<string> {
	const child = Bun.spawn(command, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr}`);
	}
	return stdout;
}

async function findGeneratedImage({
	directory,
}: {
	directory: string;
}): Promise<string> {
	const entries = await readdir(directory, { recursive: true });
	const image = entries.find((entry) => /\.(png|jpg|jpeg|webp)$/i.test(entry));
	if (image) return path.join(directory, image);

	// The pipeline CLI writes a JSON result whose output points at the hosted
	// image; download it into the staging directory.
	const resultFile = entries.find((entry) => entry.endsWith(".json"));
	if (!resultFile) {
		throw new Error(`No image or result JSON produced in ${directory}`);
	}
	const result = JSON.parse(
		await Bun.file(path.join(directory, resultFile)).text()
	) as { output?: Record<string, unknown> };
	const url = [
		result.output?.image_url,
		result.output?.url,
		result.output?.video_url,
	].find((value): value is string => typeof value === "string");
	if (!url) {
		throw new Error(`Result JSON in ${directory} has no output URL`);
	}
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Image download failed: ${response.status}`);
	}
	const extension = path.extname(new URL(url).pathname) || ".jpg";
	const downloadPath = path.join(directory, `generated${extension}`);
	await Bun.write(downloadPath, await response.arrayBuffer());
	return downloadPath;
}

/** Center-crop the generated image into a square 256px webp. */
async function convertToArtworkWebp({
	sourcePath,
	outputPath,
}: {
	sourcePath: string;
	outputPath: string;
}): Promise<void> {
	const image = await loadImage(sourcePath);
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
}

function seededRandom({ seed }: { seed: number }): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hexToRgb({ hex }: { hex: string }): [number, number, number] {
	const value = hex.replace("#", "");
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
}

function mixColors({
	from,
	to,
	amount,
}: {
	from: string;
	to: string;
	amount: number;
}): string {
	const a = hexToRgb({ hex: from });
	const b = hexToRgb({ hex: to });
	const channel = (index: number) =>
		Math.round(a[index] + (b[index] - a[index]) * amount);
	return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

async function renderProceduralCover({
	track,
	outputPath,
}: {
	track: (typeof BUILT_IN_AUDIO)[number];
	outputPath: string;
}): Promise<void> {
	const [base, accent] = track.artworkColors ?? ["#28465c", "#9ed7c7"];
	const random = seededRandom({ seed: Math.abs(track.id) });
	const canvas = createCanvas(ARTWORK_SIZE, ARTWORK_SIZE);
	const context = canvas.getContext("2d");

	// Duotone base gradient, angled per track.
	const angle = random() * Math.PI;
	const gradient = context.createLinearGradient(
		ARTWORK_SIZE / 2 - (Math.cos(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 - (Math.sin(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 + (Math.cos(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 + (Math.sin(angle) * ARTWORK_SIZE) / 2
	);
	gradient.addColorStop(
		0,
		mixColors({ from: base, to: "#000000", amount: 0.35 })
	);
	gradient.addColorStop(0.55, base);
	gradient.addColorStop(1, mixColors({ from: base, to: accent, amount: 0.55 }));
	context.fillStyle = gradient;
	context.fillRect(0, 0, ARTWORK_SIZE, ARTWORK_SIZE);

	// Accent glow.
	const glowX = ARTWORK_SIZE * (0.25 + random() * 0.5);
	const glowY = ARTWORK_SIZE * (0.2 + random() * 0.4);
	const glow = context.createRadialGradient(
		glowX,
		glowY,
		0,
		glowX,
		glowY,
		ARTWORK_SIZE * 0.8
	);
	glow.addColorStop(0, `${accent}66`);
	glow.addColorStop(1, `${accent}00`);
	context.fillStyle = glow;
	context.fillRect(0, 0, ARTWORK_SIZE, ARTWORK_SIZE);

	if (track.kind === "music") {
		// Vinyl-like concentric arcs.
		context.strokeStyle = `${accent}55`;
		const centerX = ARTWORK_SIZE * (0.3 + random() * 0.4);
		const centerY = ARTWORK_SIZE * (0.35 + random() * 0.3);
		for (let ring = 0; ring < 6; ring += 1) {
			context.beginPath();
			context.lineWidth = 1.5 + random() * 2;
			const radius = ARTWORK_SIZE * (0.12 + ring * 0.11 + random() * 0.03);
			const start = random() * Math.PI * 2;
			context.arc(
				centerX,
				centerY,
				radius,
				start,
				start + Math.PI * (0.8 + random())
			);
			context.stroke();
		}
		// Waveform band across the lower third.
		context.strokeStyle = `${accent}cc`;
		context.lineWidth = 3;
		context.beginPath();
		const baseline = ARTWORK_SIZE * 0.78;
		for (let x = 0; x <= ARTWORK_SIZE; x += 4) {
			const wave =
				Math.sin(x * 0.05 + random() * 0.4) * 10 +
				Math.sin(x * 0.017 + angle) * 14;
			if (x === 0) context.moveTo(x, baseline + wave);
			else context.lineTo(x, baseline + wave);
		}
		context.stroke();
	} else {
		// Radiating burst for sound effects.
		const originX = ARTWORK_SIZE * (0.3 + random() * 0.4);
		const originY = ARTWORK_SIZE * (0.3 + random() * 0.4);
		for (let ray = 0; ray < 14; ray += 1) {
			const rayAngle = (ray / 14) * Math.PI * 2 + random() * 0.2;
			const length = ARTWORK_SIZE * (0.2 + random() * 0.45);
			context.strokeStyle = `${accent}${ray % 2 === 0 ? "aa" : "55"}`;
			context.lineWidth = 2 + random() * 2.5;
			context.beginPath();
			context.moveTo(
				originX + Math.cos(rayAngle) * ARTWORK_SIZE * 0.08,
				originY + Math.sin(rayAngle) * ARTWORK_SIZE * 0.08
			);
			context.lineTo(
				originX + Math.cos(rayAngle) * length,
				originY + Math.sin(rayAngle) * length
			);
			context.stroke();
		}
		context.strokeStyle = `${accent}cc`;
		for (let ripple = 0; ripple < 3; ripple += 1) {
			context.lineWidth = 2.5 - ripple * 0.6;
			context.beginPath();
			context.arc(
				originX,
				originY,
				ARTWORK_SIZE * (0.1 + ripple * 0.09),
				0,
				Math.PI * 2
			);
			context.stroke();
		}
	}

	// Soft vignette to ground the composition.
	const vignette = context.createRadialGradient(
		ARTWORK_SIZE / 2,
		ARTWORK_SIZE / 2,
		ARTWORK_SIZE * 0.45,
		ARTWORK_SIZE / 2,
		ARTWORK_SIZE / 2,
		ARTWORK_SIZE * 0.75
	);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
	context.fillStyle = vignette;
	context.fillRect(0, 0, ARTWORK_SIZE, ARTWORK_SIZE);

	await writeFile(outputPath, await canvas.encode("webp", WEBP_QUALITY));
}

async function generateCover({
	track,
}: {
	track: (typeof BUILT_IN_AUDIO)[number];
}): Promise<"generated" | "skipped"> {
	const slug = trackSlug({ name: track.name });
	const outputPath = path.join(outputDirectory, `${slug}.webp`);
	if (!force && existsSync(outputPath)) return "skipped";

	if (procedural) {
		await renderProceduralCover({ track, outputPath });
		return "generated";
	}

	const stagingDir = path.join(
		tmpdir(),
		`qcut-audio-artwork-${slug}-${process.pid}`
	);
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	try {
		await run({
			command: [
				"bun",
				"run",
				"electron/native-pipeline/cli/cli.ts",
				"generate-image",
				"-t",
				coverPrompt({ track }),
				"-m",
				model,
				"--aspect-ratio",
				"1:1",
				"--output-dir",
				stagingDir,
				"--json",
			],
			cwd: repoRoot,
		});
		const generatedImage = await findGeneratedImage({ directory: stagingDir });
		await convertToArtworkWebp({ sourcePath: generatedImage, outputPath });
		return "generated";
	} finally {
		await rm(stagingDir, { recursive: true, force: true });
	}
}

await mkdir(outputDirectory, { recursive: true });
const tracks = BUILT_IN_AUDIO.filter(
	(track) => !only || trackSlug({ name: track.name }) === only
);
if (tracks.length === 0) {
	console.error(`No tracks matched --only ${only}`);
	process.exit(1);
}

let generated = 0;
let skipped = 0;
const failures: string[] = [];
let nextIndex = 0;
const workers = Array.from(
	{ length: Math.min(MAX_CONCURRENT_GENERATIONS, tracks.length) },
	async () => {
		while (nextIndex < tracks.length) {
			const track = tracks[nextIndex];
			nextIndex += 1;
			const slug = trackSlug({ name: track.name });
			try {
				const result = await generateCover({ track });
				if (result === "generated") {
					generated += 1;
					console.log(`✅ ${slug}`);
				} else {
					skipped += 1;
					console.log(`⏭️  ${slug} (exists, use --force to regenerate)`);
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

console.log(
	`Artwork complete: ${generated} generated, ${skipped} skipped, ${failures.length} failed`
);
if (failures.length > 0) {
	console.error(`Failed tracks: ${failures.join(", ")}`);
	process.exit(1);
}
