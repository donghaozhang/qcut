import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type {
	JianyingEffectCategory,
	JianyingEffectDefinition,
} from "../../../jianying-effect-contract";
import type { JianyingEffectRuntimeInspection } from "../../../jianying-effect/runtime-discovery";
import {
	handleEffectLabDoctor,
	handleEffectLabList,
	handleEffectLabRender,
	handleEffectLabSearch,
	type EffectLabHandlerDependencies,
} from "../cli-handlers-effect-lab";
import { parseCliArgs } from "../cli";
import type { CLIRunOptions } from "../cli-runner/types";

const CATEGORIES: JianyingEffectCategory[] = [
	{
		id: "camera",
		name: "运镜",
		panel: "effects2",
		categoryIds: ["camera"],
	},
	{
		id: "portrait",
		name: "人物",
		panel: "face-prop",
		categoryIds: ["portrait"],
	},
];

function createEffect({
	effectId,
	name,
	panel = "effects2",
	categoryIds = ["camera"],
	supported = true,
	installed = true,
}: {
	effectId: string;
	name: string;
	panel?: JianyingEffectDefinition["panel"];
	categoryIds?: string[];
	supported?: boolean;
	installed?: boolean;
}): JianyingEffectDefinition {
	return {
		id: `jy-effect-${effectId}`,
		effectId,
		resourceId: `resource-${effectId}`,
		packageHash: effectId.padStart(32, "a").slice(0, 32),
		packagePath: installed ? `/cache/${effectId}` : "",
		name,
		panel,
		categoryIds,
		defaultDurationMs: 3000,
		adjustParameters: [
			{
				key: "effects_adjust_intensity",
				defaultValue: 0.5,
				minimum: 0,
				maximum: 1,
			},
		],
		access: "free",
		supported,
		unsupportedReason: supported ? undefined : "missing model",
		requiresAlgorithm: false,
		installed,
		downloadable: true,
	};
}

const EFFECTS = [
	createEffect({ effectId: "101", name: "镜头推进" }),
	createEffect({
		effectId: "202",
		name: "发光分身",
		panel: "face-prop",
		categoryIds: ["portrait"],
	}),
	createEffect({
		effectId: "303",
		name: "未解锁特效",
		supported: false,
		installed: false,
	}),
];

function baseOptions({
	command,
	outputDir = "/tmp",
}: {
	command: string;
	outputDir?: string;
}): CLIRunOptions {
	return {
		command,
		outputDir,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function inspection(): JianyingEffectRuntimeInspection {
	return {
		status: {
			state: "ready",
			platform: "darwin",
			bridgeReady: true,
			availableCount: 2,
			effects: EFFECTS,
			categories: CATEGORIES,
			message: "ready",
		},
		appBundlePath: null,
		runtimeRootPath: "/runtime",
		bridgePath: "/bridge",
		effects: EFFECTS,
	};
}

function dependencies(
	overrides: Partial<EffectLabHandlerDependencies> = {}
): EffectLabHandlerDependencies {
	return {
		loadLibrary: async () => ({ effects: EFFECTS, categories: CATEGORIES }),
		inspectRuntime: async () => inspection(),
		ensurePackage: async ({ effectId }) => ({
			effectId,
			packageHash: "a".repeat(32),
			packagePath: `/managed/${effectId}`,
		}),
		renderEffect: async () => ({
			inputFrames: 60,
			effectFrames: 45,
			outputFrames: 60,
		}),
		probeVideo: async () => ({ width: 641, height: 361, duration: 2 }),
		...overrides,
	};
}

describe("effect-lab CLI", () => {
	test("parses grouped list, search, doctor, and render commands", () => {
		const list = parseCliArgs([
			"effect-lab",
			"list",
			"--supported-only",
			"--limit",
			"8",
		]);
		const search = parseCliArgs([
			"effect-lab",
			"search",
			"--query",
			"发光",
			"--panel",
			"face-prop",
		]);
		const doctor = parseCliArgs(["effect-lab", "doctor", "--json"]);
		const render = parseCliArgs([
			"effect-lab",
			"render",
			"--effect",
			"镜头推进",
			"--input",
			"input.mp4",
			"--adjust",
			"effects_adjust_intensity=0.8",
		]);

		expect(list).toMatchObject({
			command: "effect-lab-list",
			supportedOnly: true,
			limit: 8,
		});
		expect(search).toMatchObject({
			command: "effect-lab-search",
			query: "发光",
			panel: "face-prop",
		});
		expect(doctor.command).toBe("effect-lab-doctor");
		expect(render).toMatchObject({
			command: "effect-lab-render",
			effect: "镜头推进",
			input: "input.mp4",
			effectAdjustments: ["effects_adjust_intensity=0.8"],
		});
	});

	test("searches localized category names and stable IDs", async () => {
		const byCategory = await handleEffectLabSearch(
			{
				...baseOptions({ command: "effect-lab-search" }),
				query: "运镜",
			},
			dependencies()
		);
		const byId = await handleEffectLabSearch(
			{
				...baseOptions({ command: "effect-lab-search" }),
				query: "resource-202",
			},
			dependencies()
		);

		expect(byCategory.data).toMatchObject({
			total: 3,
			matching: 2,
			effects: [
				{ effectId: "101", categories: ["运镜"] },
				{ effectId: "303", categories: ["运镜"] },
			],
		});
		expect(byId.data).toMatchObject({
			matching: 1,
			effects: [{ effectId: "202", name: "发光分身" }],
		});
	});

	test("filters list results by renderability and installation", async () => {
		const result = await handleEffectLabList(
			{
				...baseOptions({ command: "effect-lab-list" }),
				supportedOnly: true,
				installedOnly: true,
			},
			dependencies()
		);

		expect(result.data).toMatchObject({
			total: 3,
			matching: 2,
			returned: 2,
		});
	});

	test("reports runtime health without dumping the complete catalog", async () => {
		const result = await handleEffectLabDoctor(
			baseOptions({ command: "effect-lab-doctor" }),
			dependencies()
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				state: "ready",
				availableCount: 2,
				totalCount: 3,
				installedCount: 2,
				supportedCount: 2,
				lockedCount: 1,
				categoryCount: 2,
			},
		});
		expect(result.data).not.toHaveProperty("effects");
	});

	test("rejects invalid slider values before preparing a package", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "qcut-effect-lab-"));
		const input = path.join(directory, "input.mp4");
		await writeFile(input, "video");
		const ensurePackage = vi.fn(dependencies().ensurePackage);

		try {
			await expect(
				handleEffectLabRender(
					{
						...baseOptions({
							command: "effect-lab-render",
							outputDir: directory,
						}),
						effect: "镜头推进",
						input,
						effectAdjustments: ["effects_adjust_intensity=1.5"],
					},
					() => undefined,
					dependencies({ ensurePackage })
				)
			).rejects.toThrow("must be between 0 and 1");
			expect(ensurePackage).not.toHaveBeenCalled();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("renders by title with probed dimensions and normalized adjustments", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "qcut-effect-lab-"));
		const input = path.join(directory, "input.mp4");
		const output = path.join(directory, "output.mp4");
		await writeFile(input, "video");
		const renderEffect = vi.fn(
			async ({ outputPath }: { outputPath: string }) => {
				await writeFile(outputPath, "rendered");
				return { inputFrames: 60, effectFrames: 45, outputFrames: 60 };
			}
		);

		try {
			const result = await handleEffectLabRender(
				{
					...baseOptions({
						command: "effect-lab-render",
						outputDir: directory,
					}),
					effect: "镜头推进",
					input,
					output,
					effectAdjustments: ["effects_adjust_intensity=0.8"],
				},
				() => undefined,
				dependencies({
					renderEffect:
						renderEffect as EffectLabHandlerDependencies["renderEffect"],
				})
			);

			expect(result).toMatchObject({ success: true, outputPath: output });
			expect(await readFile(output, "utf8")).toBe("rendered");
			expect(renderEffect).toHaveBeenCalledWith(
				expect.objectContaining({
					width: 640,
					height: 360,
					frameRate: 30,
					adjustValues: [{ key: "effects_adjust_intensity", value: 0.8 }],
					definition: expect.objectContaining({
						packagePath: "/managed/101",
					}),
				})
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
