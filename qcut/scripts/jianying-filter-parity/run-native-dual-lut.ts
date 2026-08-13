import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { getFFmpegPath, getFFprobePath } from "../../electron/ffmpeg/paths.js";
import { inspectJianyingFilterPackages } from "../../electron/jianying-filter-package-inspector.js";
import type { JianyingKnownFilter } from "../../electron/jianying-filter-metadata.js";
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
import {
	compareUiMaskSequence,
	loadUiMaskManifest,
	loadUiMaskReference,
} from "./dual-lut-ui-mask.js";
import {
	byteMae,
	exportSequenceEvidence,
	maskStatistics,
	measureByteSequenceChange,
	requireMask,
	saveFrameEvidence,
	verifySourceSwitch,
} from "./dual-lut-evidence.js";
import {
	decodeRealVideoSequence,
	measureSequenceMotion,
	type RealVideoFrame,
} from "./real-video-sequence.js";

export const DUAL_LUT_TARGETS: JianyingKnownFilter[] =
	JIANYING_NATIVE_PORTRAIT_PROFILES.map((profile) => ({
		...profile,
		categories: [...profile.categories],
	}));

const MASK_EDGE_VERIFIED_MAX = 0.02;
const MASK_EDGE_CLOSE_MAX = 0.08;

interface NativeDualLutOptions {
	frameCount: number;
	motionStartFrame: number;
	resourceIds?: string[];
	runDirectory: string;
	uiMaskManifestPath?: string;
	videoPath: string;
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
	let frameCount = 70;
	let motionStartFrame: number | undefined;
	let resourceIds: string[] | undefined;
	let runDirectory = "";
	let uiMaskManifestPath = "";
	let videoPath = "";
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--run-dir") {
			runDirectory = requiredValue({ argument, value: argv[index + 1] });
			index += 1;
			continue;
		}
		if (argument === "--video") {
			videoPath = requiredValue({ argument, value: argv[index + 1] });
			index += 1;
			continue;
		}
		if (argument === "--frame-count") {
			frameCount = Number(requiredValue({ argument, value: argv[index + 1] }));
			index += 1;
			continue;
		}
		if (argument === "--motion-start-frame") {
			motionStartFrame = Number(
				requiredValue({ argument, value: argv[index + 1] })
			);
			index += 1;
			continue;
		}
		if (argument === "--ui-mask-manifest") {
			uiMaskManifestPath = requiredValue({
				argument,
				value: argv[index + 1],
			});
			index += 1;
			continue;
		}
		if (argument === "--resource-ids") {
			const values = requiredValue({
				argument,
				value: argv[index + 1],
			})
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
			if (values.length === 0 || new Set(values).size !== values.length) {
				throw new Error("--resource-ids must contain unique IDs");
			}
			const knownIds = new Set(
				DUAL_LUT_TARGETS.map(({ resourceId }) => resourceId)
			);
			const unknownIds = values.filter((value) => !knownIds.has(value));
			if (unknownIds.length > 0) {
				throw new Error(
					`Unknown dual-LUT resource IDs: ${unknownIds.join(", ")}`
				);
			}
			resourceIds = values;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!runDirectory) throw new Error("--run-dir is required");
	if (!videoPath) throw new Error("--video is required");
	if (!(Number.isSafeInteger(frameCount) && frameCount >= 2)) {
		throw new Error("--frame-count must be an integer of at least two");
	}
	const resolvedMotionStartFrame =
		motionStartFrame ?? Math.max(0, frameCount - 10);
	if (
		!(
			Number.isSafeInteger(resolvedMotionStartFrame) &&
			resolvedMotionStartFrame >= 0 &&
			resolvedMotionStartFrame < frameCount - 1
		)
	) {
		throw new Error(
			"--motion-start-frame must leave at least two motion frames"
		);
	}
	return {
		frameCount,
		motionStartFrame: resolvedMotionStartFrame,
		...(resourceIds ? { resourceIds } : {}),
		runDirectory,
		videoPath,
		...(uiMaskManifestPath ? { uiMaskManifestPath } : {}),
	} satisfies NativeDualLutOptions;
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function maskEdgeStatus({ maskEdgeMae }: { maskEdgeMae: number }) {
	if (maskEdgeMae <= MASK_EDGE_VERIFIED_MAX) return "verified" as const;
	if (maskEdgeMae <= MASK_EDGE_CLOSE_MAX) return "close" as const;
	return "unverified" as const;
}

async function renderSequence({
	frames,
	session,
}: {
	frames: RealVideoFrame[];
	session: Awaited<ReturnType<typeof createJianyingFilterLocalRenderSession>>;
}) {
	const results: JianyingFilterLocalRenderResult[] = [];
	const timesMs: number[] = [];
	const renderFrame = async ({ index }: { index: number }): Promise<void> => {
		const frame = frames[index];
		if (!frame) return;
		const startedAt = performance.now();
		results.push(
			await session.render({
				rgba: frame.rgba,
				timestampSeconds: frame.timestampSeconds,
			})
		);
		timesMs.push(performance.now() - startedAt);
		return renderFrame({ index: index + 1 });
	};
	await renderFrame({ index: 0 });
	return { results, timesMs };
}

export async function runNativeDualLutParity({
	options,
}: {
	options: NativeDualLutOptions;
}) {
	const targets = options.resourceIds
		? DUAL_LUT_TARGETS.filter(({ resourceId }) =>
				options.resourceIds?.includes(resourceId)
			)
		: DUAL_LUT_TARGETS;
	const sequence = await decodeRealVideoSequence({
		videoPath: options.videoPath,
		frameCount: options.frameCount,
	});
	if (sequence.motion.movingPairCount === 0) {
		throw new Error("Decoded fixture contains no measurable real movement");
	}
	const manifest = options.uiMaskManifestPath
		? await loadUiMaskManifest({
				manifestPath: options.uiMaskManifestPath,
				sourceSha256: sequence.sourceSha256,
				frameCount: sequence.frames.length,
				width: sequence.width,
				height: sequence.height,
			})
		: null;
	const references = await listJianyingLutReferences();
	const [packages, runtime] = await Promise.all([
		inspectJianyingFilterPackages({
			filters: targets,
			references,
		}),
		inspectJianyingFilterLocalRuntime({ refresh: true }),
	]);
	if (runtime.status.state !== "ready") {
		throw new Error(runtime.status.message);
	}
	const cacheRoot = dirname(jianyingEffectCacheRoot());
	const ffmpegPath = getFFmpegPath();
	const ffprobePath = await getFFprobePath();
	const results = [];
	for (const target of targets) {
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
			width: sequence.width,
			height: sequence.height,
			bootstrapRgba: sequence.frames[0].rgba,
			runtime,
		});
		const initializedMs = performance.now() - initializedAt;
		let renderedSequence:
			| Awaited<ReturnType<typeof renderSequence>>
			| undefined;
		try {
			renderedSequence = await renderSequence({
				frames: sequence.frames,
				session,
			});
		} finally {
			await session.dispose();
		}
		if (!renderedSequence) throw new Error("Native sequence render failed");
		const frameResults = renderedSequence.results;
		const frameTimesMs = renderedSequence.timesMs;
		const masks = frameResults.map((result) => requireMask({ result }));
		const lastFrameResult = frameResults.at(-1);
		const lastMask = masks.at(-1);
		if (!(lastFrameResult && lastMask)) {
			throw new Error("Native sequence render returned no frames");
		}
		const outputDirectory = join(options.runDirectory, target.resourceId);
		await mkdir(outputDirectory, { recursive: true });
		await saveFrameEvidence({
			directory: outputDirectory,
			ffmpegPath,
			result: lastFrameResult,
		});
		const exportedVideo = await exportSequenceEvidence({
			frames: frameResults.map((frame) => frame.rgba),
			width: sequence.width,
			height: sequence.height,
			fps: sequence.fps,
			ffmpegPath,
			ffprobePath,
			outputPath: join(outputDirectory, "real-video-export.mp4"),
		});
		const uiReference = manifest
			? await loadUiMaskReference({ manifest, packagePath })
			: null;
		const uiMask = uiReference
			? await compareUiMaskSequence({
					nativeMasks: masks,
					reference: uiReference,
					candidatePath: join(outputDirectory, "candidate-mask-sequence.gray"),
				})
			: null;
		const uiMaskStatus = uiMask
			? maskEdgeStatus({ maskEdgeMae: uiMask.maskEdgeMae })
			: null;
		if (uiMaskStatus === "unverified") {
			throw new Error(
				`${target.title} mask edge MAE ${uiMask?.maskEdgeMae} exceeds ${MASK_EDGE_CLOSE_MAX}`
			);
		}
		const measurementStartFrame =
			uiReference?.measurementStartFrame ?? options.motionStartFrame;
		const measuredSourceMotion = measureSequenceMotion({
			frames: sequence.frames
				.slice(measurementStartFrame)
				.map((frame) => frame.rgba),
		});
		const measuredMaskMotion = measureByteSequenceChange({
			frames: masks.slice(measurementStartFrame).map((mask) => mask.bytes),
		});
		if (measuredMaskMotion.changedPairCount === 0) {
			throw new Error(
				`${target.title} mask did not respond to person movement`
			);
		}
		const sourceSwitch = await verifySourceSwitch({
			height: sequence.height,
			packagePath,
			resourceId: target.resourceId,
			sourceARgba: sequence.frames[0].rgba,
			sourceBRgba: sequence.frames.at(-1)?.rgba ?? sequence.frames[0].rgba,
			runtime,
			width: sequence.width,
		});
		if (!(sourceSwitch.rgbaExact && sourceSwitch.maskExact)) {
			throw new Error(
				`${target.title} source switch diverged from a fresh session`
			);
		}
		const result = {
			status: "ok" as const,
			...target,
			processId: session.processId,
			initializedMs,
			frameTimesMs,
			outputSha256: sha256({ bytes: lastFrameResult.rgba }),
			maskSha256: sha256({ bytes: lastMask.bytes }),
			mask: maskStatistics(lastMask),
			maskTemporalMae: masks
				.slice(1)
				.map((mask, index) =>
					byteMae({ left: masks[index].bytes, right: mask.bytes })
				),
			movement: measuredSourceMotion,
			maskMovement: measuredMaskMotion,
			sourceSwitch,
			exportedVideo,
			...(uiReference
				? {
						uiMaskReference: {
							algorithmGraphSha256: uiReference.algorithmGraphSha256,
							label: uiReference.label,
							maskPath: uiReference.maskPath,
							maskSha256: uiReference.maskSha256,
							measurementStartFrame,
						},
						uiMask,
						uiMaskStatus,
						maskEdgeMae: uiMask?.maskEdgeMae,
					}
				: {}),
		};
		results.push(result);
		console.log(
			`[${results.length}/${targets.length}] ${target.title}: ${frameTimesMs.length} real frames, edge=${uiMask?.maskEdgeMae.toFixed(6) ?? "missing"}`
		);
	}
	const report = {
		generatedAt: new Date().toISOString(),
		provider: "jianying-local-effect-v1",
		runtime: runtime.status,
		source: {
			kind: "real-video" as const,
			path: options.videoPath,
			sha256: sequence.sourceSha256,
			width: sequence.width,
			height: sequence.height,
			fps: sequence.fps,
			frameCount: sequence.frames.length,
			motion: sequence.motion,
			motionStartFrame: options.motionStartFrame,
		},
		uiMaskManifest: manifest?.manifestPath ?? null,
		uiMaskThresholds: {
			verifiedMax: MASK_EDGE_VERIFIED_MAX,
			closeMax: MASK_EDGE_CLOSE_MAX,
		},
		resourceIds: targets.map(({ resourceId }) => resourceId),
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
