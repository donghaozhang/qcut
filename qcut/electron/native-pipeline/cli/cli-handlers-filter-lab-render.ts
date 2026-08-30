import { link, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { probeFilterLabMedia } from "../filters/filter-lab-media.js";
import { resolveFilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
import { renderFilterLabMedia } from "../filters/filter-lab-render.js";
import { exportCatalogDefault } from "./cli-handlers-filter-lab-catalog.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";
import {
	resolveFilterLabMediaCommandPaths,
	selectFilterLabRenderMedia,
	validateFilterLabMediaFiles,
	verifyFilterLabOutput,
} from "./filter-lab-media-command.js";

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
	const paths = resolveFilterLabMediaCommandPaths({
		options,
		outputSuffix: options.resourceId,
	});
	return {
		...paths,
		intensity,
		resourceId: options.resourceId,
	};
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
		await validateFilterLabMediaFiles({
			...paths,
			force: options.force ?? false,
		});
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
		const media = selectFilterLabRenderMedia({
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
		verifyFilterLabOutput({
			input: media,
			output: rendered,
			isImage: paths.isImage,
		});
		if ((await stat(temporaryOutput)).size === 0)
			throw new Error("Rendered output is empty.");
		renderSignal.throwIfAborted();
		await validateFilterLabMediaFiles({
			...paths,
			force: options.force ?? false,
		});
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
