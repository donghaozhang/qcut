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

	it("commits a missed release on the source track even over another lane", () => {
		const source = seedTextTrack();
		if (!source) throw new Error("source track not seeded");
		const secondId = useTimelineStore.getState().insertTrackAt("text", 1);
		const second = useTimelineStore
			.getState()
			.tracks.find((t) => t.id === secondId);
		if (!second) throw new Error("second track not seeded");
		const { container } = render(
			<>
				<TimelineTrackContent track={source} zoomLevel={1} />
				<TimelineTrackContent track={second} zoomLevel={1} />
			</>
		);
		const lanes = container.querySelectorAll('[data-testid="timeline-track"]');
		expect(lanes).toHaveLength(2);
		const laneRect = (top: number, bottom: number) =>
			({
				top,
				bottom,
				left: 0,
				right: 800,
				width: 800,
				height: bottom - top,
				x: 0,
				y: top,
				toJSON: () => ({}),
			}) as DOMRect;
		(lanes[0] as HTMLElement).getBoundingClientRect = () => laneRect(0, 40);
		(lanes[1] as HTMLElement).getBoundingClientRect = () => laneRect(44, 84);

		fireEvent.mouseDown(screen.getByTestId("timeline-element-interaction"), {
			button: 0,
			buttons: 1,
			clientX: 100,
			clientY: 10,
		});
		act(() => {
			document.dispatchEvent(
				new MouseEvent("mousemove", {
					clientX: 140,
					clientY: 10,
					buttons: 1,
					bubbles: true,
				})
			);
		});
		expect(useTimelineStore.getState().dragState.isDragging).toBe(true);
		const trackCountBefore = useTimelineStore.getState().tracks.length;

		// The missed release re-enters over the SECOND lane. The commit must
		// stay on the source track: no cross-track move, no drag-out lane.
		act(() => {
			document.dispatchEvent(
				new MouseEvent("mousemove", {
					clientX: 300,
					clientY: 60,
					buttons: 0,
					bubbles: true,
				})
			);
		});

		const state = useTimelineStore.getState();
		expect(state.dragState.isDragging).toBe(false);
		const sourceAfter = state.tracks.find((t) => t.id === source.id);
		const secondAfter = state.tracks.find((t) => t.id === secondId);
		expect(sourceAfter?.elements).toHaveLength(1);
		expect(secondAfter?.elements).toHaveLength(0);
		expect(state.tracks).toHaveLength(trackCountBefore);
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
