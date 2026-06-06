# WZRD Agent Studio File Responsibility Index

Analyzed codebase path:

```text
/Users/peter/Desktop/code/wzrdagentstudio
```

This is the companion file to `README.md`. It indexes the key files involved in the main WZRD Agent Studio flows.

## Project Configuration and Entrypoints

| File | Responsibility |
| --- | --- |
| `package.json` | Scripts and dependencies; core scripts include `dev`, `build`, `test`, `test:e2e`, `remotion:preview`, `remotion:render` |
| `vite.config.ts` | Vite build configuration |
| `index.html` | SPA HTML entry with `#root` |
| `src/main.tsx` | React root creation, global CSS, Web Vitals |
| `src/App.tsx` | Top-level providers and three-branch routing: landing, login, authenticated |
| `src/lib/routes.ts` | Route constants, route manifest, legacy route detection, login next-path helpers |

## Auth and Route Shell

| File | Responsibility |
| --- | --- |
| `src/app/LoginRoute.tsx` | Lightweight provider stack for login |
| `src/app/AuthenticatedRoutes.tsx` | Authenticated route tree, full provider stack, legacy redirects, project route gate |
| `src/providers/AuthProvider.tsx` | Supabase session, Thirdweb wallet signature login, test bypass |
| `src/components/ProtectedRoute.tsx` | Protects authenticated pages |
| `src/components/ProjectAccessGate.tsx` | Project-level access control |
| `src/lib/thirdweb/client.ts` | Thirdweb client configuration |
| `src/lib/thirdweb/wallets.ts` | Wallet configuration |
| `supabase/functions/wallet-auth/index.ts` | Wallet signature authentication Edge Function |

## Home and Project List

| File | Responsibility |
| --- | --- |
| `src/pages/Home.tsx` | Main project list page, search, sorting, private/public filtering, create/open/rename project |
| `src/components/home/Sidebar.tsx` | Desktop sidebar |
| `src/components/home/MobileHeader.tsx` | Mobile header |
| `src/components/home/MobileBottomNav.tsx` | Mobile bottom navigation |
| `src/components/home/ProjectList.tsx` | Project card list |
| `src/components/home/ProjectListView.tsx` | Project list view |
| `src/components/home/AuraProjectList.tsx` | Aura project view |
| `src/components/home/AuraAssetStore.tsx` | Aura asset store |
| `src/components/home/ProjectCard.tsx` | Individual project card |
| `src/components/home/SearchBar.tsx` | Project search |
| `src/components/home/SortDropdown.tsx` | Project sorting |

## Project Setup

| File | Responsibility |
| --- | --- |
| `src/pages/ProjectSetup.tsx` | Project Setup route entry, lazy-loads wizard |
| `src/components/project-setup/ProjectSetupWizard.tsx` | Wizard shell combining provider/header/tabs/content/footer |
| `src/components/project-setup/ProjectContext.tsx` | Project setup state, project save, storyline generation, finalization |
| `src/components/project-setup/types.ts` | Project setup data structures and tab types |
| `src/components/project-setup/ProjectSetupVoiceBridge.tsx` | Bridge between voice agent and setup state/actions |
| `src/components/project-setup/ProjectSetupHeader.tsx` | Wizard header |
| `src/components/project-setup/TabNavigation.tsx` | Tab navigation |
| `src/components/project-setup/TabContent.tsx` | Active-tab content rendering |
| `src/components/project-setup/NavigationFooter.tsx` | Previous/next/finalize actions |
| `src/components/project-setup/ConceptTab.tsx` | Concept step |
| `src/components/project-setup/DynamicConceptForm.tsx` | Dynamic concept inputs by format |
| `src/components/project-setup/StorylineTab.tsx` | Storyline step |
| `src/components/project-setup/StorylineDocumentUpload.tsx` | PDF/DOCX/MD/TXT document upload and parse |
| `src/components/project-setup/SettingsTab.tsx` | Style, aspect ratio, model, and evaluation settings |
| `src/components/project-setup/CastTab.tsx` | Character and cast configuration |
| `src/components/project-setup/VoiceOverSelector.tsx` | Voiceover selection |
| `src/components/project-setup/VoiceCloneDialog.tsx` | Voice clone UI |
| `src/components/project-setup/CharacterCard.tsx` | Character card and character image generation |
| `src/components/project-setup/BreakdownTab.tsx` | Scene breakdown |
| `src/components/project-setup/SceneEditDialog.tsx` | Scene edit dialog |
| `src/services/conceptPayloadService.ts` | Converts setup state into structured concept payload |
| `src/services/characterBlueprintService.ts` | Character blueprint upsert and voice/image edit logic |

Related Edge Functions:

| File | Responsibility |
| --- | --- |
| `supabase/functions/create-project/index.ts` | Backend project creation path |
| `supabase/functions/generate-storylines/index.ts` | Non-blocking storyline generation |
| `supabase/functions/finalize-project-setup/index.ts` | Final timeline/shot foundation generation |
| `supabase/functions/document-parse/index.ts` | Document parsing |
| `supabase/functions/generate-concept-examples/index.ts` | Concept example generation |
| `supabase/functions/generate-character-image/index.ts` | Character image generation |
| `supabase/functions/edit-character-image/index.ts` | Character image editing |
| `supabase/functions/elevenlabs-voices/index.ts` | Voice listing/clone |
| `supabase/functions/split-audio-stems/index.ts` | Music stem splitting |
| `supabase/functions/transcribe-music-annotated/index.ts` | Music/lyrics analysis |

## Studio Node Canvas

| File | Responsibility |
| --- | --- |
| `src/pages/StudioPage.tsx` | Studio route entry, loads project title, composes sidebar/canvas/right panel |
| `src/store/computeFlowStore.ts` | Main Studio graph state: nodes, edges, save, load, execution, SSE, history |
| `src/store/computeFlowHistory.ts` | Graph history manager |
| `src/store/historyStore.ts` | Audit/history panel state |
| `src/hooks/studio/useStudioGraphActions.ts` | Node creation, template nodes, save scheduling |
| `src/hooks/studio/useStudioNodeGeneration.ts` | Selected/target node generation |
| `src/hooks/studio/useWorkflowGeneration.ts` | Prompt-to-workflow generation |
| `src/hooks/studio/useNodePositionSync.ts` | Node drag position sync and delayed save |
| `src/hooks/studio/useStudioKeyboardShortcuts.ts` | Studio keyboard shortcuts |
| `src/hooks/studio/useStudioMouse.ts` | Canvas mouse interactions |
| `src/hooks/studio/useConnectionDrawing.ts` | Connection drawing |
| `src/hooks/studio/useSelectionBox.ts` | Selection box |
| `src/types/computeFlow.ts` | Node, edge, port, and artifact types |
| `src/types/nodeStatusMachine.ts` | Node status machine |
| `src/lib/compute/contract.ts` | Compute contract normalization |
| `src/lib/compute/applyBinding.ts` | Binding application |
| `src/lib/compute/handleBindings.ts` | Binding handling |
| `src/lib/studio/mediaActionRegistry.ts` | Studio action registry |
| `src/lib/studio/generationExecution.ts` | Studio generation execution helpers |

Studio UI:

| File | Responsibility |
| --- | --- |
| `src/components/studio/StudioCanvas.tsx` | Main React Flow canvas |
| `src/components/studio/StudioSidebar.tsx` | Tool/node sidebar |
| `src/components/studio/StudioRightPanel.tsx` | Right-side inspector/assets/workflow panel |
| `src/components/studio/AIWorkflowGenerator.tsx` | AI workflow generation UI |
| `src/components/studio/WorkflowGeneratorTab.tsx` | Workflow generation tab |
| `src/components/studio/StudioWorkflowLauncher.tsx` | Workflow launcher |
| `src/components/studio/ModelSelector.tsx` | Model selector |
| `src/components/studio/model-selector/FloraModelMarketplace.tsx` | Flora model marketplace |
| `src/components/studio/panels/AssetsGalleryPanel.tsx` | Project assets gallery |
| `src/components/studio/panels/FlowsPanel.tsx` | Saved flows panel |
| `src/components/studio/nodes/ComputeNode.tsx` | Compute node |
| `src/components/studio/nodes/ReactFlowImageNode.tsx` | Image node |
| `src/components/studio/nodes/ReactFlowVideoNode.tsx` | Video node |
| `src/components/studio/nodes/ReactFlowAudioNode.tsx` | Audio node |
| `src/components/studio/nodes/ReactFlowTextNode.tsx` | Text node |
| `src/components/studio/nodes/ReactFlowImageEditNode.tsx` | Image edit node |
| `src/components/studio/nodes/ReactFlowUploadNode.tsx` | Upload node |
| `src/components/studio/edges/ComputeEdge.tsx` | Compute edge |
| `src/components/studio/edges/GlowingEdge.tsx` | Highlight edge |

Related Edge Functions:

| File | Responsibility |
| --- | --- |
| `supabase/functions/studio-save-state/index.ts` | Save Studio graph |
| `supabase/functions/studio-load-state/index.ts` | Load Studio graph |
| `supabase/functions/compute-execute/index.ts` | Execute graph/node and return SSE |
| `supabase/functions/compute-cancel/index.ts` | Cancel compute run |
| `supabase/functions/generate-workflow/index.ts` | Prompt-to-workflow |

## AI Generation and Model Layer

| File | Responsibility |
| --- | --- |
| `src/services/unifiedGenerationService.ts` | Unified generation service routing Fal/GMI/Gemini/Groq/ElevenLabs/custom edge |
| `src/services/generationService.ts` | Legacy/helper generation service path |
| `src/services/worldLabsService.ts` | WorldLabs service |
| `src/services/imageEditService.ts` | Image edit service |
| `src/services/textGeneration.ts` | Text generation |
| `src/lib/studio-model-constants.ts` | Frontend model catalog and defaults |
| `src/lib/falModelNormalization.ts` | Fal model input normalization |
| `src/lib/gmiCloud.ts` | GMI Cloud response/queue payload handling |
| `src/lib/modelAliases.ts` | Model aliases |

Related Edge Functions:

| File | Responsibility |
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
| `supabase/functions/model-catalog/index.ts` | Backend model catalog |
| `supabase/functions/_shared/ai-model-catalog.ts` | Shared model catalog |
| `supabase/functions/_shared/mediaActionRegistry.ts` | Shared media action registry |

## Assets, IP Vault, and Reference Registry

| File | Responsibility |
| --- | --- |
| `src/pages/AssetsPage.tsx` | Assets page |
| `src/pages/IPVault.tsx` | IP Vault page entry |
| `src/components/assets/AssetLibrary.tsx` | Asset library UI |
| `src/components/assets/AssetUploader.tsx` | Asset upload UI |
| `src/services/assetService.ts` | Project assets service |
| `src/services/mockAssetApi.ts` | Mock assets |
| `src/services/referenceRegistryService.ts` | Reference registry |
| `src/services/ipVaultService.ts` | IP Vault data service |
| `src/components/ip-vault/IPVaultPage.tsx` | Main IP Vault page |
| `src/components/ip-vault/IPVaultGallery.tsx` | IP Vault gallery |
| `src/components/ip-vault/IPVaultInspector.tsx` | IP Vault inspector |
| `src/lib/referenceRegistry.ts` | Reference registry library |
| `src/lib/characterBlueprintReference.ts` | Character blueprint reference helpers |

Related Edge Functions:

| File | Responsibility |
| --- | --- |
| `supabase/functions/asset-upload/index.ts` | Asset upload |
| `supabase/functions/asset-processor/index.ts` | Asset processing |
| `supabase/functions/create-final-asset/index.ts` | Final asset creation |
| `supabase/functions/story-ipfs-metadata/index.ts` | Story/IPFS metadata |

## Timeline, Storyboard, Director's Cut, Observability

| File | Responsibility |
| --- | --- |
| `src/pages/StoryboardPage.tsx` | Project timeline page |
| `src/pages/Storyboard.tsx` | Storyboard generator/support page |
| `src/pages/ShotEditor.tsx` | Single-shot editor |
| `src/pages/DirectorCutPage.tsx` | Director's Cut page |
| `src/pages/ProjectObservabilityPage.tsx` | Project observability/evaluation page |
| `src/services/supabaseService.ts` | Scenes, characters, storylines, shots services |
| `src/lib/evaluation.ts` | Evaluation types and thresholds |
| `src/services/observabilityService.ts` | Observability service |

Related Edge Functions:

| File | Responsibility |
| --- | --- |
| `supabase/functions/gen-shots/index.ts` | Shot generation |
| `supabase/functions/generate-shot-image/index.ts` | Shot image generation |
| `supabase/functions/generate-shot-audio/index.ts` | Shot audio generation |
| `supabase/functions/director-cut/index.ts` | Director's Cut |
| `supabase/functions/evaluate-storyboard-packet/index.ts` | Storyboard packet evaluation |
| `supabase/functions/aura-vlm-judge/index.ts` | Aura VLM judge |

## Editor and Remotion

| File | Responsibility |
| --- | --- |
| `src/pages/EditorPage.tsx` | Editor route entry |
| `src/providers/VideoEditorProvider.tsx` | Loads project and media library, mounts editor store |
| `src/store/videoEditorStore.ts` | Main editor state: clips/audio/playback/timeline/keyframes/history |
| `src/services/videoEditorService.ts` | Editor persistence service |
| `src/services/exportService.ts` | Export service |
| `src/components/editor/VideoEditor.tsx` | Main editor UI component |
| `src/components/editor/VideoEditorMain.tsx` | Main editor layout |
| `src/components/editor/PreviewPanel.tsx` | Preview panel |
| `src/components/editor/remotion/EditorComposition.tsx` | Remotion composition |
| `src/components/editor/timeline/TimelinePanel.tsx` | Timeline panel |
| `src/components/editor/timeline/TimelineTrack.tsx` | Timeline track |
| `src/components/editor/timeline/TimelineClip.tsx` | Timeline clip |
| `src/components/editor/timeline/snapping.ts` | Snapping logic |
| `src/components/editor/media/MediaLibrary.tsx` | Media library |
| `src/components/editor/tabs/ProjectAssetsTab.tsx` | Project assets tab |
| `src/components/editor/toolbar/ExportDialog.tsx` | Export dialog |
| `remotion/Root.tsx` | Remotion root |
| `remotion/index.ts` | Remotion entry |

Related Edge Functions:

| File | Responsibility |
| --- | --- |
| `supabase/functions/editframe-webhook/index.ts` | Editframe webhook |
| `supabase/functions/download/index.ts` | Download |
| `supabase/functions/upload/index.ts` | Upload |

## Supabase Data and Migrations

| File | Responsibility |
| --- | --- |
| `src/integrations/supabase/client.ts` | Generated Supabase client |
| `src/integrations/supabase/config.ts` | Supabase URL/anon key configuration |
| `src/integrations/supabase/types.ts` | Generated database types |
| `src/services/supabaseService.ts` | Frontend Supabase domain service aggregate |
| `supabase/config.toml` | Supabase local/project configuration |

Important migrations:

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20251008180000_add_media_schema.sql` | `projects`, `video_clips`, `audio_tracks`, render/media schema |
| `supabase/migrations/20251116210000_create_asset_management_system.sql` | Project assets system |
| `supabase/migrations/20251116210100_asset_management_rls_policies.sql` | Asset RLS |
| `supabase/migrations/20251116210200_storage_buckets_setup.sql` | `project-assets` storage bucket |
| `supabase/migrations/20251116220000_add_collaboration_system.sql` | Collaboration/share/comment tables |
| `supabase/migrations/20251216224922_72458b5b-d1d1-4ccd-9670-5f10eaf5ec9f.sql` | `compute_nodes`, `compute_edges` |
| `supabase/migrations/20251231083720_68472a06-1d2a-4234-af93-f317928cae70.sql` | `project_settings` |
| `supabase/migrations/20260311130000_core_flow_contract_consolidation.sql` | Compute flow contract consolidation |
| `supabase/migrations/20260406213000_create_ai_model_catalog.sql` | AI model catalog |
| `supabase/migrations/20260406224500_save_compute_graph_handles.sql` | Compute graph handle persistence |
| `supabase/migrations/20260503220000_editor_persistence_and_editframe_webhooks.sql` | Editor persistence / Editframe webhook support |
| `supabase/migrations/20260504143000_create_ip_vault_items.sql` | IP Vault items |
| `supabase/migrations/20260505061500_asset_reference_registry_v1.sql` | Asset reference registry |

## Test Entrypoints

| File/Command | Responsibility |
| --- | --- |
| `npm run test` | Vitest with canvas stub |
| `npm run test:e2e` | Playwright E2E with mock assets and test auth bypass |
| `playwright.config.ts` | Playwright configuration |
| `vitest.setup.ts` | Vitest setup |
| `src/store/__tests__/*` | Zustand store and compute flow tests |
| `src/services/__tests__/*` | Service tests |
| `src/lib/__tests__/*` | Lib/contract/route/billing tests |
| `supabase/functions/_shared/*.test.ts` | Edge Function shared helper tests |

