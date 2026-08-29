import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineHoverAxis } from "../timeline-hover-axis";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { resetPlaybackStore } from "@/test/helpers/reset-playback-store";

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: () => ({ activeProject: { fps: 30 } }),
	},
}));

const TIMELINE_RECT = {
	left: 0,
	top: 0,
	right: 800,
	bottom: 400,
	width: 800,
	height: 400,
	x: 0,
	y: 0,
	toJSON: () => ({}),
} as DOMRect;

const VIEWPORT_RECT = {
	...TIMELINE_RECT,
	left: 224,
	x: 224,
	width: 576,
} as DOMRect;

function createRefs() {
	const timeline = document.createElement("div");
	timeline.getBoundingClientRect = () => TIMELINE_RECT;
	const viewport = document.createElement("div");
	viewport.getBoundingClientRect = () => VIEWPORT_RECT;
	const labels = document.createElement("div");
	Object.defineProperty(labels, "offsetWidth", { value: 224 });
	return {
		timelineRef: { current: timeline },
		tracksScrollRef: { current: viewport },
		trackLabelsRef: { current: labels },
	};
}

function movePointer({
	clientX,
	clientY,
	buttons = 0,
}: {
	clientX: number;
	clientY: number;
	buttons?: number;
}) {
	act(() => {
		document.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX,
				clientY,
				buttons,
				bubbles: true,
			})
		);
	});
}

describe("TimelineHoverAxis", () => {
	beforeEach(() => {
		resetPlaybackStore();
		usePlaybackStore.getState().setDuration(10);
	});

	afterEach(() => {
		resetPlaybackStore();
	});

	it("follows a buttonless hover and publishes the frame-snapped scrub time", () => {
		render(<TimelineHoverAxis {...createRefs()} zoomLevel={1} />);
		const axis = screen.getByTestId("timeline-hover-axis");
		expect(axis.style.display).toBe("none");

		movePointer({ clientX: 324, clientY: 100 });

		expect(axis.style.display).toBe("");
		// contentX = 324 - 224 = 100px -> 2s at 50px/s, on the frame grid.
		expect(axis.style.left).toBe("324px");
		expect(usePlaybackStore.getState().previewScrubTime).toBe(2);
	});

	it("hides and clears the scrub while any mouse button is held", () => {
		render(<TimelineHoverAxis {...createRefs()} zoomLevel={1} />);
		const axis = screen.getByTestId("timeline-hover-axis");
		movePointer({ clientX: 324, clientY: 100 });
		expect(axis.style.display).toBe("");

		movePointer({ clientX: 330, clientY: 100, buttons: 1 });

		expect(axis.style.display).toBe("none");
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});

	it("hides when the pointer leaves the timeline or crosses the labels column", () => {
		render(<TimelineHoverAxis {...createRefs()} zoomLevel={1} />);
		const axis = screen.getByTestId("timeline-hover-axis");
		movePointer({ clientX: 324, clientY: 100 });
		expect(axis.style.display).toBe("");

		movePointer({ clientX: 100, clientY: 100 });
		expect(axis.style.display).toBe("none");
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();

		movePointer({ clientX: 324, clientY: 100 });
		expect(axis.style.display).toBe("");
		movePointer({ clientX: 324, clientY: 500 });
		expect(axis.style.display).toBe("none");
	});

	it("hides during native drag-and-drop", () => {
		render(<TimelineHoverAxis {...createRefs()} zoomLevel={1} />);
		const axis = screen.getByTestId("timeline-hover-axis");
		movePointer({ clientX: 324, clientY: 100 });
		expect(axis.style.display).toBe("");

		act(() => {
			document.dispatchEvent(new Event("dragover", { bubbles: true }));
		});

		expect(axis.style.display).toBe("none");
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});

	it("stays visual-only during playback", () => {
		usePlaybackStore.setState({ isPlaying: true });
		render(<TimelineHoverAxis {...createRefs()} zoomLevel={1} />);
		const axis = screen.getByTestId("timeline-hover-axis");

		movePointer({ clientX: 324, clientY: 100 });

		expect(axis.style.display).toBe("");
		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});

	it("clears the scrub override on unmount", () => {
		const { unmount } = render(
			<TimelineHoverAxis {...createRefs()} zoomLevel={1} />
		);
		movePointer({ clientX: 324, clientY: 100 });
		expect(usePlaybackStore.getState().previewScrubTime).toBe(2);

		unmount();

		expect(usePlaybackStore.getState().previewScrubTime).toBeNull();
	});
});
