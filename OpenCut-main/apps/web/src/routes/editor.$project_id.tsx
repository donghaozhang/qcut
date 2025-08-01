import React, { useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { MediaPanel } from '@/components/editor/media-panel'
import { PropertiesPanel } from '@/components/editor/properties-panel'
import { Timeline } from '@/components/editor/timeline'
import { PreviewPanel } from '@/components/editor/preview-panel'
import { EditorHeader } from '@/components/editor-header'
import { usePanelStore } from '@/stores/panel-store'
import { useProjectStore } from '@/stores/project-store'
import { EditorProvider } from '@/components/editor-provider'
import { usePlaybackControls } from '@/hooks/use-playback-controls'
import { Onboarding } from '@/components/onboarding'

export const Route = createFileRoute('/editor/$project_id')({
  component: EditorPage,
})

function EditorPage() {
  const { project_id } = Route.useParams()
  const {
    toolsPanel,
    previewPanel,
    mainContent,
    timeline,
    setToolsPanel,
    setPreviewPanel,
    setMainContent,
    setTimeline,
  } = usePanelStore()

  const {
    activeProject,
    loadProject,
    createNewProject,
    isInvalidProjectId,
    markProjectIdAsInvalid,
  } = useProjectStore()
  const navigate = useNavigate()
  const handledProjectIds = useRef<Set<string>>(new Set())
  const isInitializingRef = useRef<boolean>(false)

  usePlaybackControls()

  useEffect(() => {
    let isCancelled = false

    const initProject = async () => {
      if (!project_id) {
        return
      }

      // Prevent duplicate initialization
      if (isInitializingRef.current) {
        return
      }

      // Check if project is already loaded
      if (activeProject?.id === project_id) {
        return
      }

      // Check global invalid tracking first (most important for preventing duplicates)
      if (isInvalidProjectId(project_id)) {
        return
      }

      // Check if we've already handled this project ID locally
      if (handledProjectIds.current.has(project_id)) {
        return
      }

      // Mark as initializing to prevent race conditions
      isInitializingRef.current = true
      handledProjectIds.current.add(project_id)

      try {
        await loadProject(project_id)

        // Check if component was unmounted during async operation
        if (isCancelled) {
          return
        }

        // Project loaded successfully
        isInitializingRef.current = false
      } catch (error) {
        // Check if component was unmounted during async operation
        if (isCancelled) {
          return
        }

        // More specific error handling - only create new project for actual "not found" errors
        const isProjectNotFound =
          error instanceof Error &&
          (error.message.includes('not found') ||
            error.message.includes('does not exist') ||
            error.message.includes('Project not found'))

        if (isProjectNotFound) {
          // Mark this project ID as invalid globally BEFORE creating project
          markProjectIdAsInvalid(project_id)

          try {
            const newProjectId = await createNewProject('Untitled Project')

            // Check again if component was unmounted
            if (isCancelled) {
              return
            }

            navigate({ to: `/editor/${newProjectId}` })
          } catch (createError) {
            console.error('Failed to create new project:', createError)
          }
        } else {
          // For other errors (storage issues, corruption, etc.), don't create new project
          console.error(
            'Project loading failed with recoverable error:',
            error
          )
          // Remove from handled set so user can retry
          handledProjectIds.current.delete(project_id)
        }

        isInitializingRef.current = false
      }
    }

    initProject()

    // Cleanup function to cancel async operations
    return () => {
      isCancelled = true
      isInitializingRef.current = false
    }
  }, [
    project_id,
    loadProject,
    createNewProject,
    navigate,
    isInvalidProjectId,
    markProjectIdAsInvalid,
  ])

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
              defaultSize={mainContent.size}
              minSize={30}
              maxSize={85}
              onResize={setMainContent}
              className="min-h-0"
            >
              {/* Main content area */}
              <ResizablePanelGroup
                direction="horizontal"
                className="h-full w-full gap-[0.19rem] px-2"
              >
                {/* Tools Panel */}
                <ResizablePanel
                  defaultSize={toolsPanel.size}
                  minSize={15}
                  maxSize={40}
                  onResize={setToolsPanel}
                  className="min-w-0"
                >
                  <MediaPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Preview Area */}
                <ResizablePanel
                  defaultSize={previewPanel.size}
                  minSize={30}
                  onResize={setPreviewPanel}
                  className="min-w-0 min-h-0 flex-1"
                >
                  <PreviewPanel />
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  defaultSize={25}
                  minSize={15}
                  maxSize={40}
                  className="min-w-0"
                >
                  <PropertiesPanel />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Timeline */}
            <ResizablePanel
              defaultSize={timeline.size}
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
  )
}