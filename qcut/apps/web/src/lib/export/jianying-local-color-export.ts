import type {
	MediaColorSettings,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { hasMediaPortraitAdjustments } from "@qcut/editor-core";

function requiresLocalColorRuntime({
	color,
}: {
	color?: MediaColorSettings;
}): boolean {
	if (!color?.enabled) return false;
	const multiPass = color.multiPass;
	if (
		multiPass?.enabled &&
		multiPass.fidelity === "native-local" &&
		(multiPass.nativeEffect?.provider === "jianying-local-effect-v1" ||
			multiPass.nativeEffect?.provider === "qcut-metal-fog-v1" ||
			multiPass.nativeEffect?.provider === "qcut-metal-lut-v1")
	) {
		return true;
	}
	// This walker runs on raw store state (unlike render-time consumers,
	// which normalize first), so a programmatically added element with a
	// partial color object must not crash the export factory.
	return Boolean(
		color.lut?.enabled &&
			color.lut.dual?.maskKind === "skin-segmentation-v1" &&
			color.lut.dual.resourceId
	);
}

function filterStackRequiresLocalColorRuntime({
	element,
}: {
	element: MediaElement;
}): boolean {
	if (!element.filterStack?.enabled) return false;
	return element.filterStack.effects.some(
		(effect) =>
			effect.enabled &&
			effect.color.multiPass?.enabled &&
			effect.color.multiPass.fidelity === "native-local" &&
			(effect.color.multiPass.nativeEffect?.provider ===
				"jianying-local-effect-v1" ||
				effect.color.multiPass.nativeEffect?.provider === "qcut-metal-fog-v1" ||
				effect.color.multiPass.nativeEffect?.provider === "qcut-metal-lut-v1")
	);
}

function mediaRequiresLocalColorRuntime({
	element,
}: {
	element: MediaElement;
}): boolean {
	if (requiresLocalColorRuntime({ color: element.color })) return true;
	if (filterStackRequiresLocalColorRuntime({ element })) return true;
	if ((element.enhancements?.labEyeCorrection ?? 0) > 0) return true;
	if (
		hasMediaPortraitAdjustments({
			adjustments: element.portraitAdjustments,
		})
	) {
		return true;
	}
	return Boolean(
		element.compound?.clips.some((clip) =>
			mediaRequiresLocalColorRuntime({ element: clip.element })
		)
	);
}

export function requiresJianyingLocalColorExport({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): boolean {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (
				element.type === "media" &&
				mediaRequiresLocalColorRuntime({ element })
			) {
				return true;
			}
			if (
				element.type === "adjustment" &&
				requiresLocalColorRuntime({ color: element.color })
			) {
				return true;
			}
		}
	}
	return false;
}
