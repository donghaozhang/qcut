import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const NORMALIZED_WIDTH = 90;
const NORMALIZED_HEIGHT = 160;
const NORMALIZED_FRAME_SIZE = NORMALIZED_WIDTH * NORMALIZED_HEIGHT;
const COMPARISON_DURATION_SECONDS = 2.8;

type Editor = "jianying" | "qcut";
type SourceTrack = "clean-person" | "noisy-person";

interface VideoSpec {
	id: string;
	fileName: string;
	editor: Editor | "source";
	sourceTrack: SourceTrack;
}

interface EditorComparisonSpec {
	baselineId: string;
	candidateId: string;
	implementation: string;
}

interface FeatureSpec {
	id: string;
	localizedName: string;
	sourceTrack: SourceTrack;
	qcut: EditorComparisonSpec;
	jianying: EditorComparisonSpec;
}

interface VideoProbe {
	id: string;
	fileName: string;
	editor: VideoSpec["editor"];
	sourceTrack: SourceTrack;
	sha256: string;
	bytes: number;
	codec: string;
	width: number;
	height: number;
	sampleAspectRatio: string;
	displayAspectRatio: string;
	pixelFormat: string;
	averageFrameRate: string;
	frameCount: number | null;
	durationSeconds: number;
	visual: VisualMetrics;
}

interface VisualMetrics {
	normalizedFrameCount: number;
	meanLuma: number;
	minimumFrameMeanLuma: number;
	maximumFrameMeanLuma: number;
	frameLumaStandardDeviation: number;
	spatialDetail: number;
	temporalDifference: number;
	adjacentExactDuplicateFrames: number;
	estimatedGlobalTranslationPixels: number;
}

interface SimilarityMetrics {
	ssim: number;
	psnrDb: number | "infinite";
}

const VIDEO_SPECS: VideoSpec[] = [
	{
		id: "source-clean-person",
		fileName: "04-real-person-small-clean-3s.mp4",
		editor: "source",
		sourceTrack: "clean-person",
	},
	{
		id: "source-noisy-person",
		fileName: "02-real-person-challenge-noisy-3s.mp4",
		editor: "source",
		sourceTrack: "noisy-person",
	},
	{
		id: "qcut-pixel-baseline",
		fileName: "10-qcut-baseline.mp4",
		editor: "qcut",
		sourceTrack: "noisy-person",
	},
	{
		id: "jianying-pixel-baseline",
		fileName: "jianying-baseline.mp4",
		editor: "jianying",
		sourceTrack: "noisy-person",
	},
	{
		id: "qcut-private-deflicker",
		fileName: "qcut-private-deflicker.mp4",
		editor: "qcut",
		sourceTrack: "noisy-person",
	},
	{
		id: "qcut-smart-baseline",
		fileName: "qcut-smart-baseline.mp4",
		editor: "qcut",
		sourceTrack: "clean-person",
	},
	{
		id: "jianying-smart-baseline",
		fileName: "jianying-smart-baseline.mp4",
		editor: "jianying",
		sourceTrack: "clean-person",
	},
	...[
		"stabilization",
		"denoise",
		"deflicker",
		"motion-blur",
		"eye-detail",
		"local-super-resolution",
		"frame-interpolation",
	].flatMap((id): VideoSpec[] => [
		{
			id: `qcut-${id}`,
			fileName: `qcut-${id}.mp4`,
			editor: "qcut",
			sourceTrack: "noisy-person",
		},
		{
			id: `jianying-${id}`,
			fileName:
				id === "eye-detail"
					? "jianying-eye-correction.mp4"
					: id === "local-super-resolution"
						? "jianying-super-resolution.mp4"
						: id === "denoise"
							? "jianying-denoise-local.mp4"
							: `jianying-${id}.mp4`,
			editor: "jianying",
			sourceTrack: "noisy-person",
		},
	]),
	...[
		["smart-motion", "smart-motion"],
		["smart-crop", "smart-crop-16x9"],
		["camera-tracking", "face-tracking"],
	].flatMap(([qcutId, jianyingId]): VideoSpec[] => [
		{
			id: `qcut-${qcutId}`,
			fileName: `qcut-${qcutId}.mp4`,
			editor: "qcut",
			sourceTrack: "clean-person",
		},
		{
			id: `jianying-${qcutId}`,
			fileName: `jianying-${jianyingId}.mp4`,
			editor: "jianying",
			sourceTrack: "clean-person",
		},
	]),
];

const FEATURE_SPECS: FeatureSpec[] = [
	{
		id: "stabilization",
		localizedName: "视频防抖",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-stabilization",
			implementation: "FFmpeg deshake at strength 70",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-stabilization",
			implementation: "Jianying video stabilization UI",
		},
	},
	{
		id: "denoise",
		localizedName: "画面降噪",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-denoise",
			implementation: "FFmpeg hqdn3d at strength 70",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-denoise",
			implementation: "Jianying denoise with the UI model set to Local",
		},
	},
	{
		id: "deflicker",
		localizedName: "防闪烁",
		sourceTrack: "noisy-person",
		qcut: {
			// Source-relative on purpose: the private deflicker cache consumes
			// the source directly, so a qcut-pixel-baseline would conflate
			// renderer differences with the deflicker treatment.
			baselineId: "source-noisy-person",
			candidateId: "qcut-private-deflicker",
			implementation:
				"Verified Jianying 11.3.0 VideoDeflickerGpuBackend cache at strength 70 (source-relative baseline: deltas include source re-encode artifacts)",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-deflicker",
			implementation: "Jianying deflicker UI defaults",
		},
	},
	{
		id: "motion-blur",
		localizedName: "光流运动模糊",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-motion-blur",
			implementation: "FFmpeg minterpolate, tmix, then fps",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-motion-blur",
			implementation: "Jianying motion blur UI defaults",
		},
	},
	{
		id: "eye-correction",
		localizedName: "眼神修正",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-eye-detail",
			implementation: "Local portrait eye-detail and bright-eye adjustment",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-eye-detail",
			implementation: "Jianying eye-correction UI",
		},
	},
	{
		id: "super-resolution",
		localizedName: "超分辨率",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-local-super-resolution",
			implementation: "Local Lanczos 2x plus unsharp",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-local-super-resolution",
			implementation: "Jianying asynchronous super-resolution task",
		},
	},
	{
		id: "frame-interpolation",
		localizedName: "补帧",
		sourceTrack: "noisy-person",
		qcut: {
			baselineId: "qcut-pixel-baseline",
			candidateId: "qcut-frame-interpolation",
			implementation: "FFmpeg minterpolate motion-compensated mode",
		},
		jianying: {
			baselineId: "jianying-pixel-baseline",
			candidateId: "jianying-frame-interpolation",
			implementation: "Jianying frame-interpolation UI",
		},
	},
	{
		id: "smart-motion",
		localizedName: "智能运镜",
		sourceTrack: "clean-person",
		qcut: {
			baselineId: "qcut-smart-baseline",
			candidateId: "qcut-smart-motion",
			implementation: "Local MediaPipe person tracking to transform keyframes",
		},
		jianying: {
			baselineId: "jianying-smart-baseline",
			candidateId: "jianying-smart-motion",
			implementation: "Jianying smart-motion preset",
		},
	},
	{
		id: "smart-crop",
		localizedName: "智能裁剪",
		sourceTrack: "clean-person",
		qcut: {
			baselineId: "qcut-smart-baseline",
			candidateId: "qcut-smart-crop",
			implementation: "Local MediaPipe person tracking to crop keyframes",
		},
		jianying: {
			baselineId: "jianying-smart-baseline",
			candidateId: "jianying-smart-crop",
			implementation: "Jianying smart crop with 16:9 target ratio",
		},
	},
	{
		id: "camera-tracking",
		localizedName: "镜头追踪",
		sourceTrack: "clean-person",
		qcut: {
			baselineId: "qcut-smart-baseline",
			candidateId: "qcut-camera-tracking",
			implementation: "Local MediaPipe person tracking to position keyframes",
		},
		jianying: {
			baselineId: "jianying-smart-baseline",
			candidateId: "jianying-camera-tracking",
			implementation: "Jianying head tracking",
		},
	},
];

function parseArguments({ args }: { args: string[] }): {
	evidenceRoot: string;
	outputPath: string;
} {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		const value = args[index + 1];
		if (key && value) values.set(key, value);
	}
	const evidenceRoot = path.resolve(
		values.get("--evidence-root") ??
			"docs/task/jianying-video-basic-panel-reference/evidence/real-video-matrix"
	);
	return {
		evidenceRoot,
		outputPath: path.resolve(
			values.get("--output") ??
				path.join(evidenceRoot, "qcut-jianying-real-video-metrics.json")
		),
	};
}

async function runProcess({
	command,
	args,
	binaryOutput = false,
}: {
	command: string;
	args: string[];
	binaryOutput?: boolean;
}): Promise<{ stdout: Uint8Array; stderr: string }> {
	const process = Bun.spawn([command, ...args], {
		stderr: "pipe",
		stdout: "pipe",
	});
	const [stdoutBuffer, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).arrayBuffer(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`${command} failed (${exitCode}): ${stderr}`);
	}
	const stdout = new Uint8Array(stdoutBuffer);
	if (!binaryOutput && stdout.length === 0) {
		throw new Error(`${command} returned no output`);
	}
	return { stderr, stdout };
}

function asRecord({ value, context }: { value: unknown; context: string }) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Expected ${context} to be an object`);
	}
	return value as Record<string, unknown>;
}

function numericValue({
	value,
	fallback = 0,
}: {
	value: unknown;
	fallback?: number;
}) {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue({
	value,
	fallback = "unknown",
}: {
	value: unknown;
	fallback?: string;
}) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

function standardDeviation({ values }: { values: number[] }): number {
	if (values.length === 0) return 0;
	const mean =
		values.reduce((total, value) => total + value, 0) / values.length;
	const variance =
		values.reduce((total, value) => total + (value - mean) ** 2, 0) /
		values.length;
	return Math.sqrt(variance);
}

function rounded({ value, digits = 6 }: { value: number; digits?: number }) {
	return Number(value.toFixed(digits));
}

function estimateFrameTranslation({
	previous,
	current,
}: {
	previous: Uint8Array;
	current: Uint8Array;
}): number {
	let bestScore = Number.POSITIVE_INFINITY;
	let bestX = 0;
	let bestY = 0;
	for (let shiftY = -4; shiftY <= 4; shiftY += 1) {
		for (let shiftX = -4; shiftX <= 4; shiftX += 1) {
			let score = 0;
			let samples = 0;
			for (let y = 6; y < NORMALIZED_HEIGHT - 6; y += 4) {
				for (let x = 6; x < NORMALIZED_WIDTH - 6; x += 4) {
					const previousIndex = (y + shiftY) * NORMALIZED_WIDTH + x + shiftX;
					const currentIndex = y * NORMALIZED_WIDTH + x;
					score += Math.abs(
						(previous[previousIndex] ?? 0) - (current[currentIndex] ?? 0)
					);
					samples += 1;
				}
			}
			const normalizedScore = score / Math.max(1, samples);
			if (normalizedScore < bestScore) {
				bestScore = normalizedScore;
				bestX = shiftX;
				bestY = shiftY;
			}
		}
	}
	return Math.hypot(bestX, bestY);
}

function measureDecodedFrames({ bytes }: { bytes: Uint8Array }): VisualMetrics {
	const normalizedFrameCount = Math.floor(bytes.length / NORMALIZED_FRAME_SIZE);
	if (normalizedFrameCount === 0) throw new Error("FFmpeg decoded zero frames");
	const frameLuma: number[] = [];
	const translations: number[] = [];
	let totalSpatialDetail = 0;
	let spatialSamples = 0;
	let totalTemporalDifference = 0;
	let temporalSamples = 0;
	let adjacentExactDuplicateFrames = 0;
	for (let frameIndex = 0; frameIndex < normalizedFrameCount; frameIndex += 1) {
		const offset = frameIndex * NORMALIZED_FRAME_SIZE;
		const frame = bytes.subarray(offset, offset + NORMALIZED_FRAME_SIZE);
		let lumaTotal = 0;
		for (let pixelIndex = 0; pixelIndex < frame.length; pixelIndex += 1) {
			lumaTotal += frame[pixelIndex] ?? 0;
		}
		frameLuma.push(lumaTotal / frame.length);
		for (let y = 1; y < NORMALIZED_HEIGHT; y += 2) {
			for (let x = 1; x < NORMALIZED_WIDTH; x += 2) {
				const index = y * NORMALIZED_WIDTH + x;
				const value = frame[index] ?? 0;
				totalSpatialDetail +=
					Math.abs(value - (frame[index - 1] ?? value)) +
					Math.abs(value - (frame[index - NORMALIZED_WIDTH] ?? value));
				spatialSamples += 2;
			}
		}
		if (frameIndex === 0) continue;
		const previousOffset = (frameIndex - 1) * NORMALIZED_FRAME_SIZE;
		const previous = bytes.subarray(
			previousOffset,
			previousOffset + NORMALIZED_FRAME_SIZE
		);
		let isExactDuplicate = true;
		for (let pixelIndex = 0; pixelIndex < frame.length; pixelIndex += 4) {
			const difference = Math.abs(
				(frame[pixelIndex] ?? 0) - (previous[pixelIndex] ?? 0)
			);
			totalTemporalDifference += difference;
			temporalSamples += 1;
			if (difference !== 0) isExactDuplicate = false;
		}
		if (isExactDuplicate) adjacentExactDuplicateFrames += 1;
		if (frameIndex % 3 === 0) {
			translations.push(estimateFrameTranslation({ current: frame, previous }));
		}
	}
	return {
		normalizedFrameCount,
		meanLuma: rounded({
			value:
				frameLuma.reduce((total, value) => total + value, 0) / frameLuma.length,
		}),
		minimumFrameMeanLuma: rounded({ value: Math.min(...frameLuma) }),
		maximumFrameMeanLuma: rounded({ value: Math.max(...frameLuma) }),
		frameLumaStandardDeviation: rounded({
			value: standardDeviation({ values: frameLuma }),
		}),
		spatialDetail: rounded({
			value: totalSpatialDetail / Math.max(1, spatialSamples),
		}),
		temporalDifference: rounded({
			value: totalTemporalDifference / Math.max(1, temporalSamples),
		}),
		adjacentExactDuplicateFrames,
		estimatedGlobalTranslationPixels: rounded({
			value:
				translations.reduce((total, value) => total + value, 0) /
				Math.max(1, translations.length),
		}),
	};
}

async function probeVideo({
	evidenceRoot,
	spec,
}: {
	evidenceRoot: string;
	spec: VideoSpec;
}): Promise<VideoProbe> {
	const filePath = path.join(evidenceRoot, spec.fileName);
	const [probeResult, decodedResult, fileBytes] = await Promise.all([
		runProcess({
			command: "ffprobe",
			args: [
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=codec_name,width,height,sample_aspect_ratio,display_aspect_ratio,avg_frame_rate,nb_frames,pix_fmt:format=duration,size",
				"-of",
				"json",
				filePath,
			],
		}),
		runProcess({
			command: "ffmpeg",
			args: [
				"-v",
				"error",
				"-i",
				filePath,
				"-map",
				"0:v:0",
				"-vf",
				`fps=30,scale=${NORMALIZED_WIDTH}:${NORMALIZED_HEIGHT}:flags=bilinear,format=gray`,
				"-t",
				"3",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"gray",
				"pipe:1",
			],
			binaryOutput: true,
		}),
		readFile(filePath),
	]);
	const parsed: unknown = JSON.parse(
		new TextDecoder().decode(probeResult.stdout)
	);
	const root = asRecord({ context: "ffprobe root", value: parsed });
	const streams = Array.isArray(root.streams) ? root.streams : [];
	const stream = asRecord({ context: "ffprobe stream", value: streams[0] });
	const format = asRecord({ context: "ffprobe format", value: root.format });
	const frameCountValue = numericValue({
		value: stream.nb_frames,
		fallback: -1,
	});
	return {
		id: spec.id,
		fileName: spec.fileName,
		editor: spec.editor,
		sourceTrack: spec.sourceTrack,
		sha256: createHash("sha256").update(fileBytes).digest("hex"),
		bytes: numericValue({ value: format.size, fallback: fileBytes.length }),
		codec: stringValue({ value: stream.codec_name }),
		width: numericValue({ value: stream.width }),
		height: numericValue({ value: stream.height }),
		sampleAspectRatio: stringValue({ value: stream.sample_aspect_ratio }),
		displayAspectRatio: stringValue({ value: stream.display_aspect_ratio }),
		pixelFormat: stringValue({ value: stream.pix_fmt }),
		averageFrameRate: stringValue({ value: stream.avg_frame_rate }),
		frameCount: frameCountValue >= 0 ? frameCountValue : null,
		durationSeconds: rounded({
			value: numericValue({ value: format.duration }),
		}),
		visual: measureDecodedFrames({ bytes: decodedResult.stdout }),
	};
}

async function measureSimilarity({
	baselinePath,
	candidatePath,
}: {
	baselinePath: string;
	candidatePath: string;
}): Promise<SimilarityMetrics> {
	const normalize = `fps=30,trim=duration=${COMPARISON_DURATION_SECONDS},scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setpts=PTS-STARTPTS`;
	const filter = [
		`[0:v]${normalize},split=2[reference_ssim][reference_psnr]`,
		`[1:v]${normalize},split=2[candidate_ssim][candidate_psnr]`,
		"[reference_ssim][candidate_ssim]ssim",
		"[reference_psnr][candidate_psnr]psnr",
	].join(";");
	const result = await runProcess({
		command: "ffmpeg",
		args: [
			"-hide_banner",
			"-nostats",
			"-i",
			baselinePath,
			"-i",
			candidatePath,
			"-filter_complex",
			filter,
			"-an",
			"-f",
			"null",
			"-",
		],
		binaryOutput: true,
	});
	const ssimMatches = [...result.stderr.matchAll(/All:([0-9.]+)/g)];
	const psnrMatches = [...result.stderr.matchAll(/average:([0-9.]+|inf)/g)];
	const ssimText = ssimMatches.at(-1)?.[1];
	const psnrText = psnrMatches.at(-1)?.[1];
	if (!(ssimText && psnrText)) {
		throw new Error(
			`Could not parse FFmpeg similarity output: ${result.stderr}`
		);
	}
	return {
		ssim: rounded({ value: Number(ssimText) }),
		psnrDb:
			psnrText === "inf" ? "infinite" : rounded({ value: Number(psnrText) }),
	};
}

async function mapWithConcurrency<Input, Output>({
	items,
	concurrency,
	mapper,
}: {
	items: Input[];
	concurrency: number;
	mapper: (item: Input) => Promise<Output>;
}): Promise<Output[]> {
	const results = new Array<Output>(items.length);
	let cursor = 0;
	async function worker(): Promise<void> {
		const index = cursor;
		cursor += 1;
		if (index >= items.length) return;
		results[index] = await mapper(items[index] as Input);
		return worker();
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
	);
	return results;
}

function percentDelta({
	baseline,
	candidate,
}: {
	baseline: number;
	candidate: number;
}) {
	if (baseline === 0) return null;
	return rounded({
		value: ((candidate - baseline) / baseline) * 100,
		digits: 3,
	});
}

async function buildEditorComparison({
	evidenceRoot,
	probeById,
	spec,
}: {
	evidenceRoot: string;
	probeById: Map<string, VideoProbe>;
	spec: EditorComparisonSpec;
}) {
	const baseline = probeById.get(spec.baselineId);
	const candidate = probeById.get(spec.candidateId);
	if (!(baseline && candidate)) {
		throw new Error(`Missing comparison files for ${spec.candidateId}`);
	}
	const similarity = await measureSimilarity({
		baselinePath: path.join(evidenceRoot, baseline.fileName),
		candidatePath: path.join(evidenceRoot, candidate.fileName),
	});
	return {
		implementation: spec.implementation,
		baselineId: baseline.id,
		candidateId: candidate.id,
		similarity,
		deltaPercent: {
			frameLumaStandardDeviation: percentDelta({
				baseline: baseline.visual.frameLumaStandardDeviation,
				candidate: candidate.visual.frameLumaStandardDeviation,
			}),
			spatialDetail: percentDelta({
				baseline: baseline.visual.spatialDetail,
				candidate: candidate.visual.spatialDetail,
			}),
			temporalDifference: percentDelta({
				baseline: baseline.visual.temporalDifference,
				candidate: candidate.visual.temporalDifference,
			}),
			estimatedGlobalTranslationPixels: percentDelta({
				baseline: baseline.visual.estimatedGlobalTranslationPixels,
				candidate: candidate.visual.estimatedGlobalTranslationPixels,
			}),
		},
		candidateFrameCount: candidate.frameCount,
		candidateDurationSeconds: candidate.durationSeconds,
		candidateSha256: candidate.sha256,
	};
}

async function main({ args }: { args: string[] }): Promise<void> {
	const { evidenceRoot, outputPath } = parseArguments({ args });
	const videos = await mapWithConcurrency({
		items: VIDEO_SPECS,
		concurrency: 4,
		mapper: (spec) => probeVideo({ evidenceRoot, spec }),
	});
	const probeById = new Map(videos.map((probe) => [probe.id, probe]));
	const features = await mapWithConcurrency({
		items: FEATURE_SPECS,
		concurrency: 3,
		mapper: async (feature) => ({
			id: feature.id,
			localizedName: feature.localizedName,
			sourceTrack: feature.sourceTrack,
			qcut: await buildEditorComparison({
				evidenceRoot,
				probeById,
				spec: feature.qcut,
			}),
			jianying: await buildEditorComparison({
				evidenceRoot,
				probeById,
				spec: feature.jianying,
			}),
		}),
	});
	await Bun.write(
		outputPath,
		`${JSON.stringify(
			{
				schemaVersion: 1,
				generatedAt: new Date().toISOString(),
				methodology: {
					sameSourceWithinEachFeature: true,
					pixelFeaturesSource: "02-real-person-challenge-noisy-3s.mp4",
					smartFeaturesSource: "04-real-person-small-clean-3s.mp4",
					comparisonNormalization:
						"30 fps, 540x960 letterboxed, first 2.8 seconds",
					visualProbe:
						"30 fps, 90x160 grayscale, first 3 seconds; translation is sampled block matching",
					interpretationBoundary:
						"These metrics prove exported pixels and measured direction of change; they do not prove model equivalence or subjective quality parity.",
				},
				videos,
				features,
			},
			null,
			2
		)}\n`
	);
	console.log(outputPath);
}

await main({ args: Bun.argv.slice(2) });
