import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { materializeVideoCubeLut } from "../../electron/ffmpeg/color-lut-file.js";
import { getFFmpegPath } from "../../electron/ffmpeg/paths.js";
import { mapWithConcurrency } from "../../electron/lib/map-with-concurrency.js";
import { exportCatalogDefault } from "../../electron/native-pipeline/cli/cli-handlers-filter-lab-catalog.js";
import {
	listJianyingLutReferences,
	loadJianyingLut,
} from "../../electron/native-pipeline/filters/filter-lab-lut.js";
import { verifyFilterLabParity } from "../../electron/native-pipeline/filters/filter-lab-verification.js";
import { startJianyingFilterHostProcess } from "../../electron/jianying-filter-local-runtime/host-process.js";
import { inspectJianyingFilterLocalRuntime } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import { saveJianyingFilterVerification } from "../../electron/jianying-filter-verification-store.js";
import type { JianyingFilterCatalogCard } from "../../electron/jianying-filter-catalog-export.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CONCURRENCY = 3;
const SCRIPT_RELATIVE_PATH = path.join(
	"AmazingFeature",
	"lua",
	"SeekModeScript.lua"
);
const INTENSITY_EVENT_PATTERN =
	/(self\.[A-Za-z_][A-Za-z0-9_]*):setFloat\(\s*["']([^"']+)["']\s*,\s*intensity\s*\)/g;
const MATERIAL_ASSIGNMENT_PATTERN =
	/^(\s*)(self\.[A-Za-z_][A-Za-z0-9_]*)\s*=.*$/gm;

interface NativeSingleLutOptions {
	concurrency: number;
	limit?: number;
	persist: boolean;
	resourceIds?: string[];
	runDirectory: string;
	sourcePath: string;
}

interface NativeSingleLutSuccess {
	status: "ok";
	resourceId: string;
	version: string;
	title: string;
	categories: string[];
	bootstrap: "injected-intensity" | "package-default";
	scriptSha256?: string;
	processId: number;
	initializedMs: number;
	firstFrameMs: number;
	secondFrameMs: number;
	deterministic: boolean;
	verification: Awaited<ReturnType<typeof verifyFilterLabParity>>;
}

interface NativeSingleLutFailure {
	status: "error";
	resourceId: string;
	version: string;
	title: string;
	error: string;
}

type NativeSingleLutResult = NativeSingleLutSuccess | NativeSingleLutFailure;

function requiredValue({
	argument,
	value,
}: {
	argument: string;
	value?: string;
}) {
	if (!value) throw new Error(`${argument} requires a value`);
	return value;
}

export function parseNativeSingleLutArgs({ argv }: { argv: string[] }) {
	let concurrency = DEFAULT_CONCURRENCY;
	let limit: number | undefined;
	let persist = true;
	let resourceIds: string[] | undefined;
	let runDirectory = "";
	let sourcePath = "";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--no-persist") {
			persist = false;
			continue;
		}
		const value = requiredValue({ argument, value: argv[index + 1] });
		if (argument === "--concurrency") concurrency = Number(value);
		else if (argument === "--limit") limit = Number(value);
		else if (argument === "--resource-ids") {
			resourceIds = value
				.split(",")
				.map((resourceId) => resourceId.trim())
				.filter(Boolean);
		} else if (argument === "--run-dir") runDirectory = path.resolve(value);
		else if (argument === "--source") sourcePath = path.resolve(value);
		else throw new Error(`Unknown native single-LUT option: ${argument}`);
		index += 1;
	}
	if (!(runDirectory && sourcePath)) {
		throw new Error("Native single-LUT run requires --source and --run-dir");
	}
	if (
		!Number.isSafeInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > 6
	) {
		throw new Error("Native single-LUT concurrency must be from 1 to 6");
	}
	if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
		throw new Error("Native single-LUT limit must be a positive integer");
	}
	if (
		resourceIds !== undefined &&
		(resourceIds.length === 0 ||
			new Set(resourceIds).size !== resourceIds.length)
	) {
		throw new Error("Native single-LUT resource IDs must be unique");
	}
	return {
		concurrency,
		...(limit !== undefined ? { limit } : {}),
		persist,
		...(resourceIds ? { resourceIds } : {}),
		runDirectory,
		sourcePath,
	};
}

export function bootstrapSingleLutIntensity({ source }: { source: string }) {
	const events = [...source.matchAll(INTENSITY_EVENT_PATTERN)];
	if (events.length !== 1) {
		throw new Error("Single-LUT intensity event is missing or ambiguous");
	}
	const receiver = events[0][1];
	const uniform = events[0][2];
	const assignments = [...source.matchAll(MATERIAL_ASSIGNMENT_PATTERN)].filter(
		(match) => match[2] === receiver
	);
	if (assignments.length !== 1) {
		throw new Error("Single-LUT material assignment is missing or ambiguous");
	}
	const assignment = assignments[0];
	const indentation = assignment[1];
	const replacement = `${assignment[0]}\n${indentation}${receiver}:setFloat("${uniform}", 1.0)`;
	return `${source.slice(0, assignment.index)}${replacement}${source.slice((assignment.index ?? 0) + assignment[0].length)}`;
}

function caseStem({
	index,
	resourceId,
}: {
	index: number;
	resourceId: string;
}) {
	return `${String(index + 1).padStart(2, "0")}-${resourceId}`;
}

function cardVersion({ card }: { card: JianyingFilterCatalogCard }) {
	if (!card.version)
		throw new Error(`Cached card has no version: ${card.title}`);
	return card.version;
}

async function renderPng({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}) {
	await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			inputPath,
			"-frames:v",
			"1",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

async function renderNativeSource({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}) {
	await execFileAsync(
		getFFmpegPath(),
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgb24",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

async function renderQcutLut({
	card,
	outputPath,
	reference,
	sourcePath,
}: {
	card: JianyingFilterCatalogCard;
	outputPath: string;
	reference: Awaited<ReturnType<typeof listJianyingLutReferences>>[number];
	sourcePath: string;
}) {
	const entry = await loadJianyingLut({ reference });
	if (!entry) throw new Error("Cached single LUT is unreadable");
	const cubePath = materializeVideoCubeLut({
		name: card.title,
		cube: {
			size: entry.cube.size,
			domainMin: entry.cube.domainMin ?? [0, 0, 0],
			domainMax: entry.cube.domainMax ?? [1, 1, 1],
			values: Array.from(entry.cube.values),
		},
		intensity: 100,
		skinProtection: 0,
	});
	await execFileAsync(
		getFFmpegPath(),
		[
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
		{ maxBuffer: 16 * 1024 * 1024 }
	);
}

async function prepareOraclePackage({
	card,
	reference,
	temporaryDirectory,
}: {
	card: JianyingFilterCatalogCard;
	reference: Awaited<ReturnType<typeof listJianyingLutReferences>>[number];
	temporaryDirectory: string;
}) {
	const version = cardVersion({ card });
	let sourcePath = path.dirname(reference.filePath);
	const filesystemRoot = path.parse(sourcePath).root;
	while (
		path.basename(sourcePath) !== version &&
		sourcePath !== filesystemRoot
	) {
		sourcePath = path.dirname(sourcePath);
	}
	if (path.basename(sourcePath) !== version) {
		throw new Error("Single-LUT package root cannot be resolved");
	}
	const packagePath = path.join(temporaryDirectory, "effect");
	await cp(sourcePath, packagePath, {
		recursive: true,
		errorOnExist: true,
		force: false,
	});
	const scriptPath = path.join(packagePath, SCRIPT_RELATIVE_PATH);
	let script: Buffer;
	try {
		script = await readFile(scriptPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { packagePath, bootstrap: "package-default" as const };
		}
		throw error;
	}
	const scriptSha256 = createHash("sha256").update(script).digest("hex");
	await writeFile(
		scriptPath,
		bootstrapSingleLutIntensity({ source: script.toString("utf8") }),
		{ mode: 0o600 }
	);
	return {
		packagePath,
		bootstrap: "injected-intensity" as const,
		scriptSha256,
	};
}

async function runCard({
	card,
	index,
	options,
	reference,
	runtime,
}: {
	card: JianyingFilterCatalogCard;
	index: number;
	options: NativeSingleLutOptions;
	reference: Awaited<ReturnType<typeof listJianyingLutReferences>>[number];
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
}): Promise<NativeSingleLutResult> {
	const version = cardVersion({ card });
	const stem = caseStem({ index, resourceId: card.resourceId });
	const temporaryDirectory = await mkdtemp(
		path.join(tmpdir(), "qcut-native-single-lut-")
	);
	let host: Awaited<ReturnType<typeof startJianyingFilterHostProcess>> | null =
		null;
	try {
		if (
			runtime.status.state !== "ready" ||
			!runtime.bridgePath ||
			!runtime.effectLibraryPath ||
			!runtime.frameworkDirectory ||
			!runtime.modelDirectory
		) {
			throw new Error(runtime.status.message);
		}
		const { bootstrap, packagePath, scriptSha256 } = await prepareOraclePackage(
			{
				card,
				reference,
				temporaryDirectory,
			}
		);
		const firstPpm = path.join(temporaryDirectory, "first.ppm");
		const secondPpm = path.join(temporaryDirectory, "second.ppm");
		const bootstrapOutputPath = path.join(temporaryDirectory, "bootstrap.ppm");
		const initializedAt = performance.now();
		host = await startJianyingFilterHostProcess({
			bridgePath: runtime.bridgePath,
			effectLibraryPath: runtime.effectLibraryPath,
			frameworkDirectory: runtime.frameworkDirectory,
			modelDirectory: runtime.modelDirectory,
			packagePath,
			bootstrapInputPath: options.sourcePath,
			bootstrapOutputPath,
			skipAlgorithm: true,
			captureMask: false,
		});
		const initializedMs = performance.now() - initializedAt;
		const firstAt = performance.now();
		await host.render({
			requestId: "first",
			timestampSeconds: 0,
			inputPath: options.sourcePath,
			outputPath: firstPpm,
		});
		const firstFrameMs = performance.now() - firstAt;
		const secondAt = performance.now();
		await host.render({
			requestId: "second",
			timestampSeconds: 1 / 30,
			inputPath: options.sourcePath,
			outputPath: secondPpm,
		});
		const secondFrameMs = performance.now() - secondAt;
		const [firstBytes, secondBytes] = await Promise.all([
			readFile(firstPpm),
			readFile(secondPpm),
		]);
		const oraclePath = path.join(options.runDirectory, "oracle", `${stem}.png`);
		const qcutPath = path.join(options.runDirectory, "qcut", `${stem}.png`);
		await Promise.all([
			renderPng({ inputPath: secondPpm, outputPath: oraclePath }),
			renderQcutLut({
				card,
				outputPath: qcutPath,
				reference,
				sourcePath: options.sourcePath,
			}),
		]);
		const verification = await verifyFilterLabParity({
			input: { referenceFrame: oraclePath, candidateFrame: qcutPath },
		});
		return {
			status: "ok",
			resourceId: card.resourceId,
			version,
			title: card.title,
			categories: card.categories,
			bootstrap,
			...(scriptSha256 ? { scriptSha256 } : {}),
			processId: host.pid,
			initializedMs,
			firstFrameMs,
			secondFrameMs,
			deterministic: firstBytes.equals(secondBytes),
			verification,
		};
	} catch (cause) {
		return {
			status: "error",
			resourceId: card.resourceId,
			version,
			title: card.title,
			error: cause instanceof Error ? cause.message : String(cause),
		};
	} finally {
		await host?.dispose().catch(() => undefined);
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

async function saveResults({
	index,
	results,
}: {
	index: number;
	results: NativeSingleLutResult[];
}): Promise<void> {
	const result = results[index];
	if (!result) return;
	// Package-default runs render the oracle at an unpinned intensity while the
	// QCut candidate uses intensity 100, so only injected-intensity results
	// qualify as persisted native-oracle evidence; package-default results stay
	// visible in report.json/report.md.
	if (result.status === "ok" && result.bootstrap === "injected-intensity") {
		await saveJianyingFilterVerification({
			record: {
				resourceId: result.resourceId,
				version: result.version,
				referenceKind: "native-oracle",
				...result.verification,
			},
		});
	}
	return saveResults({ index: index + 1, results });
}

function markdownReport({ results }: { results: NativeSingleLutResult[] }) {
	const successful = results.filter(
		(result): result is NativeSingleLutSuccess => result.status === "ok"
	);
	const counts = Object.fromEntries(
		["verified", "close", "unverified"].map((status) => [
			status,
			successful.filter((result) => result.verification.status === status)
				.length,
		])
	);
	return `${[
		"# Native single-LUT parity",
		"",
		`Cards: ${results.length}; verified: ${counts.verified}; close: ${counts.close}; unverified: ${counts.unverified}; errors: ${results.length - successful.length}.`,
		"",
		"| # | Filter | Status | RMSE | SSIM | DeltaE | Deterministic |",
		"|---:|---|---|---:|---:|---:|---|",
		...results.map((result, index) =>
			result.status === "ok"
				? `| ${index + 1} | ${result.title} | ${result.verification.status} | ${result.verification.rgbRmse} | ${result.verification.ssim} | ${result.verification.deltaE} | ${result.deterministic} |`
				: `| ${index + 1} | ${result.title} | error | - | - | - | ${result.error.replace(/\|/g, "\\|")} |`
		),
		"",
	].join("\n")}\n`;
}

export async function runNativeSingleLutParity({
	options,
}: {
	options: NativeSingleLutOptions;
}) {
	const fixtureDirectory = path.join(options.runDirectory, "fixture");
	const nativeSourcePath = path.join(fixtureDirectory, "source.ppm");
	await Promise.all([
		readFile(options.sourcePath),
		mkdir(path.join(options.runDirectory, "oracle"), { recursive: true }),
		mkdir(path.join(options.runDirectory, "qcut"), { recursive: true }),
		mkdir(fixtureDirectory, { recursive: true }),
	]);
	await renderNativeSource({
		inputPath: options.sourcePath,
		outputPath: nativeSourcePath,
	});
	const [catalog, references, runtime] = await Promise.all([
		exportCatalogDefault(),
		listJianyingLutReferences(),
		inspectJianyingFilterLocalRuntime({ refresh: true }),
	]);
	const availableCards = catalog.cards
		.filter(
			(card) =>
				card.implementation === "single-lut" &&
				card.cacheStatus === "cached" &&
				card.available &&
				Boolean(card.version)
		)
		.sort((left, right) => left.resourceId.localeCompare(right.resourceId));
	if (options.resourceIds) {
		const availableIds = new Set(
			availableCards.map(({ resourceId }) => resourceId)
		);
		const missing = options.resourceIds.filter(
			(resourceId) => !availableIds.has(resourceId)
		);
		if (missing.length > 0) {
			throw new Error(
				`Requested single-LUT cards are unavailable: ${missing.join(", ")}`
			);
		}
	}
	const selectedCards = options.resourceIds
		? availableCards.filter(({ resourceId }) =>
				options.resourceIds?.includes(resourceId)
			)
		: availableCards;
	const cards = options.limit
		? selectedCards.slice(0, options.limit)
		: selectedCards;
	const referenceByCard = new Map(
		references.map((reference) => [
			`${reference.resourceId}/${reference.version}`,
			reference,
		])
	);
	const results = await mapWithConcurrency({
		items: cards,
		limit: options.concurrency,
		task: async ({ item: card, index }) => {
			const version = cardVersion({ card });
			const reference = referenceByCard.get(`${card.resourceId}/${version}`);
			if (!reference) {
				return {
					status: "error" as const,
					resourceId: card.resourceId,
					version,
					title: card.title,
					error: "Single-LUT reference is missing",
				};
			}
			const result = await runCard({
				card,
				index,
				options: { ...options, sourcePath: nativeSourcePath },
				reference,
				runtime,
			});
			console.log(
				`[${index + 1}/${cards.length}] ${card.title}: ${result.status === "ok" ? result.verification.status : result.error}`
			);
			return result;
		},
	});
	if (options.persist) await saveResults({ index: 0, results });
	const report = {
		generatedAt: new Date().toISOString(),
		provider: "jianying-local-effect-v1",
		concurrency: options.concurrency,
		persisted: options.persist,
		runtime: runtime.status,
		results,
	};
	await Promise.all([
		writeFile(
			path.join(options.runDirectory, "report.json"),
			`${JSON.stringify(report, null, 2)}\n`
		),
		writeFile(
			path.join(options.runDirectory, "report.md"),
			markdownReport({ results })
		),
	]);
	return report;
}

if (import.meta.main) {
	const options = parseNativeSingleLutArgs({ argv: process.argv.slice(2) });
	await runNativeSingleLutParity({ options });
}
