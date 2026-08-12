import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { getFFmpegPath } from "../../electron/ffmpeg/paths.js";
import { inspectJianyingFilterPackages } from "../../electron/jianying-filter-package-inspector.js";
import type { JianyingKnownFilter } from "../../electron/jianying-filter-metadata.js";
import { createJianyingFilterLocalProvider } from "../../electron/jianying-filter-local-runtime/provider.js";
import {
	decodePpm,
	encodePpm,
} from "../../electron/jianying-filter-local-runtime/portable-image.js";
import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderResult,
} from "../../electron/jianying-filter-local-runtime/render.js";
import { inspectJianyingFilterLocalRuntime } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import {
	jianyingEffectCacheRoot,
	listJianyingLutReferences,
} from "../../electron/native-pipeline/filters/filter-lab-lut.js";
import {
	JIANYING_NATIVE_PORTRAIT_PROFILES,
	resolveJianyingNativePortraitPackagePath,
} from "../../electron/native-pipeline/filters/filter-lab-native-portrait.js";

const execFileAsync = promisify(execFile);

export const DUAL_LUT_TARGETS: JianyingKnownFilter[] =
	JIANYING_NATIVE_PORTRAIT_PROFILES.map((profile) => ({
		...profile,
		categories: [...profile.categories],
	}));

interface NativeDualLutOptions {
	runDirectory: string;
	sourcePath: string;
}

function requiredValue({
	argument,
	value,
}: {
	argument: string;
	value?: string;
}) {
	if (!value) throw new Error(`${argument} requires a value`);
	return value;
}

export function parseNativeDualLutArgs({ argv }: { argv: string[] }) {
	let runDirectory = "";
	let sourcePath = "";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--run-dir") {
			runDirectory = requiredValue({ argument, value: argv[index + 1] });
			index += 1;
			continue;
		}
		if (argument === "--source") {
			sourcePath = requiredValue({ argument, value: argv[index + 1] });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!runDirectory) throw new Error("--run-dir is required");
	if (!sourcePath) throw new Error("--source is required");
	return { runDirectory, sourcePath } satisfies NativeDualLutOptions;
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function translateFrame({
	rgba,
	width,
	height,
	offsetX,
}: {
	rgba: Uint8Array;
	width: number;
	height: number;
	offsetX: number;
}) {
	const output = new Uint8Array(rgba.length);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const sourceX = Math.min(width - 1, Math.max(0, x - offsetX));
			const source = (y * width + sourceX) * 4;
			const destination = (y * width + x) * 4;
			output.set(rgba.subarray(source, source + 4), destination);
		}
	}
	return output;
}

export function mirrorFrame({
	rgba,
	width,
	height,
}: {
	rgba: Uint8Array;
	width: number;
	height: number;
}) {
	const output = new Uint8Array(rgba.length);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const source = (y * width + (width - x - 1)) * 4;
			const destination = (y * width + x) * 4;
			output.set(rgba.subarray(source, source + 4), destination);
		}
	}
	return output;
}

export function maskStatistics({
	bytes,
	width,
	height,
}: {
	bytes: Uint8Array;
	width: number;
	height: number;
}) {
	let sum = 0;
	let nonZero = 0;
	let edgeSum = 0;
	let edgeSamples = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x;
			const value = bytes[index];
			sum += value;
			if (value > 0) nonZero += 1;
			if (x + 1 < width) {
				edgeSum += Math.abs(value - bytes[index + 1]);
				edgeSamples += 1;
			}
			if (y + 1 < height) {
				edgeSum += Math.abs(value - bytes[index + width]);
				edgeSamples += 1;
			}
		}
	}
	return {
		mean: sum / bytes.length,
		nonZeroRatio: nonZero / bytes.length,
		edgeMean: edgeSamples === 0 ? 0 : edgeSum / edgeSamples,
	};
}

function byteMae({ left, right }: { left: Uint8Array; right: Uint8Array }) {
	if (left.length !== right.length) return Number.POSITIVE_INFINITY;
	let sum = 0;
	for (let index = 0; index < left.length; index += 1) {
		sum += Math.abs(left[index] - right[index]);
	}
	return sum / left.length;
}

function encodePgm({
	bytes,
	width,
	height,
}: {
	bytes: Uint8Array;
	width: number;
	height: number;
}) {
	if (bytes.length !== width * height) {
		throw new Error("Mask frame has the wrong size");
	}
	return Buffer.concat([
		Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii"),
		bytes,
	]);
}

async function convertPortableImage({
	ffmpegPath,
	inputPath,
	outputPath,
}: {
	ffmpegPath: string;
	inputPath: string;
	outputPath: string;
}) {
	await execFileAsync(ffmpegPath, [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		inputPath,
		outputPath,
	]);
}

function requireMask({ result }: { result: JianyingFilterLocalRenderResult }) {
	if (!result.mask) throw new Error("Native portrait render returned no mask");
	return result.mask;
}

async function saveFrameEvidence({
	directory,
	ffmpegPath,
	result,
}: {
	directory: string;
	ffmpegPath: string;
	result: JianyingFilterLocalRenderResult;
}) {
	const mask = requireMask({ result });
	const framePath = join(directory, "frame.ppm");
	const framePngPath = join(directory, "frame.png");
	const maskPath = join(directory, "mask.pgm");
	const maskPngPath = join(directory, "mask.png");
	await mkdir(directory, { recursive: true });
	await Promise.all([
		writeFile(
			framePath,
			encodePpm({
				rgba: result.rgba,
				width: result.width,
				height: result.height,
			})
		),
		writeFile(
			maskPath,
			encodePgm({ bytes: mask.bytes, width: mask.width, height: mask.height })
		),
	]);
	await Promise.all([
		convertPortableImage({
			ffmpegPath,
			inputPath: framePath,
			outputPath: framePngPath,
		}),
		convertPortableImage({
			ffmpegPath,
			inputPath: maskPath,
			outputPath: maskPngPath,
		}),
	]);
}

async function renderFresh({
	bootstrapRgba,
	height,
	packagePath,
	resourceId,
	rgba,
	runtime,
	timestampSeconds,
	width,
}: {
	bootstrapRgba: Uint8Array;
	height: number;
	packagePath: string;
	resourceId: string;
	rgba: Uint8Array;
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
	timestampSeconds: number;
	width: number;
}) {
	const session = await createJianyingFilterLocalRenderSession({
		resourceId,
		packagePath,
		width,
		height,
		bootstrapRgba,
		runtime,
	});
	try {
		return await session.render({ rgba, timestampSeconds });
	} finally {
		await session.dispose();
	}
}

async function verifySourceSwitch({
	height,
	packagePath,
	resourceId,
	rgba,
	runtime,
	width,
}: {
	height: number;
	packagePath: string;
	resourceId: string;
	rgba: Uint8Array;
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
	width: number;
}) {
	const mirrored = mirrorFrame({ rgba, width, height });
	const provider = createJianyingFilterLocalProvider();
	try {
		await provider.render({
			resourceId,
			packagePath,
			width,
			height,
			rgba,
			sourceKey: "clip:a",
			timestampSeconds: 0,
		});
		const switched = await provider.render({
			resourceId,
			packagePath,
			width,
			height,
			rgba: mirrored,
			sourceKey: "clip:b",
			timestampSeconds: 0,
		});
		const fresh = await renderFresh({
			bootstrapRgba: mirrored,
			height,
			packagePath,
			resourceId,
			rgba: mirrored,
			runtime,
			timestampSeconds: 0,
			width,
		});
		const switchedMask = requireMask({ result: switched });
		const freshMask = requireMask({ result: fresh });
		return {
			rgbaExact:
				sha256({ bytes: switched.rgba }) === sha256({ bytes: fresh.rgba }),
			rgbaMae: byteMae({ left: switched.rgba, right: fresh.rgba }),
			maskExact:
				sha256({ bytes: switchedMask.bytes }) ===
				sha256({ bytes: freshMask.bytes }),
			maskMae: byteMae({ left: switchedMask.bytes, right: freshMask.bytes }),
		};
	} finally {
		provider.clear();
	}
}

export async function runNativeDualLutParity({
	options,
}: {
	options: NativeDualLutOptions;
}) {
	const source = decodePpm({ bytes: await readFile(options.sourcePath) });
	const references = await listJianyingLutReferences();
	const [packages, runtime] = await Promise.all([
		inspectJianyingFilterPackages({
			filters: DUAL_LUT_TARGETS,
			references,
		}),
		inspectJianyingFilterLocalRuntime({ refresh: true }),
	]);
	if (runtime.status.state !== "ready") {
		throw new Error(runtime.status.message);
	}
	const cacheRoot = dirname(jianyingEffectCacheRoot());
	const ffmpegPath = getFFmpegPath();
	const frames = [
		source.rgba,
		translateFrame({ ...source, offsetX: 2 }),
		translateFrame({ ...source, offsetX: 4 }),
	];
	const results = [];
	for (const target of DUAL_LUT_TARGETS) {
		const renderer = packages.get(target.resourceId)?.nativePortraitRenderer;
		if (!renderer || renderer.version !== target.version) {
			results.push({
				status: "error" as const,
				...target,
				error: "Pinned dual-LUT renderer is unavailable",
			});
			continue;
		}
		const packagePath = resolveJianyingNativePortraitPackagePath({
			cacheRoot,
			renderer,
		});
		const initializedAt = performance.now();
		const session = await createJianyingFilterLocalRenderSession({
			resourceId: target.resourceId,
			packagePath,
			width: source.width,
			height: source.height,
			bootstrapRgba: frames[0],
			runtime,
		});
		const initializedMs = performance.now() - initializedAt;
		const frameResults: JianyingFilterLocalRenderResult[] = [];
		const frameTimesMs: number[] = [];
		try {
			for (let index = 0; index < frames.length; index += 1) {
				const startedAt = performance.now();
				frameResults.push(
					await session.render({
						rgba: frames[index],
						timestampSeconds: index / 30,
					})
				);
				frameTimesMs.push(performance.now() - startedAt);
			}
		} finally {
			await session.dispose();
		}
		const masks = frameResults.map((result) => requireMask({ result }));
		const outputDirectory = join(options.runDirectory, target.resourceId);
		await saveFrameEvidence({
			directory: outputDirectory,
			ffmpegPath,
			result: frameResults[2],
		});
		const result = {
			status: "ok" as const,
			...target,
			processId: session.processId,
			initializedMs,
			frameTimesMs,
			outputSha256: sha256({ bytes: frameResults[2].rgba }),
			maskSha256: sha256({ bytes: masks[2].bytes }),
			mask: maskStatistics(masks[2]),
			maskTemporalMae: [
				byteMae({ left: masks[0].bytes, right: masks[1].bytes }),
				byteMae({ left: masks[1].bytes, right: masks[2].bytes }),
			],
		};
		results.push(result);
		console.log(
			`[${results.length}/${DUAL_LUT_TARGETS.length}] ${target.title}: ${frameTimesMs.map((value) => value.toFixed(1)).join("/")} ms`
		);
	}
	const olympus = results.find(
		(result) => result.status === "ok" && result.title === "奥林巴斯"
	);
	let sourceSwitch = null;
	if (olympus?.status === "ok") {
		const renderer = packages.get(olympus.resourceId)?.nativePortraitRenderer;
		if (renderer) {
			sourceSwitch = await verifySourceSwitch({
				height: source.height,
				packagePath: resolveJianyingNativePortraitPackagePath({
					cacheRoot,
					renderer,
				}),
				resourceId: olympus.resourceId,
				rgba: source.rgba,
				runtime,
				width: source.width,
			});
		}
	}
	const report = {
		generatedAt: new Date().toISOString(),
		provider: "jianying-local-effect-v1",
		runtime: runtime.status,
		source: { width: source.width, height: source.height },
		sourceSwitch,
		results,
	};
	await mkdir(options.runDirectory, { recursive: true });
	await writeFile(
		join(options.runDirectory, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`
	);
	return report;
}

if (import.meta.main) {
	const options = parseNativeDualLutArgs({ argv: process.argv.slice(2) });
	await runNativeDualLutParity({ options });
}
