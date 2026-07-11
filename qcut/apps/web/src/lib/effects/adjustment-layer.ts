import type { AdjustmentElement, TimelineElement } from "@/types/timeline";
import type { EffectParameters } from "@/types/effects";
import {
	layerEffectChains,
	processEffectChain,
} from "@/lib/effects/effects-chaining";
import { parametersToCSSFilters } from "@/lib/effects/effects-utils";

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
}: {
	element: AdjustmentElement;
	currentTime: number;
}): string {
	return parametersToCSSFilters(
		resolveTimelineElementEffects({ element, currentTime })
	);
}
