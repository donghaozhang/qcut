import type { JianyingFilterLabLoadRendererResult } from "../jianying-filter-lab-contract.js";
import type {
	IndependentFilterIdentity,
	IndependentFilterRequest,
} from "./contract.js";
import { parseFilterLabRenderLocalEffectRequest } from "../jianying-filter-lab-request.js";

export const SOFT_GLOW_RESOURCE = "7447126702137904420";
export const SOFT_GLOW_VERSION = "9673f80b8e2f5a07f02f9ce1130b784a";
export const SOFT_GLOW_PROVIDER = "qcut-cpu-soft-glow-ui-snapshot-v1";
export const SOFT_GLOW_INTENSITY_MODE = "ui-snapshot";

export function isSoftGlowIdentity({
	resourceId,
	version,
}: IndependentFilterIdentity) {
	return resourceId === SOFT_GLOW_RESOURCE && version === SOFT_GLOW_VERSION;
}

export function validateSoftGlowIdentity(identity: IndependentFilterIdentity) {
	if (!isSoftGlowIdentity(identity))
		throw new Error(
			"Independent cinematic soft glow requires its exact resource and version."
		);
}

export function validateSoftGlowFrame(request: IndependentFilterRequest) {
	validateSoftGlowIdentity(request);
	parseFilterLabRenderLocalEffectRequest({ request });
	for (let index = 3; index < request.rgba.length; index += 4) {
		if (request.rgba[index] !== 255)
			throw new Error(
				"Independent cinematic soft glow requires opaque SDR RGBA8 input."
			);
	}
}

export function independentSoftGlowSettings(): JianyingFilterLabLoadRendererResult {
	return {
		resourceId: SOFT_GLOW_RESOURCE,
		version: SOFT_GLOW_VERSION,
		name: "电影柔光 · QCut CPU",
		enabled: true,
		presetId: "qcut-independent-soft-glow-ui-snapshot-v1",
		intensity: 100,
		fidelity: "native-local",
		nativeEffect: {
			provider: SOFT_GLOW_PROVIDER,
			resourceId: SOFT_GLOW_RESOURCE,
			version: SOFT_GLOW_VERSION,
		},
		passes: [],
	};
}
