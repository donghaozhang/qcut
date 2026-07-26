import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDefaultAudioMixBus,
	createDefaultProjectAudioMixSettings,
} from "@/lib/audio/audio-mix-settings";
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

function projectWithAudioMix(): TProject {
	const audioMix = createDefaultProjectAudioMixSettings();
	audioMix.master.gainDb = -6;
	audioMix.buses.push({
		...createDefaultAudioMixBus({ id: "bus-voice", name: "Voice" }),
		pan: -0.25,
		muted: true,
	});
	return {
		id: "project-audio-mix",
		name: "Audio Mix Project",
		thumbnail: "",
		createdAt: new Date("2026-07-01T00:00:00.000Z"),
		updatedAt: new Date("2026-07-02T00:00:00.000Z"),
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt: new Date("2026-07-01T00:00:00.000Z"),
				updatedAt: new Date("2026-07-01T00:00:00.000Z"),
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
		fps: 30,
		audioMix,
	};
}

describe("storage service project audio mix persistence", () => {
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

	it("round-trips audioMix through save and load", async () => {
		const project = projectWithAudioMix();

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.audioMix).toEqual(project.audioMix);
		expect(loaded?.audioMix?.master.gainDb).toBe(-6);
		expect(loaded?.audioMix?.buses[0]).toMatchObject({
			id: "bus-voice",
			pan: -0.25,
			muted: true,
		});
	});

	it("keeps audioMix undefined for projects that never configured it", async () => {
		const project = projectWithAudioMix();
		project.audioMix = undefined;

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.audioMix).toBeUndefined();
	});
});
