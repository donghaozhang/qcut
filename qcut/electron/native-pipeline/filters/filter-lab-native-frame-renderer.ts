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

export type FilterLabNativeRenderPlan = Extract<
	FilterLabRenderPlan,
	{ kind: "native" }
>;

type FilterLabNativeSession =
	| JianyingFilterLocalRenderSession
	| JianyingFilterSwingRenderSession;

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
}: {
	plan: FilterLabNativeRenderPlan;
	bootstrapRgba: Uint8Array;
	media: FilterLabMediaInfo;
}): Promise<FilterLabNativeSession> {
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
			signal.throwIfAborted();
			let current: Uint8Array = rgba;
			for (const [planIndex, plan] of plans.entries()) {
				let session = sessions[planIndex];
				if (!session) {
					session = await createNativeSession({
						plan,
						bootstrapRgba: current,
						media,
					});
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
						plan.mode === "multi-pass" || plan.mode === "swing"
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
