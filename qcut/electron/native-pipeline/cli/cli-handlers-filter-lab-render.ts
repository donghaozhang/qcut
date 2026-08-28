import {
	link,
	lstat,
	mkdir,
	mkdtemp,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
	probeFilterLabMedia,
	type FilterLabMediaInfo,
} from "../filters/filter-lab-media.js";
import { resolveFilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
import { renderFilterLabMedia } from "../filters/filter-lab-render.js";
import { exportCatalogDefault } from "./cli-handlers-filter-lab-catalog.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".bmp",
	".tif",
	".tiff",
]);
const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".m4v",
	".mkv",
	".webm",
	".avi",
]);

export interface FilterLabRenderDependencies {
	exportCatalog: typeof exportCatalogDefault;
	resolvePlan: typeof resolveFilterLabRenderPlan;
	probe: typeof probeFilterLabMedia;
	render: typeof renderFilterLabMedia;
}

function validateOptions({ options }: { options: CLIRunOptions }) {
	if (!options.resourceId || !/^\d{1,30}$/.test(options.resourceId))
		throw new Error(
			"--resource-id must be an exact numeric ID from filter-lab catalog."
		);
	if (options.resourceIds && options.resourceIds.length > 1)
		throw new Error("Render one --resource-id at a time.");
	if (!options.input)
		throw new Error("Missing --input/-i image or video path.");
	const intensity = options.filterIntensity ?? 100;
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100)
		throw new Error("--filter-intensity must be between 0 and 100.");
	const duration =
		options.duration === undefined ? undefined : Number(options.duration);
	if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
		throw new Error("--duration must be a positive number of seconds.");
	if (
		options.fps !== undefined &&
		(!Number.isFinite(options.fps) || options.fps <= 0 || options.fps > 120)
	)
		throw new Error("--fps must be greater than 0 and at most 120.");
	const input = resolve(options.input);
	const extension = extname(input).toLowerCase();
	const isImage = IMAGE_EXTENSIONS.has(extension);
	if (!isImage && !VIDEO_EXTENSIONS.has(extension))
		throw new Error("Unsupported image/video extension.");
	if (isImage && (duration !== undefined || options.fps !== undefined))
		throw new Error("--duration and --fps apply only to video inputs.");
	const output = options.output
		? resolve(options.output)
		: join(
				resolve(options.outputDir),
				`${basename(input, extname(input))}_${options.resourceId}${isImage ? ".png" : ".mp4"}`
			);
	if (extname(output).toLowerCase() !== (isImage ? ".png" : ".mp4"))
		throw new Error("Use a .png output for images or .mp4 for videos.");
	if (input === output)
		throw new Error("Filter output cannot overwrite the input.");
	return {
		input,
		output,
		isImage,
		intensity,
		duration,
		resourceId: options.resourceId,
	};
}

async function validateFiles({
	input,
	output,
	force,
}: {
	input: string;
	output: string;
	force: boolean;
}) {
	const source = await stat(input);
	if (!source.isFile()) throw new Error("Input is not a regular file.");
	const destination = await lstat(output).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return undefined;
			throw error;
		}
	);
	if (!destination) return;
	if (destination.dev === source.dev && destination.ino === source.ino)
		throw new Error("Filter output cannot overwrite the input.");
	if (!destination.isFile())
		throw new Error(
			"Output must be a regular file, not a directory or symlink."
		);
	if (!force)
		throw new Error("Output already exists. Use --force to replace it.");
}

function selectRenderMedia({
	media,
	isImage,
	duration,
	fps,
}: {
	media: FilterLabMediaInfo;
	isImage: boolean;
	duration?: number;
	fps?: number;
}): FilterLabMediaInfo {
	if (isImage) return { ...media, duration: 0, frameRate: 1, hasAudio: false };
	const frameRate = fps ?? media.frameRate;
	if (
		media.duration <= 0 ||
		!Number.isFinite(frameRate) ||
		frameRate <= 0 ||
		frameRate > 120
	)
		throw new Error(
			"Video duration or frame rate is invalid; use --fps for sources without a usable rate."
		);
	if (media.width % 2 || media.height % 2)
		throw new Error(
			"MP4 output requires even dimensions; resize the source explicitly before rendering."
		);
	return {
		...media,
		frameRate,
		duration: Math.min(duration ?? media.duration, media.duration),
	};
}

function verifyOutput({
	input,
	output,
	isImage,
}: {
	input: FilterLabMediaInfo;
	output: FilterLabMediaInfo;
	isImage: boolean;
}) {
	if (input.width !== output.width || input.height !== output.height)
		throw new Error("Rendered dimensions differ from the input.");
	if (isImage) return;
	if (
		Math.abs(input.duration - output.duration) >
		Math.max(0.1, 1 / input.frameRate + 0.05)
	)
		throw new Error("Rendered duration differs from the requested duration.");
	if (Math.abs(input.frameRate - output.frameRate) > 0.001)
		throw new Error(
			"Rendered frame rate differs from the requested frame rate."
		);
	if (input.hasAudio && !output.hasAudio)
		throw new Error("Input audio was lost during rendering.");
}

export async function handleFilterLabRender({
	options,
	onProgress,
	signal,
	dependencies = {},
}: {
	options: CLIRunOptions;
	onProgress: ProgressFn;
	signal: AbortSignal;
	dependencies?: Partial<FilterLabRenderDependencies>;
}): Promise<CLIResult> {
	const deps = {
		exportCatalog: exportCatalogDefault,
		resolvePlan: resolveFilterLabRenderPlan,
		probe: probeFilterLabMedia,
		render: renderFilterLabMedia,
		...dependencies,
	};
	let stagingDirectory: string | undefined;
	const started = Date.now();
	try {
		const paths = validateOptions({ options });
		await validateFiles({ ...paths, force: options.force ?? false });
		const renderSignal = AbortSignal.any([
			signal,
			AbortSignal.timeout(15 * 60 * 1000),
		]);
		renderSignal.throwIfAborted();
		onProgress({
			stage: "loading",
			percent: 5,
			message: "Loading local Filter Lab card...",
		});
		const catalog = await deps.exportCatalog();
		const card = catalog.cards.find(
			({ resourceId }) => resourceId === paths.resourceId
		);
		if (!card)
			throw new Error("Filter resource ID is not in the local catalog.");
		if (!card.available || card.cacheStatus !== "cached")
			throw new Error(
				`Filter ${card.title} has cache status "${card.cacheStatus}" but is not supported by the current Filter Lab loader.`
			);
		if (
			options.filterVersion !== undefined &&
			card.version !== options.filterVersion
		)
			throw new Error(
				"--filter-version does not match the catalog's selected version."
			);
		const sourceMedia = await deps.probe({
			filePath: paths.input,
			signal: renderSignal,
		});
		const media = selectRenderMedia({
			media: sourceMedia,
			isImage: paths.isImage,
			duration: paths.duration,
			fps: options.fps,
		});
		const plan = await deps.resolvePlan({ card, intensity: paths.intensity });
		renderSignal.throwIfAborted();
		if (options.dryRun)
			return {
				success: true,
				data: {
					dryRun: true,
					input: paths.input,
					output: paths.output,
					filter: plan.evidence,
					media,
				},
			};
		await mkdir(dirname(paths.output), { recursive: true });
		stagingDirectory = await mkdtemp(
			join(dirname(paths.output), ".qcut-filter-")
		);
		const temporaryOutput = join(
			stagingDirectory,
			`render${extname(paths.output)}`
		);
		onProgress({
			stage: "filtering",
			percent: 15,
			message: `Rendering ${card.title} (${plan.evidence.backend})...`,
		});
		await deps.render({
			input: paths.input,
			output: temporaryOutput,
			isImage: paths.isImage,
			media,
			plan,
			signal: renderSignal,
		});
		const rendered = await deps.probe({
			filePath: temporaryOutput,
			signal: renderSignal,
		});
		verifyOutput({ input: media, output: rendered, isImage: paths.isImage });
		if ((await stat(temporaryOutput)).size === 0)
			throw new Error("Rendered output is empty.");
		renderSignal.throwIfAborted();
		await validateFiles({ ...paths, force: options.force ?? false });
		// A hard link publishes without replacing a file created during rendering.
		if (options.force) await rename(temporaryOutput, paths.output);
		else await link(temporaryOutput, paths.output);
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Filter Lab render complete",
		});
		return {
			success: true,
			outputPath: paths.output,
			duration: (Date.now() - started) / 1000,
			data: {
				input: paths.input,
				output: paths.output,
				filter: plan.evidence,
				media: rendered,
				frameRateMode: paths.isImage ? "still" : "cfr",
				audioPreserved: !media.hasAudio || rendered.hasAudio,
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			duration: (Date.now() - started) / 1000,
		};
	} finally {
		if (stagingDirectory)
			await rm(stagingDirectory, { recursive: true, force: true });
	}
}
