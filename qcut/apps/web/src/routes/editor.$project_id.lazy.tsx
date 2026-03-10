import { platform } from "@qcut/platform-core";
import React, { useEffect, useRef } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { EditorHeader } from "@/components/editor-header";
import { usePanelStore } from "@/stores/editor/panel-store";
import { EditorProvider } from "@/components/editor-provider";
import { useProjectStore, NotFoundError } from "@/stores/project-store";
import { usePlaybackControls } from "@/hooks/timeline/use-playback-controls";
import { useSaveOnVisibilityChange } from "@/hooks/use-save-on-visibility-change";
import { useProjectJsonSync } from "@/hooks/use-project-json-sync";
import { Onboarding } from "@/components/onboarding";
import { debugError, debugLog } from "@/lib/debug/debug-config";
import { useSkillsStore } from "@/stores/skills-store";
import { cleanupPtyOnEditorExit } from "@/lib/debug/pty-session-cleanup";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { useClaudeProjectUpdates } from "@/hooks/use-claude-project-updates";
import "@/lib/debug/ios-console-bridge"; // iPad console log capture (auto-gates behind DEV)
import "@/lib/stickers/debug-sticker-overlay"; // Load debug utilities
import "@/lib/stickers/sticker-test-helper"; // Load sticker test helper
import "@/lib/stickers/sticker-persistence-debug"; // Load persistence debug
import {
	DefaultLayout,
	MediaLayout,
	InspectorLayout,
	VerticalPreviewLayout,
} from "@/components/editor/panel-layouts";

export const Route = createLazyFileRoute("/editor/$project_id")({
	component: EditorPage,
});

/**
 * Render the editor UI for a project and manage project lifecycle side effects such as loading projects, initializing the Claude terminal, syncing project JSON, and setting up playback and panel layouts.
 *
 * @returns The Editor page React element containing the header, the currently selected layout, and the onboarding component
 */
function EditorPage() {
	const navigate = useNavigate();
	const { project_id } = Route.useParams();
	const setActiveTab = useMediaPanelStore((state) => state.setActiveTab);
	const { setProjectContext, setWorkingDirectory, ensureAutoConnected } =
		usePtyTerminalStore();

	useClaudeProjectUpdates({ projectId: project_id });

	useEffect(() => {
		return () => {
			cleanupPtyOnEditorExit();
		};
	}, []);

	const {
		activeProject,
		loadProject,
		createNewProject,
		isInvalidProjectId,
		markProjectIdAsInvalid,
	} = useProjectStore();

	// Save timeline when page becomes hidden (tab switch, close, etc.)
	useSaveOnVisibilityChange();

	// Auto-sync project.json on any store change (debounced 1s)
	useProjectJsonSync();

	// Load skills when project changes
	const { loadSkills } = useSkillsStore();
	useEffect(() => {
		if (activeProject?.id) {
			loadSkills(activeProject.id);
		}
	}, [activeProject?.id, loadSkills]);

	// Track current load promise to handle concurrent loads properly
	const currentLoadPromiseRef = useRef<Promise<void> | null>(null);
	// Track which project_id is currently being loaded to avoid duplicate loads
	const inFlightProjectIdRef = useRef<string | null>(null);

	useEffect(() => {
		const abortController = new AbortController();

		const init = async () => {
			debugLog(`[Editor] init called for project: ${project_id}`);

			if (!project_id || abortController.signal.aborted) {
				debugLog("[Editor] Early return - no project_id or aborted");
				return;
			}

			if (activeProject?.id === project_id) {
				debugLog(
					`[Editor] Early return - project already loaded: ${activeProject.id}`
				);
				return;
			}

			if (isInvalidProjectId(project_id)) {
				debugLog("[Editor] Early return - invalid project ID");
				return;
			}

			// Prevent duplicate loads for the same project_id
			if (inFlightProjectIdRef.current === project_id) {
				debugLog(
					`[Editor] Early return - already loading project: ${project_id}`
				);
				return;
			}

			// Wait for any previous load to complete before starting a new one
			if (currentLoadPromiseRef.current) {
				if (inFlightProjectIdRef.current === project_id) {
					debugLog(
						`[Editor] Early return - already initializing same project: ${project_id}`
					);
					return;
				}
				debugLog(
					`[Editor] Waiting for previous load to complete before loading: ${project_id}`
				);
				try {
					await currentLoadPromiseRef.current;
				} catch {
					// Previous load handled its error path; continue.
				}
				// Check if we were aborted while waiting
				if (abortController.signal.aborted) {
					debugLog("[Editor] Aborted while waiting for previous load");
					return;
				}
				// Re-check after waiting in case the previous load already satisfied this project
				const latestActiveProjectId =
					useProjectStore.getState().activeProject?.id;
				if (
					latestActiveProjectId === project_id ||
					inFlightProjectIdRef.current === project_id
				) {
					debugLog(
						`[Editor] Early return - project became loaded while waiting: ${project_id}`
					);
					return;
				}
			}

			debugLog(`[Editor] Starting project load: ${project_id}`);

			// Create load promise for this specific project
			inFlightProjectIdRef.current = project_id;
			const loadPromise = (async () => {
				try {
					await loadProject(project_id);
					debugLog(`[Editor] Project load complete: ${project_id}`);

					if (abortController.signal.aborted) {
						debugLog(`[Editor] Load completed but was aborted: ${project_id}`);
						return;
					}
				} catch (error) {
					if (abortController.signal.aborted) {
						debugLog(`[Editor] Load failed but was aborted: ${project_id}`);
						return;
					}

					const isNotFound = error instanceof NotFoundError;
					if (isNotFound) {
						markProjectIdAsInvalid(project_id);
						try {
							const newId = await createNewProject("Untitled Project");
							if (abortController.signal.aborted) return;

							navigate({
								to: "/editor/$project_id",
								params: { project_id: newId },
							});
						} catch (e) {
							debugError(
								"[Editor] createNewProject failed after NotFoundError",
								e
							);
						}
					} else {
						// Re-throw to allow retries on non-not-found errors
						throw error;
					}
				} finally {
					if (inFlightProjectIdRef.current === project_id) {
						inFlightProjectIdRef.current = null;
					}
				}
			})();

			currentLoadPromiseRef.current = loadPromise;

			try {
				await loadPromise;
			} finally {
				// Clear the promise ref if this was the current load
				if (currentLoadPromiseRef.current === loadPromise) {
					currentLoadPromiseRef.current = null;
				}
			}
		};

		init();

		return () => {
			debugLog(`[Editor] Cleanup - aborting loads for project: ${project_id}`);
			abortController.abort();
			// Don't clear currentLoadPromiseRef here - let it complete naturally
		};
	}, [
		project_id,
		activeProject?.id,
		loadProject,
		createNewProject,
		isInvalidProjectId,
		markProjectIdAsInvalid,
		navigate,
	]);

	useEffect(() => {
		let isCancelled = false;

		const initializeClaudeTerminal = async () => {
			if (!project_id || activeProject?.id !== project_id) {
				return;
			}

			setActiveTab("pty");

			let projectRoot = "";
			try {
				projectRoot =
					(await platform().projectFolder?.getRoot?.(project_id)) || "";
			} catch {
				projectRoot = "";
			}

			if (isCancelled) {
				return;
			}

			if (projectRoot) {
				setWorkingDirectory(projectRoot);
			}

			setProjectContext({
				projectId: project_id,
				workingDirectory: projectRoot || undefined,
			});

			try {
				await ensureAutoConnected({
					cwd: projectRoot || undefined,
					projectId: project_id,
				});
			} catch (error) {
				debugError("[Editor] Failed to auto-connect Claude terminal", error);
			}
		};

		initializeClaudeTerminal().catch((error) => {
			debugError("[Editor] Terminal initialization error", error);
		});

		return () => {
			isCancelled = true;
		};
	}, [
		activeProject?.id,
		ensureAutoConnected,
		project_id,
		setActiveTab,
		setProjectContext,
		setWorkingDirectory,
	]);

	// Get active preset and reset counter for panel layouts
	const activePreset = usePanelStore((s) => s.activePreset) ?? "default";
	const resetCounter = usePanelStore((s) => s.resetCounter) ?? 0;

	// Layout selection complete

	usePlaybackControls();

	const layouts = {
		media: <MediaLayout resetCounter={resetCounter} />,
		inspector: <InspectorLayout resetCounter={resetCounter} />,
		"vertical-preview": <VerticalPreviewLayout resetCounter={resetCounter} />,
		default: <DefaultLayout resetCounter={resetCounter} />,
	};

	const selectedLayout = layouts[activePreset] || layouts.default;

	return (
		<EditorProvider>
			<div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
				<EditorHeader />
				<div className="flex-1 min-h-0 min-w-0">{selectedLayout}</div>
				<Onboarding />
			</div>
		</EditorProvider>
	);
}
