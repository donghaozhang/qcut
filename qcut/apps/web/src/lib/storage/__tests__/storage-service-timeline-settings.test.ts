import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TProject } from "@/types/project";
import { storageService } from "../storage-service";
import type { SerializedProject } from "../types";

function createProjectsAdapterStub() {
	const store = new Map<string, SerializedProject>();
	return {
		store,
		adapter: {
			get: vi.fn(async (id: string) => store.get(id) ?? null),
			set: vi.fn(async (id: string, value: SerializedProject) => {
				store.set(id, value);
			}),
			list: vi.fn(async () => [...store.keys()]),
			remove: vi.fn(async (id: string) => {
				store.delete(id);
			}),
			clear: vi.fn(async () => {
				store.clear();
			}),
		},
	};
}

function projectWithTimelineSettings(): TProject {
	return {
		id: "project-timeline-settings",
		name: "Timeline Settings Project",
		thumbnail: "",
		createdAt: new Date("2026-08-01T00:00:00.000Z"),
		updatedAt: new Date("2026-08-02T00:00:00.000Z"),
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt: new Date("2026-08-01T00:00:00.000Z"),
				updatedAt: new Date("2026-08-01T00:00:00.000Z"),
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
		fps: 24,
		timeline: {
			snappingEnabled: false,
			mainTrackMagnetEnabled: true,
			linkedRippleEnabled: true,
		},
	};
}

describe("storage service project timeline settings persistence", () => {
	let stub: ReturnType<typeof createProjectsAdapterStub>;

	beforeEach(() => {
		stub = createProjectsAdapterStub();
		const internals = storageService as unknown as {
			projectsAdapter: typeof stub.adapter;
			initializeStorage: () => Promise<void>;
		};
		internals.projectsAdapter = stub.adapter;
		vi.spyOn(internals, "initializeStorage").mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("round-trips timeline behavior settings through save and load", async () => {
		const project = projectWithTimelineSettings();

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.timeline).toEqual(project.timeline);
	});

	it("keeps timeline settings undefined for legacy projects", async () => {
		const project = projectWithTimelineSettings();
		project.timeline = undefined;

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.timeline).toBeUndefined();
	});
});
