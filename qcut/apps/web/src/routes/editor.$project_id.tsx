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
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackControls } from "@/hooks/use-playback-controls";
import { Onboarding } from "@/components/onboarding";
import { ExportDialog } from "@/components/export-dialog";

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

  // Prevent duplicate loads
  const handledProjectIds = useRef<Set<string>>(new Set());
  const isInitializingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!project_id || cancelled) return;
      if (isInitializingRef.current) return;
      if (activeProject?.id === project_id) return;
      if (isInvalidProjectId(project_id)) return;
      if (handledProjectIds.current.has(project_id)) return;

      isInitializingRef.current = true;
      handledProjectIds.current.add(project_id);
      try {
        await loadProject(project_id);
        if (cancelled) return;
      } catch (error) {
        const isNotFound =
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("does not exist") ||
            error.message.includes("Project not found"));
        if (isNotFound) {
          markProjectIdAsInvalid(project_id);
          try {
            const newId = await createNewProject("Untitled Project");
            if (cancelled) return;
            navigate({
              to: "/editor/$project_id",
              params: { project_id: newId },
            });
          } catch {
            // noop
          }
        } else {
          handledProjectIds.current.delete(project_id);
        }
      } finally {
        isInitializingRef.current = false;
      }
    };
    init();
    return () => {
      cancelled = true;
      isInitializingRef.current = false;
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

  // Use selector-based subscriptions to minimize re-renders
  const toolsPanel = usePanelStore((s) => s.toolsPanel);
  const previewPanel = usePanelStore((s) => s.previewPanel);
  const propertiesPanel = usePanelStore((s) => s.propertiesPanel);
  const mainContent = usePanelStore((s) => s.mainContent);
  const timeline = usePanelStore((s) => s.timeline);
  const setToolsPanel = usePanelStore((s) => s.setToolsPanel);
  const setPreviewPanel = usePanelStore((s) => s.setPreviewPanel);
  const setPropertiesPanel = usePanelStore((s) => s.setPropertiesPanel);
  const setMainContent = usePanelStore((s) => s.setMainContent);
  const setTimeline = usePanelStore((s) => s.setTimeline);

  usePlaybackControls();

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
        <ExportDialog />
      </div>
    </EditorProvider>
  );
}
