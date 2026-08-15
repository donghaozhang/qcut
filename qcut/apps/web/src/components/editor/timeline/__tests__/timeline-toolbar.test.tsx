import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TimelineTrack, TrackType } from "@/types/timeline";
import { TimelineToolbar } from "../timeline-toolbar";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useSceneStore } from "@/stores/timeline/scene-store";

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: vi.fn(),
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: vi.fn(),
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: vi.fn(),
}));

vi.mock("@/stores/timeline/scene-store", () => ({
	useSceneStore: vi.fn(),
}));

vi.mock("../scenes-view", () => ({
	ScenesView: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
		error: vi.fn(),
	},
}));

type TimelineSelector<T> = (state: MockTimelineState) => T;
type PlaybackSelector<T> = (state: MockPlaybackState) => T;
type ProjectSelector<T> = (state: MockProjectState) => T;

interface MockTimelineState {
	tracks: TimelineTrack[];
	addTrack: (trackType: TrackType) => string;
	addElementToTrack: (
		trackId: string,
		element: Record<string, unknown>
	) => string | null;
	getTotalDuration: () => number;
	addMarkdownAtTime: (element: Record<string, unknown>, time: number) => void;
	removeElementFromTrack: (trackId: string, elementId: string) => void;
	removeElementFromTrackWithRipple: (
		trackId: string,
		elementId: string
	) => void;
	deleteSelectedElementsWithRipple: (
		selections?: Array<{ trackId: string; elementId: string }>
	) => {
		deletedElements: number;
		splitElements: number;
		totalRemovedDuration: number;
	};
	selectedElements: Array<{ trackId: string; elementId: string }>;
	clearSelectedElements: () => void;
	splitElement: (trackId: string, elementId: string, time: number) => string;
	splitAndKeepLeft: (trackId: string, elementId: string, time: number) => void;
	splitAndKeepRight: (trackId: string, elementId: string, time: number) => void;
	separateAudio: (trackId: string, elementId: string) => void;
	updateMediaElement: (
		trackId: string,
		elementId: string,
		updates: Record<string, unknown>
	) => void;
	setTrackHeightMode: (mode: "compact" | "default") => void;
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;
	showEffectsTrack: boolean;
	toggleEffectsTrack: () => void;
}

interface MockPlaybackState {
	currentTime: number;
	duration: number;
	isPlaying: boolean;
	toggle: () => void;
}

interface MockProjectState {
	toggleBookmark: (time: number) => Promise<void>;
	isBookmarked: (time: number) => boolean;
	activeProject: { fps: number };
}

describe("TimelineToolbar", () => {
	const splitElement = vi.fn(() => "split-el");
	const setZoomLevel = vi.fn();

	const timelineState: MockTimelineState = {
		tracks: [
			{
				id: "track-1",
				name: "Track 1",
				type: "media",
				elements: [
					{
						id: "element-1",
						type: "media",
						name: "Clip",
						mediaId: "media-1",
						duration: 10,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		],
		addTrack: () => "new-track",
		addElementToTrack: vi.fn(() => "new-element"),
		getTotalDuration: vi.fn(() => 20),
		addMarkdownAtTime: vi.fn(),
		removeElementFromTrack: vi.fn(),
		removeElementFromTrackWithRipple: vi.fn(),
		deleteSelectedElementsWithRipple: vi.fn(() => ({
			deletedElements: 0,
			splitElements: 0,
			totalRemovedDuration: 0,
		})),
		selectedElements: [{ trackId: "track-1", elementId: "element-1" }],
		clearSelectedElements: vi.fn(),
		splitElement,
		splitAndKeepLeft: vi.fn(),
		splitAndKeepRight: vi.fn(),
		separateAudio: vi.fn(),
		updateMediaElement: vi.fn(),
		setTrackHeightMode: vi.fn(),
		snappingEnabled: true,
		toggleSnapping: vi.fn(),
		rippleEditingEnabled: false,
		toggleRippleEditing: vi.fn(),
		showEffectsTrack: true,
		toggleEffectsTrack: vi.fn(),
	};

	const playbackState: MockPlaybackState = {
		currentTime: 5,
		duration: 20,
		isPlaying: false,
		toggle: vi.fn(),
	};

	const projectState: MockProjectState = {
		toggleBookmark: vi.fn(async () => {}),
		isBookmarked: vi.fn(() => false),
		activeProject: { fps: 30 },
	};

	beforeEach(() => {
		vi.clearAllMocks();

		(
			useTimelineStore as unknown as ReturnType<typeof vi.fn>
		).mockImplementation(<T,>(selector: TimelineSelector<T>) =>
			selector(timelineState)
		);
		(
			usePlaybackStore as unknown as ReturnType<typeof vi.fn>
		).mockImplementation(<T,>(selector: PlaybackSelector<T>) =>
			selector(playbackState)
		);
		(useProjectStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			<T,>(selector: ProjectSelector<T>) => selector(projectState)
		);
		(useSceneStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
			scenes: [],
			currentScene: null,
		});

		// The freeze-frame helper reads stores imperatively via getState.
		(
			useTimelineStore as unknown as { getState: () => MockTimelineState }
		).getState = () => timelineState;
		(
			usePlaybackStore as unknown as { getState: () => MockPlaybackState }
		).getState = () => playbackState;
		(
			useProjectStore as unknown as { getState: () => MockProjectState }
		).getState = () => projectState;
	});

	it("renders with play button", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		expect(screen.getByTestId("timeline-play-button")).toBeInTheDocument();
	});

	it("shows zoom controls", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		expect(screen.getByTestId("zoom-in-button")).toBeInTheDocument();
		expect(screen.getByTestId("zoom-out-button")).toBeInTheDocument();
	});

	it("split button calls splitElement", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		fireEvent.click(screen.getByTestId("split-clip-button"));
		expect(splitElement).toHaveBeenCalledWith("track-1", "element-1", 5);
	});

	it("add markdown button adds markdown at playhead", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		fireEvent.click(screen.getByTestId("add-markdown-button"));
		expect(timelineState.addMarkdownAtTime).toHaveBeenCalled();
	});

	it("adds a freeze frame at the playhead source time", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		fireEvent.click(screen.getByTestId("freeze-frame-button"));

		expect(timelineState.updateMediaElement).toHaveBeenCalledWith(
			"track-1",
			"element-1",
			{
				freezeFrameTime: 5,
				freezeFrameDuration: 1,
			}
		);
	});

	it("switches the timeline into compact track mode", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		fireEvent.click(screen.getByTestId("compact-tracks-button"));

		expect(timelineState.setTrackHeightMode).toHaveBeenCalledWith("compact");
	});

	it("opens crop controls for the selected media clip", () => {
		const events: Event[] = [];
		window.addEventListener("qcut:open-media-properties-tab", (event) =>
			events.push(event)
		);
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);

		fireEvent.click(screen.getByTestId("crop-clip-button"));

		expect((events[0] as CustomEvent).detail).toEqual({
			elementId: "element-1",
			tab: "basic",
			scrollTo: "crop",
		});
	});

	it("orders the toggles like Jianying: magnet, snapping, ripple, linked", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);

		const sequence = [
			"timeline-main-magnet-button",
			"timeline-snapping-button",
			"timeline-ripple-button",
			"timeline-linked-ripple-button",
		].map((testId) => screen.getByTestId(testId));
		for (const [index, button] of sequence.slice(0, -1).entries()) {
			expect(
				button.compareDocumentPosition(sequence[index + 1]) &
					Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy();
		}
	});

	it("toggles snapping and linked ripple editing from visible toolbar buttons", () => {
		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);

		const snappingButton = screen.getByTestId("timeline-snapping-button");
		expect(snappingButton).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(snappingButton);
		expect(timelineState.toggleSnapping).toHaveBeenCalledOnce();

		const rippleButton = screen.getByTestId("timeline-ripple-button");
		expect(rippleButton).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(rippleButton);
		expect(timelineState.toggleRippleEditing).toHaveBeenCalledOnce();
	});

	it("uses one linked ripple delete operation for a selected batch", () => {
		const rippleState = {
			...timelineState,
			rippleEditingEnabled: true,
			selectedElements: [
				{ trackId: "track-1", elementId: "element-1" },
				{ trackId: "track-2", elementId: "element-2" },
			],
		};
		(
			useTimelineStore as unknown as ReturnType<typeof vi.fn>
		).mockImplementation(<T,>(selector: TimelineSelector<T>) =>
			selector(rippleState)
		);

		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);
		fireEvent.click(screen.getByTestId("delete-selected-button"));

		expect(rippleState.deleteSelectedElementsWithRipple).toHaveBeenCalledWith(
			rippleState.selectedElements
		);
		expect(rippleState.removeElementFromTrack).not.toHaveBeenCalled();
		expect(rippleState.removeElementFromTrackWithRipple).not.toHaveBeenCalled();
	});

	it("disables selection tools when nothing is selected", () => {
		const emptySelectionState = {
			...timelineState,
			selectedElements: [],
		};
		(
			useTimelineStore as unknown as ReturnType<typeof vi.fn>
		).mockImplementation(<T,>(selector: TimelineSelector<T>) =>
			selector(emptySelectionState)
		);

		render(<TimelineToolbar zoomLevel={1} setZoomLevel={setZoomLevel} />);

		expect(screen.getByTestId("split-clip-button")).toBeDisabled();
		expect(screen.getByTestId("duplicate-clip-button")).toBeDisabled();
		expect(screen.getByTestId("crop-clip-button")).toBeDisabled();
		expect(screen.getByTestId("delete-selected-button")).toBeDisabled();
	});
});
