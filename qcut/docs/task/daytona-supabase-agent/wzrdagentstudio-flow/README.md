# WZRD Agent Studio Main Flow Analysis

Analyzed codebase path:

```text
/Users/peter/Desktop/code/wzrdagentstudio
```

This document summarizes the main runtime flow of WZRD Agent Studio based on the current code. The project is a React + Vite + TypeScript single-page app. Its core product path is: public landing -> login/wallet auth -> Home project list -> Project Setup -> Studio node canvas -> Timeline/Storyboard -> Editor video editing/export. The backend is mainly Supabase Auth, Postgres, Storage, and Edge Functions.

## Top-Level Architecture

```text
index.html
  -> src/main.tsx
  -> src/App.tsx
      -> public Landing
      -> LoginRoute
      -> AuthenticatedRoutes
          -> ThirdwebProvider
          -> AuthProvider
          -> VoiceAgentProvider
          -> Sidebar/Cursor/Toast providers
          -> protected routes
              -> Home
              -> ProjectSetup
              -> StudioPage
              -> StoryboardPage / DirectorCutPage
              -> EditorPage
              -> Assets / IPVault / Kanvas

Frontend state:
  Zustand stores + React Query + local component context

Backend:
  Supabase Auth + Postgres + Storage + Edge Functions

AI / media:
  unifiedGenerationService
  computeFlowStore -> compute-execute SSE
  Supabase Edge Functions -> Fal.ai / GMI / Gemini / Groq / ElevenLabs / WorldLabs
```

## Startup and Routing Flow

1. `src/main.tsx`
   - Finds `#root`.
   - Records `performance.mark('app:boot')`.
   - Renders `<App />`.
   - Calls `reportWebVitals()`.

2. `src/App.tsx`
   - Creates the global `QueryClientProvider`.
   - Wraps the app in `ThemeProvider` and `TooltipProvider`.
   - Uses `BrowserRouter`.
   - Splits routing into three high-level branches:
     - `/` -> `Landing`
     - `/login` -> `LoginRoute`
     - `*` -> `AuthenticatedRoutes`

3. `src/app/LoginRoute.tsx`
   - Uses a smaller provider stack for the login page:
     - `ThirdwebProvider`
     - `AuthProvider`
     - toast providers
   - Renders `src/pages/Login.tsx`.

4. `src/app/AuthenticatedRoutes.tsx`
   - Loads the full authenticated provider stack:
     - `ThirdwebProvider`
     - `AuthProvider`
     - `VoiceAgentProvider`
     - `SidebarProvider`
     - `CursorLoadingProvider`
     - toast, billing dialog, custom cursor
   - Core pages are wrapped in `ProtectedRoute`.
   - Project pages are additionally wrapped in `ProjectAccessGate`.
   - Legacy routes redirect to canonical `/projects/:projectId/...` routes.

## Authentication Flow

The core file is `src/providers/AuthProvider.tsx`.

Main path:

```text
Thirdweb wallet connected
  -> AuthProvider.authenticateWallet()
  -> wallet signs auth message
  -> supabase.functions.invoke('wallet-auth')
  -> Supabase session returned
  -> supabase.auth.setSession()
  -> ProtectedRoute allows access
```

Key details:

- The Supabase session is the app's authentication source, with `isAuthenticated = !!user`.
- Thirdweb wallet is used for signature-based login; the `wallet-auth` Edge Function verifies the signature and returns a Supabase session.
- `VITE_BYPASS_AUTH_FOR_TESTS=true` only works in `import.meta.env.DEV`.
- After login, `resolvePostLoginPath()` returns the user to the `next` or original attempted path.

## Home Project List Flow

The core file is `src/pages/Home.tsx`.

```text
Home mount
  -> useAuth() reads user
  -> supabaseService.projects.list()
  -> filter deleted projects
  -> active tab / search / sort
  -> ProjectList / AuraProjectList / ProjectListView
```

Home owns:

- Project list loading, search, sorting, and private/public filtering.
- Create project button navigation to `appRoutes.projectSetup`.
- Opening a project defaults to the timeline route: `/projects/:projectId/timeline`.
- Project rename by updating `projects.title`.
- Local refresh from `project-restored` and `project-visibility-updated` browser events.

## Project Setup Flow

Entry files:

- `src/pages/ProjectSetup.tsx`
- `src/components/project-setup/ProjectSetupWizard.tsx`
- `src/components/project-setup/ProjectContext.tsx`

Overall flow:

```text
ProjectSetup
  -> ProjectSetupWizard
      -> ProjectProvider
      -> ProjectSetupVoiceBridge
      -> ProjectSetupHeader
      -> TabNavigation
      -> TabContent
      -> NavigationFooter

ProjectProvider state:
  concept/settings/cast/storyline/breakdown data
  projectId
  activeTab
  saveProjectData()
  generateStoryline()
  finalizeProjectSetup()
```

Steps and components:

- Concept: `ConceptTab.tsx`, `DynamicConceptForm.tsx`
  - Collects concept, genre, and format-specific fields.
  - Can call `generate-concept-examples`.
- Storyline: `StorylineTab.tsx`, `StorylineDocumentUpload.tsx`
  - Document parsing calls `document-parse`.
  - Storyline generation calls `generate-storylines`.
- Settings/Cast: `SettingsTab.tsx`, `CastTab.tsx`, `VoiceOverSelector.tsx`, `VoiceCloneDialog.tsx`
  - Project style, aspect ratio, base models, voiceover, and characters.
  - ElevenLabs-related calls go through `elevenlabs-voices`.
- Breakdown: `BreakdownTab.tsx`, `SceneEditDialog.tsx`
  - Edits scenes, characters, locations, wardrobe, audio, and related breakdown data.
- Finalize: `ProjectContext.finalizeProjectSetup()`
  - Saves the latest project data.
  - Upserts character blueprints.
  - Calls the `finalize-project-setup` Supabase Edge Function.
  - The backend prepares timeline/shot data and may start initial shot image generation.

Project Setup persists data through `supabaseService.projects.create/update()` and writes additional settings into `project_settings`.

## Studio Node Canvas Flow

The entry file is `src/pages/StudioPage.tsx`.

```text
/projects/:projectId/studio
  -> StudioPage
      -> load project title
      -> useAppStore.setActiveProject()
      -> StudioSidebar
      -> StudioCanvas
      -> StudioRightPanel
      -> SettingsPanel
      -> useComputeFlowStore()
```

The core state lives in `src/store/computeFlowStore.ts`:

- Nodes, edges, statuses, dirty state, and history.
- Graph id and port id normalization.
- `loadGraph(projectId)` loads the graph.
- `saveGraph(projectId)` persists the graph.
- `executeGraphStreaming(projectId, nodeIds?)` calls `compute-execute` and handles SSE.
- `addGeneratedWorkflow()` inserts prompt-to-workflow generated nodes and edges.

Studio operation entry points:

- Manual node creation: `src/hooks/studio/useStudioGraphActions.ts`
- Node generation: `src/hooks/studio/useStudioNodeGeneration.ts`
- Prompt-to-workflow: `src/hooks/studio/useWorkflowGeneration.ts`
- Canvas UI: `src/components/studio/StudioCanvas.tsx`
- Right panel: `src/components/studio/StudioRightPanel.tsx`
- AI workflow UI: `src/components/studio/AIWorkflowGenerator.tsx`, `WorkflowGeneratorTab.tsx`

Studio generation chain:

```text
User adds/configures nodes
  -> computeFlowStore mutates nodes/edges
  -> saveGraph(projectId)
  -> Supabase function studio-save-state or compute graph tables
  -> executeGraphStreaming(projectId, nodeIds?)
  -> POST /functions/v1/compute-execute
  -> SSE event stream
  -> node status/progress/artifacts update in computeFlowStore
```

## AI Generation Service Flow

The core file is `src/services/unifiedGenerationService.ts`.

It is the shared generation service for Project Setup, Studio, and Editor. Its input is a normalized `GenerationInput`; its output is a normalized `GenerationResult`.

Route selection roughly follows:

```text
GenerationInput(model, prompt, parameters, referenceAssets)
  -> getModelById()
  -> determineRoute()
      -> fal-stream
      -> gmi-cloud
      -> gemini-text
      -> groq-text
      -> elevenlabs-tts / sfx / music
      -> custom edge-function
  -> invoke Supabase Edge Function or fetch streaming endpoint
  -> normalize provider response
  -> return url + metadata + status
```

Important backend functions:

- `fal-stream`
- `falai-execute`
- `gmi-execute`
- `gemini-text-generation`
- `groq-chat`
- `elevenlabs-tts`
- `elevenlabs-sfx`
- `elevenlabs-music`
- `worldlabs-proxy`

## Timeline / Storyboard / Director's Cut Flow

Project timeline routes:

- `/projects/:projectId/timeline` -> `src/pages/StoryboardPage.tsx`
- `/projects/:projectId/directors-cut` -> `src/pages/DirectorCutPage.tsx`
- `/projects/:projectId/observability` -> `src/pages/ProjectObservabilityPage.tsx`

These pages continue from the scenes, shots, characters, and timeline assets produced by Project Setup. Main service/backend pieces:

- `src/services/supabaseService.ts`
  - `sceneService`
  - `characterService`
  - `storylineService`
  - `shotService`
- Supabase functions:
  - `gen-shots`
  - `generate-shot-image`
  - `generate-shot-audio`
  - `director-cut`
  - `evaluate-storyboard-packet`
  - `aura-vlm-judge`

## Editor Video Editing Flow

Entry files:

- `src/pages/EditorPage.tsx`
- `src/providers/VideoEditorProvider.tsx`
- `src/store/videoEditorStore.ts`
- `src/components/editor/VideoEditor.tsx`

Overall flow:

```text
/projects/:projectId/editor
  -> EditorPage
      -> AppHeader
      -> VideoEditorProvider
          -> setProjectId(projectId)
          -> load projects row
          -> videoEditorStore.loadProject(projectId)
          -> videoEditorStore.loadMediaLibrary(projectId)
      -> VideoEditor UI
          -> media panel
          -> Remotion preview
          -> timeline tracks
          -> properties/effects/text/export
```

Editor state in `videoEditorStore.ts`:

- project metadata
- playback
- clips
- audio tracks
- composition settings
- media library
- keyframes
- timeline zoom/scroll/snapping
- undo/redo history
- AI generation state

Persistence and data loading mainly use:

- `src/services/videoEditorService.ts`
- `src/services/supabaseService.ts`
  - `mediaService`
  - `trackService`
  - `trackItemService`
  - `keyframeService`
- Supabase tables:
  - `video_clips`
  - `audio_tracks`
  - project assets / timeline assets

## Data and Backend Layer

Supabase client:

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/config.ts`
- `src/integrations/supabase/types.ts`

Main database/storage concepts:

- `projects`
- `project_settings`
- `storylines`
- `scenes`
- `characters`
- `shots`
- `compute_nodes`
- `compute_edges`
- `compute_graphs`
- `project_assets`
- `video_clips`
- `audio_tracks`
- Storage bucket: `project-assets`

Important migrations:

- `20251008180000_add_media_schema.sql`
- `20251116210000_create_asset_management_system.sql`
- `20251116210200_storage_buckets_setup.sql`
- `20251216224922_72458b5b-d1d1-4ccd-9670-5f10eaf5ec9f.sql`
- `20251231083720_68472a06-1d2a-4234-af93-f317928cae70.sql`
- `20260311130000_core_flow_contract_consolidation.sql`
- `20260312103000_extend_generation_jobs_for_kanvas.sql`
- `20260406213000_create_ai_model_catalog.sql`
- `20260406224500_save_compute_graph_handles.sql`
- `20260503220000_editor_persistence_and_editframe_webhooks.sql`

## Primary User Path

```text
1. User opens /
2. Landing presents product
3. User enters /login
4. Thirdweb wallet signs auth message
5. wallet-auth returns Supabase session
6. User enters /home
7. Home loads projects
8. User creates a new project -> /project-setup
9. Project Setup collects concept/storyline/settings/breakdown
10. finalize-project-setup creates timeline/shot foundation data
11. User enters /projects/:projectId/studio
12. Studio graph adds nodes, saves, and executes compute-execute
13. Generated assets become project assets / node artifacts
14. User enters /projects/:projectId/editor
15. Editor loads media library, timeline clips, and audio tracks
16. Remotion preview + timeline editing
17. Export or save final assets
```

## Companion Documents

`FILES.md` in this directory provides a more detailed file responsibility index. Chinese versions are available as `README.zh.md` and `FILES.zh.md`.

