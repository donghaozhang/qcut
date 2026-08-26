import { describe, expect, it } from "vitest";
import { evaluateStickerRuntime } from "@qcut/editor-core/sticker-lab";
import { getTimelineSplitUpdates } from "@/stores/timeline/timeline-split-utils";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement } from "@/types/timeline";
import {
	getStickerRuntimeTimelineWindow,
	resolveStickerRuntimeDescriptor,
} from "../sticker-runtime-timeline";

const descriptor = {
	kind: "direct-gif",
	canvasSize: { width: 1, height: 1 },
	cycleDurationSeconds: 0.4,
	frames: [
		{
			startSeconds: 0,
			durationSeconds: 0.1,
			delayCentiseconds: 10,
			disposalMethod: 1,
			frameRect: { x: 0, y: 0, width: 1, height: 1 },
			hasTransparency: false,
		},
		{
			startSeconds: 0.1,
			durationSeconds: 0.3,
			delayCentiseconds: 30,
			disposalMethod: 1,
			frameRect: { x: 0, y: 0, width: 1, height: 1 },
			hasTransparency: false,
		},
	],
	repeat: { kind: "infinite" },
	completion: "freeze-last",
} as const;

function stickerElement(): StickerElement {
	return {
		id: "element",
		type: "sticker",
		stickerId: "sticker",
		mediaId: "media",
		name: "Runtime sticker",
		startTime: 2,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		stickerRuntime: descriptor,
	};
}

describe("sticker runtime timeline wiring", () => {
	it("persists the descriptor on media and prefers the timeline copy", () => {
		const mediaDescriptor = { ...descriptor, cycleDurationSeconds: 1 };
		const mediaItem = {
			id: "media",
			name: "runtime.gif",
			type: "image",
			file: new File([], "runtime.gif", { type: "image/gif" }),
			metadata: { stickerRuntime: mediaDescriptor },
		} satisfies MediaItem;
		expect(
			resolveStickerRuntimeDescriptor({ element: stickerElement(), mediaItem })
		).toBe(descriptor);
		expect(resolveStickerRuntimeDescriptor({ mediaItem })).toBe(
			mediaDescriptor
		);
	});

	it("maps split trimStart to sourceOffset without restarting the GIF", () => {
		const element = stickerElement();
		const splitTime = 2.1;
		const split = getTimelineSplitUpdates({ element, splitTime, fps: 30 });
		const right = {
			...element,
			...split.right,
			id: "right",
			startTime: splitTime,
		};
		const state = evaluateStickerRuntime({
			descriptor,
			timeline: getStickerRuntimeTimelineWindow({ element: right }),
			timelineTimeSeconds: splitTime,
		});

		expect(right.trimStart).toBeCloseTo(0.1);
		expect(state).toMatchObject({
			active: true,
			frameIndex: 1,
		});
		if (!state.active) throw new Error("Expected an active split frame");
		expect(state.sourceTimeSeconds).toBeCloseTo(0.1);
	});
});
