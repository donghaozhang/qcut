import { createHash, randomUUID } from "node:crypto";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingPortraitAdjustmentDetectRequest,
	JianyingPortraitAdjustmentDetectResult,
	JianyingPortraitDetectedFace,
	JianyingPortraitAdjustmentGroup,
	JianyingPortraitAdjustmentRenderRequest,
	JianyingPortraitAdjustmentRenderResult,
	JianyingPortraitAdjustmentStatus,
	MediaPortraitManualRetouchStroke,
} from "../jianying-portrait-adjustment-contract.js";
import { inspectJianyingFilterLocalRuntime } from "../jianying-filter-local-runtime/runtime-discovery.js";
import { resolveJianyingPortraitAdjustmentHost } from "./bridge-resolver.js";
import { JIANYING_PORTRAIT_ADJUSTMENT_CATALOG } from "./catalog.js";
import {
	startJianyingPortraitHostProcess,
	type JianyingPortraitHostProcess,
} from "./host-process.js";
import { resolveJianyingPortraitMakeupCards } from "./makeup-resolver.js";
import { resolveJianyingPortraitPackages } from "./package-resolver.js";
import {
	bindDetectedPortraitFaces,
	type NativeDetectedPortraitFace,
} from "./person-binding.js";
import {
	renderUntilOutputChanges,
	SPOT_ACNE_MAX_RENDER_ATTEMPTS,
} from "./render-readiness.js";
import {
	activeJianyingPortraitGroups,
	buildJianyingPortraitRenderStages,
	type JianyingPortraitRenderStage,
} from "./stages.js";
import {
	matchPortraitTrackIdsDetailed,
	type PortraitFaceGeometry,
	remapPortraitFeatureParameters,
	restorePortraitReferenceFaces,
} from "./track-id-remapping.js";
import {
	canMapPortraitDetection,
	isPortraitTrackingDiscontinuity,
} from "./tracking-session.js";
import { createPortraitTrackingScopePool } from "./tracking-scope-pool.js";

const CACHE_LIMIT = 4;
const MANUAL_RETOUCH_CACHE_VERSION = "v1";
const TRACKING_SCOPE_LIMIT = 4;

interface HostSession {
	id: string;
	packagePath: string;
	process: JianyingPortraitHostProcess;
	trackIds?: ReadonlyMap<number, number>;
}

interface DetectionSnapshot {
	frameHash: string;
	faces: JianyingPortraitDetectedFace[];
	frameNumber?: number;
	sourceKey?: string;
}

export interface JianyingPortraitAdjustmentProvider {
	inspect: ({
		refresh,
	}?: {
		refresh?: boolean;
	}) => Promise<JianyingPortraitAdjustmentStatus>;
	render: (
		request: JianyingPortraitAdjustmentRenderRequest
	) => Promise<JianyingPortraitAdjustmentRenderResult>;
	detect: (
		request: JianyingPortraitAdjustmentDetectRequest
	) => Promise<JianyingPortraitAdjustmentDetectResult>;
	clear: () => Promise<void>;
}

/**
 * Only the first five tracked faces receive effects — a package-level limit,
 * not a product choice — so the UI can tell the user why a sixth face is
 * listed but inert.
 */
const APPLIED_FACE_LIMIT = 5;

/**
 * Parses the host's detect payload. A malformed payload is an error rather
 * than an empty face list: reporting "no faces" for a broken pipeline would
 * read as a detection outcome.
 */
function parseDetectedFaces({
	payload,
}: {
	payload: string;
}): NativeDetectedPortraitFace[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(payload);
	} catch {
		throw new Error("剪映美颜美体人脸检测返回了无法解析的结果");
	}
	const faces = (parsed as { faces?: unknown })?.faces;
	if (!Array.isArray(faces)) {
		throw new Error("剪映美颜美体人脸检测结果缺少人脸列表");
	}
	return faces.map((value) => {
		const face = value as Record<string, unknown>;
		const rect = face.rect;
		if (
			typeof face.trackId !== "number" ||
			!Number.isSafeInteger(face.trackId) ||
			face.trackId < 0 ||
			typeof face.faceId !== "number" ||
			!Number.isSafeInteger(face.faceId) ||
			face.faceId < 0 ||
			typeof face.freidTrackId !== "number" ||
			!Number.isSafeInteger(face.freidTrackId) ||
			face.freidTrackId < 0 ||
			face.trackId !== face.freidTrackId ||
			!Array.isArray(rect) ||
			rect.length !== 4 ||
			!rect.every(
				(entry) => typeof entry === "number" && Number.isFinite(entry)
			)
		) {
			throw new Error("剪映美颜美体人脸检测结果格式无效");
		}
		const numberField = (key: string) =>
			typeof face[key] === "number" && Number.isFinite(face[key])
				? (face[key] as number)
				: 0;
		return {
			trackId: face.trackId,
			faceId: face.faceId,
			freidTrackId: face.freidTrackId,
			rect: {
				x: rect[0] as number,
				y: rect[1] as number,
				width: rect[2] as number,
				height: rect[3] as number,
			},
			score: numberField("score"),
			yaw: numberField("yaw"),
			pitch: numberField("pitch"),
			roll: numberField("roll"),
			trackingCount: numberField("trackingCount"),
			landmarkCount: numberField("landmarkCount"),
		};
	});
}

function requestedGroups({
	request,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
}): JianyingPortraitAdjustmentGroup[] {
	const groups = new Set<JianyingPortraitAdjustmentGroup>();
	for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
		if ((request.adjustments.values[control.key] ?? 0) !== 0) {
			groups.add(control.group);
		}
	}
	if (Object.keys(request.adjustments.makeup ?? {}).length > 0) {
		groups.add("face");
	}
	if ((request.adjustments.manualRetouch?.strokes.length ?? 0) > 0) {
		groups.add("face");
	}
	if (
		(request.adjustments.manualBody?.stretch?.intensity ?? 0) !== 0 ||
		(request.adjustments.manualBody?.slim?.intensity ?? 0) !== 0 ||
		(request.adjustments.manualBody?.zoom?.intensity ?? 0) !== 0
	) {
		groups.add("body");
	}
	for (const face of request.adjustments.faces ?? []) {
		for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
			if ((face.values[control.key] ?? 0) !== 0) {
				groups.add(control.group);
			}
		}
		if (Object.keys(face.makeup ?? {}).length > 0) {
			groups.add("face");
		}
	}
	return (["face", "body"] as const).filter((group) => groups.has(group));
}

function frameCacheKey({
	request,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
}) {
	const hash = createHash("sha256")
		.update(`${request.width}x${request.height}\0`)
		.update(request.sourceKey ?? "")
		.update(`\0${request.timestampSeconds ?? 0}\0`);
	for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
		hash.update(
			`\0${control.key}:${request.adjustments.values[control.key] ?? 0}`
		);
	}
	hash.update(
		`\0target:${JSON.stringify(request.adjustments.faceTarget ?? {})}`
	);
	const makeupEntries = Object.entries(request.adjustments.makeup ?? {}).sort(
		([left], [right]) => left.localeCompare(right)
	);
	hash.update(`\0makeup:${JSON.stringify(makeupEntries)}`);
	hash.update(
		`\0manual:${JSON.stringify(request.adjustments.manualRetouch?.strokes ?? [])}`
	);
	hash.update(
		`\0manual-body:${JSON.stringify(request.adjustments.manualBody ?? {})}`
	);
	// Per-face entries arrive normalized (deduped, ascending trackId) but the
	// serialization sorts anyway so the key never depends on writer order.
	// Legacy requests carry no faces and hash exactly as before.
	for (const face of [...(request.adjustments.faces ?? [])].sort(
		(left, right) => left.trackId - right.trackId
	)) {
		hash.update(`\0face:${face.trackId}`);
		for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
			const value = face.values[control.key] ?? 0;
			if (value !== 0) hash.update(`\0${control.key}:${value}`);
		}
		const faceMakeup = Object.entries(face.makeup ?? {}).sort(
			([left], [right]) => left.localeCompare(right)
		);
		if (faceMakeup.length > 0) {
			hash.update(`\0facemakeup:${JSON.stringify(faceMakeup)}`);
		}
	}
	hash.update(request.rgba);
	return hash.digest("hex");
}

function frameHash({ rgba }: { rgba: Uint8Array }) {
	return createHash("sha256").update(rgba).digest("hex");
}

function manualRetouchCacheBase() {
	return (
		process.env.QCUT_JIANYING_MANUAL_RETOUCH_CACHE_ROOT ??
		path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"QCut",
			"Caches",
			"JianyingManualRetouch"
		)
	);
}

function manualRetouchCacheDirectory({
	request,
	stage,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	stage: JianyingPortraitRenderStage;
}) {
	const identity = createHash("sha256")
		.update(MANUAL_RETOUCH_CACHE_VERSION)
		.update(`\0${request.width}x${request.height}\0`)
		.update(request.sourceKey ?? frameHash({ rgba: request.rgba }))
		.update(`\0${stage.id}`)
		.digest("hex");
	return path.join(manualRetouchCacheBase(), identity);
}

async function pathExists({ filePath }: { filePath: string }) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function manualRetouchCacheReady({
	cacheDirectory,
	tool,
}: {
	cacheDirectory: string;
	tool: "smooth" | "acne";
}) {
	const manifestPath = path.join(cacheDirectory, "retouch_config.json");
	let manifest: unknown;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch {
		return false;
	}
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return false;
	}
	const listKey =
		tool === "smooth" ? "smooth_mask_list" : "acne_removeal_mask_list";
	const list = (manifest as Record<string, unknown>)[listKey];
	if (!list || typeof list !== "object" || Array.isArray(list)) return false;
	const maskFiles = Object.values(list);
	if (
		maskFiles.length === 0 ||
		maskFiles.some(
			(fileName) =>
				typeof fileName !== "string" ||
				path.basename(fileName) !== fileName ||
				!fileName.endsWith(".png")
		)
	) {
		return false;
	}
	return (
		await Promise.all(
			maskFiles.map((fileName) =>
				pathExists({ filePath: path.join(cacheDirectory, String(fileName)) })
			)
		)
	).every(Boolean);
}

function manualBrushType({ tool }: { tool: "smooth" | "acne" }) {
	return tool === "smooth" ? "manual_beauty_smooth" : "manual_acne_removal";
}

function manualFeatureParameters({
	cacheDirectory,
	loadCache,
	request,
	stroke,
	tool,
}: {
	cacheDirectory?: string;
	loadCache?: boolean;
	request?: JianyingPortraitAdjustmentRenderRequest;
	stroke?: MediaPortraitManualRetouchStroke;
	tool: "smooth" | "acne";
}) {
	const lastStroke = stroke;
	return JSON.stringify({
		...(cacheDirectory
			? {
					draft_path: `${cacheDirectory}${path.sep}`,
					load_manual_retouch_cache: loadCache ?? false,
					canvas_size: JSON.stringify({
						width: request?.width,
						height: request?.height,
					}),
				}
			: {}),
		brush_type: manualBrushType({ tool }),
		brush_mode: lastStroke?.mode === "erase" ? 1 : 0,
		intensity: lastStroke?.intensity ?? 100,
		brush_size: lastStroke?.size ?? 50,
	});
}

function faceContainingPoint({
	faces,
	point,
}: {
	faces: NativeDetectedPortraitFace[];
	point: { x: number; y: number };
}) {
	return faces.find(
		(face) =>
			point.x >= face.rect.x &&
			point.x <= face.rect.x + face.rect.width &&
			point.y >= face.rect.y &&
			point.y <= face.rect.y + face.rect.height
	);
}

async function writeManualRetouchCacheManifest({
	cacheDirectory,
	maskFilesByTrackId,
	tool,
}: {
	cacheDirectory: string;
	maskFilesByTrackId: ReadonlyMap<number, string>;
	tool: "smooth" | "acne";
}) {
	const list = Object.fromEntries(
		[...maskFilesByTrackId.entries()].map(([trackId, fileName]) => [
			String(trackId),
			fileName,
		])
	);
	const manifest = {
		[tool === "smooth" ? "smooth_mask_list" : "acne_removeal_mask_list"]: list,
	};
	const temporaryPath = path.join(
		cacheDirectory,
		`.retouch-config-${process.pid}-${Date.now()}`
	);
	await writeFile(temporaryPath, `${JSON.stringify(manifest)}\n`, {
		mode: 0o600,
	});
	await rename(temporaryPath, path.join(cacheDirectory, "retouch_config.json"));
}

export function createJianyingPortraitAdjustmentProvider(): JianyingPortraitAdjustmentProvider {
	const trackingScopes = createPortraitTrackingScopePool<HostSession>({
		limit: TRACKING_SCOPE_LIMIT,
	});
	const cache = new Map<string, Uint8Array>();
	let queue = Promise.resolve();
	let temporaryDirectoryPromise: Promise<string> | null = null;
	let detectionSnapshot: DetectionSnapshot | null = null;

	const retireInactiveSessions = async ({
		sessions,
		stages,
	}: {
		sessions: Map<string, HostSession>;
		stages: JianyingPortraitRenderStage[];
	}) => {
		const activeIds = new Set(stages.map(({ id }) => id));
		const stale = [...sessions.entries()].filter(
			([sessionId]) => !activeIds.has(sessionId)
		);
		for (const [sessionId] of stale) sessions.delete(sessionId);
		await Promise.all(stale.map(([, session]) => session.process.dispose()));
	};

	const inspect = async ({ refresh = false }: { refresh?: boolean } = {}) => {
		if (refresh) await trackingScopes.clear();
		const [runtime, hostPath, packages, makeupCards] = await Promise.all([
			inspectJianyingFilterLocalRuntime({ refresh }),
			resolveJianyingPortraitAdjustmentHost(),
			resolveJianyingPortraitPackages(),
			resolveJianyingPortraitMakeupCards(),
		]);
		const packageStatuses = packages.map(
			({ group, runtimePackage, packagePath, source }) => ({
				group,
				runtimePackage,
				ready: Boolean(packagePath),
				source,
			})
		);
		const makeupBaseReady =
			packageStatuses.find(({ runtimePackage }) => runtimePackage === "makeup")
				?.ready === true;
		const makeupCardStatuses = makeupCards.map(
			({ card, packagePath, source, thumbnailDataUrl }) => ({
				id: card.id,
				category: card.category,
				titleZh: card.titleZh,
				titleEn: card.titleEn,
				defaultIntensity: card.defaultIntensity,
				ready: Boolean(
					packagePath && (card.kind === "standalone" || makeupBaseReady)
				),
				source,
				...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
			})
		);
		const baseStatus = {
			provider: "jianying-local-swing-v1" as const,
			catalog: [...JIANYING_PORTRAIT_ADJUSTMENT_CATALOG],
			packages: packageStatuses,
			makeupCards: makeupCardStatuses,
		};
		if (runtime.status.state !== "ready") {
			return {
				...baseStatus,
				state: runtime.status.state,
				message: runtime.status.message,
				available: false,
				offlineReady: false,
			};
		}
		if (!hostPath) {
			return {
				...baseStatus,
				state: "bridge-missing" as const,
				message: "QCut 剪映美颜美体本机宿主未安装或构建失败。",
				available: false,
				offlineReady: false,
			};
		}
		const hasRenderablePackage =
			packageStatuses.some(({ ready }) => ready) ||
			makeupCardStatuses.some(({ ready }) => ready);
		if (!hasRenderablePackage) {
			return {
				...baseStatus,
				state: "package-missing" as const,
				message: "剪映美颜、美妆或美体效果包尚未缓存。",
				available: false,
				offlineReady: false,
			};
		}
		const allPackagesReady = packageStatuses.every(({ ready }) => ready);
		const allCardsReady = makeupCardStatuses.every(({ ready }) => ready);
		const offlineReady =
			allPackagesReady &&
			allCardsReady &&
			runtime.status.runtimeSource === "qcut-private" &&
			runtime.status.modelSource === "qcut-private" &&
			packageStatuses.every(({ source }) => source === "qcut-private") &&
			makeupCardStatuses.every(({ source }) => source === "qcut-private");
		const fullyReady = allPackagesReady && allCardsReady;
		return {
			...baseStatus,
			state: "ready" as const,
			message: offlineReady
				? "剪映原版美颜、美妆与美体本机运行时已离线就绪。"
				: fullyReady
					? "剪映原版美颜、美妆与美体本机运行时已就绪。"
					: "剪映本机运行时已就绪，未缓存的控件已禁用。",
			available: true,
			offlineReady,
		};
	};

	const renderNow = async (
		request: JianyingPortraitAdjustmentRenderRequest
	): Promise<JianyingPortraitAdjustmentRenderResult> => {
		const groups = requestedGroups({ request });
		if (!request.adjustments.enabled || groups.length === 0) {
			return {
				provider: "jianying-local-swing-v1",
				width: request.width,
				height: request.height,
				rgba: new Uint8Array(request.rgba),
				activeGroups: [],
			};
		}
		const cacheKey = frameCacheKey({ request });
		const cached = cache.get(cacheKey);
		if (cached) {
			cache.delete(cacheKey);
			cache.set(cacheKey, cached);
			return {
				provider: "jianying-local-swing-v1",
				width: request.width,
				height: request.height,
				rgba: new Uint8Array(cached),
				activeGroups: groups,
			};
		}

		const [runtime, hostPath, packages, makeupCards] = await Promise.all([
			inspectJianyingFilterLocalRuntime(),
			resolveJianyingPortraitAdjustmentHost(),
			resolveJianyingPortraitPackages(),
			resolveJianyingPortraitMakeupCards(),
		]);
		if (
			runtime.status.state !== "ready" ||
			!runtime.frameworkDirectory ||
			!runtime.modelDirectory ||
			!hostPath
		) {
			throw new Error(runtime.status.message);
		}
		const stages = buildJianyingPortraitRenderStages({
			request,
			packages,
			makeupCards,
		});
		const activeGroups = activeJianyingPortraitGroups({ stages });
		const frameworkDirectory = runtime.frameworkDirectory;
		const modelDirectory = runtime.modelDirectory;
		const requestedTimestamp = request.timestampSeconds ?? 0;
		const requestedScope = [
			request.width,
			request.height,
			request.sourceKey ?? "",
		].join("\0");
		const requestedFaceEntries = request.adjustments.faces ?? [];
		const renderFrameHash = frameHash({ rgba: request.rgba });
		const canMapDetectedFaces = canMapPortraitDetection({
			requestedFaceCount: requestedFaceEntries.length,
			detectionSourceKey: detectionSnapshot?.sourceKey,
			requestSourceKey: request.sourceKey,
			detectionFrameNumber: detectionSnapshot?.frameNumber,
			requestFrameNumber: request.frameNumber,
			detectionFrameHash: detectionSnapshot?.frameHash,
			requestFrameHash: renderFrameHash,
		});
		let trackingScope = await trackingScopes.acquire({
			scopeKey: requestedScope,
		});
		const trackingDiscontinuity = isPortraitTrackingDiscontinuity({
			previousTimestampSeconds: trackingScope.lastTimestampSeconds,
			requestedTimestampSeconds: requestedTimestamp,
		});
		if (trackingDiscontinuity) {
			await trackingScopes.retire({ scopeKey: requestedScope });
			trackingScope = await trackingScopes.acquire({
				scopeKey: requestedScope,
			});
		}
		const sessions = trackingScope.sessions;
		await retireInactiveSessions({ sessions, stages });
		if (requestedFaceEntries.length > 0) {
			if (!detectionSnapshot) {
				throw new Error("逐脸美颜需要在当前画面重新识别人脸");
			}
			const detectedByBindingId = new Map(
				detectionSnapshot.faces.map(
					(face) => [face.personBindingId, face] as const
				)
			);
			for (const entry of requestedFaceEntries) {
				if (!entry.personBindingId) {
					throw new Error("旧版逐脸设置需要重新识别并选择人物");
				}
				const detected = detectedByBindingId.get(entry.personBindingId);
				if (!detected || detected.trackId !== entry.trackId) {
					throw new Error("人物绑定已过期，请在当前画面重新识别人脸");
				}
			}
		}
		const runtimeRoot = path.dirname(frameworkDirectory);
		if (!temporaryDirectoryPromise) {
			temporaryDirectoryPromise = mkdtemp(
				path.join(os.tmpdir(), "qcut-jianying-portrait-")
			).catch((cause) => {
				temporaryDirectoryPromise = null;
				throw cause;
			});
		}
		const directory = await temporaryDirectoryPromise;

		const sessionForStage = async ({
			stage,
		}: {
			stage: JianyingPortraitRenderStage;
		}) => {
			const existing = sessions.get(stage.id);
			if (existing?.packagePath === stage.packagePath) return existing;
			if (existing) {
				sessions.delete(stage.id);
				await existing.process.dispose();
			}
			const process = await startJianyingPortraitHostProcess({
				hostPath,
				runtimeRoot,
				modelDirectory,
				packagePath: stage.packagePath,
				frameworkDirectory,
				width: request.width,
				height: request.height,
			});
			const session: HostSession = {
				id: stage.id,
				packagePath: stage.packagePath,
				process,
			};
			sessions.set(stage.id, session);
			return session;
		};

		const requestId = randomUUID();
		const paths = [path.join(directory, `${requestId}-input.rgba`)];
		await writeFile(paths[0], request.rgba);
		const renderManualStage = async ({
			index,
			inputPath,
			outputPath,
			session,
			stage,
		}: {
			index: number;
			inputPath: string;
			outputPath: string;
			session: HostSession;
			stage: JianyingPortraitRenderStage;
		}) => {
			const tool = stage.manualTool;
			const strokes = stage.manualStrokes;
			if (!tool || !strokes || strokes.length === 0) {
				throw new Error("剪映手动美颜渲染计划无效");
			}
			const cacheDirectory = manualRetouchCacheDirectory({ request, stage });
			await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
			const hasCache = await manualRetouchCacheReady({
				cacheDirectory,
				tool,
			});
			const initialParameters = manualFeatureParameters({
				cacheDirectory,
				loadCache: hasCache,
				request,
				stroke: strokes[strokes.length - 1],
				tool,
			});
			await session.process.render({
				requestId: `${requestId}-${index}-manual-warm`,
				timestampSeconds: requestedTimestamp,
				inputPath,
				outputPath,
				featureParameters: initialParameters,
			});
			if (hasCache) return;

			const detectionPayload = await session.process.detect({
				requestId: `${requestId}-${index}-manual-detect`,
				inputPath,
			});
			const faces = parseDetectedFaces({ payload: detectionPayload });
			const maskFilesByTrackId = new Map<number, string>();
			const replayStroke = async ({ strokeIndex }: { strokeIndex: number }) => {
				const stroke = strokes[strokeIndex];
				if (!stroke) return;
				const face = faceContainingPoint({
					faces,
					point: stroke.points[0] ?? { x: -1, y: -1 },
				});
				if (!face) {
					throw new Error("手动美颜笔画起点没有命中可跟踪人脸");
				}
				const before = new Set(await readdir(cacheDirectory));
				await session.process.stroke({
					requestId: `${requestId}-${index}-manual-${strokeIndex}`,
					timestampSeconds: requestedTimestamp,
					inputPath,
					outputPath,
					featureParameters: manualFeatureParameters({ stroke, tool }),
					points: stroke.points,
				});
				const maskFile = (await readdir(cacheDirectory)).find(
					(fileName) => !before.has(fileName) && fileName.endsWith(".png")
				);
				if (!maskFile) {
					throw new Error("剪映手动美颜没有生成原生 mask 缓存");
				}
				maskFilesByTrackId.set(face.trackId, maskFile);
				await replayStroke({ strokeIndex: strokeIndex + 1 });
			};
			await replayStroke({ strokeIndex: 0 });
			await writeManualRetouchCacheManifest({
				cacheDirectory,
				maskFilesByTrackId,
				tool,
			});
		};
		const renderStage = async ({
			index,
			inputPath,
		}: {
			index: number;
			inputPath: string;
		}): Promise<string> => {
			const stage = stages[index];
			if (!stage) return inputPath;
			const outputPath = path.join(directory, `${requestId}-${index}.rgba`);
			paths.push(outputPath);
			const session = await sessionForStage({ stage });
			let featureParameters = stage.featureParameters;
			if (stage.targetFaceIds.length > 0) {
				const needsTrackMapping = stage.targetFaceIds.some(
					(trackId) => !session.trackIds?.has(trackId)
				);
				if (needsTrackMapping) {
					let referenceFaces: PortraitFaceGeometry[] | undefined =
						canMapDetectedFaces && detectionSnapshot
							? detectionSnapshot.faces
							: undefined;
					if (!referenceFaces) {
						const mappedSession = [...sessions.values()].find(
							(candidate) => candidate !== session && candidate.trackIds
						);
						if (mappedSession?.trackIds) {
							const payload = await mappedSession.process.detect({
								requestId: `${requestId}-${index}-reference-map`,
								inputPath: paths[0],
							});
							referenceFaces = restorePortraitReferenceFaces({
								runtimeFaces: parseDetectedFaces({ payload }),
								trackIds: mappedSession.trackIds,
							});
						}
					}
					if (!referenceFaces || referenceFaces.length === 0) {
						throw new Error("逐脸美颜缺少当前帧的人物映射，请重新识别人脸");
					}
					const detectionPayload = await session.process.detect({
						requestId: `${requestId}-${index}-track-map`,
						inputPath: paths[0],
					});
					const match = matchPortraitTrackIdsDetailed({
						referenceFaces,
						runtimeFaces: parseDetectedFaces({ payload: detectionPayload }),
					});
					session.trackIds = match.trackIds;
				}
				const trackIds = session.trackIds;
				if (!trackIds) {
					throw new Error(`剪映美颜美体未能建立 ${stage.id} 的人物映射`);
				}
				for (const trackId of stage.targetFaceIds) {
					if (!trackIds.has(trackId)) {
						throw new Error(
							`剪映美颜美体无法在 ${stage.id} 中绑定所选人物 ${trackId}`
						);
					}
				}
				featureParameters = remapPortraitFeatureParameters({
					featureParameters,
					trackIds,
				});
			}
			try {
				if (stage.manualTool) {
					await renderManualStage({
						index,
						inputPath,
						outputPath,
						session,
						stage,
					});
					return renderStage({ index: index + 1, inputPath: outputPath });
				}
				const renderAttempt = async ({ attempt }: { attempt: number }) =>
					session.process.render({
						requestId: `${requestId}-${index}-${attempt}`,
						timestampSeconds: requestedTimestamp,
						inputPath,
						outputPath,
						featureParameters,
					});
				if (stage.runtimePackage === "spot-acne") {
					const inputPixels = await readFile(inputPath);
					await renderUntilOutputChanges({
						renderAttempt,
						isOutputChanged: async () =>
							!(await readFile(outputPath)).equals(inputPixels),
						maxAttempts: SPOT_ACNE_MAX_RENDER_ATTEMPTS,
					});
				} else {
					await renderAttempt({ attempt: 1 });
				}
			} catch (cause) {
				sessions.delete(stage.id);
				void session.process.dispose().catch(() => undefined);
				throw cause;
			}
			return renderStage({ index: index + 1, inputPath: outputPath });
		};

		try {
			const outputPath = await renderStage({ index: 0, inputPath: paths[0] });
			const output = new Uint8Array(await readFile(outputPath));
			if (output.byteLength !== request.width * request.height * 4) {
				throw new Error("剪映美颜美体返回了错误的像素数量");
			}
			trackingScope.lastTimestampSeconds = requestedTimestamp;
			if (cache.size >= CACHE_LIMIT) {
				const oldest = cache.keys().next().value;
				if (oldest) cache.delete(oldest);
			}
			cache.set(cacheKey, output);
			return {
				provider: "jianying-local-swing-v1",
				width: request.width,
				height: request.height,
				rgba: new Uint8Array(output),
				activeGroups,
			};
		} finally {
			await Promise.all(paths.map((filePath) => rm(filePath, { force: true })));
		}
	};

	const detectNow = async (
		request: JianyingPortraitAdjustmentDetectRequest
	): Promise<JianyingPortraitAdjustmentDetectResult> => {
		if (
			request.frameNumber !== undefined &&
			(!Number.isSafeInteger(request.frameNumber) || request.frameNumber < 0)
		) {
			throw new Error("剪映美颜美体检测帧号无效");
		}
		// Each effect package owns a separate tracker. Retire old sessions and keep
		// this frame's geometry so every new package can map its ids before render.
		cache.clear();
		detectionSnapshot = null;
		await trackingScopes.clear();
		const [runtime, hostPath, packages] = await Promise.all([
			inspectJianyingFilterLocalRuntime({ refresh: false }),
			resolveJianyingPortraitAdjustmentHost(),
			resolveJianyingPortraitPackages(),
		]);
		const modelDirectory = runtime.modelDirectory;
		const frameworkDirectory = runtime.frameworkDirectory;
		// Detection needs a package that carries a face algorithm graph; the
		// face-shape package is the one every install has when portrait is ready.
		const packagePath = packages.find(
			({ runtimePackage }) => runtimePackage === "face"
		)?.packagePath;
		if (!hostPath || !modelDirectory || !frameworkDirectory || !packagePath) {
			throw new Error("剪映美颜美体人脸检测不可用");
		}
		if (!temporaryDirectoryPromise) {
			temporaryDirectoryPromise = mkdtemp(
				path.join(os.tmpdir(), "qcut-jianying-portrait-")
			).catch((cause) => {
				temporaryDirectoryPromise = null;
				throw cause;
			});
		}
		const directory = await temporaryDirectoryPromise;
		const requestId = randomUUID();
		const inputPath = path.join(directory, `${requestId}-detect.rgba`);
		await writeFile(inputPath, request.rgba);
		// The frame is several megabytes, so it is removed even when the host
		// never starts — a spawn failure the user can retry many times must not
		// accumulate files in the temporary directory.
		try {
			// Detection runs in its own short-lived host: it loads a second effect
			// handle, and reusing a render session's host would disturb the tracker
			// state those sessions depend on.
			const host = await startJianyingPortraitHostProcess({
				hostPath,
				runtimeRoot: path.dirname(frameworkDirectory),
				modelDirectory,
				packagePath,
				frameworkDirectory,
				width: request.width,
				height: request.height,
			});
			try {
				const payload = await host.detect({ requestId, inputPath });
				const nativeFaces = parseDetectedFaces({ payload });
				const binding = bindDetectedPortraitFaces({
					bindings: request.personBindings,
					faces: nativeFaces,
					frameNumber: request.frameNumber,
				});
				detectionSnapshot = {
					frameHash: frameHash({ rgba: request.rgba }),
					faces: binding.faces,
					...(request.frameNumber === undefined
						? {}
						: { frameNumber: request.frameNumber }),
					...(request.sourceKey ? { sourceKey: request.sourceKey } : {}),
				};
				return {
					provider: "jianying-local-swing-v1",
					faces: binding.faces,
					appliedFaceLimit: APPLIED_FACE_LIMIT,
					unmatchedPersonBindingIds: binding.unmatchedPersonBindingIds,
				};
			} finally {
				await host.dispose();
			}
		} finally {
			await rm(inputPath, { force: true });
		}
	};

	return {
		inspect,
		detect: (request) => {
			const pending = queue.then(() => detectNow(request));
			queue = pending.then(
				() => undefined,
				() => undefined
			);
			return pending;
		},
		render: (request) => {
			const pending = queue.then(() => renderNow(request));
			queue = pending.then(
				() => undefined,
				() => undefined
			);
			return pending;
		},
		clear: async () => {
			await queue;
			cache.clear();
			detectionSnapshot = null;
			await trackingScopes.clear();
			const directory = await temporaryDirectoryPromise?.catch(() => null);
			temporaryDirectoryPromise = null;
			if (directory) await rm(directory, { force: true, recursive: true });
		},
	};
}
