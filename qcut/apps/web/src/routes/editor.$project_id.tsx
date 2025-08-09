import React, { useEffect, useRef, useState } from "react";
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
// SUBTASK 2: Removed Zustand panel store import to test useSyncExternalStore fix
// import { usePanelStore } from "@/stores/panel-store";
import { useProjectStore } from "@/stores/project-store";
import { EditorProvider } from "@/components/editor-provider";
import { usePlaybackControls } from "@/hooks/use-playback-controls";
import { Onboarding } from "@/components/onboarding";
import { ExportDialog } from "@/components/export-dialog";
import { useExportStore } from "@/stores/export-store";

export const Route = createFileRoute("/editor/$project_id")({
  component: EditorPage,
});

function EditorPage() {
  // Add render counter
  const renderCount = useRef(0);
  renderCount.current++;
  
  // Add mount state to prevent infinite loops during initialization
  const [isMounted, setIsMounted] = useState(false);
  
  const { project_id } = Route.useParams();
  console.log(`🎯 [EditorPage] Render #${renderCount.current}, Project ID: ${project_id}, Mounted: ${isMounted}`);
  
  // SUBTASK 1: Replace Zustand panel store with local useState to test useSyncExternalStore issue
  const [panelSizes, setPanelSizes] = useState({
    toolsPanel: 20,
    previewPanel: 55, 
    propertiesPanel: 25,
    mainContent: 70,
    timeline: 30,
    aiPanelWidth: 22,
    aiPanelMinWidth: 4
  });

  const { toolsPanel, previewPanel, propertiesPanel, mainContent, timeline } = panelSizes;
  
  // Local state setters to replace Zustand
  const setToolsPanel = (size: number) => setPanelSizes(prev => ({ ...prev, toolsPanel: size }));
  const setPreviewPanel = (size: number) => setPanelSizes(prev => ({ ...prev, previewPanel: size }));
  const setPropertiesPanel = (size: number) => setPanelSizes(prev => ({ ...prev, propertiesPanel: size }));
  const setMainContent = (size: number) => setPanelSizes(prev => ({ ...prev, mainContent: size }));
  const setTimeline = (size: number) => setPanelSizes(prev => ({ ...prev, timeline: size }));
  
  // Simple normalization function (no Zustand store)
  const normalizeHorizontalPanels = () => {
    const total = panelSizes.toolsPanel + panelSizes.previewPanel + panelSizes.propertiesPanel;
    if (Math.abs(total - 100) > 0.1) {
      console.log(`[LOCAL-STATE] Normalizing panels: ${total} -> 100`);
      const factor = 100 / total;
      setPanelSizes(prev => ({
        ...prev,
        toolsPanel: Math.round(prev.toolsPanel * factor * 100) / 100,
        previewPanel: Math.round(prev.previewPanel * factor * 100) / 100,
        propertiesPanel: Math.round((100 - prev.toolsPanel * factor - prev.previewPanel * factor) * 100) / 100
      }));
    }
  };
  
  console.log(`🎯 [EditorPage] Panel sizes:`, {
    toolsPanel,
    previewPanel,
    propertiesPanel,
    total: toolsPanel + previewPanel + propertiesPanel
  });
  const { isDialogOpen } = useExportStore();

  const {
    activeProject,
    loadProject,
    createNewProject,
    isInvalidProjectId,
    markProjectIdAsInvalid,
  } = useProjectStore();
  const navigate = useNavigate();
  const handledProjectIds = useRef<Set<string>>(new Set());
  const isInitializingRef = useRef<boolean>(false);

  usePlaybackControls();

  // SUBTASK 2: Simplified mount effect without Zustand normalization
  useEffect(() => {
    // No normalization needed with local state - panels are already at correct defaults
    // Enable resize handlers after a short delay to prevent any potential loops
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log('🔧 [EditorPage] Resize handlers enabled after mount (LOCAL-STATE)');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    console.log(`🎯 [EditorPage] Project loading effect triggered`, {
      project_id,
      activeProject: activeProject?.id,
      isInitializing: isInitializingRef.current
    });
    
    let isCancelled = false;

    const initProject = async () => {
      if (!project_id) {
        return;
      }

      // Prevent duplicate initialization
      if (isInitializingRef.current) {
        return;
      }

      // Check if project is already loaded
      if (activeProject?.id === project_id) {
        return;
      }

      // Check global invalid tracking first (most important for preventing duplicates)
      if (isInvalidProjectId(project_id)) {
        return;
      }

      // Check if we've already handled this project ID locally
      if (handledProjectIds.current.has(project_id)) {
        return;
      }

      // Mark as initializing to prevent race conditions
      isInitializingRef.current = true;
      handledProjectIds.current.add(project_id);

      try {
        await loadProject(project_id);

        // Check if component was unmounted during async operation
        if (isCancelled) {
          return;
        }

        // Project loaded successfully
        isInitializingRef.current = false;
      } catch (error) {
        // Check if component was unmounted during async operation
        if (isCancelled) {
          return;
        }

        // More specific error handling - only create new project for actual "not found" errors
        const isProjectNotFound =
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("does not exist") ||
            error.message.includes("Project not found"));

        if (isProjectNotFound) {
          // Mark this project ID as invalid globally BEFORE creating project
          markProjectIdAsInvalid(project_id);

          try {
            const newProjectId = await createNewProject("Untitled Project");

            // Check again if component was unmounted
            if (isCancelled) {
              return;
            }

            navigate({ to: `/editor/${newProjectId}` });
          } catch (createError) {
            console.error("Failed to create new project:", createError);
          }
        } else {
          // For other errors (storage issues, corruption, etc.), don't create new project
          console.error(
            "Project loading failed with recoverable error:",
            error
          );
          // Remove from handled set so user can retry
          handledProjectIds.current.delete(project_id);
        }

        isInitializingRef.current = false;
      }
    };

    initProject();

    // Cleanup function to cancel async operations
    return () => {
      isCancelled = true;
      isInitializingRef.current = false;
    };
  }, [
    project_id,
    loadProject,
    createNewProject,
    navigate,
    isInvalidProjectId,
    markProjectIdAsInvalid,
    activeProject?.id,
  ]);

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
              minSize={30}
              maxSize={85}
              onResize={isMounted ? (size) => setPanelSizes(prev => ({ ...prev, mainContent: size })) : undefined}
              className="min-h-0"
            >
              {/* Main content area */}
              <ResizablePanelGroup
                direction="horizontal"
                className="h-full w-full gap-[0.19rem] px-2"
              >
                {/* Tools Panel */}
                <ResizablePanel
                  minSize={15}
                  maxSize={40}
                  onResize={isMounted ? (size) => setPanelSizes(prev => ({ ...prev, toolsPanel: size })) : undefined}
                  className="min-w-0"
                >
                  <MediaPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Preview Area */}
                <ResizablePanel
                  minSize={30}
                  maxSize={70}
                  onResize={isMounted ? (size) => setPanelSizes(prev => ({ ...prev, previewPanel: size })) : undefined}
                  className="min-w-0 min-h-0 flex-1"
                >
                  <PreviewPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  minSize={15}
                  maxSize={40}
                  onResize={isMounted ? (size) => setPanelSizes(prev => ({ ...prev, propertiesPanel: size })) : undefined}
                  className="min-w-0"
                >
                  <div
                    className="h-full"
                    style={{ borderRadius: "0.375rem", overflow: "hidden" }}
                  >
                    {isDialogOpen ? <ExportDialog /> : <PropertiesPanel />}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Timeline */}
            <ResizablePanel
              minSize={15}
              maxSize={70}
              onResize={isMounted ? (size) => setPanelSizes(prev => ({ ...prev, timeline: size })) : undefined}
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
