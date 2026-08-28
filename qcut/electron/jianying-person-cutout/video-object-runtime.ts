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

const VIDEO_OBJECT_GRAPH_SHA256 =
	"797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b";
const VIDEO_OBJECT_MODEL = {
	name: "video_saliency_seg_bce_v1.0_size100_md57b601afc96d910a40a4dd17c0c43c96a.model",
	sha256: "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
} as const;
const VIDEO_OBJECT_GRAPH_MAX_DIMENSION = 512;
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

export interface JianyingVideoObjectRuntime {
	bridgePath: string;
	effectDirectory: string;
	frameworkDirectory: string;
	libraryPath: string;
	modelDirectory: string;
	modelSha256: string;
	processorSha256: string;
	graphHeight: number;
	graphWidth: number;
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

export async function resolveJianyingVideoObjectRuntime({
	height,
	width,
}: {
	height: number;
	width: number;
}): Promise<JianyingVideoObjectRuntime | null> {
	if (process.platform !== "darwin") return null;
	const privateRuntimeRoot = path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
	const jianyingEffectRoot = path.join(
		os.homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"effect"
	);
	const configuredRoot = process.env.QCUT_JIANYING_VIDEO_OBJECT_RUNTIME;
	const modelDirectory = await firstMatchingDirectory({
		candidates: [
			...(configuredRoot ? [path.join(configuredRoot, "Models")] : []),
			path.join(privateRuntimeRoot, "JianyingSaliency", "current", "Models"),
			path.join(privateRuntimeRoot, "JianyingFilter", "current", "Models"),
			path.join(jianyingEffectRoot, "model"),
		],
		files: [VIDEO_OBJECT_MODEL],
	});
	const graphPath = await firstMatchingFile({
		candidates: [
			...(configuredRoot
				? [path.join(configuredRoot, "SourceEffect", "algorithmConfig.json")]
				: []),
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
		],
		sha256: VIDEO_OBJECT_GRAPH_SHA256,
	});
	const libraryPath = await firstMatchingFile({
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
	});
	const bridgePath = await resolveJianyingSaliencyBridge();
	if (!bridgePath || !graphPath || !libraryPath || !modelDirectory) return null;
	const bridgeSha256 = await sha256File({ filePath: bridgePath });
	if (!bridgeSha256) return null;
	const effectDirectory = await prepareEffectDirectory({
		graphSha256: VIDEO_OBJECT_GRAPH_SHA256,
		height,
		width,
	});
	const graphSize = calculateVideoObjectGraphSize({ height, width });
	return {
		bridgePath,
		effectDirectory,
		frameworkDirectory: path.dirname(libraryPath),
		libraryPath,
		modelDirectory,
		modelSha256: VIDEO_OBJECT_MODEL.sha256,
		graphHeight: graphSize.height,
		graphWidth: graphSize.width,
		processorSha256: createHash("sha256")
			.update(bridgeSha256)
			.update(VIDEO_FUSION_LIBRARY_SHA256)
			.update(VIDEO_OBJECT_GRAPH_SHA256)
			.update(EFFECT_CONFIG)
			.update(createAlgorithmConfig({ height, width }))
			.digest("hex"),
	};
}
