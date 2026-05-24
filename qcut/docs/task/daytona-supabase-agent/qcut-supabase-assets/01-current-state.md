# Current State: QCut Daytona Outputs and WZRD Asset Reference

Date: 2026-05-22

## QCut Web/Daytona Flow Today

The QCut website Chat Agent has two related artifact paths:

1. Interactive Daytona session files.
2. Headless agent job artifacts.

### Interactive Daytona Session Files

The current web UI treats the sandbox as the live workspace:

- uploaded user files go to `/tmp/qcut-input`;
- generated outputs should go to `/tmp/qcut-output`;
- temporary tools can live under `/tmp/qcut-tools`;
- the file browser lists active sandbox paths;
- users can navigate folders, preview images/text/JSON/Markdown, copy paths, download files, and download folders.

Important existing files:

- `packages/nexusai-website/js/agent-chat/01-runtime-api.js`
- `packages/nexusai-website/js/agent-chat/02-ui-files.js`
- `packages/license-server/src/routes/agent-parts/files.ts`

Existing docs:

- `docs/task/daytona-supabase-agent/implementation/16-chat-agent-file-browser-stack.md`
- `docs/task/daytona-supabase-agent/implementation/25-chat-agent-file-preview.md`
- `docs/task/daytona-supabase-agent/implementation/28-upload-files-artifacts-e2e.md`

The live file browser is good for "what is in the current sandbox right now". It is not yet an asset library.

### Headless Agent Job Artifacts

For queued jobs, QCut already persists output files to Supabase Storage:

- worker walks the output directory;
- uploads files to the `artifacts` bucket;
- inserts `agent_artifacts` rows;
- license-server routes can list/download artifact rows.

Important existing files:

- `packages/agent-worker/src/upload-artifacts.ts`
- `packages/db/src/schema.ts`
- `packages/license-server/src/routes/agent-parts/jobs.ts`

Current schema shape:

```text
agent_jobs
agent_events
agent_artifacts
agent_sessions
```

`agent_artifacts` is job-scoped. It stores kind, storage path, bytes, metadata, and job/user ownership. That is useful, but it is still not a user-facing reusable asset library.

## What QCut Has Already Solved

- Real cloud sandbox execution with Daytona.
- A known input/output convention: `/tmp/qcut-input` and `/tmp/qcut-output`.
- Browser-side upload to sandbox.
- Browser-side artifact navigation and file preview.
- Download routes that understand sandbox paths and session ownership.
- Job artifact persistence for headless runs.
- File kind classification for common media and text outputs.

These pieces reduce the migration difficulty a lot. The live workspace does not need to be invented again.

## What QCut Has Not Solved Yet

- Durable asset identity independent of a sandbox path or job id.
- Asset search/filtering across many runs.
- Collections/folders/tags as a user organization model.
- Reuse tracking: "this video used these portrait images and this storyboard frame".
- Generated metadata: prompt, model, provider, command, seed, parent assets, scene id, character id.
- Thumbnail/proxy generation for large video/audio.
- Signed URL strategy for private storage.
- Storage quotas and cleanup/archival policy.
- A clean web affordance for selecting assets as references for the next QCut command.

## WZRD Reference System

The `wzrdagentstudio-main` repo already has a Supabase-style asset management design:

- `src/components/assets/AssetUploader.tsx`
- `src/components/assets/AssetLibrary.tsx`
- `src/hooks/useAssets.ts`
- `src/services/assetService.ts`
- `src/types/assets.ts`
- `supabase/functions/asset-upload/index.ts`
- `supabase/functions/asset-processor/index.ts`
- `supabase/migrations/20251116210000_create_asset_management_system.sql`
- `supabase/migrations/20251116210200_storage_buckets_setup.sql`

Useful ideas to reuse:

- `project_assets` as durable metadata.
- `asset_usage` for dependency tracking.
- `asset_collections` and `asset_collection_items`.
- `project-assets`, `asset-thumbnails`, and `asset-previews` buckets.
- path convention like `{userId}/{projectId}/{assetType}/{filename}`;
- private primary bucket, public/signed thumbnail and preview strategy;
- processing queue for thumbnails, video previews, metadata extraction.

## Direct Reuse Caveat

The QCut website is currently mostly static HTML/JS around `chat-agent.html`. WZRD is React/Vite/Supabase with TanStack Query and shadcn UI.

So the best reuse is architectural:

- reuse schema ideas;
- reuse upload/processing concepts;
- reuse asset metadata vocabulary;
- maybe copy small service patterns later if QCut moves to a React page.

Direct component copy/paste is low value unless the QCut web surface is also migrated to a React app.

## Current-State Conclusion

QCut has a working live sandbox workspace. WZRD has a working asset-library pattern. The migration should connect these two ideas:

```text
QCut live output files -> durable Supabase assets -> selectable references -> future QCut runs
```

The first milestone should persist outputs without disturbing the current file browser.

---

# 现状：QCut Daytona Outputs 与 WZRD Asset Reference

日期：2026-05-22

## 今天的 QCut Web/Daytona 流程

QCut 网站 Chat Agent 现在有两条相关的 artifact 路径：

1. 交互式 Daytona session files。
2. Headless agent job artifacts。

### 交互式 Daytona Session Files

当前网页 UI 把 sandbox 当成 live workspace：

- 用户上传文件进入 `/tmp/qcut-input`；
- 生成产物应该写到 `/tmp/qcut-output`；
- 临时工具可以放在 `/tmp/qcut-tools`；
- file browser 可以列出 active sandbox paths；
- 用户可以进入文件夹、预览图片/文本/JSON/Markdown、复制路径、下载文件、下载文件夹。

重要文件：

- `packages/nexusai-website/js/agent-chat/01-runtime-api.js`
- `packages/nexusai-website/js/agent-chat/02-ui-files.js`
- `packages/license-server/src/routes/agent-parts/files.ts`

已有文档：

- `docs/task/daytona-supabase-agent/implementation/16-chat-agent-file-browser-stack.md`
- `docs/task/daytona-supabase-agent/implementation/25-chat-agent-file-preview.md`
- `docs/task/daytona-supabase-agent/implementation/28-upload-files-artifacts-e2e.md`

live file browser 很适合回答“当前 sandbox 里现在有什么”。但它还不是资产库。

### Headless Agent Job Artifacts

对于 queued jobs，QCut 已经会把 output files 持久化到 Supabase Storage：

- worker 遍历 output directory；
- 上传文件到 `artifacts` bucket；
- 插入 `agent_artifacts` rows；
- license-server routes 可以列出/下载 artifact rows。

重要文件：

- `packages/agent-worker/src/upload-artifacts.ts`
- `packages/db/src/schema.ts`
- `packages/license-server/src/routes/agent-parts/jobs.ts`

当前 schema 形状：

```text
agent_jobs
agent_events
agent_artifacts
agent_sessions
```

`agent_artifacts` 是 job-scoped。它存 kind、storage path、bytes、metadata 和 job/user ownership。这个很有用，但它仍然不是面向用户的 reusable asset library。

## QCut 已经解决的部分

- 真实云端 Daytona sandbox 执行。
- 明确的 input/output convention：`/tmp/qcut-input` 和 `/tmp/qcut-output`。
- 浏览器上传到 sandbox。
- 浏览器里 artifact navigation 和 file preview。
- download routes 能理解 sandbox paths 和 session ownership。
- headless runs 的 job artifact persistence。
- 常见 media/text outputs 的 file kind classification。

这些都显著降低了迁移难度。live workspace 不需要重新发明。

## QCut 还没有解决的部分

- 脱离 sandbox path 或 job id 的 durable asset identity。
- 跨多次生成 run 的 asset search/filtering。
- 用户组织模型：collections/folders/tags。
- reuse tracking：比如“这个视频用了哪些 portrait images 和 storyboard frame”。
- 生成 metadata：prompt、model、provider、command、seed、parent assets、scene id、character id。
- 大视频/音频的 thumbnail/proxy generation。
- private storage 的 signed URL 策略。
- storage quota 和 cleanup/archival policy。
- 一个清晰的网页交互，让用户选择 assets 作为下一次 QCut command 的 references。

## WZRD 参考系统

`wzrdagentstudio-main` 已经有一套 Supabase 风格资产管理设计：

- `src/components/assets/AssetUploader.tsx`
- `src/components/assets/AssetLibrary.tsx`
- `src/hooks/useAssets.ts`
- `src/services/assetService.ts`
- `src/types/assets.ts`
- `supabase/functions/asset-upload/index.ts`
- `supabase/functions/asset-processor/index.ts`
- `supabase/migrations/20251116210000_create_asset_management_system.sql`
- `supabase/migrations/20251116210200_storage_buckets_setup.sql`

值得复用的思想：

- `project_assets` 作为 durable metadata。
- `asset_usage` 做依赖/使用追踪。
- `asset_collections` 和 `asset_collection_items`。
- `project-assets`、`asset-thumbnails`、`asset-previews` buckets。
- 类似 `{userId}/{projectId}/{assetType}/{filename}` 的路径约定。
- primary bucket private，thumbnail/preview 用 public 或 signed URL。
- processing queue 做 thumbnail、video preview、metadata extraction。

## 直接复用的注意点

QCut 网站现在主要是 `chat-agent.html` 周围的 static HTML/JS。WZRD 是 React/Vite/Supabase，使用 TanStack Query 和 shadcn UI。

所以最值得复用的是 architecture：

- 复用 schema ideas；
- 复用 upload/processing concepts；
- 复用 asset metadata vocabulary；
- 如果 QCut 以后迁到 React 页面，再考虑复用小的 service/UI patterns。

直接 copy/paste WZRD components 的价值不高，除非 QCut web surface 也迁移到 React app。

## 现状结论

QCut 有 working live sandbox workspace。WZRD 有 working asset-library pattern。迁移应该连接这两个东西：

```text
QCut live output files -> durable Supabase assets -> selectable references -> future QCut runs
```

第一个 milestone 应该是在不打扰当前 file browser 的情况下，把 outputs 持久化下来。
