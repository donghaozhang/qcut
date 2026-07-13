import { describe, it, expect, beforeEach } from "vitest";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { resetAllStores } from "@/test/utils/store-helpers";

describe("Store Initialization", () => {
	it("initializes media store with empty state", async () => {
		await resetAllStores();
		const state = useMediaStore.getState();
		expect(state.mediaItems).toEqual([]);
		expect(state.isLoading).toBe(false);
	});

	it("initializes timeline store with default state", async () => {
		await resetAllStores();
		const state = useTimelineStore.getState();
		// Timeline store creates a default main track on initialization
		expect(state.tracks).toHaveLength(1);
		expect(state.tracks[0].isMain).toBe(true);
		expect(state.tracks[0].name).toBe("主轨道");
		expect(state.history).toEqual([]);
		expect(state.redoStack).toEqual([]);
	});

	it("initializes project store with null project", async () => {
		await resetAllStores();
		const state = useProjectStore.getState();
		expect(state.activeProject).toBeNull();
		expect(state.savedProjects).toEqual([]);
		expect(state.isInitialized).toBe(false);
	});
});
