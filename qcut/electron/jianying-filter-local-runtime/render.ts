import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingFilterLabRenderLocalEffectResult,
	JianyingFilterLabRenderLocalPortraitResult,
} from "../jianying-filter-lab-contract.js";
import {
	startJianyingFilterHostProcess,
	type JianyingFilterHostProcess,
} from "./host-process.js";
import { decodePgm, decodePpm, encodePpm } from "./portable-image.js";
import { prepareJianyingNativeMultiPassPackage } from "./package-preparer.js";
import type { JianyingFilterLocalRuntimeInspection } from "./runtime-discovery.js";

export type JianyingFilterLocalRenderMode = "portrait" | "multi-pass";

export interface JianyingFilterLocalRenderResult
	extends JianyingFilterLabRenderLocalEffectResult {
	mask?: JianyingFilterLabRenderLocalPortraitResult["mask"];
}

export interface RenderJianyingLocalPortraitOptions {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	rgba: Uint8Array;
	timestampSeconds?: number;
	runtime: JianyingFilterLocalRuntimeInspection;
}

export interface CreateJianyingFilterLocalRenderSessionOptions {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	bootstrapRgba: Uint8Array;
	runtime: JianyingFilterLocalRuntimeInspection;
	mode?: JianyingFilterLocalRenderMode;
	intensity?: number;
}

export interface JianyingFilterLocalRenderSession {
	processId: number;
	render: ({
		rgba,
		timestampSeconds,
	}: {
		rgba: Uint8Array;
		timestampSeconds?: number;
	}) => Promise<JianyingFilterLocalRenderResult>;
	dispose: () => Promise<void>;
}

interface ReadyRuntimePaths {
	bridgePath: string;
	effectLibraryPath: string;
	frameworkDirectory: string;
	modelDirectory: string;
}

function requireReadyRuntime({
	runtime,
}: {
	runtime: JianyingFilterLocalRuntimeInspection;
}): ReadyRuntimePaths {
	if (
		runtime.status.state !== "ready" ||
		!runtime.bridgePath ||
		!runtime.effectLibraryPath ||
		!runtime.frameworkDirectory ||
		!runtime.modelDirectory
	) {
		throw new Error(runtime.status.message);
	}
	return {
		bridgePath: runtime.bridgePath,
		effectLibraryPath: runtime.effectLibraryPath,
		frameworkDirectory: runtime.frameworkDirectory,
		modelDirectory: runtime.modelDirectory,
	};
}

async function removeFrameFiles({ paths }: { paths: string[] }) {
	await Promise.all(paths.map((filePath) => rm(filePath, { force: true })));
}

async function decodeRenderResult({
	resourceId,
	width,
	height,
	outputPath,
	maskPath,
	captureMask,
}: {
	resourceId: string;
	width: number;
	height: number;
	outputPath: string;
	maskPath: string;
	captureMask: boolean;
}): Promise<JianyingFilterLocalRenderResult> {
	const [renderedFile, maskFile] = await Promise.all([
		readFile(outputPath),
		captureMask ? readFile(maskPath) : Promise.resolve(null),
	]);
	const rendered = decodePpm({ bytes: renderedFile });
	if (rendered.width !== width || rendered.height !== height) {
		throw new Error("剪映本机滤镜返回了错误的画面尺寸");
	}
	const mask = maskFile ? decodePgm({ bytes: maskFile }) : null;
	return {
		provider: "jianying-local-effect-v1",
		resourceId,
		width,
		height,
		rgba: rendered.rgba,
		...(mask
			? {
					mask: {
						width: mask.width,
						height: mask.height,
						bytes: mask.bytes,
						orientation: "bottom-left" as const,
					},
				}
			: {}),
	};
}

function blendNativeEffectOutput({
	source,
	rendered,
	intensity,
}: {
	source: Uint8Array;
	rendered: Uint8Array;
	intensity: number;
}) {
	if (source.length !== rendered.length) {
		throw new Error("剪映本机滤镜返回了错误的像素数量");
	}
	if (intensity >= 100) return rendered;
	const amount = intensity / 100;
	const output = new Uint8Array(source.length);
	for (let index = 0; index < output.length; index += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			output[index + channel] = Math.round(
				source[index + channel] +
					(rendered[index + channel] - source[index + channel]) * amount
			);
		}
		output[index + 3] = source[index + 3];
	}
	return output;
}

export async function createJianyingFilterLocalRenderSession({
	resourceId,
	packagePath,
	width,
	height,
	bootstrapRgba,
	runtime,
	mode = "portrait",
	intensity = 100,
}: CreateJianyingFilterLocalRenderSessionOptions): Promise<JianyingFilterLocalRenderSession> {
	const runtimePaths = requireReadyRuntime({ runtime });
	const temporaryDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-filter-host-")
	);
	const bootstrapInputPath = path.join(temporaryDirectory, "bootstrap.ppm");
	const bootstrapOutputPath = path.join(
		temporaryDirectory,
		"bootstrap-output.ppm"
	);
	let host: JianyingFilterHostProcess | null = null;
	let outputBlendIntensity: number | undefined;
	try {
		let activePackagePath = packagePath;
		if (mode === "multi-pass") {
			const prepared = await prepareJianyingNativeMultiPassPackage({
				resourceId,
				packagePath,
				destinationDirectory: temporaryDirectory,
				intensity,
			});
			activePackagePath = prepared.packagePath;
			outputBlendIntensity = prepared.outputBlendIntensity;
		}
		await writeFile(
			bootstrapInputPath,
			encodePpm({ rgba: bootstrapRgba, width, height }),
			{ mode: 0o600 }
		);
		host = await startJianyingFilterHostProcess({
			...runtimePaths,
			packagePath: activePackagePath,
			bootstrapInputPath,
			bootstrapOutputPath,
			skipAlgorithm: mode === "multi-pass",
			captureMask: mode === "portrait",
		});
	} catch (cause) {
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw cause;
	}

	const activeHost = host;
	let requestIndex = 0;
	let disposed = false;
	return {
		processId: activeHost.pid,
		render: async ({ rgba, timestampSeconds = 0 }) => {
			if (disposed) throw new Error("剪映本机滤镜会话已关闭");
			requestIndex += 1;
			const requestId = String(requestIndex);
			const inputPath = path.join(temporaryDirectory, `frame-${requestId}.ppm`);
			const outputPath = path.join(
				temporaryDirectory,
				`frame-${requestId}-output.ppm`
			);
			const maskPath = path.join(
				temporaryDirectory,
				`frame-${requestId}-mask.pgm`
			);
			const captureMask = mode === "portrait";
			const framePaths = [
				inputPath,
				outputPath,
				...(captureMask ? [maskPath] : []),
			];
			try {
				await writeFile(inputPath, encodePpm({ rgba, width, height }), {
					mode: 0o600,
				});
				await activeHost.render({
					requestId,
					timestampSeconds,
					inputPath,
					outputPath,
					...(captureMask ? { maskPath } : {}),
				});
				const result = await decodeRenderResult({
					resourceId,
					width,
					height,
					outputPath,
					maskPath,
					captureMask,
				});
				return outputBlendIntensity === undefined
					? result
					: {
							...result,
							rgba: blendNativeEffectOutput({
								source: rgba,
								rendered: result.rgba,
								intensity: outputBlendIntensity,
							}),
						};
			} finally {
				await removeFrameFiles({ paths: framePaths });
			}
		},
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			await activeHost.dispose();
			await rm(temporaryDirectory, { recursive: true, force: true });
		},
	};
}

export const jianyingFilterLocalRenderTestUtils = {
	blendNativeEffectOutput,
};

export async function renderJianyingLocalPortrait({
	resourceId,
	packagePath,
	width,
	height,
	rgba,
	timestampSeconds,
	runtime,
}: RenderJianyingLocalPortraitOptions): Promise<JianyingFilterLabRenderLocalPortraitResult> {
	const session = await createJianyingFilterLocalRenderSession({
		resourceId,
		packagePath,
		width,
		height,
		bootstrapRgba: rgba,
		runtime,
	});
	try {
		const result = await session.render({ rgba, timestampSeconds });
		if (!result.mask) {
			throw new Error("剪映本机人像滤镜没有返回皮肤分割蒙版");
		}
		return {
			...result,
			mask: result.mask,
		};
	} finally {
		await session.dispose();
	}
}
