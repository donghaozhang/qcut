import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
	getClipTransitionPresetConfig,
	transitionPresets,
} from "../../apps/web/src/components/editor/media-panel/views/transitions/transition-presets";
import { portraitAuditDirectory } from "../../apps/web/src/test/e2e/helpers/portrait-audit-fixtures";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths";
import type { VideoSource, VideoTransition } from "../ffmpeg/types";

let ffmpegPath = "";
let ffprobePath = "";
const auditOutputRoot = path.resolve(
	"output/playwright/portrait-filter-transition-audit/run-05-real-exports"
);
const clipDuration = 1.5;
const representativePresetIds = [
	"page-turn-left",
	"push-down",
	"deep-zoom-blur",
	"impact-shake",
	"film-burn",
	"heavy-glitch",
] as const;

interface RealExportCase {
	id: "portrait-to-landscape" | "landscape-to-portrait";
	fromFileName: string;
	toFileName: string;
	width: number;
	height: number;
}

interface VideoProbe {
	streams: Array<{
		codec_name: string;
		width: number;
		height: number;
		pix_fmt: string;
	}>;
	format: { duration: string };
}

interface FrameSample {
	hash: string;
	lumaRange: number;
}

interface ExportEvidence {
	presetId: string;
	type: VideoTransition["type"];
	direction?: VideoTransition["direction"];
	fileName: string;
	fileSize: number;
	duration: number;
	midpointHash: string;
	midpointLumaRange: number;
	frameFileName: string;
}

const realExportCases: RealExportCase[] = [
	{
		id: "portrait-to-landscape",
		fromFileName: "colorful-influencer-10s.mp4",
		toFileName: "university-woman-landscape-10s.mp4",
		width: 360,
		height: 640,
	},
	{
		id: "landscape-to-portrait",
		fromFileName: "office-woman-landscape-10s.mp4",
		toFileName: "neon-man-10s.mp4",
		width: 640,
		height: 360,
	},
];

const requiredSourcePaths = realExportCases.flatMap((auditCase) => [
	path.join(portraitAuditDirectory, auditCase.fromFileName),
	path.join(portraitAuditDirectory, auditCase.toFileName),
]);
const realSourcesMissing = requiredSourcePaths.some(
	(sourcePath) => !existsSync(sourcePath)
);

function buildRealVideoSources({
	auditCase,
}: {
	auditCase: RealExportCase;
}): VideoSource[] {
	return [
		{
			elementId: "clip-from",
			trackId: "track-1",
			path: path.join(portraitAuditDirectory, auditCase.fromFileName),
			startTime: 0,
			duration: clipDuration,
			trackOrder: 0,
			elementOrder: 0,
		},
		{
			elementId: "clip-to",
			trackId: "track-1",
			path: path.join(portraitAuditDirectory, auditCase.toFileName),
			startTime: clipDuration,
			duration: clipDuration,
			trackOrder: 0,
			elementOrder: 1,
		},
	];
}

function encodeProject({
	auditCase,
	outputPath,
	transition,
}: {
	auditCase: RealExportCase;
	outputPath: string;
	transition?: VideoTransition;
}) {
	const result = spawnSync(
		ffmpegPath,
		buildFFmpegArgs({
			inputDir: portraitAuditDirectory,
			outputFile: outputPath,
			width: auditCase.width,
			height: auditCase.height,
			fps: 30,
			quality: "low",
			duration: clipDuration * 2,
			videoSources: buildRealVideoSources({ auditCase }),
			videoTransitions: transition ? [transition] : [],
		}),
		{ encoding: "utf8", timeout: 60_000 }
	);
	expect(result.status, result.stderr).toBe(0);
	expect(statSync(outputPath).size).toBeGreaterThan(5_000);
}

function probeVideo({ inputPath }: { inputPath: string }): VideoProbe {
	const result = spawnSync(
		ffprobePath,
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=codec_name,width,height,pix_fmt:format=duration",
			"-of",
			"json",
			inputPath,
		],
		{ encoding: "utf8", timeout: 60_000 }
	);
	expect(result.status, result.stderr).toBe(0);
	return JSON.parse(result.stdout) as VideoProbe;
}

function verifyCompleteDecode({ inputPath }: { inputPath: string }) {
	const result = spawnSync(
		ffmpegPath,
		["-v", "error", "-i", inputPath, "-f", "null", "-"],
		{ encoding: "utf8", timeout: 60_000 }
	);
	expect(result.status, result.stderr).toBe(0);
}

function readFrameSample({
	inputPath,
	time,
}: {
	inputPath: string;
	time: number;
}): FrameSample {
	const result = spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"scale=64:64,format=rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ timeout: 60_000 }
	);
	expect(result.status, result.stderr.toString()).toBe(0);
	expect(result.stdout.length).toBe(64 * 64 * 3);
	let minimumLuma = 255;
	let maximumLuma = 0;
	for (let index = 0; index < result.stdout.length; index += 3) {
		const luma = Math.round(
			result.stdout[index] * 0.2126 +
				result.stdout[index + 1] * 0.7152 +
				result.stdout[index + 2] * 0.0722
		);
		minimumLuma = Math.min(minimumLuma, luma);
		maximumLuma = Math.max(maximumLuma, luma);
	}
	return {
		hash: createHash("sha256").update(result.stdout).digest("hex"),
		lumaRange: maximumLuma - minimumLuma,
	};
}

function extractMidpointFrame({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}) {
	const result = spawnSync(
		ffmpegPath,
		[
			"-y",
			"-v",
			"error",
			"-ss",
			String(clipDuration),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			outputPath,
		],
		{ encoding: "utf8", timeout: 60_000 }
	);
	expect(result.status, result.stderr).toBe(0);
	expect(statSync(outputPath).size).toBeGreaterThan(1_000);
}

function createTransition({
	presetId,
}: {
	presetId: (typeof representativePresetIds)[number];
}): VideoTransition {
	const preset = transitionPresets.find(
		(candidate) => candidate.id === presetId
	);
	if (!preset) throw new Error(`Missing transition preset ${presetId}`);
	const config = getClipTransitionPresetConfig({ preset });
	if (!config) throw new Error(`Missing transition mapping ${presetId}`);
	return {
		id: `transition-${presetId}`,
		trackId: "track-1",
		fromElementId: "clip-from",
		toElementId: "clip-to",
		presetId,
		type: config.type,
		direction: config.direction,
		easing: "easeInOut",
		duration: preset.defaultDuration,
		tuning: config.tuning,
		maskShape: config.maskShape,
	};
}

function verifyExport({
	auditCase,
	outputPath,
	framePath,
	baselineMidpointHash,
	transition,
}: {
	auditCase: RealExportCase;
	outputPath: string;
	framePath: string;
	baselineMidpointHash: string;
	transition: VideoTransition;
}): ExportEvidence {
	encodeProject({ auditCase, outputPath, transition });
	const probe = probeVideo({ inputPath: outputPath });
	const videoStream = probe.streams[0];
	expect(videoStream).toMatchObject({
		codec_name: "h264",
		width: auditCase.width,
		height: auditCase.height,
		pix_fmt: "yuv420p",
	});
	const duration = Number.parseFloat(probe.format.duration);
	expect(duration).toBeCloseTo(clipDuration * 2, 1);
	verifyCompleteDecode({ inputPath: outputPath });
	const midpoint = readFrameSample({
		inputPath: outputPath,
		time: clipDuration,
	});
	expect(midpoint.lumaRange, transition.presetId).toBeGreaterThan(5);
	expect(midpoint.hash, transition.presetId).not.toBe(baselineMidpointHash);
	extractMidpointFrame({ inputPath: outputPath, outputPath: framePath });
	return {
		presetId: transition.presetId,
		type: transition.type,
		direction: transition.direction,
		fileName: path.basename(outputPath),
		fileSize: statSync(outputPath).size,
		duration,
		midpointHash: midpoint.hash,
		midpointLumaRange: midpoint.lumaRange,
		frameFileName: path.basename(framePath),
	};
}

describe.skipIf(realSourcesMissing)("Real portrait transition exports", () => {
	beforeAll(async () => {
		ffmpegPath = getFFmpegPath();
		ffprobePath = await getFFprobePath();
	});

	for (const auditCase of realExportCases) {
		it(`exports representative transitions at the ${auditCase.id} seam`, () => {
			const outputDirectory = path.join(auditOutputRoot, auditCase.id);
			rmSync(outputDirectory, { recursive: true, force: true });
			mkdirSync(outputDirectory, { recursive: true });
			const baselinePath = path.join(outputDirectory, "baseline.mp4");
			encodeProject({ auditCase, outputPath: baselinePath });
			verifyCompleteDecode({ inputPath: baselinePath });
			const baselineMidpoint = readFrameSample({
				inputPath: baselinePath,
				time: clipDuration,
			});
			const evidence: ExportEvidence[] = [];
			for (const presetId of representativePresetIds) {
				const transition = createTransition({ presetId });
				const outputPath = path.join(outputDirectory, `${presetId}.mp4`);
				const framePath = path.join(
					outputDirectory,
					`${presetId}-midpoint.png`
				);
				evidence.push(
					verifyExport({
						auditCase,
						outputPath,
						framePath,
						baselineMidpointHash: baselineMidpoint.hash,
						transition,
					})
				);
			}
			expect(evidence).toHaveLength(representativePresetIds.length);
			expect(new Set(evidence.map((item) => item.midpointHash)).size).toBe(
				representativePresetIds.length
			);
			writeFileSync(
				path.join(outputDirectory, "manifest.json"),
				`${JSON.stringify(
					{
						seam: auditCase,
						baselineMidpointHash: baselineMidpoint.hash,
						exports: evidence,
					},
					null,
					2
				)}\n`
			);
		}, 120_000);
	}
});
