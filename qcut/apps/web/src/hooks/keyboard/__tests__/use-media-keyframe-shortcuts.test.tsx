import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	KEYFRAME_VALUE_FOCUS_EVENT,
	MEDIA_KEYFRAME_COMMAND_EVENT,
} from "@/lib/editor-shortcut-events";
import type { MediaElement } from "@/types/timeline";
import { useMediaKeyframeShortcuts } from "../use-media-keyframe-shortcuts";

const mocks = vi.hoisted(() => ({
	updateMediaElement: vi.fn(),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: (
		selector: (state: {
			updateMediaElement: typeof mocks.updateMediaElement;
		}) => unknown
	) => selector({ updateMediaElement: mocks.updateMediaElement }),
}));

const element: MediaElement = {
	id: "clip",
	type: "media",
	mediaId: "media",
	name: "Clip",
	startTime: 0,
	duration: 8,
	trimStart: 0,
	trimEnd: 0,
	rotation: 45,
};

describe("useMediaKeyframeShortcuts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("adds the current property keyframe with the requested easing", () => {
		const onExpandKeyframes = vi.fn();
		const onOpenBasic = vi.fn();
		renderHook(() =>
			useMediaKeyframeShortcuts({
				currentTime: 2,
				currentFrame: 60,
				element,
				fps: 30,
				keyframeProperty: "rotation",
				onExpandKeyframes,
				onOpenBasic,
				trackId: "track",
			})
		);

		act(() => {
			window.dispatchEvent(
				new CustomEvent(MEDIA_KEYFRAME_COMMAND_EVENT, {
					detail: { elementId: "clip", command: "ease-in" },
				})
			);
		});

		expect(onOpenBasic).toHaveBeenCalledOnce();
		expect(onExpandKeyframes).toHaveBeenCalledOnce();
		expect(mocks.updateMediaElement).toHaveBeenCalledWith("track", "clip", {
			keyframes: {
				rotation: [
					expect.objectContaining({
						frame: 60,
						value: 45,
						easing: "easeIn",
					}),
				],
			},
		});
	});

	it("requests value focus after creating an editable keyframe", async () => {
		const focusEvents: Event[] = [];
		window.addEventListener(KEYFRAME_VALUE_FOCUS_EVENT, (event) =>
			focusEvents.push(event)
		);
		renderHook(() =>
			useMediaKeyframeShortcuts({
				currentTime: 2,
				currentFrame: 60,
				element,
				fps: 30,
				keyframeProperty: "rotation",
				onExpandKeyframes: vi.fn(),
				onOpenBasic: vi.fn(),
				trackId: "track",
			})
		);

		act(() => {
			window.dispatchEvent(
				new CustomEvent(MEDIA_KEYFRAME_COMMAND_EVENT, {
					detail: { elementId: "clip", command: "edit-value" },
				})
			);
		});

		await waitFor(() => expect(focusEvents).toHaveLength(1));
		expect((focusEvents[0] as CustomEvent).detail).toMatchObject({
			property: "rotation",
		});
	});
});
