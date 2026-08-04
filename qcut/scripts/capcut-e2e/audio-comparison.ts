/**
 * Compare the audio streams of two native exports and emit path-free evidence.
 *
 * Usage:
 *   bun scripts/capcut-e2e/audio-comparison.ts \
 *     --left <media> --right <media> [--output <dir>] [--json]
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	AUDIO_COMPARISON_MANIFEST_FILE_NAME,
	AUDIO_COMPARISON_MANIFEST_SCHEMA,
	audioComparisonChecksPass,
	buildAudioDifferenceArgs,
	buildAudioSignalAnalysisArgs,
	CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
	type AudioComparisonChecks,
	type AudioComparisonThresholds,
	type AudioDifferenceEvidence,
	type AudioSignalEvidence,
	type AudioStreamEvidence,
	evaluateAudioComparison,
	parseAudioDifferenceEvidence,
	parseAudioSignalEvidence,
	parseAudioStreamEvidence,
} from "./audio-comparison-contract.js";
import {
	getBundledTargetKey,
	probeMedia,
	requireBundledToolVersion,
	resolveBundledToolPath,
	runCommand,
} from "./runtime.js";
import { describeVisualFile } from "./visual-files.js";

interface AudioFileEvidence {
	bytes: number;
	sha256: string;
}

interface AudioInputEvidence extends AudioFileEvidence {
	signal: AudioSignalEvidence;
	stream: AudioStreamEvidence;
}

type AudioManifestInput = AudioFileEvidence & {
	signal?: AudioSignalEvidence;
	stream?: AudioStreamEvidence;
};

export interface AudioComparisonManifest {
	checks?: AudioComparisonChecks;
	generatedAtIso: string;
	left: AudioManifestInput;
	notComparableReason?: string;
	difference?: AudioDifferenceEvidence;
	right: AudioManifestInput;
	schema: typeof AUDIO_COMPARISON_MANIFEST_SCHEMA;
	schemaVersion: 1;
	thresholds: AudioComparisonThresholds;
	toolchain: {
		ffmpeg: { banner: string; version: string };
		ffprobe: { banner: string; version: string };
		targetKey: string;
	};
	verdict: "pass" | "fail" | "not-comparable";
}

async function describeInput({ path }: { path: string }) {
	const { bytes, sha256 } = await describeVisualFile({ path });
	return { bytes, sha256 };
}

async function analyzeSignal({
	ffmpegPath,
	mediaPath,
}: {
	ffmpegPath: string;
	mediaPath: string;
}): Promise<AudioSignalEvidence> {
	const { stderr } = await runCommand({
		args: buildAudioSignalAnalysisArgs({ mediaPath }),
		command: ffmpegPath,
	});
	return parseAudioSignalEvidence({ stderr });
}

async function measureDifference({
	ffmpegPath,
	leftPath,
	leftStream,
	rightPath,
	rightStream,
}: {
	ffmpegPath: string;
	leftPath: string;
	leftStream: AudioStreamEvidence;
	rightPath: string;
	rightStream: AudioStreamEvidence;
}): Promise<AudioDifferenceEvidence | null> {
	if (
		leftStream.channels !== rightStream.channels ||
		leftStream.channelLayout !== rightStream.channelLayout
	) {
		return null;
	}
	const { stderr } = await runCommand({
		args: buildAudioDifferenceArgs({
			channelCount: leftStream.channels,
			channelLayout: leftStream.channelLayout,
			leftPath,
			rightPath,
			sampleRateHz: leftStream.sampleRateHz,
		}),
		command: ffmpegPath,
	});
	return parseAudioDifferenceEvidence({
		channelCount: leftStream.channels,
		stderr,
	});
}

async function writeManifest({
	manifest,
	outputDirectory,
}: {
	manifest: AudioComparisonManifest;
	outputDirectory?: string;
}): Promise<void> {
	if (!outputDirectory) return;
	await writeFile(
		join(outputDirectory, AUDIO_COMPARISON_MANIFEST_FILE_NAME),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx", mode: 0o600 }
	);
}

export async function compareAudioOutputs({
	leftPath,
	nowIso = new Date().toISOString(),
	outputDirectory,
	rightPath,
	thresholds = CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
}: {
	leftPath: string;
	nowIso?: string;
	outputDirectory?: string;
	rightPath: string;
	thresholds?: AudioComparisonThresholds;
}): Promise<AudioComparisonManifest> {
	const projectRoot = resolve(process.cwd());
	const targetKey = getBundledTargetKey();
	const [ffmpegPath, ffprobePath] = await Promise.all([
		resolveBundledToolPath({ projectRoot, targetKey, tool: "ffmpeg" }),
		resolveBundledToolPath({ projectRoot, targetKey, tool: "ffprobe" }),
	]);
	const [ffmpeg, ffprobe, leftFile, rightFile, leftProbe, rightProbe] =
		await Promise.all([
			requireBundledToolVersion({ tool: "ffmpeg", toolPath: ffmpegPath }),
			requireBundledToolVersion({ tool: "ffprobe", toolPath: ffprobePath }),
			describeInput({ path: leftPath }),
			describeInput({ path: rightPath }),
			probeMedia({ ffprobePath, mediaPath: leftPath }),
			probeMedia({ ffprobePath, mediaPath: rightPath }),
		]);
	const toolchain = {
		ffmpeg: { banner: ffmpeg.banner, version: ffmpeg.version },
		ffprobe: { banner: ffprobe.banner, version: ffprobe.version },
		targetKey,
	};
	const leftStream = parseAudioStreamEvidence({ probe: leftProbe });
	const rightStream = parseAudioStreamEvidence({ probe: rightProbe });
	if (!leftStream || !rightStream) {
		const manifest: AudioComparisonManifest = {
			generatedAtIso: nowIso,
			left: leftFile,
			notComparableReason: leftStream
				? "right input has no audio stream"
				: "left input has no audio stream",
			right: rightFile,
			schema: AUDIO_COMPARISON_MANIFEST_SCHEMA,
			schemaVersion: 1,
			thresholds,
			toolchain,
			verdict: "not-comparable",
		};
		await writeManifest({ manifest, outputDirectory });
		return manifest;
	}
	const [leftSignal, rightSignal, difference] = await Promise.all([
		analyzeSignal({ ffmpegPath, mediaPath: leftPath }),
		analyzeSignal({ ffmpegPath, mediaPath: rightPath }),
		measureDifference({
			ffmpegPath,
			leftPath,
			leftStream,
			rightPath,
			rightStream,
		}),
	]);
	const left: AudioInputEvidence = {
		...leftFile,
		signal: leftSignal,
		stream: leftStream,
	};
	const right: AudioInputEvidence = {
		...rightFile,
		signal: rightSignal,
		stream: rightStream,
	};
	const checks = evaluateAudioComparison({
		difference,
		leftSignal,
		leftStream,
		rightSignal,
		rightStream,
		thresholds,
	});
	const manifest: AudioComparisonManifest = {
		checks,
		...(difference ? { difference } : {}),
		generatedAtIso: nowIso,
		left,
		right,
		schema: AUDIO_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds,
		toolchain,
		verdict: audioComparisonChecksPass({ checks }) ? "pass" : "fail",
	};
	await writeManifest({ manifest, outputDirectory });
	return manifest;
}

export function parseAudioComparisonCliOptions({ argv }: { argv: string[] }): {
	json: boolean;
	leftPath: string;
	outputDirectory?: string;
	rightPath: string;
} {
	let json = false;
	let leftPath: string | undefined;
	let outputDirectory: string | undefined;
	let rightPath: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag === "--json") {
			json = true;
			continue;
		}
		if (flag !== "--left" && flag !== "--right" && flag !== "--output") {
			throw new Error(`Unknown flag: ${flag}`);
		}
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		index += 1;
		if (flag === "--left") leftPath = value;
		if (flag === "--right") rightPath = value;
		if (flag === "--output") outputDirectory = value;
	}
	if (!leftPath || !rightPath) {
		throw new Error(
			"Usage: audio-comparison.ts --left <media> --right <media> [--output <dir>] [--json]"
		);
	}
	return {
		json,
		leftPath,
		...(outputDirectory ? { outputDirectory } : {}),
		rightPath,
	};
}

async function main(): Promise<void> {
	const options = parseAudioComparisonCliOptions({
		argv: process.argv.slice(2),
	});
	const manifest = await compareAudioOutputs(options);
	process.stdout.write(
		options.json
			? `${JSON.stringify(manifest, null, 2)}\n`
			: `verdict: ${manifest.verdict}\n`
	);
	if (manifest.verdict === "fail") process.exitCode = 1;
	if (manifest.verdict === "not-comparable") process.exitCode = 2;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	resolve(process.cwd()),
	"scripts",
	"capcut-e2e",
	"audio-comparison.ts"
);
if (entryPath === expectedEntryPath) void main();
