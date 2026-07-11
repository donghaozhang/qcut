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
const portraitSource = resolve(
	showcaseRoot,
	"podcast/Quriosity-Dress-Mockup-v2.jpg"
);
const nightSource = resolve(
	showcaseRoot,
	"PandaCoffee2/Panda Coffee Shop Night View.png"
);
const outdoorSource = resolve(
	showcaseRoot,
	"PandaCoffee2/Panda Coffee Shop Exterior with Logo.png"
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
	camera: portraitSource,
	night: nightSource,
	cinematic: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Night View.png"
	),
	outdoor: outdoorSource,
	stylized: portraitSource,
	film: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Interior with Logo.png"
	),
	monochrome: resolve(
		showcaseRoot,
		"PandaCoffee2/Panda Coffee Shop Street Corner View.png"
	),
	portrait: portraitSource,
	hd: outdoorSource,
	indoor: resolve(showcaseRoot, "PandaCoffee2/Panda Coffee Cafe Interior.png"),
};

function buildPreviewFilter({
	preset,
	cubePath,
}: {
	preset: FilterPreset;
	cubePath: string;
}) {
	const crop = ["portrait", "camera", "stylized"].includes(preset.category)
		? "crop=288:180:0:0"
		: "crop=288:180";
	const filters = [
		"scale=288:180:force_original_aspect_ratio=increase",
		crop,
		`lut3d=file='${cubePath}'`,
	];
	const sharpness = preset.extras?.sharpness ?? 0;
	if (sharpness > 0) {
		filters.push(`unsharp=5:5:${Math.min(2, sharpness / 50)}`);
	}
	const vignette = preset.extras?.vignette ?? 0;
	if (vignette > 0) {
		filters.push(`vignette=angle=PI/2-PI/3*${vignette / 100}`);
	}
	const grain = preset.extras?.grain ?? 0;
	if (grain > 0) {
		const amount = grain / 100;
		filters.push(
			`geq=r='clip(r(X,Y)+(random(1)-0.5)*51*${amount},0,255)':` +
				`g='clip(g(X,Y)+(random(2)-0.5)*51*${amount},0,255)':` +
				`b='clip(b(X,Y)+(random(3)-0.5)*51*${amount},0,255)'`
		);
	}
	return filters.join(",");
}

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
		filter: buildPreviewFilter({ preset, cubePath }),
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
