# WZRD Agent Studio 文件职责索引

分析对象代码路径：

```text
/Users/peter/Desktop/code/wzrdagentstudio
```

本文是 `README.zh.md` 的配套文件，按功能区域列出主流程涉及的关键文件。

## 项目配置和入口

| 文件 | 职责 |
| --- | --- |
| `package.json` | 脚本和依赖；核心脚本包括 `dev`、`build`、`test`、`test:e2e`、`remotion:preview`、`remotion:render` |
| `vite.config.ts` | Vite 构建配置 |
| `index.html` | SPA HTML 入口，提供 `#root` |
| `src/main.tsx` | React root 创建、全局 CSS、Web Vitals |
| `src/App.tsx` | 顶层 provider 和三段式路由：landing、login、authenticated |
| `src/lib/routes.ts` | 路由常量、route manifest、legacy route 识别、login next path |

## Auth 和路由壳

| 文件 | 职责 |
| --- | --- |
| `src/app/LoginRoute.tsx` | 登录页轻量 provider stack |
| `src/app/AuthenticatedRoutes.tsx` | 认证后完整路由树、provider stack、legacy redirect、project route gate |
| `src/providers/AuthProvider.tsx` | Supabase session、Thirdweb wallet 签名登录、测试 bypass |
| `src/components/ProtectedRoute.tsx` | 保护认证页面 |
| `src/components/ProjectAccessGate.tsx` | 项目级访问控制 |
| `src/lib/thirdweb/client.ts` | Thirdweb client 配置 |
| `src/lib/thirdweb/wallets.ts` | Wallet 配置 |
| `supabase/functions/wallet-auth/index.ts` | 钱包签名认证 Edge Function |

## Home 和项目列表

| 文件 | 职责 |
| --- | --- |
| `src/pages/Home.tsx` | 项目列表主页面、搜索、排序、private/public 过滤、创建/打开/重命名项目 |
| `src/components/home/Sidebar.tsx` | 桌面侧边栏 |
| `src/components/home/MobileHeader.tsx` | 移动端 header |
| `src/components/home/MobileBottomNav.tsx` | 移动端底部导航 |
| `src/components/home/ProjectList.tsx` | 项目卡片列表 |
| `src/components/home/ProjectListView.tsx` | 项目列表视图 |
| `src/components/home/AuraProjectList.tsx` | Aura 项目视图 |
| `src/components/home/AuraAssetStore.tsx` | Aura asset store |
| `src/components/home/ProjectCard.tsx` | 单个项目卡 |
| `src/components/home/SearchBar.tsx` | 项目搜索 |
| `src/components/home/SortDropdown.tsx` | 项目排序 |

## Project Setup

| 文件 | 职责 |
| --- | --- |
| `src/pages/ProjectSetup.tsx` | Project Setup 页面入口，lazy load wizard |
| `src/components/project-setup/ProjectSetupWizard.tsx` | Wizard shell，组合 provider/header/tabs/content/footer |
| `src/components/project-setup/ProjectContext.tsx` | Project setup 状态、保存项目、生成 storyline、finalize setup |
| `src/components/project-setup/types.ts` | Project setup 数据结构和 tab 类型 |
| `src/components/project-setup/ProjectSetupVoiceBridge.tsx` | Voice agent 和 setup state/action 桥接 |
| `src/components/project-setup/ProjectSetupHeader.tsx` | Wizard header |
| `src/components/project-setup/TabNavigation.tsx` | Tab 导航 |
| `src/components/project-setup/TabContent.tsx` | 按 active tab 渲染各步骤 |
| `src/components/project-setup/NavigationFooter.tsx` | 上一步/下一步/finalize 操作 |
| `src/components/project-setup/ConceptTab.tsx` | Concept 步骤 |
| `src/components/project-setup/DynamicConceptForm.tsx` | 不同 format 的动态概念输入 |
| `src/components/project-setup/StorylineTab.tsx` | Storyline 步骤 |
| `src/components/project-setup/StorylineDocumentUpload.tsx` | PDF/DOCX/MD/TXT 文档上传解析 |
| `src/components/project-setup/SettingsTab.tsx` | 风格、比例、模型、评估配置 |
| `src/components/project-setup/CastTab.tsx` | 角色和 cast 配置 |
| `src/components/project-setup/VoiceOverSelector.tsx` | voiceover 选择 |
| `src/components/project-setup/VoiceCloneDialog.tsx` | voice clone UI |
| `src/components/project-setup/CharacterCard.tsx` | 角色卡和角色图生成 |
| `src/components/project-setup/BreakdownTab.tsx` | 场景拆解 |
| `src/components/project-setup/SceneEditDialog.tsx` | 场景编辑弹窗 |
| `src/services/conceptPayloadService.ts` | 把 setup state 转成结构化 concept payload |
| `src/services/characterBlueprintService.ts` | character blueprint upsert 和 voice/image 编辑相关逻辑 |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/create-project/index.ts` | 项目创建后端路径 |
| `supabase/functions/generate-storylines/index.ts` | 非阻塞 storyline 生成 |
| `supabase/functions/finalize-project-setup/index.ts` | 最终生成 timeline/shot 基础数据 |
| `supabase/functions/document-parse/index.ts` | 文档解析 |
| `supabase/functions/generate-concept-examples/index.ts` | 概念示例生成 |
| `supabase/functions/generate-character-image/index.ts` | 角色图片生成 |
| `supabase/functions/edit-character-image/index.ts` | 角色图片编辑 |
| `supabase/functions/elevenlabs-voices/index.ts` | voice 列表/clone |
| `supabase/functions/split-audio-stems/index.ts` | 音乐 stems 拆分 |
| `supabase/functions/transcribe-music-annotated/index.ts` | 音乐/歌词分析 |

## Studio 节点画布

| 文件 | 职责 |
| --- | --- |
| `src/pages/StudioPage.tsx` | Studio 页面入口，加载项目标题、组合 sidebar/canvas/right panel |
| `src/store/computeFlowStore.ts` | Studio graph 主状态：节点、边、保存、加载、执行、SSE、历史 |
| `src/store/computeFlowHistory.ts` | Graph history 管理 |
| `src/store/historyStore.ts` | 审计/历史面板状态 |
| `src/hooks/studio/useStudioGraphActions.ts` | 创建节点、模板节点、保存调度 |
| `src/hooks/studio/useStudioNodeGeneration.ts` | 选中节点/目标节点生成 |
| `src/hooks/studio/useWorkflowGeneration.ts` | Prompt-to-workflow 生成 |
| `src/hooks/studio/useNodePositionSync.ts` | 节点拖拽位置同步和延迟保存 |
| `src/hooks/studio/useStudioKeyboardShortcuts.ts` | Studio 快捷键 |
| `src/hooks/studio/useStudioMouse.ts` | Canvas 鼠标交互 |
| `src/hooks/studio/useConnectionDrawing.ts` | 连线绘制 |
| `src/hooks/studio/useSelectionBox.ts` | 框选 |
| `src/types/computeFlow.ts` | 节点、边、端口、artifact 类型 |
| `src/types/nodeStatusMachine.ts` | 节点状态机 |
| `src/lib/compute/contract.ts` | Compute contract 规范化 |
| `src/lib/compute/applyBinding.ts` | 绑定应用 |
| `src/lib/compute/handleBindings.ts` | 绑定处理 |
| `src/lib/studio/mediaActionRegistry.ts` | Studio action registry |
| `src/lib/studio/generationExecution.ts` | Studio generation execution helpers |

Studio UI：

| 文件 | 职责 |
| --- | --- |
| `src/components/studio/StudioCanvas.tsx` | React Flow canvas 主体 |
| `src/components/studio/StudioSidebar.tsx` | 工具/节点 sidebar |
| `src/components/studio/StudioRightPanel.tsx` | 右侧 inspector/assets/workflow 面板 |
| `src/components/studio/AIWorkflowGenerator.tsx` | AI workflow 生成 UI |
| `src/components/studio/WorkflowGeneratorTab.tsx` | Workflow 生成 tab |
| `src/components/studio/StudioWorkflowLauncher.tsx` | Workflow launcher |
| `src/components/studio/ModelSelector.tsx` | 模型选择 |
| `src/components/studio/model-selector/FloraModelMarketplace.tsx` | Flora 模型市场 |
| `src/components/studio/panels/AssetsGalleryPanel.tsx` | Project assets gallery |
| `src/components/studio/panels/FlowsPanel.tsx` | Saved flows 面板 |
| `src/components/studio/nodes/ComputeNode.tsx` | Compute 节点 |
| `src/components/studio/nodes/ReactFlowImageNode.tsx` | Image 节点 |
| `src/components/studio/nodes/ReactFlowVideoNode.tsx` | Video 节点 |
| `src/components/studio/nodes/ReactFlowAudioNode.tsx` | Audio 节点 |
| `src/components/studio/nodes/ReactFlowTextNode.tsx` | Text 节点 |
| `src/components/studio/nodes/ReactFlowImageEditNode.tsx` | Image edit 节点 |
| `src/components/studio/nodes/ReactFlowUploadNode.tsx` | Upload 节点 |
| `src/components/studio/edges/ComputeEdge.tsx` | Compute edge |
| `src/components/studio/edges/GlowingEdge.tsx` | 高亮 edge |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/studio-save-state/index.ts` | 保存 Studio graph |
| `supabase/functions/studio-load-state/index.ts` | 加载 Studio graph |
| `supabase/functions/compute-execute/index.ts` | 执行 graph/node，返回 SSE |
| `supabase/functions/compute-cancel/index.ts` | 取消 compute run |
| `supabase/functions/generate-workflow/index.ts` | Prompt-to-workflow |

## AI 生成和模型层

| 文件 | 职责 |
| --- | --- |
| `src/services/unifiedGenerationService.ts` | 统一生成服务，路由 Fal/GMI/Gemini/Groq/ElevenLabs/custom edge |
| `src/services/generationService.ts` | 生成服务旧/辅助路径 |
| `src/services/worldLabsService.ts` | WorldLabs 相关服务 |
| `src/services/imageEditService.ts` | 图片编辑服务 |
| `src/services/textGeneration.ts` | 文本生成 |
| `src/lib/studio-model-constants.ts` | 前端模型 catalog 和默认模型 |
| `src/lib/falModelNormalization.ts` | Fal model 输入规范化 |
| `src/lib/gmiCloud.ts` | GMI Cloud 响应/queue payload 处理 |
| `src/lib/modelAliases.ts` | 模型 alias |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/fal-stream/index.ts` | Fal streaming endpoint |
| `supabase/functions/falai-execute/index.ts` | Fal execute |
| `supabase/functions/gmi-execute/index.ts` | GMI execute |
| `supabase/functions/gemini-text-generation/index.ts` | Gemini text |
| `supabase/functions/gemini-image-generation/index.ts` | Gemini image |
| `supabase/functions/gemini-video-generation/index.ts` | Gemini video |
| `supabase/functions/groq-chat/index.ts` | Groq chat |
| `supabase/functions/elevenlabs-tts/index.ts` | TTS |
| `supabase/functions/elevenlabs-sfx/index.ts` | SFX |
| `supabase/functions/elevenlabs-music/index.ts` | Music |
| `supabase/functions/worldlabs-proxy/index.ts` | WorldLabs proxy |
| `supabase/functions/model-catalog/index.ts` | 后端模型 catalog |
| `supabase/functions/_shared/ai-model-catalog.ts` | shared model catalog |
| `supabase/functions/_shared/mediaActionRegistry.ts` | shared media action registry |

## Assets、IP Vault 和引用注册

| 文件 | 职责 |
| --- | --- |
| `src/pages/AssetsPage.tsx` | Assets 页面 |
| `src/pages/IPVault.tsx` | IP Vault 页面入口 |
| `src/components/assets/AssetLibrary.tsx` | 资产库 UI |
| `src/components/assets/AssetUploader.tsx` | 资产上传 UI |
| `src/services/assetService.ts` | project assets 服务 |
| `src/services/mockAssetApi.ts` | mock assets |
| `src/services/referenceRegistryService.ts` | reference registry |
| `src/services/ipVaultService.ts` | IP Vault 数据服务 |
| `src/components/ip-vault/IPVaultPage.tsx` | IP Vault 页面主体 |
| `src/components/ip-vault/IPVaultGallery.tsx` | IP Vault gallery |
| `src/components/ip-vault/IPVaultInspector.tsx` | IP Vault inspector |
| `src/lib/referenceRegistry.ts` | 引用注册库 |
| `src/lib/characterBlueprintReference.ts` | 角色 blueprint 引用 |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/asset-upload/index.ts` | 资产上传 |
| `supabase/functions/asset-processor/index.ts` | 资产处理 |
| `supabase/functions/create-final-asset/index.ts` | 最终资产创建 |
| `supabase/functions/story-ipfs-metadata/index.ts` | Story/IPFS metadata |

## Timeline、Storyboard、Director's Cut、Observability

| 文件 | 职责 |
| --- | --- |
| `src/pages/StoryboardPage.tsx` | Project timeline 页面 |
| `src/pages/Storyboard.tsx` | Storyboard generator/support page |
| `src/pages/ShotEditor.tsx` | 单 shot 编辑 |
| `src/pages/DirectorCutPage.tsx` | Director's Cut 页面 |
| `src/pages/ProjectObservabilityPage.tsx` | 项目观测/评估页面 |
| `src/services/supabaseService.ts` | scenes、characters、storylines、shots 服务 |
| `src/lib/evaluation.ts` | 评估类型和阈值 |
| `src/services/observabilityService.ts` | 观测服务 |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/gen-shots/index.ts` | shots 生成 |
| `supabase/functions/generate-shot-image/index.ts` | shot image 生成 |
| `supabase/functions/generate-shot-audio/index.ts` | shot audio 生成 |
| `supabase/functions/director-cut/index.ts` | Director's Cut |
| `supabase/functions/evaluate-storyboard-packet/index.ts` | storyboard packet 评估 |
| `supabase/functions/aura-vlm-judge/index.ts` | Aura VLM judge |

## Editor 和 Remotion

| 文件 | 职责 |
| --- | --- |
| `src/pages/EditorPage.tsx` | Editor route 入口 |
| `src/providers/VideoEditorProvider.tsx` | 加载 project、media library，挂载 editor store |
| `src/store/videoEditorStore.ts` | Editor 主状态：clips/audio/playback/timeline/keyframes/history |
| `src/services/videoEditorService.ts` | Editor 持久化服务 |
| `src/services/exportService.ts` | 导出服务 |
| `src/components/editor/VideoEditor.tsx` | Editor UI 主组件 |
| `src/components/editor/VideoEditorMain.tsx` | Editor 主布局 |
| `src/components/editor/PreviewPanel.tsx` | 预览面板 |
| `src/components/editor/remotion/EditorComposition.tsx` | Remotion composition |
| `src/components/editor/timeline/TimelinePanel.tsx` | Timeline 面板 |
| `src/components/editor/timeline/TimelineTrack.tsx` | Timeline track |
| `src/components/editor/timeline/TimelineClip.tsx` | Timeline clip |
| `src/components/editor/timeline/snapping.ts` | Snapping 逻辑 |
| `src/components/editor/media/MediaLibrary.tsx` | Media library |
| `src/components/editor/tabs/ProjectAssetsTab.tsx` | Project assets tab |
| `src/components/editor/toolbar/ExportDialog.tsx` | 导出弹窗 |
| `remotion/Root.tsx` | Remotion root |
| `remotion/index.ts` | Remotion entry |

相关 Edge Functions：

| 文件 | 职责 |
| --- | --- |
| `supabase/functions/editframe-webhook/index.ts` | Editframe webhook |
| `supabase/functions/download/index.ts` | 下载 |
| `supabase/functions/upload/index.ts` | 上传 |

## Supabase 数据和迁移

| 文件 | 职责 |
| --- | --- |
| `src/integrations/supabase/client.ts` | 生成的 Supabase client |
| `src/integrations/supabase/config.ts` | Supabase URL/anon key 配置 |
| `src/integrations/supabase/types.ts` | 生成的数据库类型 |
| `src/services/supabaseService.ts` | 前端 Supabase domain service 聚合 |
| `supabase/config.toml` | Supabase local/project 配置 |

重点 migrations：

| 文件 | 职责 |
| --- | --- |
| `supabase/migrations/20251008180000_add_media_schema.sql` | `projects`、`video_clips`、`audio_tracks`、render/media schema |
| `supabase/migrations/20251116210000_create_asset_management_system.sql` | project assets 系统 |
| `supabase/migrations/20251116210100_asset_management_rls_policies.sql` | asset RLS |
| `supabase/migrations/20251116210200_storage_buckets_setup.sql` | `project-assets` storage bucket |
| `supabase/migrations/20251116220000_add_collaboration_system.sql` | collaboration/share/comment tables |
| `supabase/migrations/20251216224922_72458b5b-d1d1-4ccd-9670-5f10eaf5ec9f.sql` | `compute_nodes`、`compute_edges` |
| `supabase/migrations/20251231083720_68472a06-1d2a-4234-af93-f317928cae70.sql` | `project_settings` |
| `supabase/migrations/20260311130000_core_flow_contract_consolidation.sql` | compute flow contract consolidation |
| `supabase/migrations/20260406213000_create_ai_model_catalog.sql` | AI model catalog |
| `supabase/migrations/20260406224500_save_compute_graph_handles.sql` | compute graph handle persistence |
| `supabase/migrations/20260503220000_editor_persistence_and_editframe_webhooks.sql` | editor persistence / Editframe webhook support |
| `supabase/migrations/20260504143000_create_ip_vault_items.sql` | IP Vault items |
| `supabase/migrations/20260505061500_asset_reference_registry_v1.sql` | asset reference registry |

## 测试入口

| 文件/命令 | 职责 |
| --- | --- |
| `npm run test` | Vitest，带 canvas stub |
| `npm run test:e2e` | Playwright E2E，启用 mock assets 和 test auth bypass |
| `playwright.config.ts` | Playwright 配置 |
| `vitest.setup.ts` | Vitest setup |
| `src/store/__tests__/*` | Zustand store 和 compute flow 测试 |
| `src/services/__tests__/*` | service 测试 |
| `src/lib/__tests__/*` | lib/contract/route/billing 测试 |
| `supabase/functions/_shared/*.test.ts` | Edge Function shared helpers 测试 |

