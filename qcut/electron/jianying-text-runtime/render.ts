import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
	shouldFitJianyingHostText,
} from "./host-text-fit.js";
import { resolveJianyingTextPackage } from "./package-resolver.js";
import { repairTransientTransparentRgbaFrames } from "./raw-sequence-integrity.js";
import { normalizeJianyingTextRuntimeReference } from "./reference.js";
import { ensureJianyingTextPreviewVideo } from "./preview-video.js";
import { buildJianyingTextRawFrameFilter } from "./premultiplied-alpha.js";
import {
	JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
	jianyingTextFramePath,
	jianyingTextFramePattern,
	readJianyingTextCachedRender,
	type JianyingTextCachedRenderManifest,
} from "./render-cache.js";
import { withJianyingTextRenderCacheLock } from "./render-cache-lock.js";
import {
	finishJianyingTextRender,
	runJianyingTextProcess,
	throwIfJianyingTextRenderCancelled,
} from "./render-process.js";
import { inspectJianyingTextRuntime } from "./runtime-discovery.js";
import { JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION } from "./script-package-editor.js";
import { resolveJianyingTextTemplateTiming } from "./timing.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const MAXIMUM_CONTENT_CODE_POINTS = 4096;
const MAXIMUM_DIMENSION = 4096;
const MAXIMUM_FRAME_COUNT = 18_000;
const MAXIMUM_HOST_TEXT_FIT_ATTEMPTS = 4;

interface ValidatedRenderRequest
	extends Omit<JianyingTextRuntimeRenderRequest, "reference"> {
	reference: NonNullable<
		ReturnType<typeof normalizeJianyingTextRuntimeReference>
	>;
}

interface ExpectedRenderCache {
	frameCount: number;
	fps: number;
	templateDuration: number;
	width: number;
	height: number;
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
				schemaVersion: JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
				runtimeFingerprint,
				packageKind: request.reference.packageKind,
				packageHash: request.reference.packageHash,
				scriptPackageSchemaVersion:
					request.reference.packageKind === "ScriptInfoSticker"
						? JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION
						: null,
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
	const filter = buildJianyingTextRawFrameFilter({
		opacity: request.transform.opacity,
		rotationRadians: rotated.radians,
		outputWidth: rotated.width,
		outputHeight: rotated.height,
	});
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
			jianyingTextFramePattern({ directory }),
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
	manifest: JianyingTextCachedRenderManifest;
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
				? {
						kind: "image",
						path: jianyingTextFramePath({ directory, index: 0 }),
					}
				: {
						kind: "image-sequence",
						path: jianyingTextFramePattern({ directory }),
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
	manifest: JianyingTextCachedRenderManifest;
}) {
	const rotated = rotatedDimensions({
		width: Math.round(request.transform.width),
		height: Math.round(request.transform.height),
		rotation: request.transform.rotation,
	});
	return request.previewVideo
		? ensureJianyingTextPreviewVideo({
				requestId: request.requestId,
				cacheKey,
				directory,
				frameCount: manifest.frameCount,
				fps: manifest.fps,
				width: rotated.width,
				height: rotated.height,
			})
		: undefined;
}

async function responseFromStoredRender({
	request,
	cacheKey,
	directory,
	manifest,
	cacheHit,
	diagnostics,
}: {
	request: ValidatedRenderRequest;
	cacheKey: string;
	directory: string;
	manifest: JianyingTextCachedRenderManifest;
	cacheHit: boolean;
	diagnostics: JianyingTextRuntimeDiagnostic[];
}) {
	const previewUrl = await previewVideoForRender({
		request,
		cacheKey,
		directory,
		manifest,
	});
	return responseForRender({
		request,
		directory,
		manifest,
		cacheHit,
		diagnostics,
		previewUrl,
	});
}

async function fitHostTextRequest({
	runtime,
	request,
	attempt = 0,
}: {
	runtime: JianyingTextBridgeRuntime;
	request: JianyingTextRawSequenceRequest;
	attempt?: number;
}): Promise<JianyingTextRawSequenceRequest> {
	if (!shouldFitJianyingHostText({ packageKind: request.packageKind })) {
		return request;
	}
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
		if (nextFontSize === null || attempt >= MAXIMUM_HOST_TEXT_FIT_ATTEMPTS) {
			return {
				...request,
				fontSize,
			};
		}
		return fitHostTextRequest({
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
	const timing = resolveJianyingTextTemplateTiming({
		sourceStart: request.sourceStart,
		elementDuration: request.elementDuration,
		frameCount: request.frameCount,
		fps: request.fps,
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
			fallbackFontPath: fontPath,
			...(request.fontAssetId ? { fontOverridePath: fontPath } : {}),
		});
	} else {
		const hostTextRequest = await fitHostTextRequest({
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
			throwIfCancelled: () =>
				throwIfJianyingTextRenderCancelled({ requestId: request.requestId }),
		});
		strategy = "host-text";
	}
	await convertRawSequence({ request, rawPath, directory, width, height });
	await rm(rawPath, { force: true });
	const manifest: JianyingTextCachedRenderManifest = {
		schemaVersion: JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
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

async function renderWithCacheLock({
	request,
	runtime,
	packageInfo,
	cacheKey,
	cacheRoot,
	destination,
	expectedCache,
	fontPath,
	diagnostics,
}: {
	request: ValidatedRenderRequest;
	runtime: JianyingTextBridgeRuntime;
	packageInfo: Awaited<ReturnType<typeof resolveJianyingTextPackage>>;
	cacheKey: string;
	cacheRoot: string;
	destination: string;
	expectedCache: ExpectedRenderCache;
	fontPath: string;
	diagnostics: JianyingTextRuntimeDiagnostic[];
}) {
	return withJianyingTextRenderCacheLock({
		cacheKey,
		cacheRoot,
		throwIfCancelled: () =>
			throwIfJianyingTextRenderCancelled({ requestId: request.requestId }),
		task: async () => {
			const cached = await readJianyingTextCachedRender({
				directory: destination,
				cacheKey,
				expected: expectedCache,
			});
			if (cached) {
				return responseFromStoredRender({
					request,
					cacheKey,
					directory: destination,
					manifest: cached,
					cacheHit: true,
					diagnostics,
				});
			}
			await rm(destination, { recursive: true, force: true });
			const temporary = path.join(
				cacheRoot,
				`.tmp-${cacheKey}-${randomUUID()}`
			);
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
					if (
						await readJianyingTextCachedRender({
							directory: destination,
							cacheKey,
							expected: expectedCache,
						})
					) {
						return;
					}
					throw cause;
				});
				const stored = await readJianyingTextCachedRender({
					directory: destination,
					cacheKey,
					expected: expectedCache,
				});
				if (!stored) {
					throw new Error("Jianying text render cache validation failed.");
				}
				return responseFromStoredRender({
					request,
					cacheKey,
					directory: destination,
					manifest: stored,
					cacheHit: false,
					diagnostics,
				});
			} finally {
				await rm(temporary, { recursive: true, force: true });
			}
		},
	});
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
			runtimeRoot: runtime.runtimeRoot,
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
		const rotated = rotatedDimensions({
			width: Math.round(request.transform.width),
			height: Math.round(request.transform.height),
			rotation: request.transform.rotation,
		});
		const expectedCache = {
			frameCount: request.frameCount,
			fps: request.fps,
			templateDuration: packageInfo.templateDuration,
			width: rotated.width,
			height: rotated.height,
		};
		const cached = await readJianyingTextCachedRender({
			directory: destination,
			cacheKey,
			expected: expectedCache,
		});
		if (cached && !request.previewVideo) {
			return responseForRender({
				request,
				directory: destination,
				manifest: cached,
				cacheHit: true,
				diagnostics,
			});
		}
		const cacheRoot = getJianyingTextRenderCacheRoot();
		await mkdir(cacheRoot, { recursive: true });
		return renderWithCacheLock({
			request,
			runtime,
			packageInfo,
			cacheKey,
			cacheRoot,
			destination,
			expectedCache,
			fontPath,
			diagnostics,
		});
	} finally {
		finishJianyingTextRender({ requestId: request.requestId });
	}
}
