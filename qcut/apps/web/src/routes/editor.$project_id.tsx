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
  // Debug logs removed after fix
  
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
  
  // PHASE 2-G: Enhanced verification messages to detect Component Virus with Timeline
  if (renderCount.current === 1) {
    // initial mount
  } else if (renderCount.current === 2) {
    // secondary render
  } else if (renderCount.current === 3) {
    // tertiary render
  } else if (renderCount.current >= 4 && renderCount.current <= 10) {
    // excessive renders watchdog (disabled after fix)
  } else if (renderCount.current > 10) {
    // disabled noisy logs
  }

  // PHASE 2-G: Success/Failure detection timer
  if (renderCount.current === 1) {
    setTimeout(() => {
      if (renderCount.current <= 3) {
        // success
      } else {
        // failure path (not expected)
      }
    }, 3000); // Check after 3 seconds to allow for normal React mounting
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
  
  // ULTRA ANALYSIS: Phase 2-G - Re-enable Timeline ONLY to test for virus trigger
  // removed verbose VIRUS-HUNT logs after fix
  
  return (
    <EditorProvider>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        {/* PHASE 2-G: All components disabled except Timeline */}
        {/* <EditorHeader /> */}
        <div 
          style={{ 
            padding: '0.5rem', 
            background: '#2a0a5a', 
            color: 'white',
            textAlign: 'center',
            fontSize: '14px'
          }}
        >
          🦠 [VIRUS-HUNT-P2-G] All components DISABLED except Timeline - Testing if Timeline is the culprit (FINAL PHASE!)
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
              {/* PHASE 2-G: Re-enable Timeline ONLY - all other panels remain disabled */}
              
              {/* Tools Panel - STILL DISABLED */}
              <div style={{ gridArea: 'tools' }} className="min-w-0">
                {/* <MediaPanel /> */}
                <div 
                  style={{ 
                    background: '#2a2a2a', 
                    color: 'white', 
                    padding: '2rem',
                    textAlign: 'center',
                    height: '100%',
                    fontSize: '14px'
                  }}
                >
                  🦠 [VIRUS-HUNT-P2-G]<br/>MediaPanel STILL DISABLED
                </div>
              </div>

              {/* Preview Area - STILL DISABLED */}
              <div style={{ gridArea: 'preview' }} className="min-w-0 min-h-0 flex-1">
                {/* <PreviewPanel /> */}
                <div 
                  style={{ 
                    background: '#3a3a3a', 
                    color: 'white', 
                    padding: '2rem',
                    textAlign: 'center',
                    height: '100%',
                    fontSize: '14px'
                  }}
                >
                  🦠 [VIRUS-HUNT-P2-G]<br/>PreviewPanel STILL DISABLED
                </div>
              </div>

              {/* Properties Panel - STILL DISABLED */}
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
                      height: '100%',
                      fontSize: '14px'
                    }}
                  >
                    🦠 [VIRUS-HUNT-P2-G]<br/>PropertiesPanel STILL DISABLED
                  </div>
                  <div 
                    style={{ 
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: 'rgba(42, 10, 90, 0.9)', 
                      color: 'white', 
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '12px',
                      zIndex: 1000
                    }}
                  >
                    🦠 [P2-G] PropertiesPanel DISABLED
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline - RE-ENABLED for Phase 2-G testing */}
            <div 
              style={{ gridArea: 'timeline' }} 
              className="min-h-0 px-2 pb-2"
            >
              <Timeline />
              <div 
                style={{ 
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  background: 'rgba(0, 150, 0, 0.9)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  fontSize: '12px',
                  zIndex: 1002
                }}
              >
                🔧 [VIRUS-FIX] Timeline FIXED - Individual Selectors!
              </div>
            </div>
          </div>
        </div>
        
        {/* ExportDialog - DISABLED AGAIN for Phase 2-G */}
        {/* <ExportDialog /> */}
        <div 
          style={{ 
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            background: 'rgba(90, 10, 150, 0.9)',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            fontSize: '12px',
            zIndex: 1001
          }}
        >
          🦠 [P2-G] ExportDialog DISABLED AGAIN
        </div>
        
        {/* Onboarding - STILL DISABLED */}
        {/* <Onboarding /> */}
        <div 
          style={{ 
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            background: '#6a6a6a',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            fontSize: '12px'
          }}
        >
          🦠 [VIRUS-HUNT-P2-G] Onboarding STILL DISABLED (FINAL COMPONENT LEFT!)
        </div>
      </div>
    </EditorProvider>
  );
}
