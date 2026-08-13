import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
	JianyingTextRuntimeRenderStrategy,
	JianyingTextRuntimeDiagnostic,
} from "../jianying-text-runtime-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import {
	renderEditableJianyingScriptSequence,
	renderJianyingTextRawSequence,
	type JianyingTextBridgeRuntime,
	type JianyingTextRawSequenceRequest,
} from "./bridge-render.js";
import {
	getJianyingTextRenderCacheDirectory,
	getJianyingTextRenderCacheRoot,
} from "./cache-path.js";
import { resolveJianyingTextRuntimeFont } from "./font-resolver.js";
import {
	measureJianyingHostTextAlphaBounds,
	nextJianyingHostTextFontSize,
} from "./host-text-fit.js";
import { resolveJianyingTextPackage } from "./package-resolver.js";
import { repairTransientTransparentRgbaFrames } from "./raw-sequence-integrity.js";
import { normalizeJianyingTextRuntimeReference } from "./reference.js";
import { ensureJianyingTextPreviewVideo } from "./preview-video.js";
import {
	finishJianyingTextRender,
	runJianyingTextProcess,
	throwIfJianyingTextRenderCancelled,
} from "./render-process.js";
import { inspectJianyingTextRuntime } from "./runtime-discovery.js";

const RENDER_CACHE_SCHEMA_VERSION = 12;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const MAXIMUM_CONTENT_CODE_POINTS = 4096;
const MAXIMUM_DIMENSION = 4096;
const MAXIMUM_FRAME_COUNT = 18_000;
const TEXT_STYLE_RESOLUTION_TYPE = 1;
const MAXIMUM_TEXT_STYLE_FIT_ATTEMPTS = 4;

interface ValidatedRenderRequest
	extends Omit<JianyingTextRuntimeRenderRequest, "reference"> {
	reference: NonNullable<
		ReturnType<typeof normalizeJianyingTextRuntimeReference>
	>;
}

interface CachedRenderManifest {
	schemaVersion: 12;
	cacheKey: string;
	frameCount: number;
	fps: number;
	strategy: JianyingTextRuntimeRenderStrategy;
	templateDuration: number;
}

function requireFiniteNumber({
	value,
	label,
	minimum,
	maximum,
}: {
	value: number;
	label: string;
	minimum: number;
	maximum: number;
}) {
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
	}
	return value;
}

function validateRenderRequest({
	request,
}: {
	request: JianyingTextRuntimeRenderRequest;
}): ValidatedRenderRequest {
	if (!REQUEST_ID_PATTERN.test(request.requestId)) {
		throw new Error("Jianying text requestId is invalid.");
	}
	const reference = normalizeJianyingTextRuntimeReference({
		value: request.reference,
	});
	if (!reference) throw new Error("Jianying text reference is invalid.");
	if (
		typeof request.content !== "string" ||
		request.content.trim().length === 0 ||
		Array.from(request.content).length > MAXIMUM_CONTENT_CODE_POINTS
	) {
		throw new Error(
			`Jianying text content must contain 1-${MAXIMUM_CONTENT_CODE_POINTS} code points.`
		);
	}
	if (
		request.fontAssetId !== undefined &&
		typeof request.fontAssetId !== "string"
	) {
		throw new Error("Jianying text fontAssetId is invalid.");
	}
	if (
		request.previewVideo !== undefined &&
		typeof request.previewVideo !== "boolean"
	) {
		throw new Error("Jianying text previewVideo is invalid.");
	}
	requireFiniteNumber({
		value: request.fontSize,
		label: "fontSize",
		minimum: 1,
		maximum: 1000,
	});
	for (const [label, value] of [
		["canvasWidth", request.canvasWidth],
		["canvasHeight", request.canvasHeight],
		["transform.width", request.transform.width],
		["transform.height", request.transform.height],
	] as const) {
		requireFiniteNumber({
			value,
			label,
			minimum: 1,
			maximum: MAXIMUM_DIMENSION,
		});
	}
	requireFiniteNumber({
		value: request.transform.x,
		label: "transform.x",
		minimum: -MAXIMUM_DIMENSION * 4,
		maximum: MAXIMUM_DIMENSION * 4,
	});
	requireFiniteNumber({
		value: request.transform.y,
		label: "transform.y",
		minimum: -MAXIMUM_DIMENSION * 4,
		maximum: MAXIMUM_DIMENSION * 4,
	});
	requireFiniteNumber({
		value: request.transform.rotation,
		label: "transform.rotation",
		minimum: -36_000,
		maximum: 36_000,
	});
	requireFiniteNumber({
		value: request.transform.opacity,
		label: "transform.opacity",
		minimum: 0,
		maximum: 1,
	});
	requireFiniteNumber({
		value: request.sourceStart,
		label: "sourceStart",
		minimum: 0,
		maximum: 86_400,
	});
	requireFiniteNumber({
		value: request.elementDuration,
		label: "elementDuration",
		minimum: 1 / 240,
		maximum: 86_400,
	});
	requireFiniteNumber({
		value: request.fps,
		label: "fps",
		minimum: 1,
		maximum: 120,
	});
	if (
		!Number.isInteger(request.frameCount) ||
		request.frameCount < 1 ||
		request.frameCount > MAXIMUM_FRAME_COUNT
	) {
		throw new Error(
			`frameCount must be an integer from 1 to ${MAXIMUM_FRAME_COUNT}.`
		);
	}
	const finalSourceTime =
		request.sourceStart + (request.frameCount - 1) / request.fps;
	if (finalSourceTime > request.elementDuration + 1 / request.fps) {
		throw new Error("Jianying text frame range exceeds the timeline element.");
	}
	return { ...request, reference };
}

function renderCacheKey({
	request,
	runtimeFingerprint,
	templateDuration,
	resourceFingerprint,
	fontPath,
}: {
	request: ValidatedRenderRequest;
	runtimeFingerprint: string;
	templateDuration: number;
	resourceFingerprint?: string;
	fontPath: string;
}) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: RENDER_CACHE_SCHEMA_VERSION,
				runtimeFingerprint,
				packageKind: request.reference.packageKind,
				packageHash: request.reference.packageHash,
				resourceFingerprint: resourceFingerprint ?? null,
				contentHash: createHash("sha256").update(request.content).digest("hex"),
				fontAssetId: request.fontAssetId ?? null,
				fontPath,
				fontSize: request.fontSize,
				width: Math.round(request.transform.width),
				height: Math.round(request.transform.height),
				rotation: request.transform.rotation,
				opacity: request.transform.opacity,
				sourceStart: request.sourceStart,
				elementDuration: request.elementDuration,
				frameCount: request.frameCount,
				fps: request.fps,
				templateDuration,
			})
		)
		.digest("hex");
}

function framePath({ directory, index }: { directory: string; index: number }) {
	return path.join(directory, `frame-${String(index).padStart(6, "0")}.png`);
}

function framePattern({ directory }: { directory: string }) {
	return path.join(directory, "frame-%06d.png");
}

async function readCachedRender({
	directory,
	cacheKey,
}: {
	directory: string;
	cacheKey: string;
}): Promise<CachedRenderManifest | null> {
	try {
		const manifest = JSON.parse(
			await readFile(path.join(directory, "manifest.json"), "utf8")
		) as CachedRenderManifest;
		if (
			manifest.schemaVersion !== RENDER_CACHE_SCHEMA_VERSION ||
			manifest.cacheKey !== cacheKey ||
			manifest.frameCount < 1
		) {
			return null;
		}
		const [first, last] = await Promise.all([
			stat(framePath({ directory, index: 0 })),
			stat(framePath({ directory, index: manifest.frameCount - 1 })),
		]);
		return first.isFile() && first.size > 0 && last.isFile() && last.size > 0
			? manifest
			: null;
	} catch {
		return null;
	}
}

function templateTiming({
	request,
	templateDuration,
}: {
	request: ValidatedRenderRequest;
	templateDuration: number;
}) {
	const maximumTimestamp = Math.min(60, templateDuration) * 1_000_000;
	const startTimestamp = Math.min(
		maximumTimestamp,
		(request.sourceStart / request.elementDuration) * maximumTimestamp
	);
	const desiredStep = maximumTimestamp / request.elementDuration / request.fps;
	const maximumStep =
		request.frameCount === 1
			? 0
			: (maximumTimestamp - startTimestamp) / (request.frameCount - 1);
	return {
		timelineDuration: maximumTimestamp,
		startTimestamp,
		timestampStep:
			request.frameCount === 1 ? 0 : Math.min(desiredStep, maximumStep),
	};
}

function runtimeAnimations({
	request,
	packageInfo,
	timelineDuration,
}: {
	request: ValidatedRenderRequest;
	packageInfo: Awaited<ReturnType<typeof resolveJianyingTextPackage>>;
	timelineDuration: number;
}) {
	const runtimeDuration = timelineDuration / 1_000_000;
	return packageInfo.animationResources.values.map((animation) => ({
		...animation,
		duration: Math.max(
			1 / 1_000_000,
			Math.min(
				runtimeDuration,
				(animation.duration / request.elementDuration) * runtimeDuration
			)
		),
	}));
}

function rotatedDimensions({
	width,
	height,
	rotation,
}: {
	width: number;
	height: number;
	rotation: number;
}) {
	const radians = (rotation * Math.PI) / 180;
	return {
		radians,
		width: Math.max(
			1,
			Math.ceil(
				Math.abs(width * Math.cos(radians)) +
					Math.abs(height * Math.sin(radians))
			)
		),
		height: Math.max(
			1,
			Math.ceil(
				Math.abs(width * Math.sin(radians)) +
					Math.abs(height * Math.cos(radians))
			)
		),
	};
}

async function convertRawSequence({
	request,
	rawPath,
	directory,
	width,
	height,
}: {
	request: ValidatedRenderRequest;
	rawPath: string;
	directory: string;
	width: number;
	height: number;
}) {
	const ffmpegPath = await getFFmpegPath();
	const rotated = rotatedDimensions({
		width,
		height,
		rotation: request.transform.rotation,
	});
	const filter = [
		"format=rgba",
		`colorchannelmixer=aa=${request.transform.opacity}`,
		`rotate=${rotated.radians}:c=none:ow=${rotated.width}:oh=${rotated.height}`,
		"format=rgba",
	].join(",");
	await runJianyingTextProcess({
		requestId: request.requestId,
		command: ffmpegPath,
		timeoutMs: Math.min(300_000, Math.max(30_000, request.frameCount * 100)),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"rawvideo",
			"-pixel_format",
			"rgba",
			"-video_size",
			`${width}x${height}`,
			"-framerate",
			String(request.fps),
			"-i",
			rawPath,
			"-vf",
			filter,
			"-frames:v",
			String(request.frameCount),
			"-start_number",
			"0",
			framePattern({ directory }),
		],
	});
	return rotated;
}

function responseForRender({
	request,
	directory,
	manifest,
	cacheHit,
	diagnostics,
	previewUrl,
}: {
	request: ValidatedRenderRequest;
	directory: string;
	manifest: CachedRenderManifest;
	cacheHit: boolean;
	diagnostics: JianyingTextRuntimeDiagnostic[];
	previewUrl?: string;
}): JianyingTextRuntimeRenderResult {
	const width = Math.round(request.transform.width);
	const height = Math.round(request.transform.height);
	const rotated = rotatedDimensions({
		width,
		height,
		rotation: request.transform.rotation,
	});
	return {
		requestId: request.requestId,
		resourceId: request.reference.resourceId,
		packageHash: request.reference.packageHash,
		templateDuration: manifest.templateDuration,
		frameCount: manifest.frameCount,
		strategy: manifest.strategy,
		cacheHit,
		x: request.canvasWidth / 2 + request.transform.x - rotated.width / 2,
		y: request.canvasHeight / 2 + request.transform.y - rotated.height / 2,
		width: rotated.width,
		height: rotated.height,
		...(diagnostics.length > 0 ? { diagnostics } : {}),
		...(previewUrl ? { previewUrl } : {}),
		source:
			manifest.frameCount === 1
				? { kind: "image", path: framePath({ directory, index: 0 }) }
				: {
						kind: "image-sequence",
						path: framePattern({ directory }),
						frameRate: manifest.fps,
					},
	};
}

async function previewVideoForRender({
	request,
	cacheKey,
	directory,
	manifest,
}: {
	request: ValidatedRenderRequest;
	cacheKey: string;
	directory: string;
	manifest: CachedRenderManifest;
}) {
	return request.previewVideo
		? ensureJianyingTextPreviewVideo({
				requestId: request.requestId,
				cacheKey,
				directory,
				frameCount: manifest.frameCount,
				fps: manifest.fps,
			})
		: undefined;
}

async function fitTextStyleHostRequest({
	runtime,
	request,
	attempt = 0,
}: {
	runtime: JianyingTextBridgeRuntime;
	request: JianyingTextRawSequenceRequest;
	attempt?: number;
}): Promise<JianyingTextRawSequenceRequest> {
	if (request.packageKind !== "TextStyle") return request;
	const probePath = `${request.outputPath}.fit-probe.rgba`;
	const fontSize = request.fontSize ?? 12;
	try {
		await renderJianyingTextRawSequence({
			runtime,
			request: {
				...request,
				outputPath: probePath,
				frameCount: 1,
				startTimestamp:
					request.startTimestamp +
					request.timestampStep * Math.floor(request.frameCount / 2),
				timestampStep: 0,
				resolutionType: TEXT_STYLE_RESOLUTION_TYPE,
				fontSize,
			},
		});
		const bounds = measureJianyingHostTextAlphaBounds({
			bytes: await readFile(probePath),
			width: request.width,
			height: request.height,
		});
		const nextFontSize = nextJianyingHostTextFontSize({
			fontSize,
			bounds,
			width: request.width,
			height: request.height,
		});
		if (nextFontSize === null || attempt >= MAXIMUM_TEXT_STYLE_FIT_ATTEMPTS) {
			return {
				...request,
				resolutionType: TEXT_STYLE_RESOLUTION_TYPE,
				fontSize,
			};
		}
		return fitTextStyleHostRequest({
			runtime,
			request: { ...request, fontSize: nextFontSize },
			attempt: attempt + 1,
		});
	} finally {
		await rm(probePath, { force: true });
	}
}

async function renderUncached({
	request,
	runtime,
	packageInfo,
	directory,
	cacheKey,
	fontPath,
}: {
	request: ValidatedRenderRequest;
	runtime: JianyingTextBridgeRuntime;
	packageInfo: Awaited<ReturnType<typeof resolveJianyingTextPackage>>;
	directory: string;
	cacheKey: string;
	fontPath: string;
}) {
	const width = Math.round(request.transform.width);
	const height = Math.round(request.transform.height);
	const rawPath = path.join(directory, "frames.rgba");
	const timing = templateTiming({
		request,
		templateDuration: packageInfo.templateDuration,
	});
	const animations = runtimeAnimations({
		request,
		packageInfo,
		timelineDuration: timing.timelineDuration,
	});
	const rawRequest = {
		requestId: request.requestId,
		outputPath: rawPath,
		width,
		height,
		frameCount: request.frameCount,
		...timing,
		...(animations.length > 0 ? { animations } : {}),
	};
	let strategy: JianyingTextRuntimeRenderStrategy;
	if (packageInfo.packageKind === "ScriptInfoSticker") {
		strategy = await renderEditableJianyingScriptSequence({
			runtime,
			request: rawRequest,
			packageInfo,
			content: request.content,
			fontPath,
		});
	} else {
		const hostTextRequest = await fitTextStyleHostRequest({
			runtime,
			request: {
				...rawRequest,
				packagePath: packageInfo.packagePath,
				packageKind: packageInfo.packageKind,
				content: request.content,
				fontPath,
				fontSize: request.fontSize,
			},
		});
		await renderJianyingTextRawSequence({
			runtime,
			request: hostTextRequest,
		});
		await repairTransientTransparentRgbaFrames({
			rawPath,
			width,
			height,
			frameCount: request.frameCount,
			renderFrame: async ({ frameIndex, outputPath }) =>
				renderJianyingTextRawSequence({
					runtime,
					request: {
						...hostTextRequest,
						outputPath,
						frameCount: 1,
						startTimestamp:
							hostTextRequest.startTimestamp +
							hostTextRequest.timestampStep * frameIndex,
						timestampStep: 0,
					},
				}),
		});
		strategy = "host-text";
	}
	await convertRawSequence({ request, rawPath, directory, width, height });
	await rm(rawPath, { force: true });
	const manifest: CachedRenderManifest = {
		schemaVersion: RENDER_CACHE_SCHEMA_VERSION,
		cacheKey,
		frameCount: request.frameCount,
		fps: request.fps,
		strategy,
		templateDuration: packageInfo.templateDuration,
	};
	await writeFile(
		path.join(directory, "manifest.json"),
		`${JSON.stringify(manifest)}\n`,
		"utf8"
	);
	return manifest;
}

export async function renderJianyingText({
	request: untrustedRequest,
}: {
	request: JianyingTextRuntimeRenderRequest;
}): Promise<JianyingTextRuntimeRenderResult> {
	const request = validateRenderRequest({ request: untrustedRequest });
	try {
		const inspection = await inspectJianyingTextRuntime();
		if (
			inspection.status.state !== "ready" ||
			!inspection.bridgePath ||
			!inspection.runtimeRoot ||
			!inspection.runtimeFingerprint
		) {
			throw new Error(inspection.status.message);
		}
		throwIfJianyingTextRenderCancelled({ requestId: request.requestId });
		const packageInfo = await resolveJianyingTextPackage({
			reference: request.reference,
		});
		const runtime: JianyingTextBridgeRuntime = {
			bridgePath: inspection.bridgePath,
			runtimeRoot: inspection.runtimeRoot,
			runtimeFingerprint: inspection.runtimeFingerprint,
		};
		const font = await resolveJianyingTextRuntimeFont({
			fontAssetId: request.fontAssetId,
		});
		const fontPath = font.filePath;
		const diagnostics = [...packageInfo.diagnostics, ...font.diagnostics];
		const cacheKey = renderCacheKey({
			request,
			runtimeFingerprint: runtime.runtimeFingerprint,
			templateDuration: packageInfo.templateDuration,
			resourceFingerprint: packageInfo.resourceFingerprint,
			fontPath,
		});
		const destination = getJianyingTextRenderCacheDirectory({ cacheKey });
		const cached = await readCachedRender({
			directory: destination,
			cacheKey,
		});
		if (cached) {
			const previewUrl = await previewVideoForRender({
				request,
				cacheKey,
				directory: destination,
				manifest: cached,
			});
			return responseForRender({
				request,
				directory: destination,
				manifest: cached,
				cacheHit: true,
				diagnostics,
				previewUrl,
			});
		}
		await rm(destination, { recursive: true, force: true });
		const cacheRoot = getJianyingTextRenderCacheRoot();
		await mkdir(cacheRoot, { recursive: true });
		const temporary = path.join(cacheRoot, `.tmp-${cacheKey}-${randomUUID()}`);
		await mkdir(temporary, { recursive: true });
		try {
			await renderUncached({
				request,
				runtime,
				packageInfo,
				directory: temporary,
				cacheKey,
				fontPath,
			});
			throwIfJianyingTextRenderCancelled({ requestId: request.requestId });
			await rename(temporary, destination).catch(async (cause) => {
				if (await readCachedRender({ directory: destination, cacheKey }))
					return;
				throw cause;
			});
			const stored = await readCachedRender({
				directory: destination,
				cacheKey,
			});
			if (!stored) {
				throw new Error("Jianying text render cache validation failed.");
			}
			const previewUrl = await previewVideoForRender({
				request,
				cacheKey,
				directory: destination,
				manifest: stored,
			});
			return responseForRender({
				request,
				directory: destination,
				manifest: stored,
				cacheHit: false,
				diagnostics,
				previewUrl,
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	} finally {
		finishJianyingTextRender({ requestId: request.requestId });
	}
}
