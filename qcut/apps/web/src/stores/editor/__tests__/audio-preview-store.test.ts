import { beforeEach, describe, expect, it } from "vitest";
import {
	selectAudioPreviewBypassed,
	useAudioPreviewStore,
} from "../audio-preview-store";

describe("audio-preview-store", () => {
	beforeEach(() => {
		useAudioPreviewStore.setState({ bypassedElementIds: {} });
	});

	it("tracks bypass independently for each clip", () => {
		useAudioPreviewStore
			.getState()
			.setElementBypassed({ elementId: "clip-a", bypassed: true });

		expect(
			selectAudioPreviewBypassed({
				state: useAudioPreviewStore.getState(),
				elementId: "clip-a",
			})
		).toBe(true);
		expect(
			selectAudioPreviewBypassed({
				state: useAudioPreviewStore.getState(),
				elementId: "clip-b",
			})
		).toBe(false);
	});

	it("removes bypass without affecting another clip", () => {
		const store = useAudioPreviewStore.getState();
		store.setElementBypassed({ elementId: "clip-a", bypassed: true });
		store.setElementBypassed({ elementId: "clip-b", bypassed: true });
		useAudioPreviewStore.getState().clearElement({ elementId: "clip-a" });

		expect(useAudioPreviewStore.getState().bypassedElementIds).toEqual({
			"clip-b": true,
		});
	});
});
