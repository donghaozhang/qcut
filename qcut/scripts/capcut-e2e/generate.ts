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
	outputPaths,
	run = runFfmpeg,
}: {
	assertCoverage: FontCoverageAssertion;
	ffmpegPath: string;
	fontPaths: FixtureFontPaths;
	outputPaths: { cjkProof: string; sourceVideo: string };
	run?: FfmpegRunner;
}): Promise<FixtureFontReports> {
	// Both checks complete before either drawtext process is allowed to start.
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
	await run({
		args: buildSourceVideoArgs({
			asciiFontPath: fontPaths.ascii,
			outputPath: outputPaths.sourceVideo,
		}),
		ffmpegPath,
	});
	await run({
		args: buildCjkProofArgs({
			cjkFontPath: fontPaths.cjk,
			outputPath: outputPaths.cjkProof,
		}),
		ffmpegPath,
	});
	return { ascii, cjk };
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
		cjkProof: join(runDirectory, names.cjkProof),
		manifest: join(runDirectory, names.manifest),
		sourceAudio: join(runDirectory, names.sourceAudio),
		sourceFrameA: join(runDirectory, names.sourceFrameA),
		sourceFrameB: join(runDirectory, names.sourceFrameB),
		sourceVideo: join(runDirectory, names.sourceVideo),
	};
	const fontPaths = resolveFixtureFontPaths();
	const fontReports = await generateDrawtextArtifacts({
		assertCoverage,
		ffmpegPath,
		fontPaths,
		outputPaths,
	});
	await runFfmpeg({
		args: buildSourceAudioArgs({ outputPath: outputPaths.sourceAudio }),
		ffmpegPath,
	});
	const framesPerClip =
		CAPCUT_E2E_FIXTURE_SPEC.clipDurationSeconds * CAPCUT_E2E_FIXTURE_SPEC.fps;
	await Promise.all([
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: Math.floor(framesPerClip / 2),
				inputPath: outputPaths.sourceVideo,
				outputPath: outputPaths.sourceFrameA,
			}),
			ffmpegPath,
		}),
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: framesPerClip + Math.floor(framesPerClip / 2),
				inputPath: outputPaths.sourceVideo,
				outputPath: outputPaths.sourceFrameB,
			}),
			ffmpegPath,
		}),
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
				outputPaths.cjkProof,
				outputPaths.sourceAudio,
				outputPaths.sourceFrameA,
				outputPaths.sourceFrameB,
				outputPaths.sourceVideo,
			],
		}),
		describeFontFiles({ fontPaths }),
	]);
	const manifest: CapCutE2eManifest = {
		artifacts,
		audioToneEvidence,
		createdAt: new Date().toISOString(),
		ffmpeg,
		ffprobe: { ...ffprobe, sourceAudio, sourceVideo },
		fontFiles,
		fontReports,
		runId,
		schemaVersion: 1,
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
