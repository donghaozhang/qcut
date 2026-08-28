import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { resolveJianyingSaliencyBridge } from "./saliency-bridge-resolver.js";
import {
	firstMatchingDirectory,
	firstMatchingFile,
	sha256File,
	VIDEO_FUSION_LIBRARY_SHA256,
} from "./runtime-assets.js";
const MODEL_FILES = [
	{
		name: "saliency_matting_v1.0_size0_md55882cbfb5e9c1f205cd599d3c5d0833a.model",
		sha256: "ac2ae6badafc6a94641dc59b5844762676eee71b218785bfad37169eea380341",
	},
	{
		name: "saliency_script_for_cc_v1.2_size0_md57b5c3cdeb513b9e4d65f0e3fd5909100.model",
		sha256: "4d7fbc2ec820f28f3d0c8531a63d53a338d091a989109f20ee67377c4f594c01",
	},
	{
		name: "video_saliency_seg_bce_v1.0_size100_md57b601afc96d910a40a4dd17c0c43c96a.model",
		sha256: "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
	},
] as const;
const EFFECT_FILES = [
	{
		name: "algorithmConfig.json",
		sha256: "58ae549c87d82c487e546732ab4e4f91de6b7db8773b3048bf1753b4871788ef",
	},
	{
		name: "config.json",
		sha256: "652ad89364eeaf614d6e98c180ad3403420ff641e8f8b8e9d9209c07880453f0",
	},
] as const;

export interface JianyingSaliencyRuntime {
	bridgePath: string;
	effectDirectory: string;
	frameworkDirectory: string;
	libraryPath: string;
	modelDirectory: string;
	modelSha256: string;
	processorSha256: string;
}

export async function resolveJianyingSaliencyRuntime(): Promise<JianyingSaliencyRuntime | null> {
	if (process.platform !== "darwin") return null;
	const privateRuntimeRoot = path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
	const jianyingCacheRoot = path.join(
		os.homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"effect"
	);
	const configuredRoot = process.env.QCUT_JIANYING_SALIENCY_RUNTIME;
	const modelDirectory = await firstMatchingDirectory({
		candidates: [
			...(configuredRoot ? [path.join(configuredRoot, "Models")] : []),
			path.join(privateRuntimeRoot, "JianyingSaliency", "current", "Models"),
			path.join(privateRuntimeRoot, "JianyingFilter", "current", "Models"),
			path.join(jianyingCacheRoot, "model"),
		],
		files: MODEL_FILES,
	});
	const effectDirectory = await firstMatchingDirectory({
		candidates: [
			...(configuredRoot ? [path.join(configuredRoot, "Effect")] : []),
			path.join(privateRuntimeRoot, "JianyingSaliency", "current", "Effect"),
			path.join(
				jianyingCacheRoot,
				"7366590389928595994",
				"94715bdc841b34cd5451b4b9c181bde4",
				"saliency_matting"
			),
		],
		files: EFFECT_FILES,
	});
	const libraryCandidates = [
		...(configuredRoot
			? [path.join(configuredRoot, "Frameworks", "libcccreator.dylib")]
			: []),
		path.join(
			privateRuntimeRoot,
			"JianyingSaliency",
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
	];
	const libraryPath = await firstMatchingFile({
		candidates: libraryCandidates,
		sha256: VIDEO_FUSION_LIBRARY_SHA256,
	});
	const bridgePath = await resolveJianyingSaliencyBridge();
	if (!bridgePath || !libraryPath || !modelDirectory || !effectDirectory) {
		return null;
	}
	const [bridgeHash, ...assetHashes] = await Promise.all([
		sha256File({ filePath: bridgePath }),
		...MODEL_FILES.map(({ name }) =>
			sha256File({ filePath: path.join(modelDirectory, name) })
		),
		...EFFECT_FILES.map(({ name }) =>
			sha256File({ filePath: path.join(effectDirectory, name) })
		),
	]);
	if (!bridgeHash || assetHashes.some((hash) => hash === null)) return null;
	const modelSha256 = createHash("sha256")
		.update(assetHashes.join(""))
		.digest("hex");
	return {
		bridgePath,
		effectDirectory,
		frameworkDirectory: path.dirname(libraryPath),
		libraryPath,
		modelDirectory,
		modelSha256,
		processorSha256: createHash("sha256")
			.update(bridgeHash)
			.update(VIDEO_FUSION_LIBRARY_SHA256)
			.digest("hex"),
	};
}
