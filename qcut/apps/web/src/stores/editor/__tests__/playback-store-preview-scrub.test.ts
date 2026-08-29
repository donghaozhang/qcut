import { afterEach, describe, expect, it } from "vitest";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { resetPlaybackStore } from "@/test/helpers/reset-playback-store";

describe("playback store preview scrub time", () => {
	afterEach(() => {
		resetPlaybackStore();
	});

	it("clamps the scrub time to the timeline duration", () => {
		const store = usePlaybackStore.getState();
		store.setDuration(10);
		store.setPreviewScrubTime(25);
		expect(usePlaybackStore.getState().previewScrubTime).toBe(10);
		store.setPreviewScrubTime(-3);
		expect(usePlaybackStore.getState().previewScrubTime).toBe(0);
	});

	it("does not publish a state change for an identical scrub time", () => {
		const store = usePlaybackStore.getState();
		store.setDuration(10);
		store.setPreviewScrubTime(4);
		let notifications = 0;
		const unsubscribe = usePlaybackStore.subscribe(() => {
			notifications += 1;
		});
		store.setPreviewScrubTime(4);
		store.setPreviewScrubTime(null);
		store.setPreviewScrubTime(null);
		unsubscribe();
		expect(notifications).toBe(1);
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});

	it("clears the scrub override when playback starts", () => {
		const store = usePlaybackStore.getState();
		store.setDuration(10);
		store.setPreviewScrubTime(2);
		store.play();
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});
});
