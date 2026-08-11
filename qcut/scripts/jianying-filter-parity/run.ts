import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { materializeVideoCubeLut } from "../../electron/ffmpeg/color-lut-file.js";
import { getFFmpegPath } from "../../electron/ffmpeg/paths.js";
import { saveJianyingFilterVerification } from "../../electron/jianying-filter-verification-store.js";
import {
	listJianyingLutReferences,
	loadJianyingLut,
} from "../../electron/native-pipeline/filters/filter-lab-lut.js";
import {
	type FilterLabVerificationReport,
	verifyFilterLabParity,
} from "../../electron/native-pipeline/filters/filter-lab-verification.js";
import {
	JIANYING_FILTER_PARITY_CASES,
	type JianyingFilterParityCase,
} from "./cases.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CONCURRENCY = 4;

export interface JianyingFilterParityOptions {
	concurrency: number;
	persist: boolean;
	referenceDirectory: string;
	runDirectory: string;
	sourcePath: string;
}

interface JianyingFilterParityResult {
	case: JianyingFilterParityCase;
	comparisonPath: string;
	qcutPath: string;
	referencePath: string;
	verification: FilterLabVerificationReport;
}

function requiredValue({
	argument,
	value,
}: {
	argument: string;
	value?: string;
}): string {
	if (!value) throw new Error(`${argument} requires a value`);
	return value;
}

export function parseJianyingFilterParityArgs({
	argv,
}: {
	argv: string[];
}): JianyingFilterParityOptions {
	let concurrency = DEFAULT_CONCURRENCY;
	let persist = true;
	let referenceDirectory = "";
	let runDirectory = "";
	let sourcePath = "";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--no-persist") {
			persist = false;
			continue;
		}
		const value = requiredValue({ argument, value: argv[index + 1] });
		if (argument === "--source") sourcePath = resolve(value);
		else if (argument === "--reference-dir") {
			referenceDirectory = resolve(value);
		} else if (argument === "--run-dir") runDirectory = resolve(value);
		else if (argument === "--concurrency") concurrency = Number(value);
		else throw new Error(`Unknown parity option: ${argument}`);
		index += 1;
	}
	if (!(sourcePath && referenceDirectory && runDirectory)) {
		throw new Error(
			"Parity run requires --source, --reference-dir, and --run-dir"
		);
	}
	if (
		!Number.isSafeInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > 6
	) {
		throw new Error("Parity concurrency must be an integer from 1 to 6");
	}
	return {
		concurrency,
		persist,
		referenceDirectory,
		runDirectory,
		sourcePath,
	};
}

async function runFfmpeg({ args }: { args: string[] }): Promise<void> {
	await execFileAsync(getFFmpegPath(), args, {
		maxBuffer: 16 * 1024 * 1024,
	});
}

async function renderQcutFrame({
	caseItem,
	outputPath,
	referenceById,
	sourcePath,
}: {
	caseItem: JianyingFilterParityCase;
	outputPath: string;
	referenceById: ReadonlyMap<
		string,
		Awaited<ReturnType<typeof listJianyingLutReferences>>[number]
	>;
	sourcePath: string;
}): Promise<void> {
	const reference = referenceById.get(caseItem.lutId);
	if (!reference) throw new Error(`Cached LUT is missing: ${caseItem.lutId}`);
	const entry = await loadJianyingLut({ reference });
	if (!entry) throw new Error(`Cached LUT is unreadable: ${caseItem.lutId}`);
	const cubePath = materializeVideoCubeLut({
		name: caseItem.title,
		cube: {
			size: entry.cube.size,
			domainMin: entry.cube.domainMin ?? [0, 0, 0],
			domainMax: entry.cube.domainMax ?? [1, 1, 1],
			values: Array.from(entry.cube.values),
		},
		intensity: 100,
		skinProtection: 0,
	});
	await runFfmpeg({
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			sourcePath,
			"-vf",
			`lut3d=file='${cubePath.replace(/'/g, "\\'")}':interp=tetrahedral,format=rgba`,
			"-frames:v",
			"1",
			outputPath,
		],
	});
}

function labeledPanel({ input, label }: { input: number; label: string }) {
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
}): Promise<void> {
	const graph = [
		`${labeledPanel({ input: 0, label: "Original" })}[original]`,
		`${labeledPanel({ input: 1, label: "QCut exact LUT" })}[qcut]`,
		`${labeledPanel({ input: 2, label: "Jianying UI 100" })}[jianying]`,
		"[original][qcut][jianying]hstack=inputs=3[out]",
	].join(";");
	await runFfmpeg({
		args: [
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
	});
}

async function mapConcurrent<Input, Output>({
	concurrency,
	inputs,
	worker,
}: {
	concurrency: number;
	inputs: Input[];
	worker: ({
		input,
		index,
	}: {
		input: Input;
		index: number;
	}) => Promise<Output>;
}): Promise<Output[]> {
	const results = new Array<Output>(inputs.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const input = inputs[index];
		if (input === undefined) return;
		results[index] = await worker({ input, index });
		return runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, inputs.length) }, async () =>
			runNext()
		)
	);
	return results;
}

function markdownReport({
	baseline,
	results,
}: {
	baseline: FilterLabVerificationReport;
	results: JianyingFilterParityResult[];
}) {
	const lines = [
		"# Jianying / QCut Pure LUT Parity",
		"",
		`Baseline: ${baseline.status}; RMSE ${baseline.rgbRmse}; SSIM ${baseline.ssim}; DeltaE ${baseline.deltaE}.`,
		"",
		"| # | Category | Filter | Status | RMSE | SSIM | DeltaE | Comparison |",
		"|---:|---|---|---|---:|---:|---:|---|",
	];
	for (const result of results) {
		lines.push(
			`| ${result.case.order} | ${result.case.category} | ${result.case.title} | ${result.verification.status} | ${result.verification.rgbRmse} | ${result.verification.ssim} | ${result.verification.deltaE} | comparisons/${result.case.fileStem}.png |`
		);
	}
	return `${lines.join("\n")}\n`;
}

async function saveRecords({
	index,
	results,
}: {
	index: number;
	results: JianyingFilterParityResult[];
}): Promise<void> {
	const result = results[index];
	if (!result) return;
	await saveJianyingFilterVerification({
		record: {
			resourceId: result.case.resourceId,
			version: result.case.version,
			...result.verification,
		},
	});
	return saveRecords({ index: index + 1, results });
}

export async function runJianyingFilterParity({
	options,
}: {
	options: JianyingFilterParityOptions;
}) {
	await Promise.all([
		access(options.sourcePath),
		access(options.referenceDirectory),
		mkdir(join(options.runDirectory, "qcut"), { recursive: true }),
		mkdir(join(options.runDirectory, "comparisons"), { recursive: true }),
	]);
	const baselinePath = join(options.referenceDirectory, "00-baseline.png");
	await access(baselinePath);
	const baseline = await verifyFilterLabParity({
		input: {
			referenceFrame: baselinePath,
			candidateFrame: options.sourcePath,
		},
	});
	const references = await listJianyingLutReferences();
	const referenceById = new Map(
		references.map((reference) => [reference.lutId, reference])
	);
	const results = await mapConcurrent({
		concurrency: options.concurrency,
		inputs: [...JIANYING_FILTER_PARITY_CASES],
		worker: async ({ input: caseItem }) => {
			const qcutPath = join(
				options.runDirectory,
				"qcut",
				`${caseItem.fileStem}.png`
			);
			const referencePath = join(
				options.referenceDirectory,
				`${caseItem.fileStem}.png`
			);
			const comparisonPath = join(
				options.runDirectory,
				"comparisons",
				`${caseItem.fileStem}.png`
			);
			await access(referencePath);
			await renderQcutFrame({
				caseItem,
				outputPath: qcutPath,
				referenceById,
				sourcePath: options.sourcePath,
			});
			const verification = await verifyFilterLabParity({
				input: {
					referenceFrame: referencePath,
					candidateFrame: qcutPath,
				},
			});
			await renderComparison({
				comparisonPath,
				qcutPath,
				referencePath,
				sourcePath: options.sourcePath,
			});
			return {
				case: caseItem,
				comparisonPath,
				qcutPath,
				referencePath,
				verification,
			};
		},
	});
	if (options.persist) await saveRecords({ index: 0, results });
	const report = {
		generatedAt: new Date().toISOString(),
		baseline,
		results,
	};
	await Promise.all([
		writeFile(
			join(options.runDirectory, "report.json"),
			`${JSON.stringify(report, null, 2)}\n`,
			"utf8"
		),
		writeFile(
			join(options.runDirectory, "report.md"),
			markdownReport({ baseline, results }),
			"utf8"
		),
	]);
	return report;
}

if (import.meta.main) {
	const options = parseJianyingFilterParityArgs({
		argv: process.argv.slice(2),
	});
	const report = await runJianyingFilterParity({ options });
	console.log(JSON.stringify(report, null, 2));
}
