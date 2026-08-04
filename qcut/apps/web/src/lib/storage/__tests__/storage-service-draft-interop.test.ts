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

function createProject(): TProject {
	const createdAt = new Date("2026-08-04T00:00:00.000Z");
	return {
		id: "project-draft-interop",
		name: "Imported CapCut Draft",
		thumbnail: "",
		createdAt,
		updatedAt: createdAt,
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt,
				updatedAt: createdAt,
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "custom",
		draftInterop: {
			schemaVersion: 1,
			importId: "import-1",
			profileId: "capcut-desktop-8.1-plaintext",
			bundleDigest: "b".repeat(64),
			sourceFileSha256: ["a".repeat(64)],
			writeback: {
				status: "unavailable",
				reason: "envelope-not-captured",
			},
		},
	};
}

describe("storage service draft interop persistence", () => {
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

	it("round-trips the foreign draft association", async () => {
		const project = createProject();

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.draftInterop).toEqual(project.draftInterop);
	});

	it("keeps draft interop undefined for legacy projects", async () => {
		const project = createProject();
		project.draftInterop = undefined;

		await storageService.saveProject({ project });
		const loaded = await storageService.loadProject({ id: project.id });

		expect(loaded?.draftInterop).toBeUndefined();
	});
});
