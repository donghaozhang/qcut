import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingFilterLabFaceEvidence,
	JianyingFilterLabFaceObservation,
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

export type JianyingFilterLocalRenderMode =
	| "portrait"
	| "face-region"
	| "multi-pass";

export interface JianyingFilterLocalRenderResult
	extends JianyingFilterLabRenderLocalEffectResult {
	mask?: JianyingFilterLabRenderLocalPortraitResult["mask"];
	face?: JianyingFilterLabFaceEvidence;
}

export interface RenderJianyingLocalPortraitOptions {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	rgba: Uint8Array;
	timestampSeconds?: number;
	runtime: JianyingFilterLocalRuntimeInspection;
	captureFace?: boolean;
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
	captureFace?: boolean;
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

function recordValue({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function requireFiniteNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`剪映本机人脸结果中的 ${label} 无效`);
	}
	return value;
}

function requireInteger({ value, label }: { value: unknown; label: string }) {
	const number = requireFiniteNumber({ value, label });
	if (!Number.isInteger(number)) {
		throw new Error(`剪映本机人脸结果中的 ${label} 不是整数`);
	}
	return number;
}

function requireNumberArray({
	value,
	length,
	label,
}: {
	value: unknown;
	length: number;
	label: string;
}) {
	if (!Array.isArray(value) || value.length !== length) {
		throw new Error(`剪映本机人脸结果中的 ${label} 尺寸无效`);
	}
	return value.map((item, index) =>
		requireFiniteNumber({ value: item, label: `${label}[${index}]` })
	);
}

function decodeFaceObservation({
	value,
	index,
}: {
	value: unknown;
	index: number;
}): JianyingFilterLabFaceObservation {
	const record = recordValue({ value });
	if (!record) {
		throw new Error(`剪映本机人脸结果中的 faces[${index}] 无效`);
	}
	const rawRectValues = requireNumberArray({
		value: record.rawRect,
		length: 4,
		label: `faces[${index}].rawRect`,
	});
	const landmarksValue = record.landmarks;
	if (!Array.isArray(landmarksValue) || landmarksValue.length > 512) {
		throw new Error(`剪映本机人脸结果中的 faces[${index}].landmarks 无效`);
	}
	const landmarks = landmarksValue.map((landmark, landmarkIndex) => {
		const values = requireNumberArray({
			value: landmark,
			length: 3,
			label: `faces[${index}].landmarks[${landmarkIndex}]`,
		});
		return [values[0], values[1], values[2]] as [number, number, number];
	});
	return {
		rawRect: [
			rawRectValues[0],
			rawRectValues[1],
			rawRectValues[2],
			rawRectValues[3],
		],
		score: requireFiniteNumber({
			value: record.score,
			label: `faces[${index}].score`,
		}),
		yaw: requireFiniteNumber({
			value: record.yaw,
			label: `faces[${index}].yaw`,
		}),
		pitch: requireFiniteNumber({
			value: record.pitch,
			label: `faces[${index}].pitch`,
		}),
		roll: requireFiniteNumber({
			value: record.roll,
			label: `faces[${index}].roll`,
		}),
		eyeDistance: requireFiniteNumber({
			value: record.eyeDistance,
			label: `faces[${index}].eyeDistance`,
		}),
		id: requireInteger({ value: record.id, label: `faces[${index}].id` }),
		action: requireInteger({
			value: record.action,
			label: `faces[${index}].action`,
		}),
		trackingCount: requireInteger({
			value: record.trackingCount,
			label: `faces[${index}].trackingCount`,
		}),
		landmarks,
	};
}

function decodeFaceEvidence({
	text,
}: {
	text: string;
}): JianyingFilterLabFaceEvidence {
	let value: unknown;
	try {
		value = JSON.parse(text) as unknown;
	} catch {
		throw new Error("剪映本机人脸结果不是有效 JSON");
	}
	const record = recordValue({ value });
	if (
		!record ||
		record.schemaVersion !== 1 ||
		record.coordinateSpace !== "source-normalized-top-left" ||
		!Array.isArray(record.faces)
	) {
		throw new Error("剪映本机人脸结果结构无效");
	}
	const faceCount = requireInteger({
		value: record.faceCount,
		label: "faceCount",
	});
	if (faceCount < 0 || faceCount > 10 || faceCount !== record.faces.length) {
		throw new Error("剪映本机人脸结果中的 faceCount 无效");
	}
	return {
		schemaVersion: 1,
		coordinateSpace: "source-normalized-top-left",
		faceCount,
		faces: record.faces.map((face, index) =>
			decodeFaceObservation({ value: face, index })
		),
	};
}

async function decodeRenderResult({
	resourceId,
	width,
	height,
	outputPath,
	maskPath,
	captureMask,
	facePath,
	captureFace,
}: {
	resourceId: string;
	width: number;
	height: number;
	outputPath: string;
	maskPath: string;
	captureMask: boolean;
	facePath: string;
	captureFace: boolean;
}): Promise<JianyingFilterLocalRenderResult> {
	const [renderedFile, maskFile, faceFile] = await Promise.all([
		readFile(outputPath),
		captureMask ? readFile(maskPath) : Promise.resolve(null),
		captureFace ? readFile(facePath, "utf8") : Promise.resolve(null),
	]);
	const rendered = decodePpm({ bytes: renderedFile });
	if (rendered.width !== width || rendered.height !== height) {
		throw new Error("剪映本机滤镜返回了错误的画面尺寸");
	}
	const mask = maskFile ? decodePgm({ bytes: maskFile }) : null;
	const face = faceFile ? decodeFaceEvidence({ text: faceFile }) : null;
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
		...(face ? { face } : {}),
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
	captureFace = false,
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
	const shouldCaptureFace = mode === "portrait" && captureFace;
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
			captureFace: shouldCaptureFace,
			useEngineGlContext: mode === "face-region",
			flipAlgorithmInputY: mode === "face-region",
			flipProcessInputY: mode === "face-region",
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
			const facePath = path.join(
				temporaryDirectory,
				`frame-${requestId}-face.json`
			);
			const captureMask = mode === "portrait";
			const framePaths = [
				inputPath,
				outputPath,
				...(captureMask ? [maskPath] : []),
				...(shouldCaptureFace ? [facePath] : []),
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
					...(shouldCaptureFace ? { facePath } : {}),
				});
				const result = await decodeRenderResult({
					resourceId,
					width,
					height,
					outputPath,
					maskPath,
					captureMask,
					facePath,
					captureFace: shouldCaptureFace,
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
	decodeFaceEvidence,
};

export async function renderJianyingLocalPortrait({
	resourceId,
	packagePath,
	width,
	height,
	rgba,
	timestampSeconds,
	runtime,
	captureFace = false,
}: RenderJianyingLocalPortraitOptions): Promise<JianyingFilterLabRenderLocalPortraitResult> {
	const session = await createJianyingFilterLocalRenderSession({
		resourceId,
		packagePath,
		width,
		height,
		bootstrapRgba: rgba,
		runtime,
		captureFace,
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
