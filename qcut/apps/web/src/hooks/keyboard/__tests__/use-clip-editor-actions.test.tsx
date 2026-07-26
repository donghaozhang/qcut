import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeAction } from "@/constants/actions";
import { usePreviewViewStore } from "@/stores/editor/preview-view-store";
import { useClipEditorActions } from "../use-clip-editor-actions";

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
		groupId: "group-1",
		hidden: false,
	};
	return {
		element,
		timeline: {
			selectedElements: [{ trackId: "track", elementId: "clip" }],
			tracks: [{ id: "track", type: "media", elements: [element] }],
			// effects-store hydrates from _tracks at module scope on import
			_tracks: [],
			separateAudio: vi.fn(),
			toggleElementHidden: vi.fn(),
			groupSelectedElements: vi.fn(() => "group-1"),
			ungroupElements: vi.fn(() => 2),
		},
		playback: { currentTime: 3 },
		project: { toggleBookmark: vi.fn(async () => {}) },
	};
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => mocks.timeline,
		// effects-store subscribes at module scope via the import chain
		subscribe: () => () => {},
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: () => mocks.playback,
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => mocks.project,
	},
}));

describe("useClipEditorActions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		usePreviewViewStore.setState({ previewScale: "fit", showSafeAreas: false });
	});

	it("binds clip workflow commands to timeline and project stores", () => {
		const { unmount } = renderHook(() => useClipEditorActions());

		invokeAction("separate-audio-selected");
		invokeAction("toggle-bookmark");
		invokeAction("toggle-element-enabled");
		invokeAction("group-selected");
		invokeAction("ungroup-selected");

		expect(mocks.timeline.separateAudio).toHaveBeenCalledWith("track", "clip");
		expect(mocks.project.toggleBookmark).toHaveBeenCalledWith(3);
		expect(mocks.timeline.toggleElementHidden).toHaveBeenCalledWith(
			"track",
			"clip"
		);
		expect(mocks.timeline.groupSelectedElements).toHaveBeenCalled();
		expect(mocks.timeline.ungroupElements).toHaveBeenCalledWith("group-1");

		unmount();
	});

	it("drives the preview view store for player commands", () => {
		const { unmount } = renderHook(() => useClipEditorActions());

		invokeAction("toggle-safe-areas");
		expect(usePreviewViewStore.getState().showSafeAreas).toBe(true);

		invokeAction("player-zoom-in");
		expect(usePreviewViewStore.getState().previewScale).toBe(75);
		invokeAction("player-zoom-in");
		expect(usePreviewViewStore.getState().previewScale).toBe(100);
		invokeAction("player-zoom-out");
		expect(usePreviewViewStore.getState().previewScale).toBe(75);
		invokeAction("player-zoom-fit");
		expect(usePreviewViewStore.getState().previewScale).toBe("fit");

		unmount();
	});

	it("unbinds handlers on unmount", () => {
		const { unmount } = renderHook(() => useClipEditorActions());
		unmount();

		invokeAction("separate-audio-selected");
		expect(mocks.timeline.separateAudio).not.toHaveBeenCalled();
	});
});
