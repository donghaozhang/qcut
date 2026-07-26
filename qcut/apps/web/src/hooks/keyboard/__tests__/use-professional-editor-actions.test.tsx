import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeAction } from "@/constants/actions";
import {
	MEDIA_KEYFRAME_COMMAND_EVENT,
	TIMELINE_ZOOM_EVENT,
} from "@/lib/editor-shortcut-events";
import { useProfessionalEditorActions } from "../use-professional-editor-actions";

const mocks = vi.hoisted(() => {
	const element = {
		id: "clip",
		type: "media" as const,
		mediaId: "media",
		name: "Clip",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
		rotation: 0,
	};
	return {
		element,
		timeline: {
			selectedElements: [{ trackId: "track", elementId: "clip" }],
			tracks: [{ id: "track", type: "media", elements: [element] }],
			splitAndKeepRight: vi.fn(),
			splitAndKeepLeft: vi.fn(),
			updateMediaTiming: vi.fn(),
			updateMediaElement: vi.fn(),
			updateElementRotation: vi.fn(),
		},
		playback: { currentTime: 3 },
	};
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => mocks.timeline,
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => mocks.playback,
	},
}));

describe("useProfessionalEditorActions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("binds trim, transform, keyframe, crop, and zoom commands", () => {
		const keyframeEvents: Event[] = [];
		const cropEvents: Event[] = [];
		const zoomEvents: Event[] = [];
		window.addEventListener(MEDIA_KEYFRAME_COMMAND_EVENT, (event) =>
			keyframeEvents.push(event)
		);
		window.addEventListener("qcut:open-media-properties-tab", (event) =>
			cropEvents.push(event)
		);
		window.addEventListener(TIMELINE_ZOOM_EVENT, (event) =>
			zoomEvents.push(event)
		);
		const { unmount } = renderHook(() => useProfessionalEditorActions());

		invokeAction("trim-start-to-playhead");
		invokeAction("trim-end-to-playhead");
		invokeAction("reverse-selected");
		invokeAction("mirror-selected");
		invokeAction("rotate-selected");
		invokeAction("add-keyframe");
		invokeAction("crop-selected");
		invokeAction("zoom-timeline-in");

		expect(mocks.timeline.splitAndKeepRight).toHaveBeenCalledWith(
			"track",
			"clip",
			3
		);
		expect(mocks.timeline.splitAndKeepLeft).toHaveBeenCalledWith(
			"track",
			"clip",
			3
		);
		expect(mocks.timeline.updateMediaTiming).toHaveBeenCalledWith(
			"track",
			"clip",
			{ reverse: true }
		);
		expect(mocks.timeline.updateMediaElement).toHaveBeenCalledWith(
			"track",
			"clip",
			{ flipHorizontal: true }
		);
		expect(mocks.timeline.updateElementRotation).toHaveBeenCalledWith(
			"clip",
			90
		);
		expect((keyframeEvents[0] as CustomEvent).detail).toEqual({
			elementId: "clip",
			command: "add",
		});
		expect((cropEvents[0] as CustomEvent).detail).toEqual({
			elementId: "clip",
			tab: "basic",
			scrollTo: "crop",
		});
		expect((zoomEvents[0] as CustomEvent).detail).toBe("in");

		unmount();
	});
});
