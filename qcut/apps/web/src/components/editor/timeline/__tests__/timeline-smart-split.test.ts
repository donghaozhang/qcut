import { describe, expect, it, vi } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	applyTimelineSceneSplits,
	sceneTimelineSplitTimes,
} from "../timeline-smart-split";

function element({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "media",
		name: "Clip",
		startTime: 10,
		duration: 12,
		trimStart: 2,
		trimEnd: 2,
		...overrides,
	};
}

describe("timeline smart split", () => {
	it("maps visible scene boundaries into timeline coordinates", () => {
		const splitTimes = sceneTimelineSplitTimes({
			element: element({ overrides: { playbackRate: 2 } }),
			scenes: [
				{ timestamp: 0, confidence: 1 },
				{ timestamp: 4, confidence: 0.8 },
				{ timestamp: 8, confidence: 0.8 },
				{ timestamp: 12, confidence: 0.8 },
			],
			fps: 30,
		});

		expect(splitTimes).toEqual([11, 13]);
	});

	it("sorts reverse-playback boundaries in timeline order", () => {
		const splitTimes = sceneTimelineSplitTimes({
			element: element({ overrides: { reverse: true } }),
			scenes: [
				{ timestamp: 4, confidence: 0.8 },
				{ timestamp: 8, confidence: 0.8 },
			],
			fps: 30,
		});

		expect(splitTimes).toEqual([12, 16]);
	});

	it("pushes one undo snapshot while splitting each new right segment", () => {
		const pushHistory = vi.fn();
		const splitElement = vi
			.fn()
			.mockReturnValueOnce("right-1")
			.mockReturnValueOnce("right-2");

		const result = applyTimelineSceneSplits({
			trackId: "track",
			elementId: "clip",
			splitTimes: [12, 16],
			pushHistory,
			splitElement,
		});

		expect(pushHistory).toHaveBeenCalledTimes(1);
		expect(splitElement).toHaveBeenNthCalledWith(1, "track", "clip", 12, false);
		expect(splitElement).toHaveBeenNthCalledWith(
			2,
			"track",
			"right-1",
			16,
			false
		);
		expect(result).toEqual(["right-1", "right-2"]);
	});
});
