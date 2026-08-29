import { createHash } from "node:crypto";
import type {
	JianyingFilterLabRenderLocalEffectResult,
	JianyingFilterLocalRuntimeStatus,
} from "../jianying-filter-lab-contract.js";
import { inspectJianyingFilterLocalRuntime } from "../jianying-filter-local-runtime/runtime-discovery.js";
import {
	createJianyingFilterSwingRenderSession,
	type JianyingFilterSwingRenderSession,
} from "./render.js";

const CACHE_LIMIT = 4;

export interface JianyingFilterSwingRenderRequest {
	resourceId: string;
	packagePath: string;
	width: number;
	height: number;
	rgba: Uint8Array;
	intensity: number;
	sourceKey?: string;
	timestampSeconds?: number;
}

export interface JianyingFilterSwingProvider {
	inspect: ({
		refresh,
	}?: {
		refresh?: boolean;
	}) => Promise<JianyingFilterLocalRuntimeStatus>;
	renderEffect: (
		request: JianyingFilterSwingRenderRequest
	) => Promise<JianyingFilterLabRenderLocalEffectResult>;
	clear: () => void;
}

function renderKey({
	resourceId,
	packagePath,
	width,
	height,
	rgba,
	intensity,
	sourceKey = "",
	timestampSeconds = 0,
}: JianyingFilterSwingRenderRequest) {
	return createHash("sha256")
		.update(resourceId)
		.update("\0")
		.update(packagePath)
		.update(`\0${width}x${height}\0${sourceKey}\0`)
		.update(`${timestampSeconds}\0${intensity}\0`)
		.update(rgba)
		.digest("hex");
}

function sessionKey({
	resourceId,
	packagePath,
	width,
	height,
	intensity,
	sourceKey = "",
}: JianyingFilterSwingRenderRequest) {
	return [resourceId, packagePath, width, height, intensity, sourceKey].join(
		"\0"
	);
}

export function createJianyingFilterSwingProvider(): JianyingFilterSwingProvider {
	const cache = new Map<string, JianyingFilterLabRenderLocalEffectResult>();
	let activeKey = "";
	let activeRender: Promise<JianyingFilterLabRenderLocalEffectResult> | null =
		null;
	let activeSessionKey = "";
	let cacheGeneration = 0;
	let lastTimestampSeconds: number | null = null;
	let sessionPromise: Promise<JianyingFilterSwingRenderSession> | null = null;

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

	return {
		inspect: async ({ refresh = false }: { refresh?: boolean } = {}) => {
			if (refresh) retireSession();
			return (await inspectJianyingFilterLocalRuntime({ refresh })).status;
		},
		renderEffect: async (request) => {
			const key = renderKey(request);
			if (activeRender) {
				if (activeKey === key) return activeRender;
				throw new Error("Native Swing filter is processing another frame");
			}
			const requestedSessionKey = sessionKey(request);
			const requestedTimestamp = request.timestampSeconds ?? 0;
			if (
				sessionPromise &&
				(activeSessionKey !== requestedSessionKey ||
					(lastTimestampSeconds !== null &&
						requestedTimestamp < lastTimestampSeconds))
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
						const creation = createJianyingFilterSwingRenderSession({
							...request,
							runtime,
						});
						sessionPromise = creation;
						creation.catch(() => {
							if (sessionPromise === creation) {
								activeSessionKey = "";
								lastTimestampSeconds = null;
								sessionPromise = null;
							}
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
					if (renderGeneration === cacheGeneration) {
						if (cache.size >= CACHE_LIMIT) {
							const oldest = cache.keys().next().value;
							if (oldest) cache.delete(oldest);
						}
						cache.set(key, result);
					}
					return result;
				})
				.finally(() => {
					activeKey = "";
					activeRender = null;
				});
			return activeRender;
		},
		clear: () => {
			cacheGeneration += 1;
			cache.clear();
			retireSession();
		},
	};
}
