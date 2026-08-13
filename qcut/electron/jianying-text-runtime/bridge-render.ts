import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JianyingTextRuntimeRenderStrategy } from "../jianying-text-runtime-contract.js";
import { readBoundedJianyingTextJson } from "../jianying-text-package-metadata.js";
import type { ResolvedJianyingTextPackage } from "./package-resolver.js";
import type { ResolvedJianyingTextAnimation } from "./animation-package-resolver.js";
import {
	getEditedJianyingScriptPackage,
	getHydratedJianyingScriptPackage,
	prepareJianyingScriptContent,
} from "./script-package-editor.js";
import {
	runJianyingTextProcess,
	throwIfJianyingTextRenderCancelled,
} from "./render-process.js";

export interface JianyingTextBridgeRuntime {
	bridgePath: string;
	runtimeRoot: string;
	runtimeFingerprint: string;
}

export interface JianyingTextRawSequenceRequest {
	requestId: string;
	packagePath: string;
	packageKind: ResolvedJianyingTextPackage["packageKind"];
	outputPath: string;
	width: number;
	height: number;
	frameCount: number;
	startTimestamp: number;
	timestampStep: number;
	timelineDuration: number;
	animations?: ResolvedJianyingTextAnimation[];
	content?: string;
	fontPath?: string;
	fontSize?: number;
	resolutionType?: number;
	scriptParameters?: string;
}

const SCRIPT_STRATEGY_CACHE_SCHEMA_VERSION = 5;
const SCRIPT_STRATEGY_PROBE_FRACTIONS = [0.25, 2 / 3] as const;

function bridgeTimeout({ frameCount }: { frameCount: number }) {
	return Math.min(300_000, Math.max(20_000, 15_000 + frameCount * 350));
}

export function resolveJianyingTextBridgeLaunch({
	runtime,
}: {
	runtime: JianyingTextBridgeRuntime;
}): {
	command: string;
	args: string[];
	environment: NodeJS.ProcessEnv;
} {
	const { DYLD_LIBRARY_PATH: _ignored, ...environment } = process.env;
	return {
		command: runtime.bridgePath,
		args: [runtime.runtimeRoot],
		environment,
	};
}

export function resolveJianyingTextBridgeEnvironment({
	environment,
	request,
}: {
	environment: NodeJS.ProcessEnv;
	request: JianyingTextRawSequenceRequest;
}): NodeJS.ProcessEnv {
	const segmentPayload =
		request.packageKind === "ScriptInfoSticker"
			? JSON.stringify({ path: request.packagePath })
			: "";
	const animationEnvironment = Object.fromEntries(
		(request.animations ?? []).flatMap(
			({ animationType, duration, packagePath }) => [
				[`JY_TEXT_ANIMATION_${animationType}_PATH`, packagePath],
				[
					`JY_TEXT_ANIMATION_${animationType}_DURATION`,
					String(Math.round(duration * 1_000_000)),
				],
			]
		)
	);
	return {
		...environment,
		JY_TEXT_PACKAGE: request.packagePath,
		JY_TEXT_OUTPUT: request.outputPath,
		JY_TEXT_SEGMENT_TYPE:
			request.packageKind === "ScriptInfoSticker" ? "10" : "3",
		JY_TEXT_SEGMENT_PAYLOAD: segmentPayload,
		JY_TEXT_SCRIPT_PARAMETERS: request.scriptParameters ?? "",
		JY_TEXT_CONTENT: request.content ?? "",
		JY_TEXT_FONT_PATH: request.fontPath ?? "",
		JY_TEXT_FONT_SIZE: String(request.fontSize ?? 12),
		JY_TEXT_RESOLUTION_TYPE: String(request.resolutionType ?? -1),
		JY_TEXT_TIMESTAMP: String(Math.round(request.startTimestamp)),
		JY_TEXT_TIMESTAMP_STEP: String(request.timestampStep),
		JY_TEXT_TIMELINE_DURATION: String(Math.round(request.timelineDuration)),
		JY_TEXT_FRAME_COUNT: String(request.frameCount),
		JY_VIDEO_WIDTH: String(request.width),
		JY_VIDEO_HEIGHT: String(request.height),
		...animationEnvironment,
	};
}

async function requireRawSequenceSize({
	outputPath,
	width,
	height,
	frameCount,
}: Pick<
	JianyingTextRawSequenceRequest,
	"outputPath" | "width" | "height" | "frameCount"
>) {
	const expected = width * height * 4 * frameCount;
	const actual = (await stat(outputPath)).size;
	if (actual !== expected) {
		throw new Error(
			`Jianying text runtime returned ${actual} RGBA bytes; expected ${expected}.`
		);
	}
}

export async function renderJianyingTextRawSequence({
	runtime,
	request,
}: {
	runtime: JianyingTextBridgeRuntime;
	request: JianyingTextRawSequenceRequest;
}) {
	const launch = resolveJianyingTextBridgeLaunch({ runtime });
	await runJianyingTextProcess({
		requestId: request.requestId,
		command: launch.command,
		args: launch.args,
		timeoutMs: bridgeTimeout({ frameCount: request.frameCount }),
		env: resolveJianyingTextBridgeEnvironment({
			environment: launch.environment,
			request,
		}),
	});
	await requireRawSequenceSize(request);
}

function scriptResources({
	packageInfo,
}: {
	packageInfo: ResolvedJianyingTextPackage;
}) {
	if (!packageInfo.scriptResources) {
		throw new Error("ScriptInfoSticker resources were not resolved.");
	}
	return packageInfo.scriptResources;
}

function degradedScriptResourceIds({
	packageInfo,
}: {
	packageInfo: ResolvedJianyingTextPackage;
}) {
	return new Set(
		scriptResources({ packageInfo }).degraded.map(
			({ resourceId }) => resourceId
		)
	);
}

function strategyKey({
	runtime,
	packageInfo,
	fontPath,
}: {
	runtime: JianyingTextBridgeRuntime;
	packageInfo: ResolvedJianyingTextPackage;
	fontPath: string;
}) {
	return createHash("sha256")
		.update(runtime.runtimeFingerprint)
		.update(packageInfo.packageHash)
		.update(scriptResources({ packageInfo }).fingerprint)
		.update(fontPath)
		.digest("hex");
}

function strategyCachePath({ cacheKey }: { cacheKey: string }) {
	return path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime",
		"strategies",
		`${cacheKey}.json`
	);
}

async function readCachedStrategy({ cacheKey }: { cacheKey: string }) {
	try {
		const value = JSON.parse(
			await readFile(strategyCachePath({ cacheKey }), "utf8")
		) as Record<string, unknown>;
		return value.schemaVersion === SCRIPT_STRATEGY_CACHE_SCHEMA_VERSION &&
			value.cacheKey === cacheKey &&
			(value.strategy === "runtime-parameters" ||
				value.strategy === "preload-copy")
			? value.strategy
			: null;
	} catch {
		return null;
	}
}

async function writeCachedStrategy({
	cacheKey,
	strategy,
}: {
	cacheKey: string;
	strategy: "runtime-parameters" | "preload-copy";
}) {
	const destination = strategyCachePath({ cacheKey });
	await mkdir(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.tmp-${randomUUID()}`;
	await writeFile(
		temporary,
		`${JSON.stringify({
			schemaVersion: SCRIPT_STRATEGY_CACHE_SCHEMA_VERSION,
			cacheKey,
			strategy,
		})}\n`,
		"utf8"
	);
	await rm(destination, { force: true });
	await rename(temporary, destination);
}

function isVisibleTransparentFrame({ bytes }: { bytes: Buffer }) {
	let visible = false;
	let transparent = false;
	for (let offset = 3; offset < bytes.length; offset += 4) {
		const alpha = bytes[offset];
		visible ||= alpha > 0;
		transparent ||= alpha === 0;
		if (visible && transparent) return true;
	}
	return false;
}

export function verifyJianyingRuntimeParameterFrames({
	referenceBytes,
	candidateBytes,
	width,
	height,
	frameCount,
}: {
	referenceBytes: Buffer;
	candidateBytes: Buffer;
	width: number;
	height: number;
	frameCount: number;
}) {
	const bytesPerFrame = width * height * 4;
	const expectedBytes = bytesPerFrame * frameCount;
	if (
		referenceBytes.length !== expectedBytes ||
		candidateBytes.length !== expectedBytes
	) {
		return false;
	}
	for (let index = 0; index < frameCount; index += 1) {
		const start = index * bytesPerFrame;
		const end = start + bytesPerFrame;
		const referenceFrame = referenceBytes.subarray(start, end);
		const candidateFrame = candidateBytes.subarray(start, end);
		if (
			!isVisibleTransparentFrame({ bytes: candidateFrame }) ||
			!referenceFrame.equals(candidateFrame)
		) {
			return false;
		}
	}
	return true;
}

async function inspectRuntimeParameterEditing({
	runtime,
	requestId,
	packageInfo,
	fontPath,
}: {
	runtime: JianyingTextBridgeRuntime;
	requestId: string;
	packageInfo: ResolvedJianyingTextPackage;
	fontPath: string;
}) {
	const temporary = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-text-strategy-")
	);
	try {
		const source = await readBoundedJianyingTextJson({
			filePath: path.join(packageInfo.packagePath, "content.json"),
		});
		const resources = scriptResources({ packageInfo });
		const degradedResourceIds = degradedScriptResourceIds({ packageInfo });
		const probeContent = "QCut 9Z 验证";
		const edited = prepareJianyingScriptContent({
			value: source,
			content: probeContent,
			resourcePaths: resources.resourcePaths,
			fontPath,
			degradedResourceIds,
		});
		const hydratedPackagePath = await getHydratedJianyingScriptPackage({
			packagePath: packageInfo.packagePath,
			packageHash: packageInfo.packageHash,
			resourcePaths: resources.resourcePaths,
			resourceFingerprint: resources.fingerprint,
			fontPath,
			degradedResourceIds,
		});
		const preloadedPackagePath = await getEditedJianyingScriptPackage({
			packagePath: packageInfo.packagePath,
			packageHash: packageInfo.packageHash,
			content: probeContent,
			resourcePaths: resources.resourcePaths,
			resourceFingerprint: resources.fingerprint,
			fontPath,
			degradedResourceIds,
		});
		const referencePath = path.join(temporary, "reference.rgba");
		const candidatePath = path.join(temporary, "candidate.rgba");
		const maximumTimestamp =
			Math.min(60, packageInfo.templateDuration) * 1_000_000;
		const startTimestamp =
			maximumTimestamp * SCRIPT_STRATEGY_PROBE_FRACTIONS[0];
		const timestampStep =
			maximumTimestamp *
			(SCRIPT_STRATEGY_PROBE_FRACTIONS[1] - SCRIPT_STRATEGY_PROBE_FRACTIONS[0]);
		const baseRequest = {
			requestId,
			packageKind: packageInfo.packageKind,
			width: 256,
			height: 256,
			frameCount: SCRIPT_STRATEGY_PROBE_FRACTIONS.length,
			startTimestamp,
			timestampStep,
			timelineDuration: maximumTimestamp,
		} as const;
		await renderJianyingTextRawSequence({
			runtime,
			request: {
				...baseRequest,
				packagePath: preloadedPackagePath,
				outputPath: referencePath,
			},
		});
		await renderJianyingTextRawSequence({
			runtime,
			request: {
				...baseRequest,
				packagePath: hydratedPackagePath,
				outputPath: candidatePath,
				scriptParameters: JSON.stringify(edited),
			},
		});
		const [referenceBytes, candidateBytes] = await Promise.all([
			readFile(referencePath),
			readFile(candidatePath),
		]);
		return verifyJianyingRuntimeParameterFrames({
			referenceBytes,
			candidateBytes,
			width: baseRequest.width,
			height: baseRequest.height,
			frameCount: baseRequest.frameCount,
		})
			? "runtime-parameters"
			: "preload-copy";
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

async function chooseScriptStrategy({
	runtime,
	requestId,
	packageInfo,
	fontPath,
}: {
	runtime: JianyingTextBridgeRuntime;
	requestId: string;
	packageInfo: ResolvedJianyingTextPackage;
	fontPath: string;
}): Promise<"runtime-parameters" | "preload-copy"> {
	const cacheKey = strategyKey({ runtime, packageInfo, fontPath });
	const cached = await readCachedStrategy({ cacheKey });
	if (cached) return cached;
	let strategy: "runtime-parameters" | "preload-copy" = "preload-copy";
	try {
		strategy = await inspectRuntimeParameterEditing({
			runtime,
			requestId,
			packageInfo,
			fontPath,
		});
	} catch {
		throwIfJianyingTextRenderCancelled({ requestId });
	}
	await writeCachedStrategy({
		cacheKey,
		strategy,
	});
	return strategy;
}

export function resolveJianyingScriptEditStrategy({
	runtime,
	requestId,
	packageInfo,
	fontPath,
}: {
	runtime: JianyingTextBridgeRuntime;
	requestId: string;
	packageInfo: ResolvedJianyingTextPackage;
	fontPath: string;
}) {
	return chooseScriptStrategy({
		runtime,
		requestId,
		packageInfo,
		fontPath,
	});
}

export async function renderEditableJianyingScriptSequence({
	runtime,
	request,
	packageInfo,
	content,
	fontPath,
}: {
	runtime: JianyingTextBridgeRuntime;
	request: Omit<
		JianyingTextRawSequenceRequest,
		"packagePath" | "packageKind" | "scriptParameters"
	>;
	packageInfo: ResolvedJianyingTextPackage;
	content: string;
	fontPath: string;
}): Promise<JianyingTextRuntimeRenderStrategy> {
	const source = await readBoundedJianyingTextJson({
		filePath: path.join(packageInfo.packagePath, "content.json"),
	});
	const resources = scriptResources({ packageInfo });
	const degradedResourceIds = degradedScriptResourceIds({ packageInfo });
	const edited = prepareJianyingScriptContent({
		value: source,
		content,
		resourcePaths: resources.resourcePaths,
		fontPath,
		degradedResourceIds,
	});
	const hydratedPackagePath = await getHydratedJianyingScriptPackage({
		packagePath: packageInfo.packagePath,
		packageHash: packageInfo.packageHash,
		resourcePaths: resources.resourcePaths,
		resourceFingerprint: resources.fingerprint,
		fontPath,
		degradedResourceIds,
	});
	const strategy = await resolveJianyingScriptEditStrategy({
		runtime,
		requestId: request.requestId,
		packageInfo,
		fontPath,
	});
	if (strategy === "runtime-parameters") {
		try {
			await renderJianyingTextRawSequence({
				runtime,
				request: {
					...request,
					packagePath: hydratedPackagePath,
					packageKind: "ScriptInfoSticker",
					scriptParameters: JSON.stringify(edited),
				},
			});
			return strategy;
		} catch {
			throwIfJianyingTextRenderCancelled({ requestId: request.requestId });
		}
	}
	const packagePath = await getEditedJianyingScriptPackage({
		packagePath: packageInfo.packagePath,
		packageHash: packageInfo.packageHash,
		content,
		resourcePaths: resources.resourcePaths,
		resourceFingerprint: resources.fingerprint,
		fontPath,
		degradedResourceIds,
	});
	await renderJianyingTextRawSequence({
		runtime,
		request: {
			...request,
			packagePath,
			packageKind: "ScriptInfoSticker",
		},
	});
	return "preload-copy";
}
