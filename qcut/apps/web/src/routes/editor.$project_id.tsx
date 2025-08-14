import React, { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { MediaPanel } from "@/components/editor/media-panel";
import { PropertiesPanel } from "@/components/editor/properties-panel";
import { Timeline } from "@/components/editor/timeline";
import { PreviewPanel } from "@/components/editor/preview-panel";
import { EditorHeader } from "@/components/editor-header";
import { usePanelStore } from "@/stores/panel-store";
import { EditorProvider } from "@/components/editor-provider";
import { useProjectStore, NotFoundError } from "@/stores/project-store";
import { usePlaybackControls } from "@/hooks/use-playback-controls";
import { Onboarding } from "@/components/onboarding";
import { debugError, debugLog } from "@/lib/debug-config";

export const Route = createFileRoute("/editor/$project_id")({
  component: EditorPage,
});

function EditorPage() {
  const navigate = useNavigate();
  const { project_id } = Route.useParams();

  const {
    activeProject,
    loadProject,
    createNewProject,
    isInvalidProjectId,
    markProjectIdAsInvalid,
  } = useProjectStore();

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
        debugLog(`[Editor] Early return - already loading project: ${project_id}`);
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

  // Use selector-based subscriptions to minimize re-renders with fallback defaults
  const toolsPanel = usePanelStore((s) => s.toolsPanel) ?? 20;
  const previewPanel = usePanelStore((s) => s.previewPanel) ?? 55;
  const propertiesPanel = usePanelStore((s) => s.propertiesPanel) ?? 25;
  const mainContent = usePanelStore((s) => s.mainContent) ?? 70;
  const timeline = usePanelStore((s) => s.timeline) ?? 30;
  const setToolsPanel = usePanelStore((s) => s.setToolsPanel);
  const setPreviewPanel = usePanelStore((s) => s.setPreviewPanel);
  const setPropertiesPanel = usePanelStore((s) => s.setPropertiesPanel);
  const setMainContent = usePanelStore((s) => s.setMainContent);
  const setTimeline = usePanelStore((s) => s.setTimeline);

  usePlaybackControls();

  // Ensure panels are normalized on mount
  const normalizeHorizontalPanels = usePanelStore(
    (s) => s.normalizeHorizontalPanels
  );
  useEffect(() => {
    // Normalize panels after a short delay to ensure they're initialized
    const timer = setTimeout(() => {
      normalizeHorizontalPanels();
    }, 100);
    return () => clearTimeout(timer);
  }, [normalizeHorizontalPanels]);

  return (
    <EditorProvider>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <EditorHeader />
        <div className="flex-1 min-h-0 min-w-0">
          <ResizablePanelGroup
            direction="vertical"
            className="h-full w-full gap-[0.18rem]"
          >
            <ResizablePanel
              defaultSize={mainContent}
              minSize={30}
              maxSize={85}
              onResize={setMainContent}
              className="min-h-0"
            >
              <ResizablePanelGroup
                direction="horizontal"
                className="h-full w-full gap-[0.19rem] px-2"
              >
                <ResizablePanel
                  defaultSize={toolsPanel}
                  minSize={15}
                  maxSize={40}
                  onResize={setToolsPanel}
                  className="min-w-0"
                >
                  <MediaPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  defaultSize={previewPanel}
                  minSize={30}
                  onResize={setPreviewPanel}
                  className="min-w-0 min-h-0 flex-1"
                >
                  <PreviewPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  defaultSize={propertiesPanel}
                  minSize={15}
                  maxSize={40}
                  onResize={setPropertiesPanel}
                  className="min-w-0"
                >
                  <PropertiesPanel />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              defaultSize={timeline}
              minSize={15}
              maxSize={70}
              onResize={setTimeline}
              className="min-h-0 px-2 pb-2"
            >
              <Timeline />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <Onboarding />
      </div>
    </EditorProvider>
  );
}
