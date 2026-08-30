import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

const SEGMENT_DURATION_SECONDS = 3;
const CELL_WIDTH = 960;
const CELL_HEIGHT = 540;
const FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
const FONT_FAMILY = "QCut Comparison";

GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);

interface FeatureComparison {
	id: string;
	label: string;
	qcutBaseline: string;
	qcutCandidate: string;
	jianyingBaseline: string;
	jianyingCandidate: string;
}

const PIXEL_BASELINES = {
	qcut: "10-qcut-baseline.mp4",
	jianying: "jianying-baseline.mp4",
};

const SMART_BASELINES = {
	qcut: "qcut-smart-baseline.mp4",
	jianying: "jianying-smart-baseline.mp4",
};

const FEATURES: FeatureComparison[] = [
	{
		id: "stabilization",
		label: "Stabilization",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-stabilization.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-stabilization.mp4",
	},
	{
		id: "denoise",
		label: "Denoise",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-denoise.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-denoise-local.mp4",
	},
	{
		id: "deflicker",
		label: "Deflicker",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-deflicker.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-deflicker.mp4",
	},
	{
		id: "motion-blur",
		label: "Optical-flow motion blur",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-motion-blur.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-motion-blur.mp4",
	},
	{
		id: "eye-correction",
		label: "Eye correction",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-eye-detail.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-eye-correction.mp4",
	},
	{
		id: "super-resolution",
		label: "Super resolution",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-local-super-resolution.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-super-resolution.mp4",
	},
	{
		id: "frame-interpolation",
		label: "Frame interpolation",
		qcutBaseline: PIXEL_BASELINES.qcut,
		qcutCandidate: "qcut-frame-interpolation.mp4",
		jianyingBaseline: PIXEL_BASELINES.jianying,
		jianyingCandidate: "jianying-frame-interpolation.mp4",
	},
	{
		id: "smart-motion",
		label: "Smart motion",
		qcutBaseline: SMART_BASELINES.qcut,
		qcutCandidate: "qcut-smart-motion.mp4",
		jianyingBaseline: SMART_BASELINES.jianying,
		jianyingCandidate: "jianying-smart-motion.mp4",
	},
	{
		id: "smart-crop",
		label: "Smart crop",
		qcutBaseline: SMART_BASELINES.qcut,
		qcutCandidate: "qcut-smart-crop.mp4",
		jianyingBaseline: SMART_BASELINES.jianying,
		jianyingCandidate: "jianying-smart-crop-16x9.mp4",
	},
	{
		id: "camera-tracking",
		label: "Camera tracking",
		qcutBaseline: SMART_BASELINES.qcut,
		qcutCandidate: "qcut-camera-tracking.mp4",
		jianyingBaseline: SMART_BASELINES.jianying,
		jianyingCandidate: "jianying-face-tracking.mp4",
	},
];

function parseArguments({ args }: { args: string[] }): {
	evidenceRoot: string;
	outputPath: string;
} {
	const evidenceRoot = path.resolve(
		args[0] ??
			"docs/task/jianying-video-basic-panel-reference/evidence/real-video-matrix"
	);
	return {
		evidenceRoot,
		outputPath: path.join(evidenceRoot, "qcut-jianying-feature-comparison.mp4"),
	};
}

async function runFfmpeg({ args }: { args: string[] }): Promise<void> {
	const process = Bun.spawn(
		["ffmpeg", "-hide_banner", "-loglevel", "error", ...args],
		{
			stderr: "pipe",
			stdout: "ignore",
		}
	);
	const [stderr, exitCode] = await Promise.all([
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`FFmpeg failed (${exitCode}): ${stderr}`);
	}
}

function cellFilter({
	input,
	output,
}: {
	input: number;
	output: string;
}): string {
	return [
		`[${input}:v]fps=30`,
		"tpad=stop_mode=clone:stop_duration=0.2",
		`trim=duration=${SEGMENT_DURATION_SECONDS}`,
		"setpts=PTS-STARTPTS",
		`scale=${CELL_WIDTH}:${CELL_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
		`pad=${CELL_WIDTH}:${CELL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x111111`,
		"setsar=1",
		`format=yuv420p[${output}]`,
	].join(",");
}

function drawLabel({
	context,
	label,
	x,
	y,
	fontSize = 32,
}: {
	context: SKRSContext2D;
	label: string;
	x: number;
	y: number;
	fontSize?: number;
}): void {
	context.font = `${fontSize}px "${FONT_FAMILY}"`;
	const width = Math.ceil(context.measureText(label).width);
	context.fillStyle = "rgba(0, 0, 0, 0.76)";
	context.fillRect(x - 11, y - fontSize - 8, width + 22, fontSize + 18);
	context.fillStyle = "#ffffff";
	context.fillText(label, x, y);
}

async function createComparisonOverlay({
	feature,
	index,
	filePath,
}: {
	feature: FeatureComparison;
	index: number;
	filePath: string;
}): Promise<void> {
	const canvas = createCanvas(CELL_WIDTH * 2, CELL_HEIGHT * 2);
	const context = canvas.getContext("2d");
	drawLabel({ context, label: "QCut baseline", x: 24, y: 56 });
	drawLabel({
		context,
		label: `QCut - ${feature.label}`,
		x: CELL_WIDTH + 24,
		y: 56,
	});
	drawLabel({
		context,
		label: "Jianying baseline",
		x: 24,
		y: CELL_HEIGHT + 56,
	});
	drawLabel({
		context,
		label: `Jianying - ${feature.label}`,
		x: CELL_WIDTH + 24,
		y: CELL_HEIGHT + 56,
	});
	const footer = `${String(index + 1).padStart(2, "0")} / ${FEATURES.length}  ${feature.label}`;
	context.font = `34px "${FONT_FAMILY}"`;
	const footerWidth = Math.ceil(context.measureText(footer).width);
	drawLabel({
		context,
		label: footer,
		x: (CELL_WIDTH * 2 - footerWidth) / 2,
		y: CELL_HEIGHT * 2 - 20,
		fontSize: 34,
	});
	await writeFile(filePath, canvas.toBuffer("image/png"));
}

async function renderSegment({
	evidenceRoot,
	feature,
	index,
	segmentDirectory,
}: {
	evidenceRoot: string;
	feature: FeatureComparison;
	index: number;
	segmentDirectory: string;
}): Promise<string> {
	const inputs = [
		feature.qcutBaseline,
		feature.qcutCandidate,
		feature.jianyingBaseline,
		feature.jianyingCandidate,
	].map((fileName) => path.join(evidenceRoot, fileName));
	await Promise.all(inputs.map((filePath) => access(filePath)));
	const segmentPath = path.join(
		segmentDirectory,
		`${String(index + 1).padStart(2, "0")}-${feature.id}.mp4`
	);
	const overlayPath = path.join(
		segmentDirectory,
		`${String(index + 1).padStart(2, "0")}-${feature.id}-labels.png`
	);
	await createComparisonOverlay({ feature, filePath: overlayPath, index });
	const filters = [
		cellFilter({ input: 0, output: "qcut_base" }),
		cellFilter({ input: 1, output: "qcut_effect" }),
		cellFilter({ input: 2, output: "jianying_base" }),
		cellFilter({ input: 3, output: "jianying_effect" }),
		"[qcut_base][qcut_effect][jianying_base][jianying_effect]xstack=inputs=4:layout=0_0|960_0|0_540|960_540:fill=black[grid]",
		"[grid][4:v]overlay=0:0:shortest=1[output]",
	].join(";");
	await runFfmpeg({
		args: [
			"-y",
			...inputs.flatMap((filePath) => ["-i", filePath]),
			"-loop",
			"1",
			"-framerate",
			"30",
			"-i",
			overlayPath,
			"-filter_complex",
			filters,
			"-map",
			"[output]",
			"-an",
			"-r",
			"30",
			"-c:v",
			"libx264",
			"-preset",
			"faster",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p",
			segmentPath,
		],
	});
	return segmentPath;
}

async function mapWithConcurrency<Input, Output>({
	items,
	concurrency,
	mapper,
}: {
	items: Input[];
	concurrency: number;
	mapper: (item: Input, index: number) => Promise<Output>;
}): Promise<Output[]> {
	const results = new Array<Output>(items.length);
	let cursor = 0;
	async function worker(): Promise<void> {
		const index = cursor;
		cursor += 1;
		if (index >= items.length) return;
		results[index] = await mapper(items[index] as Input, index);
		return worker();
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
	);
	return results;
}

async function main({ args }: { args: string[] }): Promise<void> {
	const { evidenceRoot, outputPath } = parseArguments({ args });
	const segmentDirectory = path.join(evidenceRoot, ".comparison-build");
	await mkdir(segmentDirectory, { recursive: true });
	const segmentPaths = await mapWithConcurrency({
		items: FEATURES,
		concurrency: 2,
		mapper: (feature, index) =>
			renderSegment({ evidenceRoot, feature, index, segmentDirectory }),
	});
	const manifestPath = path.join(segmentDirectory, "segments.txt");
	await Bun.write(
		manifestPath,
		`${segmentPaths.map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`).join("\n")}\n`
	);
	await runFfmpeg({
		args: [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			manifestPath,
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			outputPath,
		],
	});
	const contactSheetPath = path.join(
		evidenceRoot,
		"qcut-jianying-feature-contact-sheet.png"
	);
	await runFfmpeg({
		args: [
			"-y",
			"-ss",
			"1.5",
			"-i",
			outputPath,
			"-vf",
			"fps=1/3,scale=480:270,tile=2x5:padding=4:margin=4:color=0x222222",
			"-frames:v",
			"1",
			contactSheetPath,
		],
	});
	console.log(outputPath);
	console.log(contactSheetPath);
}

await main({ args: Bun.argv.slice(2) });
