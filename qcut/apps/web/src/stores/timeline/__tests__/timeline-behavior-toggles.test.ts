import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { TProject } from "@/types/project";
import { resolveProjectTimelineSettings } from "@/types/project";
import { storageService } from "@/lib/storage/storage-service";
import { useProjectStore } from "@/stores/project-store";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-005: main-track magnet, ordinary snapping, and linked ripple are three
 * independent, per-project toggles with deterministic legacy defaults.
 */

function mediaElement({
	id,
	startTime,
	duration = 2,
	groupId,
	mediaId,
}: {
	id: string;
	startTime: number;
	duration?: number;
	groupId?: string;
	mediaId?: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: mediaId ?? `${id}-media`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		...(groupId ? { groupId } : {}),
	};
}

function baseTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 2 }),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [
				mediaElement({ id: "o1", startTime: 0 }),
				mediaElement({ id: "o2", startTime: 2 }),
			],
		},
	];
}

function setTracks(tracks: TimelineTrack[]) {
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
		selectedTransition: null,
		rippleEditingEnabled: false,
		mainTrackMagnetEnabled: false,
		linkedRippleEnabled: true,
	});
}

function startTimes(trackId: string): number[] {
	return (
		useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.map((element) => element.startTime) ?? []
	);
}

describe("timeline behavior toggles", () => {
	beforeEach(() => setTracks(baseTracks()));
	afterEach(() => {
		clearAutoSaveTimer();
		vi.restoreAllMocks();
	});

	it("resolves deterministic defaults for legacy projects", () => {
		useTimelineStore.getState().applyProjectTimelineSettings({
			settings: resolveProjectTimelineSettings({ settings: undefined }),
		});
		const state = useTimelineStore.getState();
		expect(state.snappingEnabled).toBe(true);
		// The magnet defaults on since the Jianying-alignment work (docs/task/
		// timeline-rules-vs-jianying); projects that persisted an explicit
		// false keep it via the settings spread.
		expect(state.mainTrackMagnetEnabled).toBe(true);
		expect(state.linkedRippleEnabled).toBe(true);

		useTimelineStore.getState().applyProjectTimelineSettings({
			settings: resolveProjectTimelineSettings({
				settings: { mainTrackMagnetEnabled: true },
			}),
		});
		expect(useTimelineStore.getState().mainTrackMagnetEnabled).toBe(true);
		expect(useTimelineStore.getState().snappingEnabled).toBe(true);
	});

	describe("main-track magnet", () => {
		it("closes the gap on main-track deletion even outside ripple mode", () => {
			useTimelineStore.setState({ mainTrackMagnetEnabled: true });
			useTimelineStore.getState().removeElementFromTrack("main", "a");

			expect(startTimes("main")).toEqual([0]);
			// A non-main deletion keeps its gap: the magnet is main-track only.
			useTimelineStore.getState().removeElementFromTrack("overlay", "o1");
			expect(startTimes("overlay")).toEqual([2]);
		});

		it("does not ripple the main track when the magnet is off", () => {
			useTimelineStore.getState().removeElementFromTrack("main", "a");
			expect(startTimes("main")).toEqual([2]);
		});

		it("never edits a locked main track: the lock wins over the magnet", () => {
			const tracks = baseTracks().map((track) =>
				track.id === "main" ? { ...track, locked: true } : track
			);
			setTracks(tracks);
			useTimelineStore.setState({ mainTrackMagnetEnabled: true });

			useTimelineStore.getState().removeElementFromTrack("main", "a");
			expect(startTimes("main")).toEqual([0, 2]);
			expect(useTimelineStore.getState().history).toHaveLength(0);
		});
	});

	describe("linked ripple", () => {
		it("keeps ripple on the edited track when disabled", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [
						mediaElement({
							id: "v",
							startTime: 0,
							groupId: "sep",
							mediaId: "m",
						}),
						mediaElement({ id: "v2", startTime: 2 }),
					],
				},
				{
					id: "audio",
					name: "Audio",
					type: "audio",
					elements: [
						mediaElement({
							id: "a",
							startTime: 0,
							groupId: "sep",
							mediaId: "m",
						}),
						mediaElement({ id: "a2", startTime: 2 }),
					],
				},
			];
			setTracks(tracks);
			useTimelineStore.setState({
				rippleEditingEnabled: true,
				linkedRippleEnabled: false,
			});

			useTimelineStore.getState().removeElementFromTrackWithRipple("main", "v");

			expect(startTimes("main")).toEqual([0]);
			// The linked audio lane holds because linked ripple is off.
			expect(startTimes("audio")).toEqual([0, 2]);
		});
	});

	it("persists toggles onto the active project", async () => {
		const saveProject = vi
			.spyOn(storageService, "saveProject")
			.mockResolvedValue(undefined);
		useProjectStore.setState({
			activeProject: {
				id: "project-1",
				name: "P",
				thumbnail: "",
				createdAt: new Date(),
				updatedAt: new Date(),
				scenes: [],
				currentSceneId: "scene-1",
				canvasSize: { width: 1920, height: 1080 },
				canvasMode: "preset",
			} as unknown as TProject,
		});

		useTimelineStore.getState().toggleMainTrackMagnet();
		await vi.waitFor(() => {
			expect(saveProject).toHaveBeenCalled();
		});

		const savedProject = saveProject.mock.calls[0][0].project;
		expect(savedProject.timeline).toEqual({
			snappingEnabled: true,
			mainTrackMagnetEnabled: true,
			linkedRippleEnabled: true,
		});
		expect(useProjectStore.getState().activeProject?.timeline).toEqual(
			savedProject.timeline
		);

		useProjectStore.setState({ activeProject: null });
	});
});
