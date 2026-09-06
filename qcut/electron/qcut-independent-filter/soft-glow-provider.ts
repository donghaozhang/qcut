import type {
	IndependentFilterIdentity,
	IndependentFilterRequest,
} from "./contract.js";
import type { IndependentFilterSession } from "./session.js";
import { resolveSoftGlowLut } from "./soft-glow-assets.js";
import { resolveSoftGlowHost } from "./soft-glow-bridge.js";
import {
	independentSoftGlowSettings,
	validateSoftGlowIdentity,
	validateSoftGlowFrame,
	SOFT_GLOW_INTENSITY_MODE,
} from "./soft-glow-contract.js";
import { createSoftGlowSession } from "./soft-glow-session.js";

export function createSoftGlowProvider() {
	let assets: Promise<Uint8Array> | undefined;
	let session: IndependentFilterSession | undefined;
	let key = "";
	let disposed = false;
	let pending = 0;
	let idle: NodeJS.Timeout | undefined;
	let tail: Promise<unknown> = Promise.resolve();
	const lifetime = new AbortController();
	const ready = () => {
		assets ??= Promise.all([resolveSoftGlowLut(), resolveSoftGlowHost()])
			.then(([lut]) => lut)
			.catch((error) => {
				assets = undefined;
				throw error;
			});
		return assets;
	};
	const release = async () => {
		const previous = session;
		session = undefined;
		key = "";
		await previous?.dispose();
	};
	return {
		async load(identity: IndependentFilterIdentity) {
			validateSoftGlowIdentity(identity);
			if (disposed)
				throw new Error(
					"Independent cinematic soft glow provider is disposed."
				);
			await ready();
			if (disposed)
				throw new Error(
					"Independent cinematic soft glow provider is disposed."
				);
			return independentSoftGlowSettings();
		},
		render(request: IndependentFilterRequest) {
			try {
				validateSoftGlowFrame(request);
				if (disposed)
					throw new Error(
						"Independent cinematic soft glow provider is disposed."
					);
				if (pending >= 4)
					throw new Error("Independent cinematic soft glow provider is busy.");
			} catch (error) {
				return Promise.reject(error);
			}
			const snapshot = { ...request, rgba: new Uint8Array(request.rgba) };
			clearTimeout(idle);
			pending += 1;
			const operation = tail
				.then(async () => {
					if (disposed)
						throw new Error(
							"Independent cinematic soft glow provider is disposed."
						);
					const nextKey = `${SOFT_GLOW_INTENSITY_MODE}:${snapshot.width}:${snapshot.height}:${snapshot.intensity}`;
					try {
						if (session && key !== nextKey) await release();
						if (!session) {
							const lut = await ready();
							lifetime.signal.throwIfAborted();
							session = await createSoftGlowSession({
								width: snapshot.width,
								height: snapshot.height,
								intensity: snapshot.intensity,
								lut,
								signal: lifetime.signal,
							});
							if (disposed) {
								await release();
								throw new Error(
									"Independent cinematic soft glow provider is disposed."
								);
							}
							key = nextKey;
						}
						return await session.render(snapshot);
					} catch (error) {
						await release().catch(() => {});
						throw error;
					}
				})
				.finally(() => {
					pending -= 1;
					if (!pending && !disposed) {
						idle = setTimeout(() => {
							void release().catch(() => {});
						}, 30_000);
						idle.unref();
					}
				});
			tail = operation.catch(() => {});
			return operation;
		},
		async dispose() {
			disposed = true;
			clearTimeout(idle);
			lifetime.abort();
			await release();
			await tail;
			assets = undefined;
		},
	};
}
