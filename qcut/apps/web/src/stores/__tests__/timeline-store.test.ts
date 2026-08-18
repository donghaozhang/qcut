import {
	describe,
	it,
	expect,
	beforeEach,
	vi,
	afterAll,
	afterEach,
} from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import type {
	TimelineTrack,
	TimelineElement,
	MediaElement,
	CreateMediaElement,
} from "@/types/timeline";

// Mock fetch globally to prevent pending requests when worker closes
const fetchMock = vi.fn(() =>
	Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
);
vi.stubGlobal("fetch", fetchMock);

// Mock error handler to prevent stderr output from caught dynamic import errors
vi.mock("@/lib/debug/error-handler", () => ({
	handleError: vi.fn(),
	handleStorageError: vi.fn(),
	handleMediaProcessingError: vi.fn(),
	ErrorCategory: { STORAGE: "storage", MEDIA: "media", GENERAL: "general" },
	ErrorSeverity: { LOW: "low", MEDIUM: "medium", HIGH: "high" },
}));

// Mock dependencies
vi.mock("@/utils/lazy-stores", () => ({
	getMediaStore: vi.fn(() =>
		Promise.resolve(() => ({ getState: () => ({ mediaItems: [] }) }))
	),
	getTimelineStore: vi.fn(() => Promise.resolve(() => ({}))),
	getProjectStore: vi.fn(() => Promise.resolve(() => ({}))),
	getSceneStore: vi.fn(() => Promise.resolve(() => ({}))),
	getStickersOverlayStore: vi.fn(() => Promise.resolve(() => ({}))),
	getPlaybackStore: vi.fn(() => Promise.resolve(() => ({}))),
	getExportStore: vi.fn(() => Promise.resolve(() => ({}))),
	getEditorStore: vi.fn(() => Promise.resolve(() => ({}))),
	preloadCriticalStores: vi.fn(() => Promise.resolve()),
	clearStoreCache: vi.fn(),
}));

vi.mock("@/stores/media/media-store-loader", () => ({
	getMediaStore: vi.fn(() => Promise.resolve({})),
	getMediaStoreUtils: vi.fn(() =>
		Promise.resolve({
			getFileType: vi.fn(),
			getImageDimensions: vi.fn(),
			generateVideoThumbnail: vi.fn(),
			getMediaDuration: vi.fn(),
			getMediaAspectRatio: vi.fn(),
		})
	),
}));

vi.mock("@/stores/editor/editor-store", () => ({
	useEditorStore: {
		getState: vi.fn(() => ({
			currentTime: 0,
			setCurrentTime: vi.fn(),
		})),
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: vi.fn(() => ({
			mediaItems: [],
		})),
	},
	getMediaAspectRatio: vi.fn(() => 16 / 9),
}));

vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveTimeline: vi.fn(() => Promise.resolve()),
		loadTimeline: vi.fn(() => Promise.resolve(null)),
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({
			activeProject: null,
		})),
	},
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

describe("TimelineStore", () => {
	beforeEach(() => {
		// Reset the store state completely
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

		// Force re-initialization with main track
		const { result } = renderHook(() => useTimelineStore());
		act(() => {
			result.current.clearTimeline();
		});
		vi.clearAllMocks();
	});

	it("initializes with main track", () => {
		const { result } = renderHook(() => useTimelineStore());

		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.tracks[0].type).toBe("media");
		expect(result.current.tracks[0].isMain).toBe(true);
		expect(result.current.tracks[0].name).toBe("主轨道");
		expect(result.current.tracks[0].elements).toEqual([]);
	});

	it("adds text track", () => {
		const { result } = renderHook(() => useTimelineStore());

		act(() => {
			result.current.addTrack("text");
		});

		expect(result.current.tracks).toHaveLength(2);
		const textTrack = result.current.tracks.find((t) => t.type === "text");
		expect(textTrack).toBeDefined();
		expect(textTrack?.name).toContain("文本");
	});

	it("adds audio track", () => {
		const { result } = renderHook(() => useTimelineStore());

		act(() => {
			result.current.addTrack("audio");
		});

		expect(result.current.tracks).toHaveLength(2);
		const audioTrack = result.current.tracks.find((t) => t.type === "audio");
		expect(audioTrack).toBeDefined();
		expect(audioTrack?.name).toContain("音频");
	});

	it("persists a custom track height in one undo step", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];
		if (!mainTrack) throw new Error("Expected main track");
		useTimelineStore.setState({ history: [], redoStack: [] });

		act(() => {
			result.current.updateTrackHeight(mainTrack.id, 96);
		});

		expect(result.current.tracks[0]?.height).toBe(96);
		expect(result.current.history).toHaveLength(1);
		act(() => result.current.undo());
		expect(result.current.tracks[0]?.height).toBeUndefined();
	});

	it("sets compact heights for every track in one undo step", () => {
		const { result } = renderHook(() => useTimelineStore());
		act(() => {
			result.current.addTrack("audio");
			result.current.addTrack("captions");
		});
		useTimelineStore.setState({ history: [], redoStack: [] });

		act(() => result.current.setTrackHeightMode("compact"));

		expect(result.current.tracks.map((track) => track.height)).toEqual([
			40, 32, 24,
		]);
		expect(result.current.history).toHaveLength(1);
		act(() => result.current.undo());
		expect(
			result.current.tracks.every((track) => track.height === undefined)
		).toBe(true);
	});

	it("applies caption track styling in one undo step", () => {
		const { result } = renderHook(() => useTimelineStore());
		let captionTrackId = "";
		act(() => {
			captionTrackId = result.current.addTrack("captions");
			for (const [index, text] of ["First", "Second"].entries()) {
				result.current.addElementToTrack(captionTrackId, {
					type: "captions",
					name: text,
					text,
					language: "en",
					source: "manual",
					startTime: index,
					duration: 1,
					trimStart: 0,
					trimEnd: 0,
				});
			}
		});
		const firstCaption = result.current.tracks
			.find((track) => track.id === captionTrackId)
			?.elements.find((element) => element.type === "captions");
		if (!firstCaption) throw new Error("Expected caption element");
		useTimelineStore.setState({ history: [], redoStack: [] });

		act(() => {
			result.current.applyCaptionStyle({
				trackId: captionTrackId,
				elementId: firstCaption.id,
				style: { fontSize: 64 },
				scope: "track",
			});
		});

		const styledCaptions = result.current.tracks
			.find((track) => track.id === captionTrackId)
			?.elements.filter((element) => element.type === "captions");
		expect(
			styledCaptions?.every(
				(element) =>
					element.type === "captions" && element.style?.fontSize === 64
			)
		).toBe(true);
		expect(result.current.history).toHaveLength(1);
		act(() => result.current.undo());
		const restoredCaptions = result.current.tracks
			.find((track) => track.id === captionTrackId)
			?.elements.filter((element) => element.type === "captions");
		expect(
			restoredCaptions?.every(
				(element) => element.type === "captions" && element.style === undefined
			)
		).toBe(true);
	});

	it("selects every member when a grouped element is selected", () => {
		const groupedTracks: TimelineTrack[] = [
			{
				id: "video",
				name: "Video",
				type: "media",
				elements: [
					{
						id: "video-1",
						name: "Video",
						type: "media",
						mediaId: TEST_MEDIA_ID,
						groupId: "group-1",
						startTime: 0,
						duration: 1,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
			{
				id: "captions",
				name: "Captions",
				type: "captions",
				elements: [
					{
						id: "caption-1",
						name: "Caption",
						type: "captions",
						text: "Hello",
						language: "en",
						source: "manual",
						groupId: "group-1",
						startTime: 0,
						duration: 1,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		];
		useTimelineStore.setState({
			_tracks: groupedTracks,
			tracks: groupedTracks,
			selectedElements: [],
		});
		const { result } = renderHook(() => useTimelineStore());

		act(() => result.current.selectElement("video", "video-1"));

		expect(result.current.selectedElements).toEqual([
			{ trackId: "video", elementId: "video-1" },
			{ trackId: "captions", elementId: "caption-1" },
		]);
	});

	it("creates and switches a multicam clip in one undo step per action", () => {
		const multicamTracks: TimelineTrack[] = [
			{
				id: "camera-a",
				name: "Camera A",
				type: "media",
				elements: [
					{
						id: "a",
						name: "Angle A",
						type: "media",
						mediaId: "media-a",
						startTime: 0,
						duration: 4,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
			{
				id: "camera-b",
				name: "Camera B",
				type: "media",
				elements: [
					{
						id: "b",
						name: "Angle B",
						type: "media",
						mediaId: "media-b",
						startTime: 0,
						duration: 4,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		];
		useTimelineStore.setState({
			_tracks: multicamTracks,
			tracks: multicamTracks,
			selectedElements: [
				{ trackId: "camera-a", elementId: "a" },
				{ trackId: "camera-b", elementId: "b" },
			],
			history: [],
			redoStack: [],
		});
		const { result } = renderHook(() => useTimelineStore());
		let multicamId = "";

		act(() => {
			multicamId =
				result.current.createMediaContainerFromSelection("multicam") ?? "";
		});

		expect(multicamId).not.toBe("");
		expect(result.current.history).toHaveLength(1);
		expect(result.current.selectedElements).toEqual([
			{ trackId: "camera-a", elementId: multicamId },
		]);
		act(() => {
			result.current.selectMulticamClip("camera-a", multicamId, "b");
		});
		expect(result.current.history).toHaveLength(2);
		const multicam = result.current.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.id === multicamId);
		expect(multicam).toMatchObject({
			type: "media",
			mediaId: "media-b",
			compound: { activeClipId: "b" },
		});
	});

	it("removes track by ID", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Add a track
		act(() => {
			result.current.addTrack("text");
		});

		const textTrack = result.current.tracks.find((t) => t.type === "text");
		expect(textTrack).toBeDefined();

		// Remove the track
		if (!textTrack) throw new Error("Expected text track to exist");
		act(() => {
			result.current.removeTrack(textTrack.id);
		});

		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.tracks[0].isMain).toBe(true);
	});

	it("cannot remove main track", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];

		act(() => {
			result.current.removeTrack(mainTrack.id);
		});

		// Main track should still exist
		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.tracks[0].isMain).toBe(true);
	});

	it("maintains history for undo/redo", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Initial state - no history
		expect(result.current.history).toHaveLength(0);

		// Add a track (creates history entry)
		act(() => {
			result.current.addTrack("audio");
		});

		expect(result.current.history).toHaveLength(1);
		expect(result.current.tracks).toHaveLength(2);

		// Undo
		act(() => {
			result.current.undo();
		});

		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.redoStack).toHaveLength(1);

		// Redo
		act(() => {
			result.current.redo();
		});

		expect(result.current.tracks).toHaveLength(2);
		expect(result.current.redoStack).toHaveLength(0);
	});

	it("adds element to track", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];

		const element: CreateMediaElement = {
			type: "media",
			mediaId: "test-media",
			startTime: 0,
			duration: 10,
			name: "Test Element",
			trimStart: 0,
			trimEnd: 10,
		};

		act(() => {
			result.current.addElementToTrack(mainTrack.id, element);
		});

		expect(result.current.tracks[0].elements).toHaveLength(1);
		expect(result.current.tracks[0].elements[0].name).toBe("Test Element");
		expect(result.current.tracks[0].elements[0].duration).toBe(10);
	});

	it("removes element from track", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];

		// Add an element
		act(() => {
			result.current.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: "test-media",
				startTime: 0,
				duration: 10,
				name: "To Remove",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		const element = result.current.tracks[0].elements[0];

		// Remove the element
		act(() => {
			result.current.removeElementFromTrack(mainTrack.id, element.id);
		});

		expect(result.current.tracks[0].elements).toHaveLength(0);
	});

	it("updates element properties", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];

		// Add an element
		act(() => {
			result.current.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: "test-media",
				startTime: 0,
				duration: 5,
				name: "Original Media",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		const element = result.current.tracks[0].elements[0];

		// Update element duration and start time
		act(() => {
			result.current.updateElementDuration(mainTrack.id, element.id, 10);
			result.current.updateElementStartTime(mainTrack.id, element.id, 5);
		});

		const updatedElement = result.current.tracks[0].elements[0];
		// Name won't change as there's no method to update it
		expect(updatedElement.name).toBe("Original Media");
		expect(updatedElement.duration).toBe(10);
		expect(updatedElement.startTime).toBe(5);
	});

	it("clears timeline", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Add tracks and elements
		act(() => {
			result.current.addTrack("text");
			result.current.addTrack("audio");
			result.current.addElementToTrack(result.current.tracks[0].id, {
				type: "media",
				mediaId: TEST_MEDIA_ID,
				startTime: 0,
				duration: 10,
				name: "Media",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		expect(result.current.tracks.length).toBeGreaterThan(1);

		// Clear timeline
		act(() => {
			result.current.clearTimeline();
		});

		// Should have only main track
		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.tracks[0].isMain).toBe(true);
		expect(result.current.tracks[0].elements).toEqual([]);
		expect(result.current.history).toEqual([]);
		expect(result.current.redoStack).toEqual([]);
	});

	it("selects and deselects elements", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrack = result.current.tracks[0];

		// Add elements
		act(() => {
			result.current.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: "media1",
				startTime: 0,
				duration: 10,
				name: "Media 1",
				trimStart: 0,
				trimEnd: 0,
			});
			result.current.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: "media2",
				startTime: 10,
				duration: 10,
				name: "Media 2",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		const [element1, element2] = result.current.tracks[0].elements;

		// Select first element
		act(() => {
			result.current.selectElement(mainTrack.id, element1.id);
		});

		expect(result.current.selectedElements).toHaveLength(1);
		expect(result.current.selectedElements[0].elementId).toBe(element1.id);

		// Select second element (multi-select)
		act(() => {
			result.current.selectElement(mainTrack.id, element2.id, true);
		});

		expect(result.current.selectedElements).toHaveLength(2);

		// Clear selection
		act(() => {
			result.current.clearSelectedElements();
		});

		expect(result.current.selectedElements).toHaveLength(0);
	});

	it("toggles track mute state", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Add audio track
		act(() => {
			result.current.addTrack("audio");
		});

		const audioTrack = result.current.tracks.find((t) => t.type === "audio");
		expect(audioTrack?.muted).toBe(false);

		// Toggle mute
		if (!audioTrack) throw new Error("Expected audio track to exist");
		act(() => {
			result.current.toggleTrackMute(audioTrack.id);
		});

		const mutedTrack = result.current.tracks.find(
			(t) => t.id === audioTrack.id
		);
		expect(mutedTrack?.muted).toBe(true);

		// Toggle again
		act(() => {
			result.current.toggleTrackMute(audioTrack.id);
		});

		const unmutedTrack = result.current.tracks.find(
			(t) => t.id === audioTrack.id
		);
		expect(unmutedTrack?.muted).toBe(false);
	});

	it("updates text elements using updateTextElement", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Add a text track
		act(() => {
			result.current.addTrack("text");
		});

		const textTrack = result.current.tracks.find((t) => t.type === "text");
		if (!textTrack) throw new Error("Expected text track to exist");

		// Add a text element
		act(() => {
			result.current.addElementToTrack(textTrack.id, {
				type: "text",
				content: "Original Text",
				startTime: 0,
				duration: 5,
				name: "Text Element",
				trimStart: 0,
				trimEnd: 0,
				fontSize: 16,
				fontFamily: "Arial",
				color: "#000000",
				backgroundColor: "transparent",
				textAlign: "center",
				fontWeight: "normal",
				fontStyle: "normal",
				textDecoration: "none",
				x: 0,
				y: 0,
				rotation: 0,
				opacity: 1,
			});
		});

		// Get fresh reference to track after adding element
		const updatedTextTrack = result.current.tracks.find(
			(t) => t.type === "text"
		);
		const element = updatedTextTrack?.elements[0];
		if (!element) throw new Error("Expected text element to exist");

		// Update text element using the correct method (updateTextElement, not updateElement)
		act(() => {
			result.current.updateTextElement(updatedTextTrack.id, element.id, {
				content: "Updated Text",
				fontSize: 24,
				fontFamily: "Arial",
			});
		});

		const updatedTrack = result.current.tracks.find(
			(t) => t.id === textTrack.id
		);
		const updatedElement = updatedTrack?.elements[0];

		// Verify the text was updated
		expect(updatedElement).toBeDefined();
		if (!updatedElement || updatedElement.type !== "text") {
			throw new Error("Expected a text element");
		}
		expect(updatedElement.content).toBe("Updated Text");
	});
});
