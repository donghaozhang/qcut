import { describe, expect, it } from "vitest";
import { hasCurrentVideoFrames } from "../preview-frame-cache-readiness";

function captureSurface({
	presentedTimes,
}: {
	presentedTimes: Array<number | null>;
}): HTMLElement {
	const surface = document.createElement("div");
	for (const presentedTime of presentedTimes) {
		const video = document.createElement("video");
		if (presentedTime !== null) {
			video.setAttribute(
				"data-qcut-presented-timeline-time",
				String(presentedTime)
			);
		}
		surface.append(video);
	}
	return surface;
}

describe("preview frame cache readiness", () => {
	it("allows image-only capture surfaces immediately", () => {
		expect(
			hasCurrentVideoFrames({
				captureSurface: captureSurface({ presentedTimes: [] }),
				timelineTime: 2,
			})
		).toBe(true);
	});

	it("requires every video layer to present the requested timeline frame", () => {
		expect(
			hasCurrentVideoFrames({
				captureSurface: captureSurface({ presentedTimes: [2, null] }),
				timelineTime: 2,
			})
		).toBe(false);
		expect(
			hasCurrentVideoFrames({
				captureSurface: captureSurface({ presentedTimes: [2, 1.5] }),
				timelineTime: 2,
			})
		).toBe(false);
		expect(
			hasCurrentVideoFrames({
				captureSurface: captureSurface({ presentedTimes: [2, 2.03] }),
				timelineTime: 2,
			})
		).toBe(true);
	});
});
