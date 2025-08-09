import React, { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
// SUBTASK 6: Removed react-resizable-panels - replaced with CSS Grid to fix infinite loop
// import {
//   ResizablePanelGroup,
//   ResizablePanel,
//   ResizableHandle,
// } from "@/components/ui/resizable";
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
  
  // ULTRA ANALYSIS: Comprehensive debugging to hunt the Component Virus
  console.log(`🎯 [EditorPage] Render #${renderCount.current}, Project ID: ${project_id}, Mounted: ${isMounted}`);
  console.log(`🔧 [CSS-GRID-FIX] Using CSS Grid layout instead of react-resizable-panels to prevent infinite loops`);
  console.log(`🚨 [REACT-DOWNGRADE] Now using React ${React.version} (downgraded from 19 to fix infinite loops)`);
  console.log(`🦠 [VIRUS-HUNT] Starting systematic component elimination - Render #${renderCount.current}`);
  
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
  
  console.log(`🎯 [EditorPage] Panel sizes (CSS-Grid):`, {
    toolsPanel,
    previewPanel,
    propertiesPanel,
    total: toolsPanel + previewPanel + propertiesPanel,
    mainContent,
    timeline
  });
  
  // Additional verification messages with React version tracking
  if (renderCount.current === 1) {
    console.log('🔧 [CSS-GRID-FIX] First render - checking for infinite loop prevention...');
    console.log(`🚨 [REACT-DOWNGRADE] React ${React.version} first render completed`);
  } else if (renderCount.current === 2) {
    console.log('🔧 [CSS-GRID-FIX] Second render - normal React behavior, no infinite loop detected yet');
    console.log(`🚨 [REACT-DOWNGRADE] React ${React.version} second render - checking if downgrade helped...`);
  } else if (renderCount.current >= 3) {
    console.error('⚠️ [CSS-GRID-FIX] Multiple renders detected - investigating cause...');
    console.error(`🚨 [REACT-DOWNGRADE] React ${React.version} multiple renders - downgrade may not have fixed issue`);
    if (renderCount.current >= 5) {
      console.error('🚨 [CSS-GRID-FIX] POTENTIAL ISSUE: Too many renders, but no crash yet');
      console.error(`🚨 [REACT-DOWNGRADE] React ${React.version} - CRITICAL: 5+ renders detected`);
    }
  }
  
  // ULTRA ANALYSIS: Phase 1 - Comment out all store hooks to isolate the virus
  console.log(`🦠 [VIRUS-HUNT-P1] Testing with NO external store hooks`);
  
  // COMMENTED OUT FOR VIRUS ISOLATION:
  // const { isDialogOpen } = useExportStore();
  // const {
  //   activeProject,
  //   loadProject,
  //   createNewProject,
  //   isInvalidProjectId,
  //   markProjectIdAsInvalid,
  // } = useProjectStore();
  // const navigate = useNavigate();
  // const handledProjectIds = useRef<Set<string>>(new Set());
  // const isInitializingRef = useRef<boolean>(false);
  // usePlaybackControls();
  
  // TEMPORARY REPLACEMENTS FOR ISOLATION:
  const isDialogOpen = false;
  const activeProject = { id: 'test' };
  console.log(`🦠 [VIRUS-HUNT-P1] Using isolated state - no store dependencies`);

  // ULTRA ANALYSIS: Phase 1 - Simplified mount effect (no complex logic)
  useEffect(() => {
    console.log('🦠 [VIRUS-HUNT-P1] Simplified mount effect started');
    console.log(`🚨 [REACT-DOWNGRADE] React ${React.version} minimal useEffect mounting...`);
    
    const timer = setTimeout(() => {
      setIsMounted(true);
      console.log('🦠 [VIRUS-HUNT-P1] Mount completed with NO store interactions');
      console.log(`✅ [VIRUS-HUNT-P1] React ${React.version} minimal mount successful`);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      console.log(`🦠 [VIRUS-HUNT-P1] Cleanup effect running`);
    };
  }, []); // CRITICAL: Empty dependency array to test if dependencies cause infinite loop

  // ULTRA ANALYSIS: COMMENTED OUT the complex project loading useEffect (PRIMARY SUSPECT)
  /*
  useEffect(() => {
    console.log(`🎯 [EditorPage] Project loading effect triggered`, {
      project_id,
      activeProject: activeProject?.id,
      isInitializing: isInitializingRef.current
    });
    
    // ... complex project loading logic with many dependencies
    
  }, [
    project_id,
    loadProject,           // ← SUSPECT: Function may change on every render
    createNewProject,      // ← SUSPECT: Function may change on every render  
    navigate,              // ← SUSPECT: Function may change on every render
    isInvalidProjectId,    // ← SUSPECT: Function may change on every render
    markProjectIdAsInvalid,// ← SUSPECT: Function may change on every render
    activeProject?.id,     // ← SUSPECT: Object property may cause re-runs
  ]);
  */
  
  console.log(`🦠 [VIRUS-HUNT-P1] Complex project loading useEffect DISABLED for isolation`);

  // Final verification before render
  console.log('🚀 [CSS-GRID-FIX] About to render - NO react-resizable-panels in component tree');
  console.log(`🚀 [REACT-DOWNGRADE] React ${React.version} about to render component tree`);
  
  // Add error boundary detection
  try {
    console.log(`🔍 [REACT-DOWNGRADE] Component tree health check - React ${React.version}`);
  } catch (error) {
    console.error(`💥 [REACT-DOWNGRADE] Error during render preparation:`, error);
  }
  
  // ULTRA ANALYSIS: Phase 2 - Systematic child component elimination
  console.log(`🦠 [VIRUS-HUNT-P2] Starting child component elimination to isolate the trigger`);
  
  return (
    <EditorProvider>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        {/* PHASE 2-A: Test without EditorHeader first */}
        {/* <EditorHeader /> */}
        <div 
          style={{ 
            padding: '1rem', 
            background: '#1a1a1a', 
            color: 'white',
            textAlign: 'center'
          }}
        >
          🦠 [VIRUS-HUNT-P2-A] EditorHeader DISABLED - Testing if header triggers virus
        </div>
        
        <div className="flex-1 min-h-0 min-w-0">
          {/* SUBTASK 6: CSS Grid Layout - Replaces react-resizable-panels to fix infinite loop */}
          <div 
            className="editor-grid h-full w-full"
            style={{
              // @ts-ignore - CSS custom properties
              '--tools-width': `${panelSizes.toolsPanel}%`,
              '--preview-width': `${panelSizes.previewPanel}%`,
              '--props-width': `${panelSizes.propertiesPanel}%`, 
              '--main-height': `${panelSizes.mainContent}%`,
              '--timeline-height': `${panelSizes.timeline}%`,
              display: 'grid',
              gridTemplateAreas: `
                "main-content main-content main-content"
                "timeline timeline timeline"
              `,
              gridTemplateRows: `var(--main-height) var(--timeline-height)`,
              gridTemplateColumns: '1fr',
              gap: '0.18rem'
            } as React.CSSProperties}
          >
            {/* Main Content Area */}
            <div 
              style={{ 
                gridArea: 'main-content',
                display: 'grid',
                gridTemplateAreas: '"tools preview properties"',
                gridTemplateColumns: `var(--tools-width) var(--preview-width) var(--props-width)`,
                gap: '0.19rem',
                padding: '0 0.5rem'
              }}
            >
              {/* PHASE 2-A: All child panels DISABLED for testing */}
              
              {/* Tools Panel - DISABLED */}
              <div style={{ gridArea: 'tools' }} className="min-w-0">
                {/* <MediaPanel /> */}
                <div 
                  style={{ 
                    background: '#2a2a2a', 
                    color: 'white', 
                    padding: '2rem',
                    textAlign: 'center',
                    height: '100%'
                  }}
                >
                  🦠 [VIRUS-HUNT-P2-A]<br/>MediaPanel DISABLED
                </div>
              </div>

              {/* Preview Area - DISABLED */}
              <div style={{ gridArea: 'preview' }} className="min-w-0 min-h-0 flex-1">
                {/* <PreviewPanel /> */}
                <div 
                  style={{ 
                    background: '#3a3a3a', 
                    color: 'white', 
                    padding: '2rem',
                    textAlign: 'center',
                    height: '100%'
                  }}
                >
                  🦠 [VIRUS-HUNT-P2-A]<br/>PreviewPanel DISABLED
                </div>
              </div>

              {/* Properties Panel - DISABLED */}
              <div style={{ gridArea: 'properties' }} className="min-w-0">
                <div
                  className="h-full"
                  style={{ borderRadius: "0.375rem", overflow: "hidden" }}
                >
                  {/* {isDialogOpen ? <ExportDialog /> : <PropertiesPanel />} */}
                  <div 
                    style={{ 
                      background: '#4a4a4a', 
                      color: 'white', 
                      padding: '2rem',
                      textAlign: 'center',
                      height: '100%'
                    }}
                  >
                    🦠 [VIRUS-HUNT-P2-A]<br/>PropertiesPanel DISABLED<br/>ExportDialog DISABLED
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline - DISABLED */}
            <div 
              style={{ gridArea: 'timeline' }} 
              className="min-h-0 px-2 pb-2"
            >
              {/* <Timeline /> */}
              <div 
                style={{ 
                  background: '#5a5a5a', 
                  color: 'white', 
                  padding: '2rem',
                  textAlign: 'center',
                  height: '100%'
                }}
              >
                🦠 [VIRUS-HUNT-P2-A] Timeline DISABLED
              </div>
            </div>
          </div>
        </div>
        
        {/* Onboarding - DISABLED */}
        {/* <Onboarding /> */}
        <div 
          style={{ 
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            background: '#6a6a6a',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem'
          }}
        >
          🦠 [VIRUS-HUNT-P2-A] Onboarding DISABLED
        </div>
      </div>
    </EditorProvider>
  );
}
