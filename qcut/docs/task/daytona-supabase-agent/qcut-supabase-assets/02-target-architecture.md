# Target Architecture: Durable QCut Assets on Supabase

Date: 2026-05-22

## Product Model

The web product should expose two different surfaces:

| Surface | Purpose | Lifetime |
| --- | --- | --- |
| Sandbox files | Live Daytona filesystem, debugging, immediate preview/download | Session-scoped |
| Asset library | Durable generated/uploaded media, reusable references, searchable history | User/project-scoped |

This separation matters. The sandbox is a workspace. The asset library is a memory.

## Target Flow

```text
1. User uploads inputs
   -> /tmp/qcut-input

2. User runs QCut command in Daytona
   -> qcut flow portraits/storyboard/novel2movie/etc.
   -> outputs under /tmp/qcut-output

3. Web app ingests selected/all outputs
   -> Supabase Storage
   -> durable asset metadata rows
   -> thumbnails/previews if needed

4. User browses asset library
   -> preview images/text/video
   -> search/filter by type, command, model, prompt, run, character, scene
   -> organize into collections

5. User reuses assets
   -> selected assets are copied into /tmp/qcut-input
   -> or passed as signed URLs / asset ids to QCut
   -> usage links are recorded
```

## Storage Layout

Recommended buckets:

| Bucket | Privacy | Contents |
| --- | --- | --- |
| `qcut-assets` or `project-assets` | private | original uploaded/generated files |
| `qcut-thumbnails` or `asset-thumbnails` | public or signed | image thumbnails and poster frames |
| `qcut-previews` or `asset-previews` | public or signed | low-res video/audio preview proxies |

If QCut shares the same Supabase project as WZRD, prefer reusing `project-assets`, `asset-thumbnails`, and `asset-previews` rather than creating parallel buckets. If QCut remains a separate product/backend, use QCut-specific bucket names.

Recommended storage path:

```text
{userId}/{projectIdOrDefault}/qcut/{runId}/{assetType}/{safeFileName}
```

For interactive sandbox outputs with no project id:

```text
{userId}/personal/qcut/{sessionId}/{timestamp}/{assetType}/{safeFileName}
```

## Metadata Model

There are two reasonable options.

### Option A: Extend `agent_artifacts`

Add enough columns to make job artifacts reusable.

Pros:

- smaller migration from current QCut worker;
- existing job detail/download APIs stay useful;
- fast MVP.

Cons:

- `agent_artifacts` is job-scoped, not library-scoped;
- weak support for collections, usage tracking, search, thumbnails, and user organization;
- likely becomes cramped as the product grows.

### Option B: Add/Reuse a Real Asset Table

Create `qcut_assets`, or reuse WZRD's `project_assets`.

Recommended durable fields:

```text
id
user_id
project_id
source_kind              -- upload | qcut_generated | imported
source_session_id
source_job_id
source_sandbox_path
source_command
asset_type               -- image | video | audio | document | json | text | other
mime_type
file_size_bytes
storage_bucket
storage_path
thumbnail_bucket
thumbnail_path
preview_bucket
preview_path
original_file_name
display_name
visibility
processing_status
generation_metadata      -- prompt, model, provider, seed, scene_id, character_id, command args
created_at
updated_at
last_accessed_at
```

Recommended related tables:

```text
qcut_asset_usage
qcut_asset_collections
qcut_asset_collection_items
qcut_asset_derivations
```

`qcut_asset_derivations` is useful because QCut workflows are graph-like:

```text
portrait image -> storyboard frame -> video clip -> final edit
```

It should record parent-child asset relationships.

## Reuse Contract

Asset reuse should support both local-file and URL-based providers.

### Local File Reuse

For CLI commands that expect file paths:

```text
selected asset
  -> license-server creates signed download/read
  -> copies file into Daytona /tmp/qcut-input/assets/{assetId}-{filename}
  -> prompt/command uses local path
```

This is the most reliable path because many CLI flows already work with local files.

### URL Reuse

For providers that accept remote URLs:

```text
selected asset
  -> create short-lived signed URL
  -> pass URL to CLI/provider
```

This avoids copying large files but requires provider support and careful URL expiry handling.

### Multi-Reference Reuse

QCut video/image flows should support multiple references:

```text
--reference /tmp/qcut-input/assets/ref-1.png
--reference /tmp/qcut-input/assets/ref-2.png
--reference /tmp/qcut-input/assets/ref-3.mp4
```

or, where the CLI supports it:

```text
--references /tmp/qcut-input/references.json
```

The JSON shape is cleaner for complex flows:

```json
{
  "references": [
    {
      "assetId": "asset_1",
      "path": "/tmp/qcut-input/assets/asset_1.png",
      "role": "character_portrait",
      "weight": 0.8
    },
    {
      "assetId": "asset_2",
      "path": "/tmp/qcut-input/assets/asset_2.png",
      "role": "style_reference",
      "weight": 0.4
    }
  ]
}
```

## Web UI Shape

Minimum useful UI:

- live sandbox files panel remains as-is;
- asset library panel/page shows durable assets;
- filters: all, images, video, audio, text/json, generated, uploaded;
- preview modal/new tab;
- right-click: preview, download, copy asset id, copy storage path, copy sandbox import command, use as reference;
- action: "Save selected sandbox outputs to Assets";
- action: "Use selected assets in next QCut run";
- detail drawer: prompt/model/provider/source command/parent assets.

## Security Model

Prefer private original assets with signed URLs.

Rules:

- user can only list/read/write assets under their own user id;
- project assets require membership check once project/team support exists;
- service role can ingest from worker/server;
- preview and thumbnail buckets can be public only if they contain no sensitive originals;
- large original video download should avoid proxying when signed URL is safe enough.

## Target Architecture Conclusion

The clean architecture is:

```text
Daytona = live workspace
Supabase Storage = durable binary store
Asset table = product memory and search index
Usage/derivation tables = reuse/provenance graph
QCut CLI = generation engine
```

This keeps QCut's CLI power while making the web app feel like a real creative asset workspace.

---

# 目标架构：Supabase 上的 Durable QCut Assets

日期：2026-05-22

## 产品模型

网页端应该暴露两个不同 surface：

| Surface | 目的 | 生命周期 |
| --- | --- | --- |
| Sandbox files | 真实 Daytona filesystem、debug、即时预览/下载 | Session-scoped |
| Asset library | 持久 generated/uploaded media、可复用 references、可搜索历史 | User/project-scoped |

这个区分很重要。Sandbox 是工作区，Asset library 是记忆。

## 目标流程

```text
1. 用户上传 inputs
   -> /tmp/qcut-input

2. 用户在 Daytona 里运行 QCut command
   -> qcut flow portraits/storyboard/novel2movie/etc.
   -> outputs under /tmp/qcut-output

3. Web app ingest selected/all outputs
   -> Supabase Storage
   -> durable asset metadata rows
   -> thumbnails/previews if needed

4. 用户浏览 asset library
   -> preview images/text/video
   -> 按 type、command、model、prompt、run、character、scene 搜索/过滤
   -> organize into collections

5. 用户复用 assets
   -> selected assets are copied into /tmp/qcut-input
   -> or passed as signed URLs / asset ids to QCut
   -> usage links are recorded
```

## Storage Layout

推荐 buckets：

| Bucket | 隐私 | 内容 |
| --- | --- | --- |
| `qcut-assets` 或 `project-assets` | private | 原始上传/生成文件 |
| `qcut-thumbnails` 或 `asset-thumbnails` | public 或 signed | image thumbnails 和 poster frames |
| `qcut-previews` 或 `asset-previews` | public 或 signed | low-res video/audio preview proxies |

如果 QCut 和 WZRD 共用同一个 Supabase project，优先复用 `project-assets`、`asset-thumbnails`、`asset-previews`，不要再造一套平行 bucket。如果 QCut 保持独立 backend，则使用 QCut-specific bucket names。

推荐 storage path：

```text
{userId}/{projectIdOrDefault}/qcut/{runId}/{assetType}/{safeFileName}
```

对于没有 project id 的 interactive sandbox outputs：

```text
{userId}/personal/qcut/{sessionId}/{timestamp}/{assetType}/{safeFileName}
```

## Metadata Model

有两个合理选择。

### 方案 A：扩展 `agent_artifacts`

给现有 job artifacts 增加足够字段，让它可以复用。

优点：

- 从当前 QCut worker 迁移成本更小；
- 现有 job detail/download APIs 继续可用；
- MVP 快。

缺点：

- `agent_artifacts` 是 job-scoped，不是 library-scoped；
- 对 collection、usage tracking、search、thumbnail、用户组织支持弱；
- 产品一复杂就会变挤。

### 方案 B：新增/复用真正的 Asset Table

创建 `qcut_assets`，或复用 WZRD 的 `project_assets`。

推荐 durable fields：

```text
id
user_id
project_id
source_kind              -- upload | qcut_generated | imported
source_session_id
source_job_id
source_sandbox_path
source_command
asset_type               -- image | video | audio | document | json | text | other
mime_type
file_size_bytes
storage_bucket
storage_path
thumbnail_bucket
thumbnail_path
preview_bucket
preview_path
original_file_name
display_name
visibility
processing_status
generation_metadata      -- prompt, model, provider, seed, scene_id, character_id, command args
created_at
updated_at
last_accessed_at
```

推荐相关表：

```text
qcut_asset_usage
qcut_asset_collections
qcut_asset_collection_items
qcut_asset_derivations
```

`qcut_asset_derivations` 很有用，因为 QCut workflows 是 graph-like：

```text
portrait image -> storyboard frame -> video clip -> final edit
```

它应该记录 parent-child asset relationships。

## Reuse Contract

资产复用应该同时支持 local-file 和 URL-based providers。

### Local File Reuse

对于期待 file paths 的 CLI commands：

```text
selected asset
  -> license-server creates signed download/read
  -> copies file into Daytona /tmp/qcut-input/assets/{assetId}-{filename}
  -> prompt/command uses local path
```

这是最可靠的路径，因为很多 CLI flows 已经支持 local files。

### URL Reuse

对于接受 remote URLs 的 providers：

```text
selected asset
  -> create short-lived signed URL
  -> pass URL to CLI/provider
```

这能避免复制大文件，但需要 provider 支持，并且要谨慎处理 URL expiry。

### Multi-Reference Reuse

QCut video/image flows 应该支持 multiple references：

```text
--reference /tmp/qcut-input/assets/ref-1.png
--reference /tmp/qcut-input/assets/ref-2.png
--reference /tmp/qcut-input/assets/ref-3.mp4
```

或者在 CLI 支持时：

```text
--references /tmp/qcut-input/references.json
```

复杂 flows 用 JSON shape 更干净：

```json
{
  "references": [
    {
      "assetId": "asset_1",
      "path": "/tmp/qcut-input/assets/asset_1.png",
      "role": "character_portrait",
      "weight": 0.8
    },
    {
      "assetId": "asset_2",
      "path": "/tmp/qcut-input/assets/asset_2.png",
      "role": "style_reference",
      "weight": 0.4
    }
  ]
}
```

## Web UI 形态

最小可用 UI：

- live sandbox files panel 保持现状；
- asset library panel/page 展示 durable assets；
- filters：all、images、video、audio、text/json、generated、uploaded；
- preview modal/new tab；
- 右键：preview、download、copy asset id、copy storage path、copy sandbox import command、use as reference；
- action：`Save selected sandbox outputs to Assets`；
- action：`Use selected assets in next QCut run`；
- detail drawer：prompt/model/provider/source command/parent assets。

## Security Model

推荐 private original assets + signed URLs。

规则：

- user 只能 list/read/write 自己 user id 下的 assets；
- 一旦有 project/team 支持，project assets 需要 membership check；
- service role 可以从 worker/server ingest；
- preview 和 thumbnail buckets 可以 public，但前提是里面没有敏感 original；
- 大视频下载能用 signed URL 就不要走 proxy。

## 目标架构结论

清晰的架构是：

```text
Daytona = live workspace
Supabase Storage = durable binary store
Asset table = product memory and search index
Usage/derivation tables = reuse/provenance graph
QCut CLI = generation engine
```

这样既保留 QCut CLI 的能力，又让网页端体验像一个真正的 creative asset workspace。
