import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inspectJianyingFilterPackages } from "../../electron/jianying-filter-package-inspector.js";
import { inspectJianyingFilterLocalRuntime } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import {
	jianyingEffectCacheRoot,
	listJianyingLutReferences,
} from "../../electron/native-pipeline/filters/filter-lab-lut.js";
import {
	JIANYING_NATIVE_PORTRAIT_PROFILES,
	resolveJianyingNativePortraitPackagePath,
} from "../../electron/native-pipeline/filters/filter-lab-native-portrait.js";
import { withDualLutDiagnosticSessions } from "./dual-lut-diagnostic-render.js";
import {
	inferDualLutMaskFrame,
	summarizeMaskReferenceComparison,
	UI_MASK_MINIMUM_COLOR_DISTANCE_SQUARED,
} from "./dual-lut-mask-inference.js";
import { algorithmGraphSha256 } from "./dual-lut-ui-mask.js";
import {
	decodeRealVideoSequence,
	type RealVideoSequence,
} from "./real-video-sequence.js";

const OLYMPUS_RESOURCE_ID = "7361792068475325735";
const CALIBRATION_MAX_MASK_MAE = 0.03;
const CALIBRATION_MIN_CORRELATION = 0.98;
const INFERENCE_MAX_RECONSTRUCTION_RGB_RMSE = 8;

interface CalibrationOptions {
	filteredVideo: string;
	resourceId: string;
	sourceVideo: string;
	uiMask: string;
}

interface BuildUiMaskOptions {
	directUiMask?: string;
	filteredVideo?: string;
	frameCount: number;
	measurementStartFrame: number;
	outputDirectory: string;
	resourceId: string;
	sourceVideo: string;
	calibration?: CalibrationOptions;
}

interface InferredReference {
	confidenceCoverage: number[];
	filteredVideo: string;
	filteredVideoSha256: string;
	masks: Uint8Array[];
	reconstructionRgbRmse: number[];
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

export function parseBuildUiMaskArgs({ argv }: { argv: string[] }) {
	let directUiMask = "";
	let filteredVideo = "";
	let frameCount = 70;
	let measurementStartFrame = 60;
	let outputDirectory = "";
	let resourceId = "";
	let sourceVideo = "";
	let calibrationFilteredVideo = "";
	let calibrationResourceId = OLYMPUS_RESOURCE_ID;
	let calibrationSourceVideo = "";
	let calibrationUiMask = "";
	for (let index = 0; index < argv.length; index += 2) {
		const argument = argv[index];
		const value = requiredValue({ argument, value: argv[index + 1] });
		if (argument === "--direct-ui-mask") directUiMask = value;
		else if (argument === "--filtered-video") filteredVideo = value;
		else if (argument === "--frame-count") frameCount = Number(value);
		else if (argument === "--measurement-start-frame") {
			measurementStartFrame = Number(value);
		} else if (argument === "--output-dir") outputDirectory = value;
		else if (argument === "--resource-id") resourceId = value;
		else if (argument === "--source-video") sourceVideo = value;
		else if (argument === "--calibration-filtered-video") {
			calibrationFilteredVideo = value;
		} else if (argument === "--calibration-resource-id") {
			calibrationResourceId = value;
		} else if (argument === "--calibration-source-video") {
			calibrationSourceVideo = value;
		} else if (argument === "--calibration-ui-mask") {
			calibrationUiMask = value;
		} else throw new Error(`Unknown argument: ${argument}`);
	}
	if (!(sourceVideo && resourceId && outputDirectory)) {
		throw new Error(
			"UI mask build requires source, resource ID, and output paths"
		);
	}
	if (Boolean(directUiMask) === Boolean(filteredVideo)) {
		throw new Error(
			"Choose exactly one of --direct-ui-mask or --filtered-video"
		);
	}
	if (!(Number.isSafeInteger(frameCount) && frameCount >= 2)) {
		throw new Error("--frame-count must be an integer of at least two");
	}
	if (
		!(
			Number.isSafeInteger(measurementStartFrame) &&
			measurementStartFrame >= 0 &&
			measurementStartFrame < frameCount
		)
	) {
		throw new Error("--measurement-start-frame is outside the frame sequence");
	}
	const calibrationPaths = [
		calibrationSourceVideo,
		calibrationFilteredVideo,
		calibrationUiMask,
	];
	if (filteredVideo && calibrationPaths.some((value) => !value)) {
		throw new Error("Inferred UI masks require all calibration paths");
	}
	return {
		frameCount,
		measurementStartFrame,
		outputDirectory,
		resourceId,
		sourceVideo,
		...(directUiMask ? { directUiMask } : {}),
		...(filteredVideo
			? {
					filteredVideo,
					calibration: {
						filteredVideo: calibrationFilteredVideo,
						resourceId: calibrationResourceId,
						sourceVideo: calibrationSourceVideo,
						uiMask: calibrationUiMask,
					},
				}
			: {}),
	} satisfies BuildUiMaskOptions;
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function splitFrames({
	bytes,
	frameBytes,
	frameCount,
}: {
	bytes: Uint8Array;
	frameBytes: number;
	frameCount: number;
}) {
	if (bytes.length !== frameBytes * frameCount) {
		throw new Error("UI mask reference has the wrong byte length");
	}
	return Array.from({ length: frameCount }, (_, index) =>
		bytes.slice(index * frameBytes, (index + 1) * frameBytes)
	);
}

function mean({ values }: { values: number[] }) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function graphIdentity({ packagePath }: { packagePath: string }) {
	const graph = JSON.parse(
		await readFile(join(packagePath, "algorithmConfig.json"), "utf8")
	) as unknown;
	return algorithmGraphSha256({ graph });
}

async function inferReference({
	resourceId,
	packagePath,
	source,
	filteredVideo,
	runtime,
}: {
	resourceId: string;
	packagePath: string;
	source: RealVideoSequence;
	filteredVideo: string;
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
}): Promise<InferredReference> {
	const filtered = await decodeRealVideoSequence({
		videoPath: filteredVideo,
		frameCount: source.frames.length,
	});
	if (
		filtered.width !== source.width ||
		filtered.height !== source.height ||
		filtered.fps !== source.fps
	) {
		throw new Error("UI filtered video does not match the source timeline");
	}
	return withDualLutDiagnosticSessions({
		resourceId,
		packagePath,
		frames: source.frames,
		width: source.width,
		height: source.height,
		runtime,
		run: async ({ backgroundSession, skinSession }) => {
			const masks: Uint8Array[] = [];
			const confidenceCoverage: number[] = [];
			const reconstructionRgbRmse: number[] = [];
			const renderFrame = async ({
				index,
			}: {
				index: number;
			}): Promise<void> => {
				const sourceFrame = source.frames[index];
				const filteredFrame = filtered.frames[index];
				if (!(sourceFrame && filteredFrame)) return;
				const [background, skin] = await Promise.all([
					backgroundSession.render(sourceFrame),
					skinSession.render(sourceFrame),
				]);
				const inferred = inferDualLutMaskFrame({
					background: background.rgba,
					skin: skin.rgba,
					filtered: filteredFrame.rgba,
				});
				masks.push(inferred.mask);
				confidenceCoverage.push(inferred.confidenceCoverage);
				reconstructionRgbRmse.push(inferred.reconstructionRgbRmse);
				return renderFrame({ index: index + 1 });
			};
			await renderFrame({ index: 0 });
			return {
				masks,
				confidenceCoverage,
				reconstructionRgbRmse,
				filteredVideo,
				filteredVideoSha256: filtered.sourceSha256,
			};
		},
	});
}

async function resolvePackages({ resourceIds }: { resourceIds: string[] }) {
	const uniqueIds = [...new Set(resourceIds)];
	const targets = uniqueIds.map((resourceId) => {
		const target = JIANYING_NATIVE_PORTRAIT_PROFILES.find(
			(profile) => profile.resourceId === resourceId
		);
		if (!target) throw new Error(`Unknown dual-LUT resource ID: ${resourceId}`);
		return target;
	});
	const references = await listJianyingLutReferences();
	const [packages, runtime] = await Promise.all([
		inspectJianyingFilterPackages({ filters: targets, references }),
		inspectJianyingFilterLocalRuntime({ refresh: true }),
	]);
	if (runtime.status.state !== "ready") throw new Error(runtime.status.message);
	const cacheRoot = dirname(jianyingEffectCacheRoot());
	const packagePaths = new Map(
		targets.map(({ resourceId }) => {
			const renderer = packages.get(resourceId)?.nativePortraitRenderer;
			if (!renderer) {
				throw new Error(`Native portrait package missing: ${resourceId}`);
			}
			return [
				resourceId,
				resolveJianyingNativePortraitPackagePath({ cacheRoot, renderer }),
			] as const;
		})
	);
	return { packagePaths, runtime };
}

async function writeManifest({
	options,
	source,
	maskSourcePath,
	maskName,
	group,
	report,
}: {
	options: BuildUiMaskOptions;
	source: RealVideoSequence;
	maskSourcePath: string;
	maskName: string;
	group: { algorithmGraphSha256: string; label: string; maskPath: string };
	report: Record<string, unknown>;
}) {
	await mkdir(options.outputDirectory, { recursive: true });
	const outputMaskPath = join(options.outputDirectory, maskName);
	if (maskSourcePath !== outputMaskPath) {
		await copyFile(maskSourcePath, outputMaskPath);
	}
	const manifestPath = join(options.outputDirectory, "ui-mask-manifest.json");
	const manifest = {
		schemaVersion: 1 as const,
		sourceSha256: source.sourceSha256,
		width: source.width,
		height: source.height,
		frameCount: source.frames.length,
		measurementStartFrame: options.measurementStartFrame,
		groups: [group],
	};
	const buildReport = {
		generatedAt: new Date().toISOString(),
		manifestPath,
		source: {
			path: options.sourceVideo,
			sha256: source.sourceSha256,
			width: source.width,
			height: source.height,
			fps: source.fps,
			frameCount: source.frames.length,
		},
		group,
		...report,
	};
	await Promise.all([
		writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
		writeFile(
			join(options.outputDirectory, "ui-mask-build-report.json"),
			`${JSON.stringify(buildReport, null, 2)}\n`
		),
	]);
	return buildReport;
}

export async function buildDualLutUiMaskManifest({
	options,
}: {
	options: BuildUiMaskOptions;
}) {
	const source = await decodeRealVideoSequence({
		videoPath: options.sourceVideo,
		frameCount: options.frameCount,
	});
	const resourceIds = [
		options.resourceId,
		...(options.calibration ? [options.calibration.resourceId] : []),
	];
	const { packagePaths, runtime } = await resolvePackages({ resourceIds });
	const targetPackage = packagePaths.get(options.resourceId);
	if (!targetPackage) throw new Error("Target package was not resolved");
	const groupGraph = await graphIdentity({ packagePath: targetPackage });
	if (options.directUiMask) {
		const directBytes = new Uint8Array(await readFile(options.directUiMask));
		splitFrames({
			bytes: directBytes,
			frameBytes: source.width * source.height,
			frameCount: source.frames.length,
		});
		const maskName = `${options.resourceId}-direct-ui-mask.gray`;
		return writeManifest({
			options,
			source,
			maskSourcePath: options.directUiMask,
			maskName,
			group: {
				algorithmGraphSha256: groupGraph,
				label: "direct-jianying-ui-mask",
				maskPath: maskName,
			},
			report: {
				mode: "direct-ui-mask",
				maskSha256: sha256({ bytes: directBytes }),
			},
		});
	}
	if (!(options.filteredVideo && options.calibration)) {
		throw new Error("Inferred UI mask options are incomplete");
	}
	const calibrationPackage = packagePaths.get(options.calibration.resourceId);
	if (!calibrationPackage) {
		throw new Error("Calibration package was not resolved");
	}
	const calibrationSource = await decodeRealVideoSequence({
		videoPath: options.calibration.sourceVideo,
		frameCount: options.frameCount,
	});
	const calibrationInference = await inferReference({
		resourceId: options.calibration.resourceId,
		packagePath: calibrationPackage,
		source: calibrationSource,
		filteredVideo: options.calibration.filteredVideo,
		runtime,
	});
	const calibrationMaskBytes = new Uint8Array(
		await readFile(options.calibration.uiMask)
	);
	const calibrationReference = splitFrames({
		bytes: calibrationMaskBytes,
		frameBytes: calibrationSource.width * calibrationSource.height,
		frameCount: calibrationSource.frames.length,
	});
	const calibration = summarizeMaskReferenceComparison({
		reference: calibrationReference,
		candidate: calibrationInference.masks,
		width: calibrationSource.width,
		height: calibrationSource.height,
	});
	await mkdir(options.outputDirectory, { recursive: true });
	await Promise.all([
		writeFile(
			join(options.outputDirectory, "calibration-inferred-mask.gray"),
			Buffer.concat(calibrationInference.masks)
		),
		writeFile(
			join(options.outputDirectory, "calibration-report.json"),
			`${JSON.stringify(
				{
					resourceId: options.calibration.resourceId,
					sourceVideo: options.calibration.sourceVideo,
					filteredVideo: options.calibration.filteredVideo,
					minimumColorDistanceSquared: UI_MASK_MINIMUM_COLOR_DISTANCE_SQUARED,
					calibration,
				},
				null,
				2
			)}\n`
		),
	]);
	if (
		calibration.maskMae > CALIBRATION_MAX_MASK_MAE ||
		calibration.maskCorrelation < CALIBRATION_MIN_CORRELATION
	) {
		throw new Error(
			`UI mask inference calibration failed: MAE ${calibration.maskMae}, correlation ${calibration.maskCorrelation}`
		);
	}
	const inferred = await inferReference({
		resourceId: options.resourceId,
		packagePath: targetPackage,
		source,
		filteredVideo: options.filteredVideo,
		runtime,
	});
	const reconstructionRgbRmse = mean({
		values: inferred.reconstructionRgbRmse,
	});
	if (reconstructionRgbRmse > INFERENCE_MAX_RECONSTRUCTION_RGB_RMSE) {
		throw new Error(
			`UI mask reconstruction RMSE is too high: ${reconstructionRgbRmse}`
		);
	}
	const maskName = `${options.resourceId}-inferred-ui-mask.gray`;
	const maskPath = join(options.outputDirectory, maskName);
	const maskBytes = Buffer.concat(inferred.masks);
	await writeFile(maskPath, maskBytes);
	return writeManifest({
		options,
		source,
		maskSourcePath: maskPath,
		maskName,
		group: {
			algorithmGraphSha256: groupGraph,
			label: "calibrated-jianying-ui-inferred-mask",
			maskPath: maskName,
		},
		report: {
			mode: "calibrated-ui-inference",
			maskSha256: sha256({ bytes: maskBytes }),
			inference: {
				filteredVideo: inferred.filteredVideo,
				filteredVideoSha256: inferred.filteredVideoSha256,
				minimumColorDistanceSquared: UI_MASK_MINIMUM_COLOR_DISTANCE_SQUARED,
				confidenceCoverage: mean({ values: inferred.confidenceCoverage }),
				reconstructionRgbRmse,
				maxReconstructionRgbRmse: INFERENCE_MAX_RECONSTRUCTION_RGB_RMSE,
			},
			calibration: {
				resourceId: options.calibration.resourceId,
				sourceVideo: options.calibration.sourceVideo,
				filteredVideo: calibrationInference.filteredVideo,
				filteredVideoSha256: calibrationInference.filteredVideoSha256,
				maskSha256: sha256({ bytes: calibrationMaskBytes }),
				thresholds: {
					maxMaskMae: CALIBRATION_MAX_MASK_MAE,
					minCorrelation: CALIBRATION_MIN_CORRELATION,
				},
				metrics: calibration,
			},
		},
	});
}

if (import.meta.main) {
	const options = parseBuildUiMaskArgs({ argv: process.argv.slice(2) });
	const report = await buildDualLutUiMaskManifest({ options });
	console.log(JSON.stringify(report, null, 2));
}
