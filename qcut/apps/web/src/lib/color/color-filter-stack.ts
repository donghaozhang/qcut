/**
 * Shared resolver for a media element's ordered Filter Lab stack.
 *
 * Both the preview renderer and the canvas export engine turn the stack
 * into extra `BrowserColorGradeLayer`s appended AFTER the element's own
 * color grade, so effect order is render order and the two renderers stay
 * in parity by construction. `safe-passthrough` and disabled effects
 * contribute no layer.
 */

import type { MediaFilterStack } from "@/types/timeline";
import type { BrowserColorGradeLayer } from "./browser-color-rendering";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "./color-properties";

export function hasEnabledFilterStack({
	filterStack,
}: {
	filterStack: MediaFilterStack | undefined;
}): boolean {
	if (!filterStack?.enabled) return false;
	return filterStack.effects.some(
		(effect) =>
			effect.enabled &&
			(Boolean(effect.color.lut?.enabled && effect.color.lut.cube) ||
				Boolean(effect.color.multiPass?.enabled))
	);
}

/** One grade layer per enabled effect that carries a renderable payload. */
export function mediaFilterStackLayers({
	filterStack,
}: {
	filterStack: MediaFilterStack | undefined;
}): BrowserColorGradeLayer[] {
	if (!filterStack?.enabled) return [];
	const layers: BrowserColorGradeLayer[] = [];
	for (const effect of filterStack.effects) {
		if (!effect.enabled) continue;
		const lut =
			effect.color.lut?.enabled && effect.color.lut.cube
				? effect.color.lut
				: undefined;
		const multiPass = effect.color.multiPass?.enabled
			? effect.color.multiPass
			: undefined;
		if (!lut && !multiPass) continue;
		layers.push({
			settings: {
				...DEFAULT_MEDIA_COLOR_SETTINGS,
				enabled: true,
				lut: lut ?? DEFAULT_MEDIA_COLOR_SETTINGS.lut,
				multiPass,
			},
			masks: [],
		});
	}
	return layers;
}
