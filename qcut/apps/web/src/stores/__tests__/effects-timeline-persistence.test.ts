import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({
	EFFECTS_ENABLED: true,
	isFeatureEnabled: () => true,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

import { useEffectsStore } from "@/stores/ai/effects-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

function addMediaElement(): string {
	const timeline = useTimelineStore.getState();
	const trackId = timeline.tracks[0].id;
	const elementId = timeline.addElementToTrack(trackId, {
		type: "media",
		mediaId: "media-1",
		name: "Clip",
		startTime: 0,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
	});
	if (!elementId) throw new Error("Failed to add test media element");
	return elementId;
}

function getTimelineElement({ elementId }: { elementId: string }) {
	for (const track of useTimelineStore.getState()._tracks) {
		const element = track.elements.find(
			(candidate) => candidate.id === elementId
		);
		if (element) return element;
	}
	throw new Error(`Timeline element not found: ${elementId}`);
}

describe("effects timeline persistence", () => {
	beforeEach(() => {
		useTimelineStore.getState().clearTimeline();
		useEffectsStore.setState({
			activeEffects: new Map(),
			effectChains: new Map(),
			selectedEffect: null,
		});
	});

	it("persists complete effect state and hydrates it after cache loss", () => {
		const elementId = addMediaElement();
		const effects = useEffectsStore.getState();
		const preset = effects.presets.find(
			(candidate) => candidate.id === "grayscale"
		);
		if (!preset) throw new Error("Grayscale preset not found");

		effects.applyEffect(elementId, preset);
		const applied = useEffectsStore.getState().getElementEffects(elementId)[0];
		useEffectsStore
			.getState()
			.updateEffectParameters(elementId, applied.id, { grayscale: 65 });
		useEffectsStore.getState().createChain(elementId, "Grade", [applied.id]);

		const persisted = getTimelineElement({ elementId });
		const persistedTracks = structuredClone(
			useTimelineStore.getState()._tracks
		);
		expect(persisted.effects).toMatchObject([
			{
				id: applied.id,
				effectType: "grayscale",
				parameters: { grayscale: 65 },
				enabled: true,
			},
		]);
		expect(persisted.effectIds).toEqual([applied.id]);
		expect(persisted.effectChains?.[0]).toMatchObject({ name: "Grade" });

		useEffectsStore.getState().hydrateFromTimeline([]);
		expect(useEffectsStore.getState().getElementEffects(elementId)).toEqual([]);
		useEffectsStore.getState().hydrateFromTimeline(persistedTracks);

		expect(useEffectsStore.getState().getElementEffects(elementId)).toEqual(
			persisted.effects
		);
		expect(useEffectsStore.getState().effectChains.get(elementId)).toEqual(
			persisted.effectChains
		);
	});
});
