import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	firstMatchingDirectory,
	firstMatchingFile,
	sha256File,
	VIDEO_FUSION_LIBRARY_SHA256,
} from "./runtime-assets.js";
import { resolveJianyingSaliencyBridge } from "./saliency-bridge-resolver.js";
import type { VideoObjectExecutionBackend } from "./pipeline-descriptor.js";
import { VIDEO_OBJECT_ALPHA_QUALITY_FAILURE } from "./video-object-circuit-breaker.js";
import { resolveVideoObjectBachBridge } from "./video-object-bach-bridge-resolver.js";
import { resolveVideoObjectCoreMLBridge } from "./video-object-coreml-bridge-resolver.js";
import { prepareVideoObjectCoreMLModel } from "./video-object-coreml-runtime.js";
import {
	verifyVideoObjectBachDependencyClosure,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
} from "./video-object-runtime-closure.js";

export const VIDEO_OBJECT_GRAPH_SHA256 =
	"797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b";
export const VIDEO_OBJECT_BACH_RUNTIME_UUID =
	"D6342ECD-5432-33F0-A2AD-0C28F5699994";
export const VIDEO_OBJECT_BACH_RUNTIME_SHA256 =
	"0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9";
const VIDEO_OBJECT_MODEL = {
	name: "video_saliency_seg_bce_v1.0_size100_md57b601afc96d910a40a4dd17c0c43c96a.model",
	sha256: "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
} as const;
const VIDEO_OBJECT_GRAPH_MAX_DIMENSION = 512;
export const VIDEO_OBJECT_COREML_PROCESSOR_VERSION =
	"source-rgba-direct-256-v2";
export const VIDEO_OBJECT_BACH_PROCESSOR_VERSION =
	"jianying-bach-d634-tematting-blend-v2-source-alpha-v1";
export const VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY = {
	dependencyClosureMarker: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
	dependencyClosureSha256: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
	effectRegistration: "jianying-bach-algorithm-plus-tematting-blend-v2",
	graphSha256: VIDEO_OBJECT_GRAPH_SHA256,
	hostEffectRegistry: "not-required-bach-direct",
	implementationRole: "audited-jianying-runtime",
	inputTransport: "ite-video-frame-cvpixelbuffer-bgra-v1",
	modelSha256: VIDEO_OBJECT_MODEL.sha256,
	outputContract: "tematting-blend-effect-v2-source-alpha-u8-v1",
	postprocess: "TEMattingBlendEffectV2-vendor-exact",
	readiness: "exact-runtime-model-graph-vendor-v2-closure-pinned",
	refinement: "vendor-v2-exact-no-qcut-refinement-v1",
	runtimeSha256: VIDEO_OBJECT_BACH_RUNTIME_SHA256,
	runtimeUuid: VIDEO_OBJECT_BACH_RUNTIME_UUID,
	temporalState: "te-bach-matting-session-v1",
} as const;
export const VIDEO_OBJECT_PROVIDER_CAPABILITY = {
	effectRegistration: "not-required-direct-coreml",
	hostEffectRegistry: "bypassed",
	implementationRole: "private-host-independent-fallback",
	inputTransport: "same-model-coreml-source-rgba-direct-256-v2",
	inputTransportStatus: "bach-capture-close-not-bit-exact-frame0",
	modelResolution: "resolved",
	modelResolver: "packed-model-coreml-extractor-v1",
	outputValidation: "coreml-tensor-contract-v1",
	readiness: "same-model-coreml-validated",
	temporalState: "previous-image-and-mask-v1",
} as const;
export const VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY = {
	effectRegistration: "qcut-generated-standalone-effect-v1",
	hostEffectRegistry: "not-reproduced",
	inputTransport: "effect-c-api-texture-v1",
	inputTransportStatus: "host-context-unverified",
	modelResolution: "resolved",
	modelResolver: "effect-c-api-file-resource-finder-v1",
	outputValidation: VIDEO_OBJECT_ALPHA_QUALITY_FAILURE,
	readiness: "output-gated-candidate",
} as const;
const EFFECT_CONFIG = `${JSON.stringify(
	{
		bALG_BACH_CONFIG: true,
		effect: {
			Link: [],
			model_names: { matting: ["video_saliency_seg_bce"] },
		},
		name: "ai_matting_video_object",
		version: "16.5.0",
	},
	null,
	2
)}\n`;

function roundToEven({ value }: { value: number }) {
	return Math.max(2, Math.round(value / 2) * 2);
}

export function calculateVideoObjectGraphSize({
	height,
	width,
}: {
	height: number;
	width: number;
}) {
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		throw new Error("视频尺寸无效");
	}
	const scale = VIDEO_OBJECT_GRAPH_MAX_DIMENSION / Math.max(width, height);
	return {
		width: roundToEven({ value: width * scale }),
		height: roundToEven({ value: height * scale }),
	};
}

function createAlgorithmConfig({
	height,
	width,
}: {
	height: number;
	width: number;
}) {
	const graphSize = calculateVideoObjectGraphSize({ height, width });
	return `${JSON.stringify(
		{
			version: "1.0",
			mode: 2,
			name: "AlgorithmGraph_9bpck63bYbqbZAcfdUcjcAbNdWcf",
			nodes: [
				{
					name: "video_saliency_seg_0",
					type: "general_seg",
					config: {
						keyMaps: {
							intParam: {},
							floatParam: {},
							stringParam: { model_name: "video_saliency_seg_bce" },
							pathParam: {},
						},
					},
				},
				{
					name: "textureBlitter",
					type: "texture_blit",
					config: {
						size: graphSize,
						keyMaps: { intParam: {}, floatParam: {}, stringParam: {} },
					},
				},
			],
			links: [
				{
					fromNode: "textureBlitter",
					fromIndex: 0,
					toNode: "video_saliency_seg_0",
					toIndex: 0,
				},
			],
		},
		null,
		2
	)}\n`;
}

export interface JianyingVideoObjectRuntimeCandidate {
	bridgePath: string;
	capabilitySha256: string;
	coreMLModelPath: string | null;
	dependencyClosureSha256: string | null;
	effectDirectory: string | null;
	executionBackend: VideoObjectExecutionBackend;
	frameworkDirectory: string | null;
	graphDirectory: string | null;
	libraryPath: string | null;
	modelDirectory: string;
	modelPath: string;
	modelSha256: string;
	processorSha256: string;
	providerCapability:
		| typeof VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY
		| typeof VIDEO_OBJECT_PROVIDER_CAPABILITY
		| typeof VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY;
	readiness:
		| typeof VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY.readiness
		| typeof VIDEO_OBJECT_PROVIDER_CAPABILITY.readiness
		| typeof VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY.readiness;
}

export function createVideoObjectRuntimeFingerprints({
	backend = "same-model-coreml-v1",
	bridgeSha256,
	height,
	width,
}: {
	backend?: VideoObjectExecutionBackend;
	bridgeSha256: string;
	height: number;
	width: number;
}) {
	const providerCapability =
		backend === "jianying-bach-v2-exact-d634-v1"
			? VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY
			: backend === "same-model-coreml-v1"
				? VIDEO_OBJECT_PROVIDER_CAPABILITY
				: VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY;
	const runtimeFingerprint =
		backend === "jianying-bach-v2-exact-d634-v1"
			? `${VIDEO_OBJECT_BACH_RUNTIME_SHA256}:${VIDEO_OBJECT_BACH_RUNTIME_UUID}:${VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256}`
			: backend === "same-model-coreml-v1"
				? "coreml-system-runtime-v1"
				: VIDEO_FUSION_LIBRARY_SHA256;
	const capabilitySha256 = createHash("sha256")
		.update(bridgeSha256)
		.update(runtimeFingerprint)
		.update(VIDEO_OBJECT_GRAPH_SHA256)
		.update(VIDEO_OBJECT_MODEL.sha256)
		.update(EFFECT_CONFIG)
		.update(JSON.stringify(providerCapability))
		.digest("hex");
	return {
		capabilitySha256,
		processorSha256: createHash("sha256")
			.update(capabilitySha256)
			.update(
				backend === "jianying-bach-v2-exact-d634-v1"
					? VIDEO_OBJECT_BACH_PROCESSOR_VERSION
					: VIDEO_OBJECT_COREML_PROCESSOR_VERSION
			)
			.update(
				backend === "effect-host-interop-v1"
					? createAlgorithmConfig({ height, width })
					: JSON.stringify({ height, width, system: os.release() })
			)
			.digest("hex"),
	};
}

async function writeGeneratedFile({
	contents,
	filePath,
}: {
	contents: string;
	filePath: string;
}) {
	try {
		if ((await readFile(filePath, "utf8")) === contents) return;
	} catch {
		// Missing or partial cache files are repaired atomically below.
	}
	const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, contents, "utf8");
	await rename(temporaryPath, filePath);
}

async function prepareEffectDirectory({
	graphSha256,
	height,
	width,
}: {
	graphSha256: string;
	height: number;
	width: number;
}) {
	const algorithmConfig = createAlgorithmConfig({ height, width });
	const fingerprint = createHash("sha256")
		.update(graphSha256)
		.update(EFFECT_CONFIG)
		.update(algorithmConfig)
		.digest("hex")
		.slice(0, 16);
	const directory = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-video-object-effect",
		fingerprint
	);
	await mkdir(directory, { recursive: true });
	await Promise.all([
		writeGeneratedFile({
			contents: algorithmConfig,
			filePath: path.join(directory, "algorithmConfig.json"),
		}),
		writeGeneratedFile({
			contents: EFFECT_CONFIG,
			filePath: path.join(directory, "config.json"),
		}),
	]);
	return directory;
}

interface VideoObjectRuntimeAssetRoots {
	configuredRoot: string | undefined;
	jianyingEffectRoot: string;
	privateRuntimeRoot: string;
}

function videoObjectRuntimeAssetRoots(): VideoObjectRuntimeAssetRoots {
	const home = os.homedir();
	return {
		configuredRoot: process.env.QCUT_JIANYING_VIDEO_OBJECT_RUNTIME,
		jianyingEffectRoot: path.join(
			home,
			"Movies",
			"JianyingPro",
			"User Data",
			"Cache",
			"effect"
		),
		privateRuntimeRoot: path.join(
			home,
			"Library",
			"Application Support",
			"QCut",
			"PrivateRuntimes"
		),
	};
}

async function resolveVideoObjectModelDirectory({
	roots,
}: {
	roots: VideoObjectRuntimeAssetRoots;
}) {
	const { configuredRoot, jianyingEffectRoot, privateRuntimeRoot } = roots;
	return firstMatchingDirectory({
		candidates: [
			...(configuredRoot
				? [
						path.join(configuredRoot, "Models"),
						path.join(configuredRoot, "Models", "user-cache"),
					]
				: []),
			path.join(
				privateRuntimeRoot,
				"JianyingTransition",
				"current",
				"Models",
				"user-cache"
			),
			path.join(privateRuntimeRoot, "JianyingSaliency", "current", "Models"),
			path.join(privateRuntimeRoot, "JianyingFilter", "current", "Models"),
			path.join(jianyingEffectRoot, "model"),
		],
		files: [VIDEO_OBJECT_MODEL],
	});
}

function videoObjectGraphCandidates({
	roots,
}: {
	roots: VideoObjectRuntimeAssetRoots;
}) {
	const { configuredRoot, jianyingEffectRoot, privateRuntimeRoot } = roots;
	return [
		...(configuredRoot
			? [
					path.join(configuredRoot, "SourceEffect", "algorithmConfig.json"),
					path.join(
						configuredRoot,
						"Models",
						"app-bundle",
						"matting_config",
						"ai_matting_video_object",
						"algorithmConfig.json"
					),
				]
			: []),
		path.join(
			privateRuntimeRoot,
			"JianyingTransition",
			"current",
			"Models",
			"app-bundle",
			"matting_config",
			"ai_matting_video_object",
			"algorithmConfig.json"
		),
		path.join(
			privateRuntimeRoot,
			"JianyingVideoObject",
			"current",
			"SourceEffect",
			"algorithmConfig.json"
		),
		path.join(
			jianyingEffectRoot,
			"7366590389928595994",
			"94715bdc841b34cd5451b4b9c181bde4",
			"ai_matting_video_object",
			"algorithmConfig.json"
		),
	];
}

async function resolveBachVideoObjectCandidate({
	height,
	modelDirectory,
	modelPath,
	roots,
	width,
}: {
	height: number;
	modelDirectory: string;
	modelPath: string;
	roots: VideoObjectRuntimeAssetRoots;
	width: number;
}): Promise<JianyingVideoObjectRuntimeCandidate | null> {
	try {
		const { configuredRoot, privateRuntimeRoot } = roots;
		const [bridgePath, graphPath, libraryPath] = await Promise.all([
			resolveVideoObjectBachBridge(),
			firstMatchingFile({
				candidates: videoObjectGraphCandidates({ roots }),
				sha256: VIDEO_OBJECT_GRAPH_SHA256,
			}),
			firstMatchingFile({
				candidates: [
					...(configuredRoot
						? [path.join(configuredRoot, "Frameworks", "libcccreator.dylib")]
						: []),
					path.join(
						privateRuntimeRoot,
						"JianyingTransition",
						"current",
						"Frameworks",
						"libcccreator.dylib"
					),
					path.join(
						privateRuntimeRoot,
						"JianyingFilter",
						"current",
						"Frameworks",
						"libcccreator.dylib"
					),
				],
				sha256: VIDEO_OBJECT_BACH_RUNTIME_SHA256,
			}),
		]);
		if (!bridgePath || !graphPath || !libraryPath) return null;
		const dependencyClosure = await verifyVideoObjectBachDependencyClosure({
			expectedCoreUuid: VIDEO_OBJECT_BACH_RUNTIME_UUID,
			expectedRuntimeSha256: VIDEO_OBJECT_BACH_RUNTIME_SHA256,
			runtimeRoot: path.dirname(path.dirname(libraryPath)),
		});
		const bridgeSha256 = await sha256File({ filePath: bridgePath });
		if (!bridgeSha256) return null;
		const fingerprints = createVideoObjectRuntimeFingerprints({
			backend: "jianying-bach-v2-exact-d634-v1",
			bridgeSha256,
			height,
			width,
		});
		return {
			bridgePath,
			capabilitySha256: fingerprints.capabilitySha256,
			coreMLModelPath: null,
			dependencyClosureSha256: dependencyClosure.dependencyClosureSha256,
			effectDirectory: null,
			executionBackend: "jianying-bach-v2-exact-d634-v1",
			frameworkDirectory: path.dirname(libraryPath),
			graphDirectory: path.dirname(graphPath),
			libraryPath,
			modelDirectory,
			modelPath,
			modelSha256: VIDEO_OBJECT_MODEL.sha256,
			processorSha256: fingerprints.processorSha256,
			providerCapability: VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY,
			readiness: VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY.readiness,
		};
	} catch (error) {
		console.warn(
			"QCut could not prepare the audited Jianying Bach runtime.",
			error
		);
		return null;
	}
}

async function resolveCoreMLVideoObjectCandidate({
	height,
	modelDirectory,
	modelPath,
	width,
}: {
	height: number;
	modelDirectory: string;
	modelPath: string;
	width: number;
}): Promise<JianyingVideoObjectRuntimeCandidate | null> {
	try {
		const bridgePath = await resolveVideoObjectCoreMLBridge();
		if (!bridgePath) return null;
		const coreMLModelPath = await prepareVideoObjectCoreMLModel({
			modelPath,
			modelSha256: VIDEO_OBJECT_MODEL.sha256,
		});
		const bridgeSha256 = await sha256File({ filePath: bridgePath });
		if (!bridgeSha256) return null;
		const fingerprints = createVideoObjectRuntimeFingerprints({
			bridgeSha256,
			height,
			width,
		});
		return {
			bridgePath,
			capabilitySha256: fingerprints.capabilitySha256,
			coreMLModelPath,
			dependencyClosureSha256: null,
			effectDirectory: null,
			executionBackend: "same-model-coreml-v1",
			frameworkDirectory: null,
			graphDirectory: null,
			libraryPath: null,
			modelDirectory,
			modelPath,
			modelSha256: VIDEO_OBJECT_MODEL.sha256,
			processorSha256: fingerprints.processorSha256,
			providerCapability: VIDEO_OBJECT_PROVIDER_CAPABILITY,
			readiness: VIDEO_OBJECT_PROVIDER_CAPABILITY.readiness,
		};
	} catch (error) {
		console.warn(
			"QCut could not prepare the same-model CoreML video-object runtime.",
			error
		);
		return null;
	}
}

async function resolveLegacyHostVideoObjectCandidate({
	height,
	modelDirectory,
	modelPath,
	roots,
	width,
}: {
	height: number;
	modelDirectory: string;
	modelPath: string;
	roots: VideoObjectRuntimeAssetRoots;
	width: number;
}): Promise<JianyingVideoObjectRuntimeCandidate | null> {
	try {
		const { configuredRoot, privateRuntimeRoot } = roots;
		const [graphPath, libraryPath] = await Promise.all([
			firstMatchingFile({
				candidates: videoObjectGraphCandidates({ roots }),
				sha256: VIDEO_OBJECT_GRAPH_SHA256,
			}),
			firstMatchingFile({
				candidates: [
					...(configuredRoot
						? [path.join(configuredRoot, "Frameworks", "libcccreator.dylib")]
						: []),
					path.join(
						privateRuntimeRoot,
						"JianyingVideoObject",
						"current",
						"Frameworks",
						"libcccreator.dylib"
					),
					path.join(
						"/Applications",
						"VideoFusion-macOS.app",
						"Contents",
						"Frameworks",
						"libcccreator.dylib"
					),
				],
				sha256: VIDEO_FUSION_LIBRARY_SHA256,
			}),
		]);
		if (!graphPath || !libraryPath) return null;
		const bridgePath = await resolveJianyingSaliencyBridge();
		if (!bridgePath) return null;
		const bridgeSha256 = await sha256File({ filePath: bridgePath });
		if (!bridgeSha256) return null;
		const effectDirectory = await prepareEffectDirectory({
			graphSha256: VIDEO_OBJECT_GRAPH_SHA256,
			height,
			width,
		});
		const fingerprints = createVideoObjectRuntimeFingerprints({
			backend: "effect-host-interop-v1",
			bridgeSha256,
			height,
			width,
		});
		return {
			bridgePath,
			capabilitySha256: fingerprints.capabilitySha256,
			coreMLModelPath: null,
			dependencyClosureSha256: null,
			effectDirectory,
			executionBackend: "effect-host-interop-v1",
			frameworkDirectory: path.dirname(libraryPath),
			graphDirectory: null,
			libraryPath,
			modelDirectory,
			modelPath,
			modelSha256: VIDEO_OBJECT_MODEL.sha256,
			providerCapability: VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY,
			readiness: VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY.readiness,
			processorSha256: fingerprints.processorSha256,
		};
	} catch (error) {
		console.warn(
			"QCut could not prepare the host video-object runtime.",
			error
		);
		return null;
	}
}

export async function resolveJianyingVideoObjectRuntimeCandidates({
	height,
	width,
}: {
	height: number;
	width: number;
}): Promise<JianyingVideoObjectRuntimeCandidate[]> {
	if (process.platform !== "darwin") return [];
	const roots = videoObjectRuntimeAssetRoots();
	let modelDirectory: string | null;
	try {
		modelDirectory = await resolveVideoObjectModelDirectory({ roots });
	} catch (error) {
		console.warn("QCut could not locate the video-object model.", error);
		return [];
	}
	if (!modelDirectory) return [];
	const modelPath = path.join(modelDirectory, VIDEO_OBJECT_MODEL.name);
	const bach = await resolveBachVideoObjectCandidate({
		height,
		modelDirectory,
		modelPath,
		roots,
		width,
	});
	const coreML = await resolveCoreMLVideoObjectCandidate({
		height,
		modelDirectory,
		modelPath,
		width,
	});
	const legacyHost = await resolveLegacyHostVideoObjectCandidate({
		height,
		modelDirectory,
		modelPath,
		roots,
		width,
	});
	return [bach, coreML, legacyHost].filter(
		(candidate): candidate is JianyingVideoObjectRuntimeCandidate =>
			candidate !== null
	);
}

export async function resolveJianyingVideoObjectRuntimeCandidate({
	height,
	width,
}: {
	height: number;
	width: number;
}): Promise<JianyingVideoObjectRuntimeCandidate | null> {
	return (
		(await resolveJianyingVideoObjectRuntimeCandidates({ height, width }))[0] ??
		null
	);
}
