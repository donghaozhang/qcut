import { describe, expect, it, vi } from "vitest";
import { splitElementOperation, splitOnBeats } from "../split-operations";
import type { OperationContext } from "../types";
import { interpolateStickerKeyframes } from "@/lib/stickers/sticker-keyframes";
import type {
	StickerElement,
	StickerPropertyKeyframe,
	TimelineTrack,
} from "@/types/timeline";

function stickerElement({
	duration = 10,
	keyframes = {
		x: [
			{ id: "start", frame: 0, value: 0, easing: "linear" },
			{ id: "end", frame: 240, value: 240, easing: "linear" },
		],
	},
}: {
	duration?: number;
	keyframes?: StickerElement["keyframes"];
} = {}): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		stickerId: "sticker-source",
		mediaId: "media-sticker",
		name: "Sticker",
		startTime: 0,
		duration,
		trimStart: 0,
		trimEnd: 0,
		keyframes,
	};
}

function operationContext({
	getTracks,
	setTracks,
	pushHistory,
}: {
	getTracks: () => TimelineTrack[];
	setTracks: (tracks: TimelineTrack[]) => void;
	pushHistory: () => void;
}): OperationContext {
	return {
		getTracks,
		getSelectedElements: () => [],
		isRippleEnabled: () => false,
		getProjectFps: () => 24,
		updateTracks: setTracks,
		updateTracksAndSave: setTracks,
		pushHistory,
		addTrack: vi.fn(),
		insertTrackAt: vi.fn(),
		selectElement: vi.fn(),
		deselectElement: vi.fn(),
	};
}

function interpolatedValue({
	keyframes,
	frame,
}: {
	keyframes: StickerPropertyKeyframe[];
	frame: number;
}): number {
	const value = interpolateStickerKeyframes({ keyframes, frame });
	if (value === undefined) {
		throw new Error("Expected a value from a non-empty keyframe track");
	}
	return value;
}

describe("splitElementOperation sticker identity", () => {
	it("gives the right side a new identity and rebases keyframes at project fps", () => {
		let tracks: TimelineTrack[] = [
			{
				id: "sticker-track",
				name: "Stickers",
				type: "sticker",
				elements: [stickerElement()],
			},
		];
		const pushHistory = vi.fn();
		const context = operationContext({
			getTracks: () => tracks,
			setTracks: (updated) => {
				tracks = updated;
			},
			pushHistory,
		});

		const secondElementId = splitElementOperation(
			context,
			"sticker-track",
			"sticker-element",
			5
		);
		const elements = tracks[0].elements.filter(
			(element): element is StickerElement => element.type === "sticker"
		);

		expect(secondElementId).not.toBeNull();
		expect(elements).toHaveLength(2);
		expect(elements[0].stickerId).toBe("sticker-source");
		expect(elements[1].stickerId).not.toBe("sticker-source");
		expect(
			elements[0].keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 0 },
			{ frame: 120, value: 120 },
		]);
		expect(
			elements[1].keyframes?.x?.map(({ frame, value }) => ({ frame, value }))
		).toEqual([
			{ frame: 0, value: 120 },
			{ frame: 120, value: 240 },
		]);
		expect(pushHistory).toHaveBeenCalledOnce();
	});

	it("keeps nonlinear boundaries faithful across legacy split-on-beats cuts", () => {
		const sourceKeyframes = [
			{ id: "start", frame: 0, value: 10, easing: "linear" },
			{ id: "end", frame: 96, value: 90, easing: "easeInOut" },
		] satisfies StickerPropertyKeyframe[];
		let tracks: TimelineTrack[] = [
			{
				id: "sticker-track",
				name: "Stickers",
				type: "sticker",
				elements: [
					stickerElement({
						duration: 4,
						keyframes: { x: sourceKeyframes },
					}),
				],
			},
		];
		const pushHistory = vi.fn();
		const context = operationContext({
			getTracks: () => tracks,
			setTracks: (updated) => {
				tracks = updated;
			},
			pushHistory,
		});

		expect(
			splitOnBeats(context, "sticker-track", "sticker-element", [1, 3])
		).toBe(2);
		const [first, second, third] = tracks[0].elements
			.filter(
				(element): element is StickerElement => element.type === "sticker"
			)
			.sort((left, right) => left.startTime - right.startTime);
		const expectedFirstCut = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: 24,
		});
		const expectedSecondCut = interpolatedValue({
			keyframes: sourceKeyframes,
			frame: 72,
		});

		expect(first.keyframes?.x?.at(-1)?.value).toBeCloseTo(expectedFirstCut);
		expect(second.keyframes?.x?.[0]?.value).toBeCloseTo(expectedFirstCut);
		expect(second.keyframes?.x?.at(-1)?.value).toBeCloseTo(expectedSecondCut);
		expect(third.keyframes?.x?.[0]?.value).toBeCloseTo(expectedSecondCut);
		expect(pushHistory).toHaveBeenCalledOnce();
	});
});
