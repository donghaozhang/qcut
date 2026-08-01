import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
	getBundledTargetKey,
	requireBundledToolVersion,
	resolveBundledToolPath,
} from "./runtime.js";
import {
	deriveOverallVisualStatus,
	type VisualOracleManifest,
	type VisualSourceFrameCalibration,
	validateVisualOracleManifest,
	VISUAL_ORACLE_RMSE_THRESHOLD,
} from "./visual-contract.js";
import { buildDissolveSamples } from "./visual-dissolve.js";
import {
	createVisualOutputLayout,
	publishVisualOutput,
	removeVisualStaging,
} from "./visual-files.js";
import { buildDissolveFramePlan } from "./visual-frame-plan.js";
import { readVisualOracleInputs } from "./visual-input.js";
import {
	buildLutMaskResult,
	buildStickerReopenedAssetResult,
} from "./visual-observed-oracles.js";

const PROJECT_ROOT = resolve(process.cwd());
const RUNS_ROOT = join(PROJECT_ROOT, ".tmp", "capcut-e2e", "runs");
const DISSOLVE_DURATION_MICROSECONDS = 466_666;
const EXPECTED_MODEL_FPS = 30;
const EXPECTED_MODEL_FRAME_COUNT = 14;
const EXPECTED_SEAM_CANDIDATE_START_FRAME_INDEX = 83;

export interface DissolveIntervalCliInput {
	evidencePath: string;
	transitionFrameCount: number;
	transitionStartFrameIndex: number;
}

export interface VisualOracleCliOptions {
	allowUnverified: boolean;
	capturesDirectory: string | null;
	interval: DissolveIntervalCliInput | null;
	runId: string;
}

interface VisualToolchain {
	ffmpeg: Awaited<ReturnType<typeof requireBundledToolVersion>>;
	ffprobe: Awaited<ReturnType<typeof requireBundledToolVersion>>;
}

function validateRunId({ runId }: { runId: string }): void {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) {
		throw new Error("Visual oracle run ID contains unsafe characters.");
	}
}

function parseNonNegativeInteger({
	label,
	value,
}: {
	label: string;
	value: string;
}): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`${label} must be a non-negative integer.`);
	}
	return parsed;
}

function parsePositiveInteger({
	label,
	value,
}: {
	label: string;
	value: string;
}): number {
	const parsed = parseNonNegativeInteger({ label, value });
	if (parsed === 0) throw new Error(`${label} must be positive.`);
	return parsed;
}

export function parseVisualOracleArgs({
	args,
}: {
	args: string[];
}): VisualOracleCliOptions {
	let allowUnverified = false;
	let capturesDirectory: string | null = null;
	let intervalEvidencePath: string | null = null;
	let intervalFrameCount: number | null = null;
	let intervalStartFrameIndex: number | null = null;
	let runId = "";
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--allow-unverified") {
			allowUnverified = true;
			continue;
		}
		const value = args[index + 1];
		if (!value) throw new Error("Visual oracle option is missing its value.");
		if (argument === "--run-id") runId = value;
		else if (argument === "--captures") capturesDirectory = resolve(value);
		else if (argument === "--transition-interval-evidence") {
			intervalEvidencePath = resolve(value);
		} else if (argument === "--transition-start-frame-index") {
			intervalStartFrameIndex = parseNonNegativeInteger({
				label: "Transition start frame index",
				value,
			});
		} else if (argument === "--transition-frame-count") {
			intervalFrameCount = parsePositiveInteger({
				label: "Transition frame count",
				value,
			});
		} else {
			throw new Error(`Unknown visual oracle option: ${argument}`);
		}
		index += 1;
	}
	validateRunId({ runId });
	const intervalValues = [
		intervalEvidencePath,
		intervalFrameCount,
		intervalStartFrameIndex,
	];
	const intervalValueCount = intervalValues.filter(
		(value) => value !== null
	).length;
	if (
		intervalValueCount !== 0 &&
		intervalValueCount !== intervalValues.length
	) {
		throw new Error(
			"Transition interval evidence, start frame index, and frame count must be supplied together."
		);
	}
	if (intervalValueCount === intervalValues.length) {
		throw new Error(
			"Transition interval verification is disabled until numbered-export evidence has a strict parsed schema."
		);
	}
	return { allowUnverified, capturesDirectory, interval: null, runId };
}

async function resolveVisualToolchain(): Promise<{
	ffmpegPath: string;
	ffprobePath: string;
	toolchain: VisualToolchain;
}> {
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
	return { ffmpegPath, ffprobePath, toolchain: { ffmpeg, ffprobe } };
}

async function buildFramePlan({
	interval,
}: {
	interval: DissolveIntervalCliInput | null;
}): Promise<ReturnType<typeof buildDissolveFramePlan>> {
	if (interval) {
		throw new Error(
			"Programmatic transition interval verification is disabled until numbered-export evidence has a strict parsed schema."
		);
	}
	return buildDissolveFramePlan({
		fps: EXPECTED_MODEL_FPS,
		intervalEvidence: null,
		intervalReason:
			"No strictly parsed numbered Jianying export exists. Frames 84/87/91/94/97 are an expected seam candidate, not an observed transition interval.",
		intervalSource: "expected-seam-candidate",
		intervalStatus: "unverified",
		transitionDurationMicroseconds: DISSOLVE_DURATION_MICROSECONDS,
		transitionFrameCount: EXPECTED_MODEL_FRAME_COUNT,
		transitionStartFrameIndex: EXPECTED_SEAM_CANDIDATE_START_FRAME_INDEX,
	});
}

export async function generateVisualOracle({
	capturesDirectory,
	interval = null,
	runId,
}: {
	capturesDirectory?: string | null;
	interval?: DissolveIntervalCliInput | null;
	runId: string;
}): Promise<{ manifest: VisualOracleManifest; manifestPath: string }> {
	validateRunId({ runId });
	const runDirectory = join(RUNS_ROOT, runId);
	const [inputs, resolvedToolchain, framePlan] = await Promise.all([
		readVisualOracleInputs({ projectRoot: PROJECT_ROOT, runDirectory, runId }),
		resolveVisualToolchain(),
		buildFramePlan({ interval }),
	]);
	const { ffmpegPath, ffprobePath, toolchain } = resolvedToolchain;
	const sourceFrameCalibration: VisualSourceFrameCalibration = {
		...inputs.sourceFrameCalibration,
		fixtureSchemaVersion: 2,
		reason:
			"Fixture v2 uses temporally invariant asymmetric A/B plates. Frame ordinals 45/135 at 1.5s/4.5s are locked in the fixture manifest, and dissolve metrics exclude the dynamic ordinal strip.",
		status: "verified",
	};
	const layout = await createVisualOutputLayout({ runDirectory });
	try {
		await Promise.all([
			mkdir(join(layout.stagingDirectory, "dissolve")),
			mkdir(join(layout.stagingDirectory, "lut-mask")),
		]);
		const decodeDirectory = await mkdtemp(
			join(layout.stagingDirectory, ".decode-")
		);
		const resolvedCapturesDirectory =
			capturesDirectory ?? join(runDirectory, "visual-captures");
		const context = {
			capturesDirectory: resolvedCapturesDirectory,
			comparisonRoi: sourceFrameCalibration.comparisonRoi,
			decodeDirectory,
			ffmpegPath,
			ffprobePath,
			layout,
		};
		let dissolveSamples: VisualOracleManifest["dissolve"]["samples"];
		let lutMask: VisualOracleManifest["lutMask"];
		let sticker: VisualOracleManifest["sticker"];
		try {
			[dissolveSamples, lutMask, sticker] = await Promise.all([
				buildDissolveSamples({
					context,
					frameAPath: inputs.frameA.path,
					frameBPath: inputs.frameB.path,
					framePlan,
				}),
				buildLutMaskResult({ context, frameAPath: inputs.frameA.path }),
				buildStickerReopenedAssetResult({ context, source: inputs.sticker }),
			]);
		} finally {
			await rm(decodeDirectory, { force: true, recursive: true });
		}
		const dissolveStatus = deriveOverallVisualStatus({
			statuses: [
				...dissolveSamples.map(({ status }) => status),
				framePlan.intervalStatus,
				sourceFrameCalibration.status,
			],
		});
		const manifest: VisualOracleManifest = {
			capturesDirectory: resolvedCapturesDirectory,
			createdAt: new Date().toISOString(),
			dissolve: {
				framePlan,
				mixSpace: "encoded-rgb-0-255-linear-weight",
				rmseThreshold: VISUAL_ORACLE_RMSE_THRESHOLD,
				samples: dissolveSamples,
				sourceFrameCalibration,
				status: dissolveStatus,
			},
			lutMask,
			overallStatus: deriveOverallVisualStatus({
				statuses: [dissolveStatus, lutMask.status, sticker.status],
			}),
			runId,
			schemaVersion: 2,
			source: {
				bundleManifest: inputs.bundleManifest,
				fixtureManifest: inputs.fixtureManifest,
				frameA: inputs.frameA,
				frameB: inputs.frameB,
			},
			sticker,
			toolchain,
		};
		validateVisualOracleManifest({ manifest });
		const stagingManifestPath = join(layout.stagingDirectory, "manifest.json");
		await writeFile(
			stagingManifestPath,
			`${JSON.stringify(manifest, null, 2)}\n`,
			"utf8"
		);
		await publishVisualOutput({ layout });
		return {
			manifest,
			manifestPath: join(layout.finalDirectory, basename(stagingManifestPath)),
		};
	} catch (error: unknown) {
		await removeVisualStaging({ layout });
		throw error;
	}
}

async function main(): Promise<void> {
	try {
		const options = parseVisualOracleArgs({ args: process.argv.slice(2) });
		const result = await generateVisualOracle({
			capturesDirectory: options.capturesDirectory,
			interval: options.interval,
			runId: options.runId,
		});
		process.stdout.write(
			`${JSON.stringify(
				{
					intervalStatus: result.manifest.dissolve.framePlan.intervalStatus,
					manifestPath: result.manifestPath,
					overallStatus: result.manifest.overallStatus,
					samples: result.manifest.dissolve.samples.map(
						({ id, status, timelineFrameNumber }) => ({
							id,
							status,
							timelineFrameNumber,
						})
					),
					sourceFrameCalibrationStatus:
						result.manifest.dissolve.sourceFrameCalibration.status,
				},
				null,
				2
			)}\n`
		);
		if (result.manifest.overallStatus === "failed") process.exitCode = 1;
		if (
			result.manifest.overallStatus === "unverified" &&
			!options.allowUnverified
		) {
			process.exitCode = 2;
		}
	} catch (error: unknown) {
		process.stderr.write(
			`[capcut-e2e-visual] ${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	PROJECT_ROOT,
	"scripts",
	"capcut-e2e",
	"visual-oracle.ts"
);
if (entryPath === expectedEntryPath) void main();
