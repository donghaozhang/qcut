import { createHash } from "node:crypto";
import type {
	JianyingFilterLabRenderLocalEffectResult,
	JianyingFilterLabRenderLocalPortraitResult,
	JianyingFilterLocalRuntimeStatus,
} from "../jianying-filter-lab-contract.js";
import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderMode,
	type JianyingFilterLocalRenderResult,
	type JianyingFilterLocalRenderSession,
} from "./render.js";
import { inspectJianyingFilterLocalRuntime } from "./runtime-discovery.js";

const CACHE_LIMIT = 4;

export interface JianyingFilterLocalRenderRequest {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	rgba: Uint8Array;
	sourceKey?: string;
	timestampSeconds?: number;
}

export interface JianyingFilterLocalEffectRenderRequest
	extends JianyingFilterLocalRenderRequest {
	intensity: number;
}

interface ProfiledRenderRequest extends JianyingFilterLocalRenderRequest {
	mode: JianyingFilterLocalRenderMode;
	intensity: number;
}

export interface JianyingFilterLocalProvider {
	inspect: ({
		refresh,
	}?: {
		refresh?: boolean;
	}) => Promise<JianyingFilterLocalRuntimeStatus>;
	render: (
		request: JianyingFilterLocalRenderRequest
	) => Promise<JianyingFilterLabRenderLocalPortraitResult>;
	renderEffect: (
		request: JianyingFilterLocalEffectRenderRequest
	) => Promise<JianyingFilterLabRenderLocalEffectResult>;
	clear: () => void;
}

function renderKey({
	resourceId,
	packagePath,
	width,
	height,
	rgba,
	sourceKey = "",
	timestampSeconds = 0,
	mode,
	intensity,
}: ProfiledRenderRequest) {
	return createHash("sha256")
		.update(resourceId)
		.update("\0")
		.update(packagePath)
		.update("\0")
		.update(`${width}x${height}\0`)
		.update(sourceKey)
		.update("\0")
		.update(`${timestampSeconds}\0${mode}\0${intensity}\0`)
		.update(rgba)
		.digest("hex");
}

function sessionKey({
	resourceId,
	packagePath,
	width,
	height,
	sourceKey = "",
	mode,
	intensity,
}: ProfiledRenderRequest) {
	return [
		resourceId,
		packagePath,
		width,
		height,
		sourceKey,
		mode,
		intensity,
	].join("\0");
}

export function createJianyingFilterLocalProvider(): JianyingFilterLocalProvider {
	const cache = new Map<string, JianyingFilterLocalRenderResult>();
	let activeKey = "";
	let activeRender: Promise<JianyingFilterLocalRenderResult> | null = null;
	let cacheGeneration = 0;
	let activeSessionKey = "";
	let lastTimestampSeconds: number | null = null;
	let sessionPromise: Promise<JianyingFilterLocalRenderSession> | null = null;

	const retireSession = () => {
		const retired = sessionPromise;
		const pendingRender = activeRender;
		activeSessionKey = "";
		lastTimestampSeconds = null;
		sessionPromise = null;
		if (!retired) return;
		const dispose = () => {
			void retired.then((session) => session.dispose()).catch(() => undefined);
		};
		if (pendingRender) {
			void pendingRender.finally(dispose).catch(() => undefined);
			return;
		}
		dispose();
	};

	const renderWithProfile = async ({
		request,
	}: {
		request: ProfiledRenderRequest;
	}): Promise<JianyingFilterLocalRenderResult> => {
		const key = renderKey(request);
		if (activeRender) {
			if (activeKey === key) return activeRender;
			throw new Error("剪映本机滤镜正在处理另一帧");
		}
		const requestedSessionKey = sessionKey(request);
		const requestedTimestamp = request.timestampSeconds ?? 0;
		const timelineMovedBackward =
			lastTimestampSeconds !== null &&
			requestedTimestamp < lastTimestampSeconds;
		if (
			sessionPromise &&
			(activeSessionKey !== requestedSessionKey || timelineMovedBackward)
		) {
			retireSession();
		}
		const cached = cache.get(key);
		if (cached) {
			cache.delete(key);
			cache.set(key, cached);
			return cached;
		}

		activeKey = key;
		const renderGeneration = cacheGeneration;
		activeRender = inspectJianyingFilterLocalRuntime()
			.then(async (runtime) => {
				if (!sessionPromise) {
					activeSessionKey = requestedSessionKey;
					sessionPromise = createJianyingFilterLocalRenderSession({
						...request,
						bootstrapRgba: request.rgba,
						runtime,
					});
				}
				const requestedSession = sessionPromise;
				const session = await requestedSession;
				try {
					const result = await session.render({
						rgba: request.rgba,
						timestampSeconds: request.timestampSeconds,
					});
					if (
						sessionPromise === requestedSession &&
						activeSessionKey === requestedSessionKey
					) {
						lastTimestampSeconds = requestedTimestamp;
					}
					return result;
				} catch (cause) {
					activeSessionKey = "";
					lastTimestampSeconds = null;
					sessionPromise = null;
					void session.dispose().catch(() => undefined);
					throw cause;
				}
			})
			.then((result) => {
				if (renderGeneration !== cacheGeneration) return result;
				if (cache.size >= CACHE_LIMIT) {
					const oldest = cache.keys().next().value;
					if (oldest) cache.delete(oldest);
				}
				cache.set(key, result);
				return result;
			})
			.finally(() => {
				activeKey = "";
				activeRender = null;
			});
		return activeRender;
	};

	return {
		inspect: async ({ refresh = false }: { refresh?: boolean } = {}) => {
			if (refresh) retireSession();
			return (await inspectJianyingFilterLocalRuntime({ refresh })).status;
		},
		render: async (request) => {
			const result = await renderWithProfile({
				request: { ...request, mode: "portrait", intensity: 100 },
			});
			if (!result.mask) {
				throw new Error("剪映本机人像滤镜没有返回皮肤分割蒙版");
			}
			return { ...result, mask: result.mask };
		},
		renderEffect: (request) =>
			renderWithProfile({
				request: { ...request, mode: "multi-pass" },
			}),
		clear: () => {
			cacheGeneration += 1;
			cache.clear();
			retireSession();
		},
	};
}
