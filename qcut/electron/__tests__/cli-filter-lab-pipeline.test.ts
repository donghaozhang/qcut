// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import {
	handleFilterLabPipeline,
	parseFilterLabPipelineSteps,
	type FilterLabPipelineDependencies,
} from "../native-pipeline/cli/cli-handlers-filter-lab-pipeline.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { FilterLabRenderPlan } from "../native-pipeline/filters/filter-lab-render-plan.js";

function card({
	resourceId,
}: {
	resourceId: string;
}): JianyingFilterCatalogCard {
	return {
		resourceId,
		title: `Filter ${resourceId}`,
		version: "v1",
		categories: [],
		available: true,
		cacheStatus: "cached",
		implementation: "single-lut",
		lutCount: 1,
		verification: "unverified",
	};
}

function plan({
	resourceId,
	intensity,
}: {
	resourceId: string;
	intensity: number;
}): FilterLabRenderPlan {
	return {
		kind: "ffmpeg",
		filterGraph: "[0:v:0]null[filter_output]",
		outputLabel: "filter_output",
		evidence: {
			resourceId,
			title: `Filter ${resourceId}`,
			version: "v1",
			implementation: "single-lut",
			verification: "unverified",
			intensity,
			backend: "ffmpeg-lut",
			fidelity: "lut",
		},
	};
}

const media = {
	width: 64,
	height: 48,
	duration: 0,
	frameRate: 25,
	hasAudio: false,
};

let directory: string;
let options: CLIRunOptions;
let dependencies: FilterLabPipelineDependencies;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "qcut-filter-pipeline-test-"));
	options = {
		command: "filter-lab-pipeline",
		filterSteps: ["111:70", "222:35"],
		input: join(directory, "input.png"),
		output: join(directory, "output.png"),
		outputDir: directory,
		json: true,
		quiet: true,
		verbose: false,
		saveIntermediates: false,
	};
	await writeFile(options.input!, "source");
	dependencies = {
		exportCatalog: vi.fn(async () => ({
			count: 2,
			cards: [card({ resourceId: "111" }), card({ resourceId: "222" })],
		})),
		resolvePlan: vi.fn(async ({ card: item, intensity }) =>
			plan({ resourceId: item.resourceId, intensity })
		),
		probe: vi.fn(async () => media),
		render: vi.fn(async ({ output }) => {
			await writeFile(output, "rendered");
		}),
	};
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function run({
	overrides = {},
	dependencyOverrides = {},
}: {
	overrides?: Partial<CLIRunOptions>;
	dependencyOverrides?: Partial<FilterLabPipelineDependencies>;
} = {}) {
	return handleFilterLabPipeline({
		options: { ...options, ...overrides },
		onProgress: vi.fn(),
		signal: new AbortController().signal,
		dependencies: { ...dependencies, ...dependencyOverrides },
	});
}

describe("filter-lab pipeline CLI", () => {
	it("renders ordered steps once and publishes their evidence", async () => {
		const result = await run();

		expect(result).toMatchObject({
			success: true,
			outputPath: options.output,
			data: {
				filters: [
					{ index: 0, resourceId: "111", intensity: 70 },
					{ index: 1, resourceId: "222", intensity: 35 },
				],
				execution: { decodePasses: 1, encodePasses: 1 },
			},
		});
		expect(dependencies.resolvePlan).toHaveBeenNthCalledWith(1, {
			card: expect.objectContaining({ resourceId: "111" }),
			intensity: 70,
		});
		expect(dependencies.resolvePlan).toHaveBeenNthCalledWith(2, {
			card: expect.objectContaining({ resourceId: "222" }),
			intensity: 35,
		});
		expect(dependencies.render).toHaveBeenCalledTimes(1);
		expect(await readFile(options.output!, "utf8")).toBe("rendered");
		expect(await readdir(directory)).toEqual(["input.png", "output.png"]);
	});

	it("supports repeated resource IDs with one shared intensity", () => {
		expect(
			parseFilterLabPipelineSteps({
				options: {
					...options,
					filterSteps: [],
					resourceIds: ["111", "222"],
					filterIntensity: 44,
				},
			})
		).toEqual([
			{ resourceId: "111", intensity: 44 },
			{ resourceId: "222", intensity: 44 },
		]);
	});

	it.each([
		[{ filterSteps: [] }, "at least two"],
		[{ filterSteps: ["111"] }, "at least two"],
		[{ filterSteps: ["bad", "222"] }, "<resource-id>"],
		[{ filterSteps: ["111:101", "222"] }, "between 0 and 100"],
		[{ filterSteps: ["111", "222"], resourceIds: ["333"] }, "not both"],
		[
			{ filterSteps: ["111", "222"], filterIntensity: 50 },
			"per-step intensity",
		],
	] as Array<
		[Partial<CLIRunOptions>, string]
	>)("rejects an invalid pipeline %j", async (overrides, message) => {
		const result = await run({ overrides });
		expect(result.success).toBe(false);
		expect(result.error).toContain(message);
		expect(dependencies.render).not.toHaveBeenCalled();
	});

	it("rejects unknown and unavailable cards before rendering", async () => {
		expect(
			(await run({ overrides: { filterSteps: ["111", "999"] } })).error
		).toContain("999 is not in the catalog");
		const result = await run({
			dependencyOverrides: {
				exportCatalog: async () => ({
					count: 2,
					cards: [
						card({ resourceId: "111" }),
						{ ...card({ resourceId: "222" }), available: false },
					],
				}),
			},
		});
		expect(result.error).toContain("not supported");
		expect(dependencies.render).not.toHaveBeenCalled();
	});

	it("resolves a dry run without creating an output", async () => {
		const result = await run({ overrides: { dryRun: true } });

		expect(result).toMatchObject({
			success: true,
			data: {
				dryRun: true,
				filters: [
					{ index: 0, resourceId: "111" },
					{ index: 1, resourceId: "222" },
				],
			},
		});
		expect(dependencies.render).not.toHaveBeenCalled();
		expect(await readdir(directory)).toEqual(["input.png"]);
	});

	it("keeps an existing output when rendering fails", async () => {
		await writeFile(options.output!, "original");
		const result = await run({
			overrides: { force: true },
			dependencyOverrides: {
				render: async ({ output }) => {
					await writeFile(output, "partial");
					throw new Error("pipeline failed");
				},
			},
		});

		expect(result.error).toBe("pipeline failed");
		expect(await readFile(options.output!, "utf8")).toBe("original");
		expect(
			(await readdir(directory)).some((name) =>
				name.startsWith(".qcut-filter-pipeline-")
			)
		).toBe(false);
	});

	it("does not overwrite a file created while the pipeline is running", async () => {
		const result = await run({
			dependencyOverrides: {
				render: async ({ output }) => {
					await writeFile(output, "rendered");
					await writeFile(options.output!, "external");
				},
			},
		});

		expect(result.success).toBe(false);
		expect(await readFile(options.output!, "utf8")).toBe("external");
	});
});
