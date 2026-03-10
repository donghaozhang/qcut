import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { initPlatform, type PlatformAPI } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import { useProjectStore } from "@/stores/project-store";
import { TestDataFactory } from "@/test/fixtures/factory";
import { waitFor } from "@testing-library/react";

beforeAll(() => {
	// Use web adapter but nullify desktop-only stubs that code checks with ?.
	// so optional chaining correctly skips them instead of hitting the proxy.
	const web = createWebAdapter();
	const adapter: PlatformAPI = {
		...web,
		projectJson: undefined as any,
		projectFolder: undefined as any,
	};
	initPlatform(adapter);
});

// Mock the media store loader to prevent dynamic import issues
vi.mock("@/stores/media/media-store-loader", () => ({
	getMediaStore: vi.fn(async () => ({
		useMediaStore: {
			getState: () => ({
				mediaItems: [],
				isLoading: false,
				hasInitialized: true,
				loadProjectMedia: vi.fn().mockResolvedValue(undefined),
				clearProjectMedia: vi.fn().mockResolvedValue(undefined),
				clearAllMedia: vi.fn(),
				addMediaItem: vi.fn().mockResolvedValue("mock-media-id"),
				removeMediaItem: vi.fn().mockResolvedValue(undefined),
				addGeneratedImages: vi.fn().mockResolvedValue(undefined),
			}),
		},
	})),
}));

// Mock storage service
vi.mock("@/lib/storage/storage-service", () => ({
	storageService: {
		saveProject: vi.fn().mockResolvedValue(undefined),
		loadProject: vi.fn().mockResolvedValue(null),
		loadAllProjects: vi.fn().mockResolvedValue([]),
		deleteProject: vi.fn().mockResolvedValue(undefined),
		loadAllMediaItems: vi.fn().mockResolvedValue([]),
		saveMediaItem: vi.fn().mockResolvedValue(undefined),
		deleteMediaItem: vi.fn().mockResolvedValue(undefined),
	},
}));

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => (key in store ? store[key] : null),
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		clear: () => {
			store = {};
		},
		removeItem: (key: string) => {
			const { [key]: _omitted, ...rest } = store;
			store = rest;
		},
	};
})();

global.localStorage = localStorageMock as Storage;

describe("Project Creation", () => {
	beforeEach(() => {
		useProjectStore.setState({
			activeProject: null,
			savedProjects: [],
			isLoading: true,
			isInitialized: false,
			invalidProjectIds: new Set<string>(),
		});
		localStorageMock.clear();
	});

	it("creates new project", async () => {
		const store = useProjectStore.getState();

		// Create the project
		const projectIdPromise = store.createNewProject("Test Project");

		// Wait for the project to be created with a longer timeout
		const projectId = await waitFor(
			async () => {
				const id = await projectIdPromise;
				expect(id).toBeDefined();
				return id;
			},
			{ timeout: 10_000 } // 10 second timeout
		);

		expect(projectId).toBeTruthy();

		// Check if project is set as active
		await waitFor(() => {
			const updatedStore = useProjectStore.getState();
			expect(updatedStore.activeProject?.id).toBe(projectId);
			expect(updatedStore.activeProject?.name).toBe("Test Project");
		});
	}, 10_000); // Set test timeout to 10 seconds

	it("loads project from storage", async () => {
		const mockProject = TestDataFactory.createProject({
			id: "test-project-id",
			name: "Loaded Project",
		});

		// Store the project in mock localStorage
		const projectsData = { [mockProject.id]: mockProject };
		localStorageMock.setItem(
			"video-editor-projects_projects_list",
			JSON.stringify(projectsData)
		);

		// Configure the storage service mock to return the project
		const { storageService } = await import("@/lib/storage/storage-service");
		(storageService.loadProject as any).mockResolvedValue(mockProject);

		// Load the project
		const store = useProjectStore.getState();
		await store.loadProject(mockProject.id);

		// Check if project is loaded
		await waitFor(() => {
			const updatedStore = useProjectStore.getState();
			expect(updatedStore.activeProject?.id).toBe(mockProject.id);
			expect(updatedStore.activeProject?.name).toBe("Loaded Project");
		});
	});
});
