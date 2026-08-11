/**
 * Builds the photographic colour prior used when fitting filter recipes.
 *
 * A filter recipe is a degree-5 polynomial with 56 coefficients per channel.
 * Fitting it over a uniform RGB cube spends most of that capacity on colours no
 * photograph contains, and fitting it only over real pixels leaves the rest of
 * the cube unconstrained — measured at ~62 levels of error outside the training
 * gamut, which is what a user applying the filter to saturated graphics would
 * see. The fit therefore needs both, and this script produces the "real pixels"
 * half as a compact, committed, reproducible summary.
 *
 * Input frames are QCut's own test media. Output is a colour histogram, not
 * imagery — quantised bins with pixel counts.
 *
 * Usage: bun run scripts/build-filter-colour-prior.ts <image-or-video>...
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath } from "../electron/ffmpeg/paths";

const run = promisify(execFile);

/** Bins per axis. 32 keeps the prior small while resolving skin-tone spacing. */
const BINS = 32;
const OUTPUT = join(
	import.meta.dirname,
	"..",
	"apps",
	"web",
	"src",
	"lib",
	"filters",
	"filter-colour-prior.json"
);

async function samplePixels({ source }: { source: string }): Promise<Buffer> {
	// Select by frame number rather than by time: a still image is 0.04s long,
	// so an fps filter drops it entirely. Scaled down because the colour
	// distribution, not the detail, is what matters.
	const { stdout } = await run(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-i",
			source,
			"-vf",
			"scale=320:-2,select=not(mod(n\\,50))",
			"-fps_mode",
			"passthrough",
			"-frames:v",
			"12",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 1 << 28 }
	);
	return stdout as unknown as Buffer;
}

async function main() {
	const sources = process.argv.slice(2);
	if (sources.length === 0) {
		throw new Error("usage: build-filter-colour-prior.ts <image-or-video>...");
	}

	const counts = new Map<number, number>();
	let totalPixels = 0;
	for (const source of sources) {
		const raw = await samplePixels({ source });
		for (let offset = 0; offset + 2 < raw.length; offset += 3) {
			const red = Math.min(BINS - 1, (raw[offset] * BINS) >> 8);
			const green = Math.min(BINS - 1, (raw[offset + 1] * BINS) >> 8);
			const blue = Math.min(BINS - 1, (raw[offset + 2] * BINS) >> 8);
			const key = (blue * BINS + green) * BINS + red;
			counts.set(key, (counts.get(key) ?? 0) + 1);
			totalPixels += 1;
		}
		console.error(`sampled ${source}`);
	}

	// Drop bins so rare they only add noise to the normal equations.
	const floor = Math.max(1, Math.round(totalPixels * 1e-6));
	const bins: number[][] = [];
	for (const [key, count] of counts) {
		if (count < floor) continue;
		const red = key % BINS;
		const green = Math.floor(key / BINS) % BINS;
		const blue = Math.floor(key / (BINS * BINS));
		bins.push([red, green, blue, count]);
	}
	bins.sort((left, right) => right[3] - left[3]);

	// Tab-indented so a regenerated file matches the repository formatter and
	// does not fail `lint:clean`.
	await writeFile(
		OUTPUT,
		`${JSON.stringify(
			{
				bins: BINS,
				sources: sources.length,
				totalPixels,
				// [redBin, greenBin, blueBin, pixelCount]; colour = (bin + 0.5) / bins
				histogram: bins,
			},
			null,
			"\t"
		)}\n`
	);
	console.error(
		`wrote ${bins.length} bins from ${totalPixels} pixels to ${OUTPUT}`
	);
}

await main();
