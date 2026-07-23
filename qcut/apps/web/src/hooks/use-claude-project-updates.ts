import { platform } from "@qcut/platform-core";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";

interface ClaudeProjectSettingsUpdate {
	name?: string;
	width?: number;
	height?: number;
	fps?: number;
	aspectRatio?: string;
	backgroundColor?: string;
	canvasSize?: {
		width?: number;
		height?: number;
	};
}

function positiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.round(value)
		: undefined;
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

		let pendingSettings: ClaudeProjectSettingsUpdate | undefined;
		let saveQueue = Promise.resolve();

		const applySettings = (settings?: ClaudeProjectSettingsUpdate): boolean => {
			try {
				const projectStore = useProjectStore.getState();
				const activeProject = projectStore.activeProject;
				if (!activeProject || activeProject.id !== projectId) {
					return false;
				}

				if (!settings) {
					useEditorStore
						.getState()
						.setCanvasSize(activeProject.canvasSize, activeProject.canvasMode);
					return true;
				}

				const width =
					positiveNumber(settings.width) ??
					positiveNumber(settings.canvasSize?.width) ??
					activeProject.canvasSize.width;
				const height =
					positiveNumber(settings.height) ??
					positiveNumber(settings.canvasSize?.height) ??
					activeProject.canvasSize.height;
				const fps = positiveNumber(settings.fps) ?? activeProject.fps;
				const dimensionsChanged =
					width !== activeProject.canvasSize.width ||
					height !== activeProject.canvasSize.height;
				const canvasMode = dimensionsChanged
					? "custom"
					: activeProject.canvasMode;
				const nextProject = {
					...activeProject,
					name:
						typeof settings.name === "string" && settings.name.trim()
							? settings.name.trim()
							: activeProject.name,
					fps,
					backgroundColor:
						settings.backgroundColor ?? activeProject.backgroundColor,
					canvasSize: { width, height },
					canvasMode,
					updatedAt: new Date(),
				};

				useProjectStore.setState({ activeProject: nextProject });
				useEditorStore.getState().setCanvasSize({ width, height }, canvasMode);
				saveQueue = saveQueue
					.catch(() => undefined)
					.then(async () => {
						if (useProjectStore.getState().activeProject?.id === projectId) {
							await useProjectStore.getState().saveCurrentProject();
						}
					});
				return true;
			} catch {
				// Ignore renderer sync failures; HTTP update already persisted to disk.
				return false;
			}
		};

		const handleProjectUpdated = (
			updatedProjectId: string,
			settings: ClaudeProjectSettingsUpdate
		) => {
			if (updatedProjectId !== projectId) return;
			if (!applySettings(settings)) {
				pendingSettings = { ...pendingSettings, ...settings };
			}
		};

		const unsubscribeProjectStore = useProjectStore.subscribe(
			(state, previousState) => {
				if (state.activeProject?.id !== projectId) return;

				const settings = pendingSettings;
				pendingSettings = undefined;
				if (settings) {
					applySettings(settings);
					return;
				}

				const previousProject = previousState.activeProject;
				if (
					previousProject?.id !== projectId ||
					previousProject.canvasSize.width !==
						state.activeProject.canvasSize.width ||
					previousProject.canvasSize.height !==
						state.activeProject.canvasSize.height ||
					previousProject.canvasMode !== state.activeProject.canvasMode
				) {
					useEditorStore
						.getState()
						.setCanvasSize(
							state.activeProject.canvasSize,
							state.activeProject.canvasMode
						);
				}
			}
		);

		applySettings();

		try {
			projectApi.onUpdated(handleProjectUpdated);
		} catch {
			unsubscribeProjectStore();
			return;
		}

		return () => {
			unsubscribeProjectStore();
			try {
				projectApi.removeListeners?.();
			} catch {
				// No-op cleanup
			}
		};
	}, [projectId]);
}
