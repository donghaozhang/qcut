import { platform } from "@qcut/platform-core";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";

interface ClaudeProjectSettingsUpdate {
	name?: string;
	width?: number;
	height?: number;
	fps?: number;
	backgroundColor?: string;
}

/**
 * Subscribes to platform Claude project update events for the given project and applies incoming settings to the active project and editor canvas.
 *
 * @param projectId - The project identifier to listen for updates for; if falsy no subscription is created
 */
export function useClaudeProjectUpdates({
	projectId,
}: {
	projectId: string;
}): void {
	useEffect(() => {
		if (!projectId) {
			return;
		}

		const projectApi = platform().claude?.project;
		if (!projectApi?.onUpdated) {
			return;
		}

		const handleProjectUpdated = (
			updatedProjectId: string,
			settings: ClaudeProjectSettingsUpdate
		) => {
			try {
				if (updatedProjectId !== projectId) {
					return;
				}

				const activeProject = useProjectStore.getState().activeProject;
				if (!activeProject || activeProject.id !== updatedProjectId) {
					return;
				}

				const width = settings.width ?? activeProject.canvasSize.width;
				const height = settings.height ?? activeProject.canvasSize.height;
				const nextProject = {
					...activeProject,
					name: settings.name ?? activeProject.name,
					fps: settings.fps ?? activeProject.fps,
					backgroundColor:
						settings.backgroundColor ?? activeProject.backgroundColor,
					canvasSize: { width, height },
					updatedAt: new Date(),
				};

				useProjectStore.setState({ activeProject: nextProject });
				useEditorStore.getState().setCanvasSize({ width, height });
			} catch {
				// Ignore renderer sync failures; HTTP update already persisted to disk.
			}
		};

		try {
			projectApi.onUpdated(handleProjectUpdated);
		} catch {
			return;
		}

		return () => {
			try {
				projectApi.removeListeners?.();
			} catch {
				// No-op cleanup
			}
		};
	}, [projectId]);
}
