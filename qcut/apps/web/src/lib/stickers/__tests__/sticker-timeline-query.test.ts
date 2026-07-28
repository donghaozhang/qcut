import { beforeEach, describe, expect, it } from "vitest";
import {
	getStickerTiming,
	getStickerTimingMap,
} from "@/lib/stickers/sticker-timeline-query";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { StickerElement, TimelineTrack } from "@/types/timeline";

function stickerElement({
	overrides = {},
}: {
	overrides?: Partial<StickerElement>;
}): StickerElement {
	return {
		id: "element-1",
		type: "sticker",
		name: "Sticker",
		startTime: 12,
		duration: 10,
		trimStart: 2,
		trimEnd: 3,
		hidden: false,
		stickerId: "sticker-1",
		mediaId: "media-1",
		...overrides,
	};
}

function stickerTrack({
	elements,
}: {
	elements: StickerElement[];
}): TimelineTrack {
	return {
		id: "sticker-track",
		name: "Stickers",
		type: "sticker",
		elements,
		order: 0,
		isMain: false,
		muted: false,
		hidden: false,
		locked: false,
	};
}

describe("sticker timeline query", () => {
	beforeEach(() => {
		const track = stickerTrack({ elements: [stickerElement({})] });
		useTimelineStore.setState({
			_tracks: [track],
			tracks: [track],
		});
	});

	it("keeps the visible start at startTime and subtracts both trims from duration", () => {
		const timing = getStickerTiming("sticker-1");
		const timingFromMap = getStickerTimingMap().get("sticker-1");

		expect(timing).toMatchObject({
			startTime: 12,
			endTime: 17,
		});
		expect(timingFromMap).toMatchObject({
			startTime: 12,
			endTime: 17,
		});
	});

	it("clamps an over-trimmed sticker to an empty interval at startTime", () => {
		const element = stickerElement({
			overrides: {
				duration: 4,
				trimStart: 3,
				trimEnd: 3,
			},
		});
		const track = stickerTrack({ elements: [element] });
		useTimelineStore.setState({
			_tracks: [track],
			tracks: [track],
		});

		expect(getStickerTiming("sticker-1")).toMatchObject({
			startTime: 12,
			endTime: 12,
		});
	});
});
