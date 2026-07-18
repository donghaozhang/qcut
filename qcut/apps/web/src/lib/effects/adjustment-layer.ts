import type { AdjustmentElement, TimelineElement } from "@/types/timeline";
import type { EffectParameters } from "@/types/effects";
import {
	layerEffectChains,
	processEffectChain,
} from "@/lib/effects/effects-chaining";
import { parametersToCSSFilters } from "@/lib/effects/effects-utils";
import {
	resolveMediaColorAtTime,
	hasMediaColorEdits,
} from "@/lib/color/color-properties";
import { buildColorCssFilter } from "@/lib/color/color-rendering";

export function resolveTimelineElementEffects({
	element,
	currentTime,
}: {
	element: TimelineElement;
	currentTime: number;
}): EffectParameters {
	const localTime = Math.max(0, currentTime - element.startTime);
	if (element.effectChains?.length) {
		return layerEffectChains(element.effectChains, localTime);
	}
	return processEffectChain(element.effects ?? [], localTime);
}

export function buildAdjustmentCssFilter({
	element,
	currentTime,
	fps = 30,
}: {
	element: AdjustmentElement;
	currentTime: number;
	fps?: number;
}): string {
	const effectsFilter = parametersToCSSFilters(
		resolveTimelineElementEffects({ element, currentTime })
	);
	const color = resolveMediaColorAtTime({ element, currentTime, fps });
	const colorFilter = hasMediaColorEdits({ settings: color })
		? buildColorCssFilter({ settings: color })
		: "";
	return [effectsFilter, colorFilter].filter(Boolean).join(" ");
}
