# WZRD Agent Studio 主流程分析

分析对象代码路径：

```text
/Users/peter/Desktop/code/wzrdagentstudio
```

本文按当前代码结构梳理 WZRD Agent Studio 的主流程。这个项目是一个 React + Vite + TypeScript 单页应用，核心产品路径是：公开 landing -> 登录/钱包鉴权 -> Home 项目列表 -> Project Setup 项目创建 -> Studio 节点生成画布 -> Timeline/Storyboard -> Editor 视频编辑与导出。后端主要通过 Supabase Auth、Postgres、Storage 和 Edge Functions 承接。

## 顶层架构

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

## 启动和路由流程

1. `src/main.tsx`
   - 找到 `#root`。
   - 记录 `performance.mark('app:boot')`。
   - 渲染 `<App />`。
   - 调用 `reportWebVitals()`。

2. `src/App.tsx`
   - 创建全局 `QueryClientProvider`。
   - 包裹 `ThemeProvider` 和 `TooltipProvider`。
   - 使用 `BrowserRouter`。
   - 路由被拆成三块：
     - `/` -> `Landing`
     - `/login` -> `LoginRoute`
     - `*` -> `AuthenticatedRoutes`

3. `src/app/LoginRoute.tsx`
   - 登录页只加载较小 provider stack：
     - `ThirdwebProvider`
     - `AuthProvider`
     - toast providers
   - 最终渲染 `src/pages/Login.tsx`。

4. `src/app/AuthenticatedRoutes.tsx`
   - 认证后加载完整 provider stack：
     - `ThirdwebProvider`
     - `AuthProvider`
     - `VoiceAgentProvider`
     - `SidebarProvider`
     - `CursorLoadingProvider`
     - toast、billing dialog、custom cursor
   - 所有核心页面都被 `ProtectedRoute` 包裹。
   - 项目级页面再套 `ProjectAccessGate`，确保用户有项目访问权限。
   - 旧路由会 redirect 到 canonical `/projects/:projectId/...` 路由。

## 鉴权流程

核心文件是 `src/providers/AuthProvider.tsx`。

主要路径：

```text
Thirdweb wallet connected
  -> AuthProvider.authenticateWallet()
  -> wallet signs auth message
  -> supabase.functions.invoke('wallet-auth')
  -> Supabase session returned
  -> supabase.auth.setSession()
  -> ProtectedRoute allows access
```

关键点：

- Supabase session 是应用内认证来源，`isAuthenticated = !!user`。
- Thirdweb wallet 用于签名登录，后端 Edge Function `wallet-auth` 校验签名并返回 Supabase session。
- `VITE_BYPASS_AUTH_FOR_TESTS=true` 只在 `import.meta.env.DEV` 下生效，用于测试环境。
- 登录后会通过 `resolvePostLoginPath()` 回到 `next` 或原始访问路径。

## Home 项目列表流程

核心文件是 `src/pages/Home.tsx`。

```text
Home mount
  -> useAuth() 读取 user
  -> supabaseService.projects.list()
  -> 过滤 deleted 项目
  -> active tab / search / sort
  -> ProjectList / AuraProjectList / ProjectListView
```

Home 主要负责：

- 项目列表加载、搜索、排序、private/public 过滤。
- 创建项目按钮跳到 `appRoutes.projectSetup`。
- 打开项目默认跳到 timeline：`/projects/:projectId/timeline`。
- 项目重命名直接更新 `projects.title`。
- 监听 `project-restored` 和 `project-visibility-updated` 事件刷新本地列表。

## Project Setup 项目创建流程

入口文件：

- `src/pages/ProjectSetup.tsx`
- `src/components/project-setup/ProjectSetupWizard.tsx`
- `src/components/project-setup/ProjectContext.tsx`

总体流程：

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

步骤和对应组件：

- Concept：`ConceptTab.tsx`、`DynamicConceptForm.tsx`
  - 收集概念、类型、format-specific fields。
  - 可调用 `generate-concept-examples`。
- Storyline：`StorylineTab.tsx`、`StorylineDocumentUpload.tsx`
  - 文档解析调用 `document-parse`。
  - 故事线生成调用 `generate-storylines`。
- Settings/Cast：`SettingsTab.tsx`、`CastTab.tsx`、`VoiceOverSelector.tsx`、`VoiceCloneDialog.tsx`
  - 项目风格、比例、基础模型、voiceover、角色。
  - ElevenLabs 相关调用走 `elevenlabs-voices`。
- Breakdown：`BreakdownTab.tsx`、`SceneEditDialog.tsx`
  - 编辑场景、角色、地点、服装、声音等拆解信息。
- Finalize：`ProjectContext.finalizeProjectSetup()`
  - 保存最新项目数据。
  - upsert character blueprints。
  - 调用 Supabase Edge Function `finalize-project-setup`。
  - 后端准备 timeline/shot 数据，并可能启动首批 shot image 生成。

Project Setup 的数据保存使用 `supabaseService.projects.create/update()`，并把额外设置写入 `project_settings`。

## Studio 节点画布流程

入口文件是 `src/pages/StudioPage.tsx`。

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

核心状态在 `src/store/computeFlowStore.ts`：

- 节点、边、状态、脏状态、历史。
- graph id/port id 规范化。
- `loadGraph(projectId)` 加载 graph。
- `saveGraph(projectId)` 保存 graph。
- `executeGraphStreaming(projectId, nodeIds?)` 调用 `compute-execute` 并处理 SSE。
- `addGeneratedWorkflow()` 用于 prompt-to-workflow 后批量加入节点和边。

Studio 操作入口：

- 手动加节点：`src/hooks/studio/useStudioGraphActions.ts`
- 节点生成：`src/hooks/studio/useStudioNodeGeneration.ts`
- prompt-to-workflow：`src/hooks/studio/useWorkflowGeneration.ts`
- canvas UI：`src/components/studio/StudioCanvas.tsx`
- 右侧面板：`src/components/studio/StudioRightPanel.tsx`
- AI workflow UI：`src/components/studio/AIWorkflowGenerator.tsx`、`WorkflowGeneratorTab.tsx`

Studio 生成链路：

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

## AI 生成服务流程

核心文件是 `src/services/unifiedGenerationService.ts`。

它是 Project Setup、Studio、Editor 共用的生成服务层，输入是标准化的 `GenerationInput`，输出是标准化的 `GenerationResult`。

路由判断大致如下：

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

重要后端函数：

- `fal-stream`
- `falai-execute`
- `gmi-execute`
- `gemini-text-generation`
- `groq-chat`
- `elevenlabs-tts`
- `elevenlabs-sfx`
- `elevenlabs-music`
- `worldlabs-proxy`

## Timeline / Storyboard / Director's Cut 流程

项目 timeline 路由：

- `/projects/:projectId/timeline` -> `src/pages/StoryboardPage.tsx`
- `/projects/:projectId/directors-cut` -> `src/pages/DirectorCutPage.tsx`
- `/projects/:projectId/observability` -> `src/pages/ProjectObservabilityPage.tsx`

这些页面围绕 Project Setup 生成出的 scenes、shots、characters、timeline assets 继续工作。主要后端/服务涉及：

- `src/services/supabaseService.ts`
  - `sceneService`
  - `characterService`
  - `storylineService`
  - `shotService`
- Supabase functions：
  - `gen-shots`
  - `generate-shot-image`
  - `generate-shot-audio`
  - `director-cut`
  - `evaluate-storyboard-packet`
  - `aura-vlm-judge`

## Editor 视频编辑流程

入口文件：

- `src/pages/EditorPage.tsx`
- `src/providers/VideoEditorProvider.tsx`
- `src/store/videoEditorStore.ts`
- `src/components/editor/VideoEditor.tsx`

总体流程：

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

Editor 状态在 `videoEditorStore.ts`：

- project metadata。
- playback。
- clips。
- audio tracks。
- composition settings。
- media library。
- keyframes。
- timeline zoom/scroll/snapping。
- undo/redo history。
- AI generation state。

持久化和数据加载主要通过：

- `src/services/videoEditorService.ts`
- `src/services/supabaseService.ts`
  - `mediaService`
  - `trackService`
  - `trackItemService`
  - `keyframeService`
- Supabase 表：
  - `video_clips`
  - `audio_tracks`
  - project assets / timeline assets

## 数据和后端层

Supabase client：

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/config.ts`
- `src/integrations/supabase/types.ts`

主要数据库/存储概念：

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

主要 Supabase migrations：

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

## 最主要的用户路径

```text
1. 用户打开 /
2. Landing 展示产品
3. 用户进入 /login
4. Thirdweb wallet 签名
5. wallet-auth 返回 Supabase session
6. 用户进入 /home
7. Home 拉取 projects
8. 用户创建新项目 -> /project-setup
9. Project Setup 收集 concept/storyline/settings/breakdown
10. finalize-project-setup 生成 timeline/shot 基础数据
11. 用户进入 /projects/:projectId/studio
12. Studio graph 添加节点、保存、执行 compute-execute
13. 生成资产进入 project assets / node artifacts
14. 用户进入 /projects/:projectId/editor
15. Editor 加载媒体库、timeline clips/audio tracks
16. Remotion preview + timeline editing
17. 导出或保存最终资产
```

## 文档配套

同目录下的 `FILES.zh.md` 提供更细的文件职责索引；英文版本见 `README.md` 和 `FILES.md`。

