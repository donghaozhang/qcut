import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serializeCubeLut } from "../src/lib/color/color-lut";
import { buildFilterCube } from "../src/lib/filters/filter-lut";
import { FILTER_PRESETS } from "../src/lib/filters/filter-registry";
import type {
	FilterCategory,
	FilterPreset,
} from "../src/lib/filters/filter-types";

const webRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(webRoot, "../..");
const outputDirectory = resolve(webRoot, "public/images/filter-previews");
const showcaseRoot = resolve(
	repositoryRoot,
	"packages/nexusai-website/assets/showcase"
);

const sourceByCategory: Record<FilterCategory, string> = {
	basic: resolve(showcaseRoot, "PandaCoffee2/Panda Coffee Cafe Interior.png"),
	summer: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Street Corner View.png"
	),
	landscape: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Exterior with Logo.png"
	),
	food: resolve(showcaseRoot, "PandaCoffee2/Panda Coffee Cups Mockup.png"),
	cinematic: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Night View.png"
	),
	film: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Interior with Logo.png"
	),
	monochrome: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Street Corner View.png"
	),
	portrait: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Street Corner View.png"
	),
};

async function runCommand({
	command,
	args,
}: {
	command: string;
	args: string[];
}) {
	const child = Bun.spawn([command, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await child.exited;
	if (exitCode === 0) return;
	throw new Error(await new Response(child.stderr).text());
}

async function renderWebp({
	source,
	filter,
	output,
	temporaryPng,
}: {
	source: string;
	filter: string;
	output: string;
	temporaryPng: string;
}) {
	await runCommand({
		command: "ffmpeg",
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			source,
			"-vf",
			filter,
			"-frames:v",
			"1",
			temporaryPng,
		],
	});
	await runCommand({
		command: "cwebp",
		args: ["-quiet", "-q", "78", temporaryPng, "-o", output],
	});
}

async function renderPreview({
	preset,
	temporaryDirectory,
}: {
	preset: FilterPreset;
	temporaryDirectory: string;
}) {
	const cubePath = join(temporaryDirectory, `${preset.id}.cube`);
	await writeFile(
		cubePath,
		serializeCubeLut({ name: preset.name, cube: buildFilterCube({ preset }) })
	);
	await renderWebp({
		source: sourceByCategory[preset.category],
		filter: `scale=288:180:force_original_aspect_ratio=increase,crop=288:180,lut3d=file='${cubePath}'`,
		output: join(outputDirectory, `${preset.id}.webp`),
		temporaryPng: join(temporaryDirectory, `${preset.id}.png`),
	});
}

async function renderNonePreview({
	temporaryDirectory,
}: {
	temporaryDirectory: string;
}) {
	await renderWebp({
		source: sourceByCategory.basic,
		filter: "scale=288:180:force_original_aspect_ratio=increase,crop=288:180",
		output: join(outputDirectory, "none.webp"),
		temporaryPng: join(temporaryDirectory, "none.png"),
	});
}

async function renderWorker({
	workerIndex,
	workerCount,
	temporaryDirectory,
}: {
	workerIndex: number;
	workerCount: number;
	temporaryDirectory: string;
}): Promise<void> {
	const preset = FILTER_PRESETS[workerIndex];
	if (!preset) return;
	await renderPreview({ preset, temporaryDirectory });
	return renderWorker({
		workerIndex: workerIndex + workerCount,
		workerCount,
		temporaryDirectory,
	});
}

async function main() {
	await mkdir(outputDirectory, { recursive: true });
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "qcut-filter-luts-"));
	const workerCount = 4;
	try {
		await Promise.all([
			renderNonePreview({ temporaryDirectory }),
			...Array.from({ length: workerCount }, (_, workerIndex) =>
				renderWorker({ workerIndex, workerCount, temporaryDirectory })
			),
		]);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

await main();
