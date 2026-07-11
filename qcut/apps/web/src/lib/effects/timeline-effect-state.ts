import type { EffectChain, EffectInstance } from "@/types/effects";
import type { TimelineTrack } from "@/types/timeline";

export interface TimelineEffectState {
	activeEffects: Map<string, EffectInstance[]>;
	effectChains: Map<string, EffectChain[]>;
}

export function collectTimelineEffectState({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineEffectState {
	const activeEffects = new Map<string, EffectInstance[]>();
	const effectChains = new Map<string, EffectChain[]>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.effects?.length) {
				activeEffects.set(element.id, element.effects);
			}
			if (element.effectChains?.length) {
				effectChains.set(element.id, element.effectChains);
			}
		}
	}
	return { activeEffects, effectChains };
}
