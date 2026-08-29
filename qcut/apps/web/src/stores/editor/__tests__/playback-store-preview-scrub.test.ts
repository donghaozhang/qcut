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

	it("mirrors scrub changes onto the playback-seek event channel", () => {
		const store = usePlaybackStore.getState();
		store.setDuration(10);
		const seen: Array<{ time: number; scrub: boolean }> = [];
		const listener = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			seen.push({ time: detail.time, scrub: detail.scrub });
		};
		window.addEventListener("playback-seek", listener);
		store.setPreviewScrubTime(3);
		store.setPreviewScrubTime(3);
		store.setPreviewScrubTime(null);
		window.removeEventListener("playback-seek", listener);
		expect(seen).toEqual([
			{ time: 3, scrub: true },
			{ time: 0, scrub: false },
		]);
	});

	it("clears the scrub override when playback starts", () => {
		const store = usePlaybackStore.getState();
		store.setDuration(10);
		store.setPreviewScrubTime(2);
		store.play();
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});
});
