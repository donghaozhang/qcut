import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderSession,
} from "../../jianying-filter-local-runtime/render.js";
import {
	createJianyingFilterSwingRenderSession,
	type JianyingFilterSwingRenderSession,
} from "../../jianying-filter-swing-runtime/render.js";
import type { FilterLabMediaInfo } from "./filter-lab-media.js";
import type { FilterLabRenderPlan } from "./filter-lab-render-plan.js";
import { createSoftGlowSession } from "../../qcut-independent-filter/soft-glow-session.js";
import {
	createIndependentFilterSession,
	createIndependentFrameRequest,
} from "../../qcut-independent-filter/session.js";

export type FilterLabNativeRenderPlan = Extract<
	FilterLabRenderPlan,
	{ kind: "native" }
>;

type FilterLabNativeSession =
	| JianyingFilterLocalRenderSession
	| JianyingFilterSwingRenderSession
	| {
			render: (input: {
				rgba: Uint8Array;
				timestampSeconds: number;
			}) => Promise<{ rgba: Uint8Array }>;
			dispose: () => Promise<void>;
	  };

export interface FilterLabNativeFrameRenderer {
	renderFrame(input: { rgba: Buffer; index: number }): Promise<Uint8Array>;
	dispose(): Promise<void>;
}

function restoreAlphaAndIntensity({
	source,
	rendered,
	intensity,
}: {
	source: Uint8Array;
	rendered: Uint8Array;
	intensity: number;
}): Uint8Array {
	if (source.length !== rendered.length)
		throw new Error("Native frame dimensions changed.");
	const weight = intensity / 100;
	const output = new Uint8Array(rendered.length);
	for (let index = 0; index < output.length; index += 1) {
		output[index] =
			index % 4 === 3
				? source[index]
				: Math.round(
						source[index] + (rendered[index] - source[index]) * weight
					);
	}
	return output;
}

async function createNativeSession({
	plan,
	bootstrapRgba,
	media,
	signal,
}: {
	plan: FilterLabNativeRenderPlan;
	bootstrapRgba: Uint8Array;
	media: FilterLabMediaInfo;
	signal: AbortSignal;
}): Promise<FilterLabNativeSession> {
	if (plan.mode === "qcut-cpu-soft-glow") {
		const session = await createSoftGlowSession({
			width: media.width,
			height: media.height,
			intensity: plan.evidence.intensity,
			lut: plan.lut,
			signal,
		});
		return {
			render: ({
				rgba,
				timestampSeconds,
			}: {
				rgba: Uint8Array;
				timestampSeconds: number;
			}) =>
				session.render({
					rgba,
					timestampSeconds,
					width: media.width,
					height: media.height,
					intensity: plan.evidence.intensity,
					resourceId: plan.evidence.resourceId,
					version: plan.evidence.version,
				}),
			dispose: session.dispose,
		};
	}
	if (
		plan.mode === "qcut-metal" ||
		plan.mode === "qcut-metal-lut" ||
		plan.mode === "qcut-metal-graph"
	) {
		const session = await createIndependentFilterSession(
			plan.mode === "qcut-metal"
				? { lutPath: plan.lutPath }
				: plan.mode === "qcut-metal-graph"
					? {
							graph: plan.graph,
							identity: {
								resourceId: plan.evidence.resourceId,
								version: plan.evidence.version,
							},
						}
					: {
							cube: plan.cube,
							identity: {
								resourceId: plan.evidence.resourceId,
								version: plan.evidence.version,
							},
						}
		);
		return {
			render: ({
				rgba,
				timestampSeconds,
			}: {
				rgba: Uint8Array;
				timestampSeconds: number;
			}) =>
				session.render({
					...createIndependentFrameRequest({
						rgba,
						width: media.width,
						height: media.height,
						intensity: plan.evidence.intensity,
					}),
					resourceId: plan.evidence.resourceId,
					version: plan.evidence.version,
					timestampSeconds,
					sourceKey: "filter-lab-export",
				}),
			dispose: session.dispose,
		};
	}
	if (plan.mode === "swing") {
		return createJianyingFilterSwingRenderSession({
			resourceId: plan.evidence.resourceId,
			packagePath: plan.packagePath,
			width: media.width,
			height: media.height,
			runtime: plan.runtime,
			intensity: plan.evidence.intensity,
		});
	}
	return createJianyingFilterLocalRenderSession({
		resourceId: plan.evidence.resourceId,
		packagePath: plan.packagePath,
		width: media.width,
		height: media.height,
		bootstrapRgba,
		runtime: plan.runtime,
		mode: plan.mode,
		intensity: plan.evidence.intensity,
		captureFace: plan.captureFace,
	});
}

export function createFilterLabNativeFrameRenderer({
	plans,
	isImage,
	media,
	signal,
}: {
	plans: FilterLabNativeRenderPlan[];
	isImage: boolean;
	media: FilterLabMediaInfo;
	signal: AbortSignal;
}): FilterLabNativeFrameRenderer {
	if (plans.length === 0)
		throw new Error("Native filter pipeline requires at least one plan.");
	const sessions: Array<FilterLabNativeSession | undefined> = Array.from({
		length: plans.length,
	});
	let disposePromise: Promise<void> | undefined;
	return {
		async renderFrame({ rgba, index }) {
			if (disposePromise) throw new Error("Filter frame renderer is disposed.");
			signal.throwIfAborted();
			let current: Uint8Array = rgba;
			for (const [planIndex, plan] of plans.entries()) {
				let session = sessions[planIndex];
				if (!session) {
					session = await createNativeSession({
						plan,
						bootstrapRgba: current,
						media,
						signal,
					});
					if (disposePromise || signal.aborted) {
						await session.dispose();
						signal.throwIfAborted();
						throw new Error(
							"Filter frame renderer was disposed during startup."
						);
					}
					sessions[planIndex] = session;
				}
				signal.throwIfAborted();
				const result = await session.render({
					rgba: current,
					timestampSeconds: isImage ? 0 : index / media.frameRate,
				});
				if (plan.mode === "portrait" && !("mask" in result && result.mask))
					throw new Error("Native skin segmentation did not return a mask.");
				current = restoreAlphaAndIntensity({
					source: current,
					rendered: result.rgba,
					intensity:
						plan.mode === "multi-pass" ||
						plan.mode === "swing" ||
						plan.mode === "qcut-metal" ||
						plan.mode === "qcut-metal-lut" ||
						plan.mode === "qcut-metal-graph" ||
						plan.mode === "qcut-cpu-soft-glow"
							? 100
							: plan.evidence.intensity,
				});
			}
			return current;
		},
		async dispose() {
			disposePromise ??= (async () => {
				const active = sessions.filter(
					(session): session is FilterLabNativeSession => session !== undefined
				);
				const results = await Promise.allSettled(
					active.reverse().map((session) => session.dispose())
				);
				const failure = results.find(
					(result): result is PromiseRejectedResult =>
						result.status === "rejected"
				);
				if (failure) throw failure.reason;
			})();
			await disposePromise;
		},
	};
}
