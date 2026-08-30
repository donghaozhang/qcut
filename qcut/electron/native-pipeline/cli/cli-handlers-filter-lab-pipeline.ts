import { link, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { probeFilterLabMedia } from "../filters/filter-lab-media.js";
import { renderFilterLabPipelineMedia } from "../filters/filter-lab-pipeline-render.js";
import { resolveFilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
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

export interface FilterLabPipelineStep {
	resourceId: string;
	intensity: number;
}

export interface FilterLabPipelineDependencies {
	exportCatalog: typeof exportCatalogDefault;
	resolvePlan: typeof resolveFilterLabRenderPlan;
	probe: typeof probeFilterLabMedia;
	render: typeof renderFilterLabPipelineMedia;
}

function parseStep({ value }: { value: string }): FilterLabPipelineStep {
	const match = /^(\d{1,30})(?::(\d{1,3}))?$/.exec(value.trim());
	if (!match)
		throw new Error(
			'--filter-step must use "<resource-id>[:<intensity>]", for example 123:80.'
		);
	const intensity = match[2] === undefined ? 100 : Number(match[2]);
	if (intensity < 0 || intensity > 100)
		throw new Error("Filter step intensity must be between 0 and 100.");
	return { resourceId: match[1], intensity };
}

export function parseFilterLabPipelineSteps({
	options,
}: {
	options: CLIRunOptions;
}): FilterLabPipelineStep[] {
	const filterSteps = options.filterSteps ?? [];
	const resourceIds = options.resourceIds ?? [];
	if (filterSteps.length && resourceIds.length)
		throw new Error("Use --filter-step or --resource-id, not both.");
	if (filterSteps.length && options.filterIntensity !== undefined)
		throw new Error(
			"Put per-step intensity in --filter-step instead of --filter-intensity."
		);
	const defaultIntensity = options.filterIntensity ?? 100;
	if (
		!Number.isFinite(defaultIntensity) ||
		defaultIntensity < 0 ||
		defaultIntensity > 100
	)
		throw new Error("--filter-intensity must be between 0 and 100.");
	const steps = filterSteps.length
		? filterSteps.map((value) => parseStep({ value }))
		: resourceIds.map((resourceId) => ({
				resourceId,
				intensity: defaultIntensity,
			}));
	if (steps.length < 2)
		throw new Error("Filter pipeline requires at least two ordered steps.");
	if (steps.length > 16)
		throw new Error("Filter pipeline supports at most 16 steps.");
	return steps;
}

export async function handleFilterLabPipeline({
	options,
	onProgress,
	signal,
	dependencies = {},
}: {
	options: CLIRunOptions;
	onProgress: ProgressFn;
	signal: AbortSignal;
	dependencies?: Partial<FilterLabPipelineDependencies>;
}): Promise<CLIResult> {
	const deps = {
		exportCatalog: exportCatalogDefault,
		resolvePlan: resolveFilterLabRenderPlan,
		probe: probeFilterLabMedia,
		render: renderFilterLabPipelineMedia,
		...dependencies,
	};
	let stagingDirectory: string | undefined;
	const started = Date.now();
	try {
		const steps = parseFilterLabPipelineSteps({ options });
		const paths = resolveFilterLabMediaCommandPaths({
			options,
			outputSuffix: "filter-pipeline",
		});
		await validateFilterLabMediaFiles({
			...paths,
			force: options.force ?? false,
		});
		const renderSignal = AbortSignal.any([
			signal,
			AbortSignal.timeout(30 * 60 * 1000),
		]);
		renderSignal.throwIfAborted();
		onProgress({
			stage: "loading",
			percent: 5,
			message: `Loading ${steps.length} local Filter Lab cards...`,
		});
		const catalog = await deps.exportCatalog();
		const cards = steps.map(({ resourceId }) => {
			const card = catalog.cards.find((item) => item.resourceId === resourceId);
			if (!card)
				throw new Error(
					`Filter resource ID ${resourceId} is not in the catalog.`
				);
			if (!card.available || card.cacheStatus !== "cached")
				throw new Error(
					`Filter ${card.title} has cache status "${card.cacheStatus}" but is not supported by the current Filter Lab loader.`
				);
			return card;
		});
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
		const plans = await Promise.all(
			cards.map((card, index) =>
				deps.resolvePlan({ card, intensity: steps[index].intensity })
			)
		);
		if (options.dryRun)
			return {
				success: true,
				data: {
					dryRun: true,
					input: paths.input,
					output: paths.output,
					filters: plans.map(({ evidence }, index) => ({
						index,
						...evidence,
					})),
					media,
					execution: { decodePasses: 1, encodePasses: 1 },
				},
			};
		await mkdir(dirname(paths.output), { recursive: true });
		stagingDirectory = await mkdtemp(
			join(dirname(paths.output), ".qcut-filter-pipeline-")
		);
		const temporaryOutput = join(
			stagingDirectory,
			`render${extname(paths.output)}`
		);
		onProgress({
			stage: "filtering",
			percent: 15,
			message: `Rendering ${plans.length} ordered filters in one media pass...`,
		});
		await deps.render({
			input: paths.input,
			output: temporaryOutput,
			isImage: paths.isImage,
			media,
			plans,
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
			throw new Error("Rendered pipeline output is empty.");
		renderSignal.throwIfAborted();
		await validateFilterLabMediaFiles({
			...paths,
			force: options.force ?? false,
		});
		if (options.force) await rename(temporaryOutput, paths.output);
		else await link(temporaryOutput, paths.output);
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Filter Lab pipeline complete",
		});
		return {
			success: true,
			outputPath: paths.output,
			duration: (Date.now() - started) / 1000,
			data: {
				input: paths.input,
				output: paths.output,
				filters: plans.map(({ evidence }, index) => ({ index, ...evidence })),
				media: rendered,
				frameRateMode: paths.isImage ? "still" : "cfr",
				audioPreserved: !media.hasAudio || rendered.hasAudio,
				execution: { decodePasses: 1, encodePasses: 1 },
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
