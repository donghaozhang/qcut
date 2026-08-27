// @vitest-environment node
import {
	link,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import {
	handleFilterLabRender,
	type FilterLabRenderDependencies,
} from "../native-pipeline/cli/cli-handlers-filter-lab-render.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { FilterLabRenderPlan } from "../native-pipeline/filters/filter-lab-render-plan.js";

const card: JianyingFilterCatalogCard = {
	resourceId: "123",
	title: "Test LUT",
	version: "v1",
	categories: [],
	available: true,
	cacheStatus: "cached",
	implementation: "single-lut",
	lutCount: 1,
	verification: "unverified",
};
const media = {
	width: 64,
	height: 48,
	duration: 2,
	frameRate: 24,
	hasAudio: true,
};
const plan: FilterLabRenderPlan = {
	kind: "ffmpeg",
	filterGraph: "[0:v]null[out]",
	outputLabel: "out",
	evidence: {
		resourceId: "123",
		title: "Test LUT",
		version: "v1",
		implementation: "single-lut",
		verification: "unverified",
		intensity: 100,
		backend: "ffmpeg-lut",
		fidelity: "lut",
	},
};
let directory: string;
let options: CLIRunOptions;
let deps: FilterLabRenderDependencies;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "qcut-filter-render-test-"));
	options = {
		command: "filter-lab-render",
		input: join(directory, "input.png"),
		output: join(directory, "output.png"),
		resourceId: "123",
		outputDir: directory,
		json: true,
		quiet: true,
		verbose: false,
		saveIntermediates: false,
	};
	await writeFile(options.input!, "source");
	deps = {
		exportCatalog: vi.fn(async () => ({ count: 1, cards: [card] })),
		resolvePlan: vi.fn(async () => plan),
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
	dependencies = {},
}: {
	overrides?: Partial<CLIRunOptions>;
	dependencies?: Partial<FilterLabRenderDependencies>;
} = {}) {
	return handleFilterLabRender({
		options: { ...options, ...overrides },
		onProgress: vi.fn(),
		signal: new AbortController().signal,
		dependencies: { ...deps, ...dependencies },
	});
}

describe("filter-lab render CLI", () => {
	it("publishes verified media with renderer metadata and cleans staging files", async () => {
		const result = await run();
		expect(result).toMatchObject({
			success: true,
			outputPath: options.output,
			data: { filter: plan.evidence, frameRateMode: "still" },
		});
		expect(await readFile(options.output!, "utf8")).toBe("rendered");
		expect(await readdir(directory)).toEqual(["input.png", "output.png"]);
	});

	it.each([
		[{ resourceId: undefined }, "--resource-id"],
		[{ resourceId: "../123" }, "--resource-id"],
		[{ resourceIds: ["123", "456"] }, "one --resource-id"],
		[{ input: undefined }, "--input"],
		[{ filterIntensity: Number.NaN }, "--filter-intensity"],
		[{ filterIntensity: 101 }, "--filter-intensity"],
		[{ duration: "oops" }, "--duration"],
		[{ duration: "-1" }, "--duration"],
		[{ fps: 0 }, "--fps"],
		[{ fps: 121 }, "--fps"],
		[{ duration: "1" }, "only to video"],
		[{ output: "result.mp4" }, ".png"],
	] as Array<
		[Partial<CLIRunOptions>, string]
	>)("rejects bad flags %j", async (overrides, message) => {
		const result = await run({ overrides });
		expect(result.success).toBe(false);
		expect(result.error).toContain(message);
		expect(deps.render).not.toHaveBeenCalled();
	});

	it("does not unlock cached-but-unsupported cards", async () => {
		const result = await run({
			dependencies: {
				exportCatalog: async () => ({
					count: 1,
					cards: [{ ...card, available: false, implementation: "face-ai" }],
				}),
			},
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("not supported");
		expect(deps.resolvePlan).not.toHaveBeenCalled();
	});

	it("rejects an unknown card or a mismatched version", async () => {
		expect((await run({ overrides: { resourceId: "999" } })).error).toContain(
			"not in the local catalog"
		);
		expect(
			(await run({ overrides: { filterVersion: "old" } })).error
		).toContain("--filter-version");
		expect(deps.render).not.toHaveBeenCalled();
	});

	it("protects source files, hard links, and symlinks even with force", async () => {
		expect(
			(await run({ overrides: { output: options.input, force: true } })).error
		).toContain("overwrite the input");
		const alias = join(directory, "alias.png");
		await link(options.input!, alias);
		expect(
			(await run({ overrides: { output: alias, force: true } })).error
		).toContain("overwrite the input");
		const symbolic = join(directory, "symlink.png");
		await symlink(options.input!, symbolic);
		expect(
			(await run({ overrides: { output: symbolic, force: true } })).error
		).toContain("symlink");
		expect(await readFile(options.input!, "utf8")).toBe("source");
	});

	it("leaves an existing output unchanged on failure, even with force", async () => {
		await writeFile(options.output!, "original");
		expect((await run()).error).toContain("--force");
		const result = await run({
			overrides: { force: true },
			dependencies: {
				render: async ({ output }) => {
					await writeFile(output, "partial");
					throw new Error("render failed");
				},
			},
		});
		expect(result.error).toBe("render failed");
		expect(await readFile(options.output!, "utf8")).toBe("original");
		expect(
			(await readdir(directory)).some((name) =>
				name.startsWith(".qcut-filter-")
			)
		).toBe(false);
	});

	it("does not overwrite a new file that appears while rendering", async () => {
		const result = await run({
			dependencies: {
				render: async ({ output }) => {
					await writeFile(output, "rendered");
					await writeFile(options.output!, "external");
				},
			},
		});
		expect(result.success).toBe(false);
		expect(await readFile(options.output!, "utf8")).toBe("external");
	});

	it("validates dry runs without producing an output", async () => {
		const result = await run({ overrides: { dryRun: true } });
		expect(result).toMatchObject({
			success: true,
			data: { dryRun: true, filter: plan.evidence },
		});
		expect(deps.render).not.toHaveBeenCalled();
		expect(await readdir(directory)).toEqual(["input.png"]);
	});

	it("keeps audio and duration for video, and supports a shorter preview", async () => {
		const input = join(directory, "input.mp4");
		await writeFile(input, "video");
		const probe = vi
			.fn()
			.mockResolvedValueOnce(media)
			.mockResolvedValueOnce({ ...media, duration: 1, frameRate: 12 });
		const result = await run({
			overrides: {
				input,
				output: join(directory, "output.mp4"),
				duration: "1",
				fps: 12,
			},
			dependencies: { probe },
		});
		expect(result).toMatchObject({
			success: true,
			data: { frameRateMode: "cfr", audioPreserved: true },
		});
		expect(deps.render).toHaveBeenCalledWith(
			expect.objectContaining({
				media: { ...media, duration: 1, frameRate: 12 },
			})
		);
	});

	it.each([
		[{ ...media, width: 60 }, "dimensions"],
		[{ ...media, duration: 1 }, "duration"],
		[{ ...media, hasAudio: false }, "audio"],
		[{ ...media, frameRate: 30 }, "frame rate"],
	])("refuses to publish invalid video output %j", async (outputMedia, message) => {
		const input = join(directory, "input.mp4");
		await writeFile(input, "video");
		const probe = vi
			.fn()
			.mockResolvedValueOnce(media)
			.mockResolvedValueOnce(outputMedia);
		const result = await run({
			overrides: { input, output: join(directory, "output.mp4") },
			dependencies: { probe },
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain(message);
		expect((await readdir(directory)).includes("output.mp4")).toBe(false);
	});
});
