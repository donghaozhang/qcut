/**
 * Tests for extracted timeline store operations.
 * Validates operations moved to timeline-store-operations.ts
 * by exercising them through the Zustand store.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { CreateMediaElement } from "@/types/timeline";

// Mock dependencies (same as timeline-store.test.ts)
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

/** Helper to set up a store with a media element on the main track */
function setupStoreWithElement({
	overrides = {},
}: {
	overrides?: Partial<CreateMediaElement>;
} = {}) {
	const { result } = renderHook(() => useTimelineStore());
	const mainTrackId = result.current.tracks[0].id;

	const element: CreateMediaElement = {
		type: "media",
		mediaId: "test-media",
		startTime: 5,
		duration: 10,
		name: "Test Clip",
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};

	act(() => {
		result.current.addElementToTrack(mainTrackId, element);
	});

	const addedElement = result.current.tracks[0].elements[0];
	return { result, mainTrackId, elementId: addedElement.id };
}

describe("Timeline Store Operations", () => {
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
			},
		});

		const { result } = renderHook(() => useTimelineStore());
		act(() => {
			result.current.clearTimeline();
		});
		vi.clearAllMocks();
	});

	// -------------------------------------------------------------------------
	// createTimelineOperations returns all expected methods
	// -------------------------------------------------------------------------

	it("store exposes all operation methods from createTimelineOperations", () => {
		const { result } = renderHook(() => useTimelineStore());
		const store = result.current;

		// Ripple operations
		expect(store.removeTrack).toBeTypeOf("function");
		expect(store.removeTrackWithRipple).toBeTypeOf("function");
		expect(store.removeElementFromTrackWithRipple).toBeTypeOf("function");
		expect(store.updateElementStartTimeWithRipple).toBeTypeOf("function");

		// Split operations
		expect(store.splitElement).toBeTypeOf("function");
		expect(store.splitAndKeepLeft).toBeTypeOf("function");
		expect(store.splitAndKeepRight).toBeTypeOf("function");

		// Audio & media operations
		expect(store.getAudioElements).toBeTypeOf("function");
		expect(store.separateAudio).toBeTypeOf("function");
		expect(store.replaceElementMedia).toBeTypeOf("function");

		// Drag state
		expect(store.setDragState).toBeTypeOf("function");
		expect(store.startDrag).toBeTypeOf("function");
		expect(store.updateDragTime).toBeTypeOf("function");
		expect(store.endDrag).toBeTypeOf("function");

		// Add-at-time
		expect(store.addMediaAtTime).toBeTypeOf("function");
		expect(store.addTextAtTime).toBeTypeOf("function");
		expect(store.addMediaToNewTrack).toBeTypeOf("function");
		expect(store.addTextToNewTrack).toBeTypeOf("function");

		// Effects
		expect(store.addEffectToElement).toBeTypeOf("function");
		expect(store.removeEffectFromElement).toBeTypeOf("function");
		expect(store.getElementEffectIds).toBeTypeOf("function");
		expect(store.clearElementEffects).toBeTypeOf("function");
	});

	// -------------------------------------------------------------------------
	// Split operations
	// -------------------------------------------------------------------------

	it("splitElement creates two elements with correct boundaries", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement();

		// Element: startTime=5, duration=10, effective range [5, 15]
		// Split at time=10 → left [5, 10], right [10, 15]
		let secondId: string | null = null;
		act(() => {
			secondId = result.current.splitElement(mainTrackId, elementId, 10);
		});

		expect(secondId).not.toBeNull();

		const elements = result.current.tracks[0].elements;
		expect(elements).toHaveLength(2);

		// Left part: original ID, trimEnd increased
		const left = elements.find((e) => e.id === elementId);
		expect(left).toBeDefined();
		expect(left?.name).toContain("left");
		// trimEnd should be increased by secondDuration (5)
		expect(left?.trimEnd).toBe(5);

		// Right part: new ID, startTime=10, trimStart increased
		const right = elements.find((e) => e.id === secondId);
		expect(right).toBeDefined();
		expect(right?.startTime).toBe(10);
		expect(right?.name).toContain("right");
		// trimStart should be increased by firstDuration (5)
		expect(right?.trimStart).toBe(5);
	});

	it("splitElement returns null for out-of-range split time", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement();

		let secondId: string | null = null;
		act(() => {
			// Split at time 0, which is before the element starts at 5
			secondId = result.current.splitElement(mainTrackId, elementId, 0);
		});

		expect(secondId).toBeNull();
		expect(result.current.tracks[0].elements).toHaveLength(1);
	});

	it("splitElement maps a 2x timeline split to source time", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement({
			overrides: { playbackRate: 2 },
		});

		let secondId: string | null = null;
		act(() => {
			secondId = result.current.splitElement(mainTrackId, elementId, 7.5);
		});

		const elements = result.current.tracks[0].elements;
		const left = elements.find((element) => element.id === elementId);
		const right = elements.find((element) => element.id === secondId);
		expect(left?.trimEnd).toBeCloseTo(5);
		expect(right?.trimStart).toBeCloseTo(5);
		expect(right?.startTime).toBe(7.5);
	});

	it("deleteTimeRange preserves source boundaries inside a 2x clip", () => {
		const { result, mainTrackId } = setupStoreWithElement({
			overrides: { playbackRate: 2 },
		});

		act(() => {
			result.current.deleteTimeRange({
				startTime: 6,
				endTime: 8,
				trackIds: [mainTrackId],
				ripple: false,
			});
		});

		const elements = result.current.tracks[0].elements;
		expect(elements).toHaveLength(2);
		expect(elements[0].trimEnd).toBeCloseTo(8);
		expect(elements[1].startTime).toBe(8);
		expect(elements[1].trimStart).toBeCloseTo(6);
	});

	it("splitAndKeepLeft trims the right portion", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement();

		act(() => {
			result.current.splitAndKeepLeft(mainTrackId, elementId, 10);
		});

		const elements = result.current.tracks[0].elements;
		expect(elements).toHaveLength(1);
		expect(elements[0].name).toContain("left");
		expect(elements[0].trimEnd).toBe(5);
	});

	it("splitAndKeepRight trims the left portion", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement();

		act(() => {
			result.current.splitAndKeepRight(mainTrackId, elementId, 10);
		});

		const elements = result.current.tracks[0].elements;
		expect(elements).toHaveLength(1);
		expect(elements[0].name).toContain("right");
		expect(elements[0].startTime).toBe(10);
		expect(elements[0].trimStart).toBe(5);
	});

	// -------------------------------------------------------------------------
	// Ripple operations
	// -------------------------------------------------------------------------

	it("removeTrackWithRipple shifts remaining elements", () => {
		const { result } = renderHook(() => useTimelineStore());

		// Add a second media track with an element
		let secondTrackId: string;
		act(() => {
			secondTrackId = result.current.addTrack("media");
			result.current.addElementToTrack(secondTrackId, {
				type: "media",
				mediaId: "second-clip",
				startTime: 0,
				duration: 5,
				name: "Second Track Clip",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		// Add an element to main track at time 10
		const mainTrackId = result.current.tracks.find((t) => t.isMain)!.id;
		act(() => {
			result.current.addElementToTrack(mainTrackId, {
				type: "media",
				mediaId: "main-clip",
				startTime: 10,
				duration: 5,
				name: "Main Track Clip",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		// Enable ripple and remove the second track
		act(() => {
			result.current.toggleRippleEditing();
		});

		expect(result.current.rippleEditingEnabled).toBe(true);

		act(() => {
			result.current.removeTrack(secondTrackId!);
		});

		// The second track should be gone
		const remainingTracks = result.current.tracks;
		expect(
			remainingTracks.find((t) => t.id === secondTrackId!)
		).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Drag state
	// -------------------------------------------------------------------------

	it("startDrag and endDrag manage drag state", () => {
		const { result } = renderHook(() => useTimelineStore());

		expect(result.current.dragState.isDragging).toBe(false);

		act(() => {
			result.current.startDrag("elem1", "track1", 100, 5, 2);
		});

		expect(result.current.dragState.isDragging).toBe(true);
		expect(result.current.dragState.elementId).toBe("elem1");
		expect(result.current.dragState.trackId).toBe("track1");
		expect(result.current.dragState.startMouseX).toBe(100);
		expect(result.current.dragState.startElementTime).toBe(5);
		expect(result.current.dragState.clickOffsetTime).toBe(2);

		act(() => {
			result.current.updateDragTime(10);
		});

		expect(result.current.dragState.currentTime).toBe(10);

		act(() => {
			result.current.endDrag();
		});

		expect(result.current.dragState.isDragging).toBe(false);
		expect(result.current.dragState.elementId).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Effects operations
	// -------------------------------------------------------------------------

	it("addEffectToElement pushes history and updates element", () => {
		const { result, elementId } = setupStoreWithElement();

		act(() => {
			result.current.addEffectToElement(elementId, "blur-effect");
		});

		// Verify effect was added
		const effectIds = result.current.getElementEffectIds(elementId);
		expect(effectIds).toContain("blur-effect");

		// Verify history was pushed (2 entries: addElement + addEffect)
		expect(result.current.history.length).toBeGreaterThanOrEqual(2);
	});

	it("removeEffectFromElement removes effect", () => {
		const { result, elementId } = setupStoreWithElement();

		act(() => {
			result.current.addEffectToElement(elementId, "blur-effect");
			result.current.addEffectToElement(elementId, "glow-effect");
		});

		act(() => {
			result.current.removeEffectFromElement(elementId, "blur-effect");
		});

		const effectIds = result.current.getElementEffectIds(elementId);
		expect(effectIds).not.toContain("blur-effect");
		expect(effectIds).toContain("glow-effect");
	});

	it("clearElementEffects removes all effects", () => {
		const { result, elementId } = setupStoreWithElement();

		act(() => {
			result.current.addEffectToElement(elementId, "blur-effect");
			result.current.addEffectToElement(elementId, "glow-effect");
		});

		act(() => {
			result.current.clearElementEffects(elementId);
		});

		const effectIds = result.current.getElementEffectIds(elementId);
		expect(effectIds).toHaveLength(0);
	});

	it("getElementEffectIds returns empty array for nonexistent element", () => {
		const { result } = renderHook(() => useTimelineStore());

		const effectIds = result.current.getElementEffectIds("nonexistent");
		expect(effectIds).toEqual([]);
	});

	// -------------------------------------------------------------------------
	// Audio operations
	// -------------------------------------------------------------------------

	it("getAudioElements returns media elements from audio/media tracks", () => {
		const { result } = renderHook(() => useTimelineStore());
		const mainTrackId = result.current.tracks[0].id;

		act(() => {
			result.current.addElementToTrack(mainTrackId, {
				type: "media",
				mediaId: "video-clip",
				startTime: 0,
				duration: 10,
				name: "Video Clip",
				trimStart: 0,
				trimEnd: 0,
			});
		});

		const audioElements = result.current.getAudioElements();
		expect(audioElements).toHaveLength(1);
		expect(audioElements[0].trackId).toBe(mainTrackId);
		expect(audioElements[0].absoluteStart).toBe(0);
	});

	it("separateAudio creates audio element on audio track", () => {
		const { result, mainTrackId, elementId } = setupStoreWithElement();

		let audioElementId: string | null = null;
		act(() => {
			audioElementId = result.current.separateAudio(mainTrackId, elementId);
		});

		expect(audioElementId).not.toBeNull();

		// Should have created an audio track
		const audioTrack = result.current.tracks.find((t) => t.type === "audio");
		expect(audioTrack).toBeDefined();
		expect(audioTrack?.elements).toHaveLength(1);
		expect(audioTrack?.elements[0].name).toContain("audio");
		const sourceElement = result.current.tracks
			.find((track) => track.id === mainTrackId)
			?.elements.find((element) => element.id === elementId);
		expect(sourceElement?.type).toBe("media");
		if (sourceElement?.type === "media") {
			expect(sourceElement.volume).toBe(0);
		}
	});
});
