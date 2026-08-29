import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TimelineTrackContent } from "../timeline-track";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { CreateTextElement } from "@/types/timeline";

const TEXT_ELEMENT: CreateTextElement = {
	type: "text",
	name: "Stuck Drag Probe",
	content: "probe",
	duration: 5,
	startTime: 1,
	trimStart: 0,
	trimEnd: 0,
	fontSize: 32,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
};

function seedTextTrack() {
	const store = useTimelineStore.getState();
	const trackId = store.insertTrackAt("text", 0);
	act(() => {
		useTimelineStore.getState().addElementToTrack(trackId, TEXT_ELEMENT);
	});
	return useTimelineStore.getState().tracks.find((t) => t.id === trackId);
}

function moveOnDocument({
	clientX,
	buttons,
}: {
	clientX: number;
	buttons: number;
}) {
	act(() => {
		document.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX,
				clientY: 10,
				buttons,
				bubbles: true,
			})
		);
	});
}

describe("timeline track drag requires a held primary button", () => {
	beforeEach(() => {
		useTimelineStore.setState({
			_tracks: [],
			tracks: [],
			history: [],
			redoStack: [],
			selectedElements: [],
			snappingEnabled: true,
			rippleEditingEnabled: false,
			dragState: {
				isDragging: false,
				elementId: null,
				trackId: null,
				startMouseX: 0,
				startElementTime: 0,
				clickOffsetTime: 0,
				currentTime: 0,
				reorderPreview: null,
			},
		});
	});

	it("abandons a pending drag when the mouseup was missed", () => {
		const track = seedTextTrack();
		if (!track) throw new Error("track not seeded");
		render(<TimelineTrackContent track={track} zoomLevel={1} />);

		fireEvent.mouseDown(screen.getByTestId("timeline-element-interaction"), {
			button: 0,
			buttons: 1,
			clientX: 100,
			clientY: 10,
		});
		// The release happened outside the window (no mouseup ever fires).
		// A later button-less move past the 5px threshold must NOT start a drag.
		moveOnDocument({ clientX: 140, buttons: 0 });

		expect(useTimelineStore.getState().dragState.isDragging).toBe(false);
	});

	it("ends an active drag when a move arrives without the primary button", () => {
		const track = seedTextTrack();
		if (!track) throw new Error("track not seeded");
		render(<TimelineTrackContent track={track} zoomLevel={1} />);

		fireEvent.mouseDown(screen.getByTestId("timeline-element-interaction"), {
			button: 0,
			buttons: 1,
			clientX: 100,
			clientY: 10,
		});
		moveOnDocument({ clientX: 140, buttons: 1 });
		expect(useTimelineStore.getState().dragState.isDragging).toBe(true);

		// mouseup was missed; the next button-less move must commit the drop
		// instead of letting the clip keep following the pointer.
		moveOnDocument({ clientX: 300, buttons: 0 });

		expect(useTimelineStore.getState().dragState.isDragging).toBe(false);
	});
});
