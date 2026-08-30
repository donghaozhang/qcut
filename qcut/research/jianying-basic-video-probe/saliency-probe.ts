import {
	analyzeSaliencyMask,
	buildSmartMotionKeyframes,
} from "./saliency-analysis";

function parsePositiveNumber({
	value,
	label,
}: {
	value: string;
	label: string;
}): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number`);
	}
	return parsed;
}

async function readMask({
	path,
	width,
	height,
}: {
	path: string;
	width: number;
	height: number;
}): Promise<Uint8Array> {
	const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
	if (bytes.byteLength !== width * height) {
		throw new Error(
			`${path} contains ${bytes.byteLength} bytes, expected ${width * height}`
		);
	}
	return bytes;
}

async function writeReport({
	outputPath,
	report,
}: {
	outputPath: string;
	report: unknown;
}): Promise<void> {
	await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(outputPath);
}

async function runCrop({ args }: { args: string[] }): Promise<void> {
	const [maskPath, widthText, heightText, aspectText, outputPath] = args;
	if (!(maskPath && widthText && heightText && aspectText && outputPath)) {
		throw new Error(
			"usage: saliency-probe.ts crop <mask> <width> <height> <aspect> <output.json>"
		);
	}
	const width = parsePositiveNumber({ value: widthText, label: "width" });
	const height = parsePositiveNumber({ value: heightText, label: "height" });
	const targetAspectRatio = parsePositiveNumber({
		value: aspectText,
		label: "aspect",
	});
	const mask = await readMask({ path: maskPath, width, height });
	const analysis = analyzeSaliencyMask({
		mask,
		width,
		height,
		targetAspectRatio,
	});
	await writeReport({
		outputPath,
		report: {
			probe: "smart-crop",
			provider: "jianying-bingo-saliency-qcut-crop-v1",
			validationLevel: "input-processed",
			input: { maskPath, width, height },
			targetAspectRatio,
			analysis,
		},
	});
}

function parseSample({ value }: { value: string }): {
	timestampSeconds: number;
	path: string;
} {
	const separatorIndex = value.indexOf("=");
	if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
		throw new Error(`invalid sample ${value}; expected <seconds>=<mask>`);
	}
	const timestampSeconds = Number(value.slice(0, separatorIndex));
	if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
		throw new Error(`invalid sample timestamp in ${value}`);
	}
	return { timestampSeconds, path: value.slice(separatorIndex + 1) };
}

async function runMotion({ args }: { args: string[] }): Promise<void> {
	const [widthText, heightText, aspectText, outputPath, ...sampleValues] = args;
	if (
		!(widthText && heightText && aspectText && outputPath) ||
		sampleValues.length < 2
	) {
		throw new Error(
			"usage: saliency-probe.ts motion <width> <height> <aspect> <output.json> <seconds=mask>..."
		);
	}
	const width = parsePositiveNumber({ value: widthText, label: "width" });
	const height = parsePositiveNumber({ value: heightText, label: "height" });
	const targetAspectRatio = parsePositiveNumber({
		value: aspectText,
		label: "aspect",
	});
	const samples = sampleValues.map((value) => parseSample({ value }));
	const observations = await Promise.all(
		samples.map(async ({ timestampSeconds, path }) => ({
			timestampSeconds,
			path,
			analysis: analyzeSaliencyMask({
				mask: await readMask({ path, width, height }),
				width,
				height,
				targetAspectRatio,
			}),
		}))
	);
	const keyframes = buildSmartMotionKeyframes({ observations });
	await writeReport({
		outputPath,
		report: {
			probe: "smart-motion",
			provider: "jianying-bingo-saliency-qcut-motion-v1",
			validationLevel: "input-processed",
			input: { width, height, samples: observations },
			targetAspectRatio,
			keyframes,
		},
	});
}

async function main({ args }: { args: string[] }): Promise<void> {
	const [mode, ...modeArgs] = args;
	if (mode === "crop") {
		await runCrop({ args: modeArgs });
		return;
	}
	if (mode === "motion") {
		await runMotion({ args: modeArgs });
		return;
	}
	throw new Error("mode must be crop or motion");
}

await main({ args: Bun.argv.slice(2) });
