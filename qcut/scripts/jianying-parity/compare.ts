// Compares JianYing ground-truth exports against QCut renders for one parity
// case (L1) and writes an evidence receipt. Isolation discipline: the tested
// feature must visibly change the JianYing render (on vs off), and QCut's
// "on" render must sit much closer to JianYing-on than JianYing-off does —
// "the picture changed" alone proves nothing (the SSIM trap from the effect
// reference line).
//
//   bun scripts/jianying-parity/compare.ts --case transform-rotation
//
// Expects in .local/jianying-parity/cases/<case>/:
//   jianying-on.mp4  jianying-off.mp4  qcut-on.mp4  [qcut-off.mp4]

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	getBundledTargetKey,
	resolveBundledToolPath,
	runCommand,
} from "../capcut-e2e/runtime.js";
import { getParityCase, PARITY_FPS } from "./draft-case.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKSPACE = join(REPO_ROOT, ".local/jianying-parity");
/**
 * Default sampled frame ordinals, chosen away from first/last-frame edge
 * effects. Cases with a narrow active window (transitions) override these
 * via ParityCase.sampleFractions.
 */
const SAMPLE_FRACTIONS = [0.15, 0.35, 0.5, 0.65, 0.85] as const;
/** JY on-vs-off mean RMSE below this = the feature never rendered. */
const ISOLATION_MIN_RMSE = 2;
/**
 * Codec-noise cap: qcut-off vs jianying-off measures the two pipelines'
 * irreducible re-encode floor (calibrated 2026-08-19 at ~8.5 on the
 * synthetic plate — sharp saturated edges are a codec worst case).
 */
const BASELINE_MAX_RMSE = 12;
/**
 * The parity residual beyond the codec floor must stay a small fraction of
 * the feature's own visual magnitude: parity ≤ baseline + this × isolation.
 * Without a qcut-off baseline the floor term falls back to BASELINE_MAX_RMSE.
 */
const PARITY_RESIDUAL_MAX_RATIO = 0.15;
/** Parity distance must be at most this fraction of the isolation distance. */
const CONTRAST_MAX_RATIO = 0.5;

interface PairMetrics {
	perFrameRmse: number[];
	meanRmse: number;
}

function parseArgs() {
	const argv = process.argv.slice(2);
	let caseId = "";
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--case") {
			caseId = argv[index + 1] ?? "";
			index += 1;
		} else {
			throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!caseId) {
		throw new Error(
			"Usage: bun scripts/jianying-parity/compare.ts --case <id>"
		);
	}
	return { caseId: getParityCase({ caseId }).id };
}

async function probeVideo({
	ffprobePath,
	videoPath,
}: {
	ffprobePath: string;
	videoPath: string;
}) {
	const { stdout } = await runCommand({
		command: ffprobePath,
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,nb_frames,duration",
			"-of",
			"json",
			videoPath,
		],
	});
	const stream = (JSON.parse(stdout).streams ?? [])[0] as
		| { width: number; height: number; nb_frames?: string; duration?: string }
		| undefined;
	if (!stream) throw new Error(`No video stream in ${videoPath}`);
	// nb_frames can be "N/A"; durations can be missing. Use each source only
	// when it yields a finite, positive count — sampling with NaN/0 ordinals
	// would silently hand FFmpeg garbage select expressions.
	const nbFrames = Number(stream.nb_frames);
	const durationFrames = Math.floor(Number(stream.duration) * PARITY_FPS);
	const frameCount =
		Number.isFinite(nbFrames) && nbFrames > 0
			? nbFrames
			: Number.isFinite(durationFrames) && durationFrames > 0
				? durationFrames
				: 0;
	if (
		frameCount <= 0 ||
		!Number.isFinite(stream.width) ||
		!Number.isFinite(stream.height) ||
		stream.width <= 0 ||
		stream.height <= 0
	) {
		throw new Error(`No usable frame count or dimensions in ${videoPath}`);
	}
	return { width: stream.width, height: stream.height, frameCount };
}

async function extractFrame({
	ffmpegPath,
	videoPath,
	frameOrdinal,
	width,
	height,
	outputPath,
}: {
	ffmpegPath: string;
	videoPath: string;
	frameOrdinal: number;
	width: number;
	height: number;
	outputPath: string;
}) {
	await runCommand({
		command: ffmpegPath,
		args: [
			"-y",
			"-i",
			videoPath,
			"-vf",
			// Force one colorimetry interpretation before RGB conversion:
			// JianYing tags bt709 while QCut exports untagged, but both carry
			// the same YUV content — without this the extractor decodes them
			// with different matrices and manufactures a constant ~17 RMSE
			// floor on saturated colors.
			`setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,select=eq(n\\,${frameOrdinal}),scale=${width}:${height}`,
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			outputPath,
		],
	});
}

function rmseBetween({ left, right }: { left: Buffer; right: Buffer }) {
	if (left.length !== right.length || left.length === 0) {
		throw new Error(
			`Frame byte mismatch: ${left.length} vs ${right.length} bytes`
		);
	}
	let sum = 0;
	for (let index = 0; index < left.length; index += 1) {
		const delta = left[index] - right[index];
		sum += delta * delta;
	}
	return Math.sqrt(sum / left.length);
}

async function compareVideos({
	ffmpegPath,
	label,
	leftPath,
	rightPath,
	sampleOrdinals,
	width,
	height,
	temporaryDirectory,
}: {
	ffmpegPath: string;
	label: string;
	leftPath: string;
	rightPath: string;
	sampleOrdinals: number[];
	width: number;
	height: number;
	temporaryDirectory: string;
}): Promise<PairMetrics> {
	const perFrameRmse: number[] = [];
	for (const ordinal of sampleOrdinals) {
		const leftFrame = join(temporaryDirectory, `${label}-${ordinal}-left.rgb`);
		const rightFrame = join(
			temporaryDirectory,
			`${label}-${ordinal}-right.rgb`
		);
		await extractFrame({
			ffmpegPath,
			videoPath: leftPath,
			frameOrdinal: ordinal,
			width,
			height,
			outputPath: leftFrame,
		});
		await extractFrame({
			ffmpegPath,
			videoPath: rightPath,
			frameOrdinal: ordinal,
			width,
			height,
			outputPath: rightFrame,
		});
		perFrameRmse.push(
			rmseBetween({
				left: await readFile(leftFrame),
				right: await readFile(rightFrame),
			})
		);
	}
	const meanRmse =
		perFrameRmse.reduce((sum, value) => sum + value, 0) / perFrameRmse.length;
	return { perFrameRmse, meanRmse };
}

async function main() {
	const { caseId } = parseArgs();
	const caseDirectory = join(WORKSPACE, "cases", caseId);
	const videos = {
		jianyingOn: join(caseDirectory, "jianying-on.mp4"),
		jianyingOff: join(caseDirectory, "jianying-off.mp4"),
		qcutOn: join(caseDirectory, "qcut-on.mp4"),
		qcutOff: join(caseDirectory, "qcut-off.mp4"),
	};
	const required = [videos.jianyingOn, videos.jianyingOff, videos.qcutOn];
	const missing = required.filter((videoPath) => !existsSync(videoPath));
	if (missing.length > 0) {
		throw new Error(
			`缺少比对视频(先按 build-case 输出的流程导出):\n${missing.join("\n")}`
		);
	}
	const hasQcutOff = existsSync(videos.qcutOff);

	const ffmpegPath = await resolveBundledToolPath({
		projectRoot: REPO_ROOT,
		targetKey: getBundledTargetKey(),
		tool: "ffmpeg",
	});
	const ffprobePath = await resolveBundledToolPath({
		projectRoot: REPO_ROOT,
		targetKey: getBundledTargetKey(),
		tool: "ffprobe",
	});
	// Probe every video, not just the reference: extractFrame rescales its
	// input to the reference dimensions, so a wrong-sized export would
	// otherwise be silently stretched into a passing comparison.
	const probes: Record<
		string,
		{ width: number; height: number; frameCount: number }
	> = {};
	for (const [label, videoPath] of Object.entries(videos)) {
		if (!existsSync(videoPath)) continue;
		probes[label] = await probeVideo({ ffprobePath, videoPath });
	}
	const reference = probes.jianyingOn;
	for (const [label, probe] of Object.entries(probes)) {
		if (
			probe.width !== reference.width ||
			probe.height !== reference.height ||
			Math.abs(probe.frameCount - reference.frameCount) > 1
		) {
			throw new Error(
				`视频参数不一致,拒绝比对:${label} ${probe.width}x${probe.height}/${probe.frameCount}帧 ` +
					`vs 参照 ${reference.width}x${reference.height}/${reference.frameCount}帧`
			);
		}
	}
	const sampleFractions =
		getParityCase({ caseId }).sampleFractions ?? SAMPLE_FRACTIONS;
	const sampleOrdinals = sampleFractions.map((fraction) =>
		Math.max(
			0,
			Math.min(
				reference.frameCount - 1,
				Math.round(reference.frameCount * fraction)
			)
		)
	);

	const temporaryDirectory = await mkdtemp(join(tmpdir(), "jy-parity-"));
	try {
		const isolation = await compareVideos({
			ffmpegPath,
			label: "isolation",
			leftPath: videos.jianyingOn,
			rightPath: videos.jianyingOff,
			sampleOrdinals,
			width: reference.width,
			height: reference.height,
			temporaryDirectory,
		});
		const parity = await compareVideos({
			ffmpegPath,
			label: "parity",
			leftPath: videos.qcutOn,
			rightPath: videos.jianyingOn,
			sampleOrdinals,
			width: reference.width,
			height: reference.height,
			temporaryDirectory,
		});
		const crossCheck = await compareVideos({
			ffmpegPath,
			label: "cross",
			leftPath: videos.qcutOn,
			rightPath: videos.jianyingOff,
			sampleOrdinals,
			width: reference.width,
			height: reference.height,
			temporaryDirectory,
		});
		const baseline = hasQcutOff
			? await compareVideos({
					ffmpegPath,
					label: "baseline",
					leftPath: videos.qcutOff,
					rightPath: videos.jianyingOff,
					sampleOrdinals,
					width: reference.width,
					height: reference.height,
					temporaryDirectory,
				})
			: null;

		const noiseFloor = baseline?.meanRmse ?? BASELINE_MAX_RMSE;
		const parityCeiling =
			noiseFloor + PARITY_RESIDUAL_MAX_RATIO * isolation.meanRmse;
		const checks = {
			isolationRenders: isolation.meanRmse >= ISOLATION_MIN_RMSE,
			parityWithinThreshold: parity.meanRmse <= parityCeiling,
			parityBeatsCross:
				parity.meanRmse <= crossCheck.meanRmse * CONTRAST_MAX_RATIO,
			...(baseline === null
				? {}
				: { baselineWithinThreshold: baseline.meanRmse <= BASELINE_MAX_RMSE }),
		};
		const verdict = Object.values(checks).every(Boolean) ? "pass" : "fail";
		const receipt = {
			schema: "qcut.jianying-parity.receipt/1",
			caseId,
			generatedAt: new Date().toISOString(),
			groundTruthNote:
				"exported by locally installed JianyingPro (see build-case output for version caveat)",
			sampleOrdinals,
			/** Validated per-video metadata — extraction refuses mismatches. */
			videos: probes,
			thresholds: {
				isolationMinRmse: ISOLATION_MIN_RMSE,
				baselineMaxRmse: BASELINE_MAX_RMSE,
				parityResidualMaxRatio: PARITY_RESIDUAL_MAX_RATIO,
				parityCeiling,
				contrastMaxRatio: CONTRAST_MAX_RATIO,
			},
			metrics: {
				isolation,
				parity,
				crossCheck,
				...(baseline === null ? {} : { baseline }),
			},
			checks,
			verdict,
		};
		const receiptPath = join(caseDirectory, "receipt.json");
		await writeFile(
			receiptPath,
			`${JSON.stringify(receipt, null, "\t")}\n`,
			"utf8"
		);
		console.log(JSON.stringify({ caseId, checks, verdict }, null, 2));
		console.log(`receipt: ${receiptPath}`);
		if (verdict === "fail") process.exitCode = 1;
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

await main();
