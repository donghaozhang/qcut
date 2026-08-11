import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildVideoColorMultiPassGraph } from "../../electron/ffmpeg/color-multi-pass-filter.js";
import type { VideoColorMultiPassSettings } from "../../electron/ffmpeg/color-settings.js";
import { getFFmpegPath } from "../../electron/ffmpeg/paths.js";
import { inspectJianyingFilterPackages } from "../../electron/jianying-filter-package-inspector.js";
import {
	loadJianyingMultiPassRecipe,
	type FilterLabMultiPassRecipe,
} from "../../electron/native-pipeline/filters/filter-lab-multi-pass.js";
import { jianyingEffectCacheRoot } from "../../electron/native-pipeline/filters/filter-lab-lut.js";
import {
	type FilterLabVerificationReport,
	verifyFilterLabParity,
} from "../../electron/native-pipeline/filters/filter-lab-verification.js";

const execFileAsync = promisify(execFile);

export const JIANYING_MULTI_PASS_CASES = [
	{
		order: 2,
		fileStem: "02-food-enhancement",
		title: "清透美食",
		resourceId: "7403664041945681191",
		version: "59f14f9555fc38667c3ddb0814346cc8",
		category: "美食",
	},
	{
		order: 3,
		fileStem: "03-vignette-old-film",
		title: "暗角旧影",
		resourceId: "7647099764940557618",
		version: "29fec8019c1c3fb2e4d8606e10ebb39d",
		category: "复古胶片",
	},
	{
		order: 4,
		fileStem: "04-fog",
		title: "迷雾",
		resourceId: "7160594413847203085",
		version: "e745e131cff1db913aea07f4098ec8de",
		category: "风格化",
	},
] as const;

export interface MultiPassRunOptions {
	runDirectory: string;
	sourcePath: string;
}

export function parseMultiPassRunArgs({ argv }: { argv: string[] }) {
	let runDirectory = "";
	let sourcePath = "";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const value = argv[index + 1];
		if (!value) throw new Error(`${argument} requires a value`);
		if (argument === "--source") sourcePath = resolve(value);
		else if (argument === "--run-dir") runDirectory = resolve(value);
		else throw new Error(`Unknown multi-pass option: ${argument}`);
		index += 1;
	}
	if (!(sourcePath && runDirectory)) {
		throw new Error("Multi-pass run requires --source and --run-dir");
	}
	return { runDirectory, sourcePath } satisfies MultiPassRunOptions;
}

function serializeRecipe({
	name,
	presetId,
	recipe,
}: {
	name: string;
	presetId: string;
	recipe: FilterLabMultiPassRecipe;
}): VideoColorMultiPassSettings {
	return {
		enabled: true,
		presetId,
		name,
		intensity: 100,
		fidelity: "structural",
		passes: recipe.passes.map((pass) =>
			pass.kind === "lut"
				? {
						...pass,
						cube: {
							size: pass.cube.size,
							domainMin: pass.cube.domainMin ?? [0, 0, 0],
							domainMax: pass.cube.domainMax ?? [1, 1, 1],
							values: Array.from(pass.cube.values),
						},
					}
				: pass
		),
	};
}

async function renderFrame({
	outputPath,
	settings,
	sourcePath,
}: {
	outputPath: string;
	settings: VideoColorMultiPassSettings;
	sourcePath: string;
}) {
	const graph = buildVideoColorMultiPassGraph({
		settings,
		inputLabel: "0:v",
		labelPrefix: settings.presetId,
	});
	const output = "multi_pass_output";
	await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			sourcePath,
			"-filter_complex",
			`${graph.filterSteps.join(";")};[${graph.outputLabel}]format=rgba[${output}]`,
			"-map",
			`[${output}]`,
			"-frames:v",
			"1",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

async function renderContactSheet({
	outputPaths,
	runDirectory,
	sourcePath,
}: {
	outputPaths: string[];
	runDirectory: string;
	sourcePath: string;
}) {
	const labels = ["Original", "Sharpen", "Food", "Vignette", "Fog"];
	const inputs = [sourcePath, ...outputPaths];
	const panels = inputs.map(
		(_, index) =>
			`[${index}:v]scale=384:216:flags=lanczos,pad=384:252:0:0:black,` +
			`drawtext=text='${labels[index]}':fontcolor=white:fontsize=20:` +
			`x=(w-text_w)/2:y=224[p${index}]`
	);
	const stack = `${inputs.map((_, index) => `[p${index}]`).join("")}hstack=inputs=${inputs.length}[out]`;
	await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...inputs.flatMap((path) => ["-i", path]),
			"-filter_complex",
			[...panels, stack].join(";"),
			"-map",
			"[out]",
			"-frames:v",
			"1",
			join(runDirectory, "contact-sheet.png"),
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

function labeledComparisonPanel({
	input,
	label,
}: {
	input: number;
	label: string;
}) {
	return (
		`[${input}:v]scale=640:360:flags=lanczos,` +
		`pad=640:408:0:0:black,drawtext=text='${label}':` +
		"fontcolor=white:fontsize=24:x=(w-text_w)/2:y=371"
	);
}

async function renderComparison({
	comparisonPath,
	qcutPath,
	referencePath,
	sourcePath,
}: {
	comparisonPath: string;
	qcutPath: string;
	referencePath: string;
	sourcePath: string;
}) {
	const graph = [
		`${labeledComparisonPanel({ input: 0, label: "Original" })}[original]`,
		`${labeledComparisonPanel({ input: 1, label: "QCut structural" })}[qcut]`,
		`${labeledComparisonPanel({ input: 2, label: "Jianying UI 100" })}[jianying]`,
		"[original][qcut][jianying]hstack=inputs=3[out]",
	].join(";");
	await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			sourcePath,
			"-i",
			qcutPath,
			"-i",
			referencePath,
			"-filter_complex",
			graph,
			"-map",
			"[out]",
			"-frames:v",
			"1",
			comparisonPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

function markdownVerification({
	verification,
}: {
	verification: FilterLabVerificationReport;
}) {
	return `| ${verification.status} | ${verification.rgbRmse} | ${verification.ssim} | ${verification.deltaE} |`;
}

export async function runJianyingMultiPassEvidence({
	options,
}: {
	options: MultiPassRunOptions;
}) {
	await Promise.all([
		access(options.sourcePath),
		mkdir(options.runDirectory, { recursive: true }),
		mkdir(join(options.runDirectory, "comparisons"), { recursive: true }),
	]);
	const packageSummaries = await inspectJianyingFilterPackages({
		filters: JIANYING_MULTI_PASS_CASES.map((caseItem) => ({
			resourceId: caseItem.resourceId,
			title: caseItem.title,
			categories: [caseItem.category],
			version: caseItem.version,
		})),
		references: [],
	});
	const cacheRoot = dirname(jianyingEffectCacheRoot());
	const loaded = await Promise.all(
		JIANYING_MULTI_PASS_CASES.map(async (caseItem) => {
			const renderer = packageSummaries.get(
				caseItem.resourceId
			)?.multiPassRenderer;
			if (!renderer)
				throw new Error(`Renderer not recognized: ${caseItem.title}`);
			const recipe = await loadJianyingMultiPassRecipe({ cacheRoot, renderer });
			if (!recipe) throw new Error(`Renderer cannot load: ${caseItem.title}`);
			return {
				caseItem,
				settings: serializeRecipe({
					name: caseItem.title,
					presetId: `jianying:${caseItem.resourceId}:${caseItem.version}`,
					recipe,
				}),
			};
		})
	);
	const cases = [
		{
			fileStem: "01-sharpen",
			title: "QCut 锐化",
			settings: {
				enabled: true,
				presetId: "qcut:sharpen:v1",
				name: "QCut 锐化",
				intensity: 100,
				fidelity: "structural" as const,
				passes: [{ kind: "sharpen" as const, amount: 1 }],
			},
		},
		...loaded.map(({ caseItem, settings }) => ({
			fileStem: caseItem.fileStem,
			title: caseItem.title,
			settings,
		})),
	];
	const results = await Promise.all(
		cases.map(async (caseItem) => {
			const outputPath = join(options.runDirectory, `${caseItem.fileStem}.png`);
			await renderFrame({
				outputPath,
				settings: caseItem.settings,
				sourcePath: options.sourcePath,
			});
			return {
				fileStem: caseItem.fileStem,
				title: caseItem.title,
				outputPath,
				passes: caseItem.settings.passes.map(({ kind }) => kind),
				fidelity: caseItem.settings.fidelity,
			};
		})
	);
	const measuredResults = await Promise.all(
		results.map(async (result) => {
			if (result.fileStem === "01-sharpen") return result;
			const fileName = `${result.fileStem}.png`;
			const referencePath = join(options.runDirectory, "jianying", fileName);
			await access(referencePath);
			const verification = await verifyFilterLabParity({
				input: {
					referenceFrame: referencePath,
					candidateFrame: result.outputPath,
				},
			});
			const comparisonPath = join(
				options.runDirectory,
				"comparisons",
				fileName
			);
			await renderComparison({
				comparisonPath,
				qcutPath: result.outputPath,
				referencePath,
				sourcePath: options.sourcePath,
			});
			return {
				...result,
				referencePath,
				comparisonPath,
				verification,
			};
		})
	);
	await renderContactSheet({
		outputPaths: results.map(({ outputPath }) => outputPath),
		runDirectory: options.runDirectory,
		sourcePath: options.sourcePath,
	});
	const report = {
		generatedAt: new Date().toISOString(),
		sourcePath: options.sourcePath,
		status: "structural-with-pixel-measurements",
		results: measuredResults,
	};
	await Promise.all([
		writeFile(
			join(options.runDirectory, "report.json"),
			`${JSON.stringify(report, null, 2)}\n`,
			"utf8"
		),
		writeFile(
			join(options.runDirectory, "report.md"),
			[
				"# QCut multi-pass filter evidence",
				"",
				"Implementation fidelity: structural. QCut reproduces the observed pass topology and parameters with native primitives; these results are not presented as exact Jianying shader parity.",
				"",
				"| Filter | Passes | Pixel status | RMSE | SSIM | DeltaE |",
				"|---|---|---|---:|---:|---:|",
				...measuredResults.map((result) =>
					"verification" in result
						? `| ${result.title} | ${result.passes.join(" -> ")} ${markdownVerification({ verification: result.verification })}`
						: `| ${result.title} | ${result.passes.join(" -> ")} | no Jianying reference | - | - | - |`
				),
				"",
				"Comparison images are in `comparisons/`. Standalone QCut sharpening has no Jianying reference and is intentionally ungraded.",
				"",
			].join("\n"),
			"utf8"
		),
	]);
	return report;
}

if (import.meta.main) {
	const options = parseMultiPassRunArgs({ argv: process.argv.slice(2) });
	console.log(
		JSON.stringify(await runJianyingMultiPassEvidence({ options }), null, 2)
	);
}
