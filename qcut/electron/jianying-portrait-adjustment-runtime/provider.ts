import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingPortraitAdjustmentGroup,
	JianyingPortraitAdjustmentRenderRequest,
	JianyingPortraitAdjustmentRenderResult,
	JianyingPortraitAdjustmentStatus,
} from "../jianying-portrait-adjustment-contract.js";
import { inspectJianyingFilterLocalRuntime } from "../jianying-filter-local-runtime/runtime-discovery.js";
import { resolveJianyingPortraitAdjustmentHost } from "./bridge-resolver.js";
import {
	JIANYING_PORTRAIT_ADJUSTMENT_CATALOG,
	jianyingPortraitControlIsHostReady,
} from "./catalog.js";
import {
	startJianyingPortraitHostProcess,
	type JianyingPortraitHostProcess,
} from "./host-process.js";
import { resolveJianyingPortraitMakeupCards } from "./makeup-resolver.js";
import { resolveJianyingPortraitPackages } from "./package-resolver.js";
import {
	activeJianyingPortraitGroups,
	buildJianyingPortraitRenderStages,
	type JianyingPortraitRenderStage,
} from "./stages.js";

const CACHE_LIMIT = 4;

interface HostSession {
	id: string;
	packagePath: string;
	process: JianyingPortraitHostProcess;
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
	clear: () => Promise<void>;
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
	hash.update(request.rgba);
	return hash.digest("hex");
}

export function createJianyingPortraitAdjustmentProvider(): JianyingPortraitAdjustmentProvider {
	const sessions = new Map<string, HostSession>();
	const cache = new Map<string, Uint8Array>();
	let queue = Promise.resolve();
	let temporaryDirectoryPromise: Promise<string> | null = null;
	let sessionScope = "";
	let lastTimestampSeconds: number | null = null;

	const disposeSessions = async () => {
		const active = [...sessions.values()];
		sessions.clear();
		await Promise.all(active.map((session) => session.process.dispose()));
	};

	const retireSessions = async () => {
		sessionScope = "";
		lastTimestampSeconds = null;
		await disposeSessions();
	};

	const retireInactiveSessions = async ({
		stages,
	}: {
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
		if (refresh) await retireSessions();
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
			catalog: JIANYING_PORTRAIT_ADJUSTMENT_CATALOG.filter((control) =>
				jianyingPortraitControlIsHostReady({ control })
			),
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
		if (
			sessionScope !== requestedScope ||
			(lastTimestampSeconds !== null &&
				requestedTimestamp < lastTimestampSeconds)
		) {
			await retireSessions();
			sessionScope = requestedScope;
		}
		await retireInactiveSessions({ stages });
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
			const session = { id: stage.id, packagePath: stage.packagePath, process };
			sessions.set(stage.id, session);
			return session;
		};

		const requestId = randomUUID();
		const paths = [path.join(directory, `${requestId}-input.rgba`)];
		await writeFile(paths[0], request.rgba);
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
			try {
				await session.process.render({
					requestId: `${requestId}-${index}`,
					timestampSeconds: requestedTimestamp,
					inputPath,
					outputPath,
					featureParameters: stage.featureParameters,
				});
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
			lastTimestampSeconds = requestedTimestamp;
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

	return {
		inspect,
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
			await retireSessions();
			const directory = await temporaryDirectoryPromise?.catch(() => null);
			temporaryDirectoryPromise = null;
			if (directory) await rm(directory, { force: true, recursive: true });
		},
	};
}
