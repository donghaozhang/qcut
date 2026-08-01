import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { measureSourceAudioTones } from "./audio-tone-evidence.js";
import {
	type FontCoverageAssertion,
	type FontGlyphCoverageReport,
	loadJianyingFontCoverageAssertion,
} from "./font-coverage-contract.js";
import {
	buildCjkProofArgs,
	buildFrameExtractionArgs,
	buildSourceAudioArgs,
	buildSourceVideoArgs,
} from "./ffmpeg-args.js";
import {
	buildSourceFrameCalibrationReport,
	describeArtifacts,
	describeFontFiles,
	type CapCutE2eManifest,
	validateSourceAudioProbe,
	validateSourceVideoProbe,
	writeManifest,
} from "./manifest.js";
import {
	getBundledTargetKey,
	probeMedia,
	requireBundledToolVersion,
	resolveBundledToolPath,
	runFfmpeg,
	sha256File,
} from "./runtime.js";
import {
	CAPCUT_E2E_FIXTURE_SPEC,
	getAsciiFixtureText,
	validateFixtureSpec,
} from "./spec.js";

const PROJECT_ROOT = resolve(process.cwd());
const RUNS_ROOT = join(PROJECT_ROOT, ".tmp", "capcut-e2e", "runs");
const DEFAULT_MACOS_CJK_FONT =
	"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/zh-hans.ttf";
const ASCII_FONT_BY_PLATFORM: Record<string, string> = {
	darwin: "/System/Library/Fonts/Supplemental/Arial.ttf",
	linux: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
	win32: "C:\\Windows\\Fonts\\arial.ttf",
};

type FfmpegRunner = typeof runFfmpeg;

export interface FixtureFontPaths {
	ascii: string;
	cjk: string;
}

export interface FixtureFontReports {
	ascii: FontGlyphCoverageReport;
	cjk: FontGlyphCoverageReport;
}

interface GeneratedDrawtextArtifacts extends FixtureFontReports {
	fontSha256: { ascii: string; cjk: string };
}

export interface GenerateFixtureResult {
	manifest: CapCutE2eManifest;
	manifestPath: string;
	runDirectory: string;
}

function requireAbsoluteOverride({
	label,
	value,
}: {
	label: string;
	value: string;
}): string {
	if (!isAbsolute(value)) {
		throw new Error(`${label} must be an absolute path.`);
	}
	return value;
}

export function resolveFixtureFontPaths({
	environment = process.env,
	platform = process.platform,
}: {
	environment?: NodeJS.ProcessEnv;
	platform?: string;
} = {}): FixtureFontPaths {
	const asciiOverride = environment.QCUT_CAPCUT_E2E_ASCII_FONT?.trim();
	const cjkOverride = environment.QCUT_CAPCUT_E2E_CJK_FONT?.trim();
	const defaultAsciiFont = ASCII_FONT_BY_PLATFORM[platform];
	if (!asciiOverride && !defaultAsciiFont) {
		throw new Error(
			`Set QCUT_CAPCUT_E2E_ASCII_FONT for unsupported platform ${platform}.`
		);
	}
	if (!cjkOverride && platform !== "darwin") {
		throw new Error(
			"Set QCUT_CAPCUT_E2E_CJK_FONT to a full Simplified Chinese font on this platform."
		);
	}
	return {
		ascii: asciiOverride
			? requireAbsoluteOverride({
					label: "QCUT_CAPCUT_E2E_ASCII_FONT",
					value: asciiOverride,
				})
			: (defaultAsciiFont as string),
		cjk: cjkOverride
			? requireAbsoluteOverride({
					label: "QCUT_CAPCUT_E2E_CJK_FONT",
					value: cjkOverride,
				})
			: DEFAULT_MACOS_CJK_FONT,
	};
}

export async function generateDrawtextArtifacts({
	assertCoverage,
	ffmpegPath,
	fontPaths,
	hashFile = sha256File,
	outputPaths,
	run = runFfmpeg,
}: {
	assertCoverage: FontCoverageAssertion;
	ffmpegPath: string;
	fontPaths: FixtureFontPaths;
	hashFile?: typeof sha256File;
	outputPaths: { cjkProof: string; sourceVideo: string };
	run?: FfmpegRunner;
}): Promise<GeneratedDrawtextArtifacts> {
	// Both checks complete before either drawtext process is allowed to start.
	const [asciiInitialSha256, cjkInitialSha256] = await Promise.all([
		hashFile({ filePath: fontPaths.ascii }),
		hashFile({ filePath: fontPaths.cjk }),
	]);
	const [ascii, cjk] = await Promise.all([
		assertCoverage({
			fontPath: fontPaths.ascii,
			text: getAsciiFixtureText(),
		}),
		assertCoverage({
			fontPath: fontPaths.cjk,
			text: CAPCUT_E2E_FIXTURE_SPEC.cjkProofText,
		}),
	]);
	if ((await hashFile({ filePath: fontPaths.ascii })) !== asciiInitialSha256) {
		throw new Error("ASCII font changed between cmap coverage and drawtext.");
	}
	await run({
		args: buildSourceVideoArgs({
			asciiFontPath: fontPaths.ascii,
			outputPath: outputPaths.sourceVideo,
		}),
		ffmpegPath,
	});
	if ((await hashFile({ filePath: fontPaths.ascii })) !== asciiInitialSha256) {
		throw new Error("ASCII font changed while drawtext was rendering.");
	}
	if ((await hashFile({ filePath: fontPaths.cjk })) !== cjkInitialSha256) {
		throw new Error("CJK font changed between cmap coverage and drawtext.");
	}
	await run({
		args: buildCjkProofArgs({
			cjkFontPath: fontPaths.cjk,
			outputPath: outputPaths.cjkProof,
		}),
		ffmpegPath,
	});
	if ((await hashFile({ filePath: fontPaths.cjk })) !== cjkInitialSha256) {
		throw new Error("CJK font changed while drawtext was rendering.");
	}
	return {
		ascii,
		cjk,
		fontSha256: { ascii: asciiInitialSha256, cjk: cjkInitialSha256 },
	};
}

function createRunId(): string {
	return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function validateRunId({ runId }: { runId: string }): void {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) {
		throw new Error(
			"Run ID must use 1-128 ASCII letters, digits, dots, underscores, or hyphens."
		);
	}
}

export function parseRunId({ args }: { args: string[] }): string {
	if (args.length === 0) return createRunId();
	if (args.length !== 2 || args[0] !== "--run-id" || !args[1]) {
		throw new Error(
			"Usage: bun scripts/capcut-e2e/generate.ts [--run-id <id>]"
		);
	}
	validateRunId({ runId: args[1] });
	return args[1];
}

export async function generateCapCutE2eFixture({
	runId,
}: {
	runId: string;
}): Promise<GenerateFixtureResult> {
	validateRunId({ runId });
	validateFixtureSpec();
	const targetKey = getBundledTargetKey();
	const [ffmpegPath, ffprobePath] = await Promise.all([
		resolveBundledToolPath({
			projectRoot: PROJECT_ROOT,
			targetKey,
			tool: "ffmpeg",
		}),
		resolveBundledToolPath({
			projectRoot: PROJECT_ROOT,
			targetKey,
			tool: "ffprobe",
		}),
	]);
	const [ffmpeg, ffprobe] = await Promise.all([
		requireBundledToolVersion({ tool: "ffmpeg", toolPath: ffmpegPath }),
		requireBundledToolVersion({ tool: "ffprobe", toolPath: ffprobePath }),
	]);
	const assertCoverage = await loadJianyingFontCoverageAssertion({
		projectRoot: PROJECT_ROOT,
	});

	await mkdir(RUNS_ROOT, { recursive: true });
	const runDirectory = join(RUNS_ROOT, runId);
	await mkdir(runDirectory);
	const names = CAPCUT_E2E_FIXTURE_SPEC.fileNames;
	const outputPaths = {
		calibrationOrdinalAdjacent: join(
			runDirectory,
			names.calibrationOrdinalAdjacent
		),
		calibrationOrdinalReference: join(
			runDirectory,
			names.calibrationOrdinalReference
		),
		calibrationRoiAAdjacent: join(runDirectory, names.calibrationRoiAAdjacent),
		calibrationRoiAEnd: join(runDirectory, names.calibrationRoiAEnd),
		calibrationRoiAReference: join(
			runDirectory,
			names.calibrationRoiAReference
		),
		calibrationRoiASeam: join(runDirectory, names.calibrationRoiASeam),
		calibrationRoiAStart: join(runDirectory, names.calibrationRoiAStart),
		calibrationRoiBAdjacent: join(runDirectory, names.calibrationRoiBAdjacent),
		calibrationRoiBEnd: join(runDirectory, names.calibrationRoiBEnd),
		calibrationRoiBReference: join(
			runDirectory,
			names.calibrationRoiBReference
		),
		calibrationRoiBSeam: join(runDirectory, names.calibrationRoiBSeam),
		calibrationRoiBStart: join(runDirectory, names.calibrationRoiBStart),
		cjkProof: join(runDirectory, names.cjkProof),
		manifest: join(runDirectory, names.manifest),
		sourceAudio: join(runDirectory, names.sourceAudio),
		sourceFrameA: join(runDirectory, names.sourceFrameA),
		sourceFrameB: join(runDirectory, names.sourceFrameB),
		sourceVideo: join(runDirectory, names.sourceVideo),
	};
	const fontPaths = resolveFixtureFontPaths();
	const { fontSha256, ...fontReports } = await generateDrawtextArtifacts({
		assertCoverage,
		ffmpegPath,
		fontPaths,
		outputPaths,
	});
	await runFfmpeg({
		args: buildSourceAudioArgs({ outputPath: outputPaths.sourceAudio }),
		ffmpegPath,
	});
	const calibration = CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration;
	const calibrationExtractions = [
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipAFrameIndices[0],
			outputPath: outputPaths.calibrationRoiAStart,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipAFrameIndices[1],
			outputPath: outputPaths.calibrationRoiAReference,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipAFrameIndices[2],
			outputPath: outputPaths.calibrationRoiAAdjacent,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipAFrameIndices[3],
			outputPath: outputPaths.calibrationRoiASeam,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipAFrameIndices[4],
			outputPath: outputPaths.calibrationRoiAEnd,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipBFrameIndices[0],
			outputPath: outputPaths.calibrationRoiBStart,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipBFrameIndices[1],
			outputPath: outputPaths.calibrationRoiBSeam,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipBFrameIndices[2],
			outputPath: outputPaths.calibrationRoiBReference,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipBFrameIndices[3],
			outputPath: outputPaths.calibrationRoiBAdjacent,
		},
		{
			cropRegion: calibration.comparisonRoi,
			frameIndex: calibration.invarianceSamples.clipBFrameIndices[4],
			outputPath: outputPaths.calibrationRoiBEnd,
		},
		{
			cropRegion: calibration.ordinalStrip,
			frameIndex: calibration.invarianceSamples.ordinalFrameIndices[0],
			outputPath: outputPaths.calibrationOrdinalReference,
		},
		{
			cropRegion: calibration.ordinalStrip,
			frameIndex: calibration.invarianceSamples.ordinalFrameIndices[1],
			outputPath: outputPaths.calibrationOrdinalAdjacent,
		},
	];
	await Promise.all([
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: calibration.sourceFrameAIndex,
				inputPath: outputPaths.sourceVideo,
				outputPath: outputPaths.sourceFrameA,
			}),
			ffmpegPath,
		}),
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: calibration.sourceFrameBIndex,
				inputPath: outputPaths.sourceVideo,
				outputPath: outputPaths.sourceFrameB,
			}),
			ffmpegPath,
		}),
		...calibrationExtractions.map(({ cropRegion, frameIndex, outputPath }) =>
			runFfmpeg({
				args: buildFrameExtractionArgs({
					cropRegion,
					frameIndex,
					inputPath: outputPaths.sourceVideo,
					outputPath,
				}),
				ffmpegPath,
			})
		),
	]);
	const [sourceAudio, sourceVideo, audioToneEvidence] = await Promise.all([
		probeMedia({
			ffprobePath,
			mediaPath: outputPaths.sourceAudio,
		}),
		probeMedia({
			ffprobePath,
			mediaPath: outputPaths.sourceVideo,
		}),
		measureSourceAudioTones({
			ffmpegPath,
			mediaPath: outputPaths.sourceAudio,
		}),
	]);
	validateSourceVideoProbe({
		probe: sourceVideo,
		spec: CAPCUT_E2E_FIXTURE_SPEC,
	});
	validateSourceAudioProbe({
		probe: sourceAudio,
		spec: CAPCUT_E2E_FIXTURE_SPEC,
	});
	const [artifacts, fontFiles] = await Promise.all([
		describeArtifacts({
			filePaths: [
				outputPaths.calibrationOrdinalAdjacent,
				outputPaths.calibrationOrdinalReference,
				outputPaths.calibrationRoiAAdjacent,
				outputPaths.calibrationRoiAEnd,
				outputPaths.calibrationRoiAReference,
				outputPaths.calibrationRoiASeam,
				outputPaths.calibrationRoiAStart,
				outputPaths.calibrationRoiBAdjacent,
				outputPaths.calibrationRoiBEnd,
				outputPaths.calibrationRoiBReference,
				outputPaths.calibrationRoiBSeam,
				outputPaths.calibrationRoiBStart,
				outputPaths.cjkProof,
				outputPaths.sourceAudio,
				outputPaths.sourceFrameA,
				outputPaths.sourceFrameB,
				outputPaths.sourceVideo,
			],
		}),
		describeFontFiles({ fontPaths }),
	]);
	if (
		fontFiles.ascii.sha256 !== fontSha256.ascii ||
		fontFiles.cjk.sha256 !== fontSha256.cjk
	) {
		throw new Error("Fixture fonts changed after drawtext rendering.");
	}
	const manifest: CapCutE2eManifest = {
		artifacts,
		audioToneEvidence,
		createdAt: new Date().toISOString(),
		ffmpeg,
		ffprobe: { ...ffprobe, sourceAudio, sourceVideo },
		fontFiles,
		fontReports,
		runId,
		schemaVersion: 2,
		sourceFrameCalibration: buildSourceFrameCalibrationReport({ artifacts }),
		spec: CAPCUT_E2E_FIXTURE_SPEC,
		targetKey,
	};
	await writeManifest({ manifest, manifestPath: outputPaths.manifest });
	return {
		manifest,
		manifestPath: outputPaths.manifest,
		runDirectory,
	};
}

async function main(): Promise<void> {
	try {
		const result = await generateCapCutE2eFixture({
			runId: parseRunId({ args: process.argv.slice(2) }),
		});
		process.stdout.write(
			`${JSON.stringify(
				{
					artifacts: result.manifest.artifacts,
					manifestPath: result.manifestPath,
					runDirectory: result.runDirectory,
					targetKey: result.manifest.targetKey,
				},
				null,
				2
			)}\n`
		);
	} catch (error: unknown) {
		process.stderr.write(
			`[capcut-e2e] ${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	PROJECT_ROOT,
	"scripts",
	"capcut-e2e",
	"generate.ts"
);
if (entryPath === expectedEntryPath) {
	void main();
}
