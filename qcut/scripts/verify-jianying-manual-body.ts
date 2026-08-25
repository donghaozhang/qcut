import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import type {
	MediaPortraitAdjustments,
	MediaPortraitManualBodyTool,
} from "../electron/jianying-portrait-adjustment-contract.js";
import { createJianyingPortraitAdjustmentProvider } from "../electron/jianying-portrait-adjustment-runtime/provider.js";

const width = 1280;
const height = 720;
const sourcePath =
	process.env.QCUT_MANUAL_BODY_SOURCE ??
	path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"Research",
		"JianyingFilter",
		"body-multiface-2026-08-25",
		"body-frame.rgba"
	);
const outputDirectory =
	process.env.QCUT_MANUAL_BODY_OUTPUT ??
	path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"Research",
		"JianyingFilter",
		"manual-body-private-runtime-e2e",
		new Date().toISOString().slice(0, 10)
	);

const variants = [
	{
		tool: "stretch" as const,
		title: "Stretch",
		manualBody: {
			stretch: { intensity: 50, upper: 0.72, bottom: 0.18 },
		},
	},
	{
		tool: "slim" as const,
		title: "Slim",
		manualBody: {
			slim: {
				intensity: 50,
				x: 0.5,
				y: 0.52,
				width: 0.42,
				height: 0.58,
				rotation: 18,
			},
		},
	},
	{
		tool: "zoom" as const,
		title: "Zoom",
		manualBody: {
			zoom: { intensity: 50, x: 0.5, y: 0.5, radius: 0.24 },
		},
	},
] satisfies {
	tool: MediaPortraitManualBodyTool;
	title: string;
	manualBody: NonNullable<MediaPortraitAdjustments["manualBody"]>;
}[];

function pngBuffer({ rgba }: { rgba: Uint8Array }) {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.putImageData(
		new ImageData(new Uint8ClampedArray(rgba), width, height),
		0,
		0
	);
	return canvas.toBuffer("image/png");
}

function comparePixels({
	input,
	output,
}: {
	input: Uint8Array;
	output: Uint8Array;
}) {
	let absoluteDifference = 0;
	let changedPixels = 0;
	let maximumChannelDifference = 0;
	for (let offset = 0; offset < input.length; offset += 4) {
		let pixelChanged = false;
		for (let channel = 0; channel < 3; channel += 1) {
			const difference = Math.abs(
				(input[offset + channel] ?? 0) - (output[offset + channel] ?? 0)
			);
			absoluteDifference += difference;
			maximumChannelDifference = Math.max(maximumChannelDifference, difference);
			if (difference !== 0) pixelChanged = true;
		}
		if (pixelChanged) changedPixels += 1;
	}
	return {
		changedPixels,
		changedRatio: changedPixels / (width * height),
		meanAbsoluteError: absoluteDifference / (width * height * 3),
		maximumChannelDifference,
	};
}

async function writeComparison({
	input,
	output,
	tool,
}: {
	input: Uint8Array;
	output: Uint8Array;
	tool: MediaPortraitManualBodyTool;
}) {
	const canvas = createCanvas(width * 2, height);
	const context = canvas.getContext("2d");
	context.putImageData(
		new ImageData(new Uint8ClampedArray(input), width, height),
		0,
		0
	);
	context.putImageData(
		new ImageData(new Uint8ClampedArray(output), width, height),
		width,
		0
	);
	context.fillStyle = "rgba(0, 0, 0, 0.72)";
	context.fillRect(0, 0, width * 2, 44);
	context.fillStyle = "white";
	context.font = "24px sans-serif";
	context.fillText("Before", 16, 30);
	context.fillText(`After: ${tool}`, width + 16, 30);
	const filePath = path.join(outputDirectory, `${tool}-before-after.png`);
	await writeFile(filePath, canvas.toBuffer("image/png"));
	return filePath;
}

async function run() {
	process.env.QCUT_JIANYING_DISABLE_APP_BUNDLE = "1";
	process.env.QCUT_JIANYING_DISABLE_USER_CACHE = "1";
	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });
	const input = new Uint8Array(await readFile(sourcePath));
	if (input.byteLength !== width * height * 4) {
		throw new Error(`Expected ${width}x${height} RGBA input`);
	}
	await writeFile(
		path.join(outputDirectory, "input.png"),
		pngBuffer({ rgba: input })
	);
	const provider = createJianyingPortraitAdjustmentProvider();
	try {
		const status = await provider.inspect({ refresh: true });
		const manualPackages = status.packages.filter(({ runtimePackage }) =>
			runtimePackage.startsWith("manual-")
		);
		if (!status.offlineReady) throw new Error(status.message);
		if (manualPackages.some(({ source }) => source !== "qcut-private")) {
			throw new Error(
				"Manual body packages did not resolve from QCut private storage"
			);
		}
		const results: {
			comparisonFile: string;
			metrics: ReturnType<typeof comparePixels>;
			outputFile: string;
			tool: MediaPortraitManualBodyTool;
		}[] = [];
		const renderAt = async ({ index }: { index: number }): Promise<void> => {
			const variant = variants[index];
			if (!variant) return;
			const result = await provider.render({
				width,
				height,
				rgba: input,
				adjustments: {
					enabled: true,
					values: {},
					manualBody: variant.manualBody,
				},
				sourceKey: `manual-body-e2e:${variant.tool}`,
				timestampSeconds: 0,
			});
			const outputFile = path.join(
				outputDirectory,
				`${variant.tool}-output.png`
			);
			await writeFile(outputFile, pngBuffer({ rgba: result.rgba }));
			const comparisonFile = await writeComparison({
				input,
				output: result.rgba,
				tool: variant.tool,
			});
			const metrics = comparePixels({ input, output: result.rgba });
			if (metrics.changedPixels === 0) {
				throw new Error(`${variant.title} produced no pixel change`);
			}
			results.push({ comparisonFile, metrics, outputFile, tool: variant.tool });
			await renderAt({ index: index + 1 });
		};
		await renderAt({ index: 0 });
		const report = {
			generatedAt: new Date().toISOString(),
			strictOffline: true,
			status: {
				available: status.available,
				offlineReady: status.offlineReady,
				state: status.state,
			},
			manualPackages,
			results,
			sourcePath,
		};
		await writeFile(
			path.join(outputDirectory, "report.json"),
			`${JSON.stringify(report, null, 2)}\n`
		);
		console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
	} finally {
		await provider.clear();
	}
}

void run().catch((cause) => {
	console.error(cause instanceof Error ? cause.stack : String(cause));
	process.exitCode = 1;
});
