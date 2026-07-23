import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectApi = vi.hoisted(() => {
	const state: {
		callback?: (projectId: string, settings: Record<string, unknown>) => void;
	} = {};
	return {
		state,
		onUpdated: vi.fn(
			(
				callback: (projectId: string, settings: Record<string, unknown>) => void
			) => {
				state.callback = callback;
			}
		),
		removeListeners: vi.fn(),
	};
});

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		claude: {
			project: {
				onUpdated: projectApi.onUpdated,
				removeListeners: projectApi.removeListeners,
			},
		},
	}),
}));

import { useClaudeProjectUpdates } from "@/hooks/use-claude-project-updates";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";
import type { TProject } from "@/types/project";

const originalSaveCurrentProject =
	useProjectStore.getState().saveCurrentProject;

function createProject({
	width = 1280,
	height = 720,
}: {
	width?: number;
	height?: number;
} = {}): TProject {
	const now = new Date();
	return {
		id: "project-1",
		name: "Aspect Test",
		thumbnail: "",
		createdAt: now,
		updatedAt: now,
		scenes: [
			{
				id: "scene-1",
				name: "Main Scene",
				isMain: true,
				createdAt: now,
				updatedAt: now,
			},
		],
		currentSceneId: "scene-1",
		backgroundColor: "#000000",
		backgroundType: "color",
		blurIntensity: 8,
		bookmarks: [],
		fps: 30,
		canvasSize: { width, height },
		canvasMode: "custom",
	};
}

describe("useClaudeProjectUpdates", () => {
	const saveCurrentProject = vi.fn(async () => {});

	beforeEach(() => {
		projectApi.state.callback = undefined;
		projectApi.onUpdated.mockClear();
		projectApi.removeListeners.mockClear();
		saveCurrentProject.mockClear();
		useProjectStore.setState({
			activeProject: null,
			saveCurrentProject,
		});
		useEditorStore.setState({
			canvasSize: { width: 1920, height: 1080 },
			canvasMode: "preset",
		});
	});

	afterEach(() => {
		useProjectStore.setState({
			activeProject: null,
			saveCurrentProject: originalSaveCurrentProject,
		});
	});

	it("restores the project canvas when the project loads", () => {
		const { unmount } = renderHook(() =>
			useClaudeProjectUpdates({ projectId: "project-1" })
		);

		act(() => {
			useProjectStore.setState({
				activeProject: createProject({ width: 1080, height: 1920 }),
			});
		});

		expect(useEditorStore.getState().canvasSize).toEqual({
			width: 1080,
			height: 1920,
		});
		expect(useEditorStore.getState().canvasMode).toBe("custom");
		unmount();
	});

	it("applies a normalized CLI update that arrives before project loading", async () => {
		const { unmount } = renderHook(() =>
			useClaudeProjectUpdates({ projectId: "project-1" })
		);

		act(() => {
			projectApi.state.callback?.("project-1", {
				width: 405,
				height: 720,
				aspectRatio: "9:16",
			});
			useProjectStore.setState({
				activeProject: createProject(),
			});
		});

		expect(useEditorStore.getState().canvasSize).toEqual({
			width: 405,
			height: 720,
		});
		expect(useProjectStore.getState().activeProject?.canvasSize).toEqual({
			width: 405,
			height: 720,
		});
		await waitFor(() => expect(saveCurrentProject).toHaveBeenCalledOnce());
		unmount();
	});
});
