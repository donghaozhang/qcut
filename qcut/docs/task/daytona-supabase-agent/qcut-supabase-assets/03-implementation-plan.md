# Implementation Plan: QCut Outputs to Reusable Web Assets

Date: 2026-05-22

## Phase 0: Define the Contract

Goal: make the vocabulary stable before changing code.

Decisions:

- Use WZRD `project_assets` style or create QCut-specific `qcut_assets`.
- Decide whether project id is required or optional.
- Decide whether `agent_artifacts` remains job history only, or becomes linked to durable assets.
- Decide storage bucket names.
- Define supported asset types: image, video, audio, document, json, text, folder/archive, other.
- Define reference injection mode: local copy, signed URL, or both.

Suggested decision:

- Keep `agent_artifacts` as job/session history.
- Add a durable asset table or reuse `project_assets`.
- Add a linking field/table: `agent_artifact_id -> asset_id`.

Deliverables:

- schema plan;
- API contract;
- UI copy for "Sandbox files" vs "Assets".

Estimated effort: 1-2 days.

## Phase 1: Persist QCut Outputs as Assets

Goal: from the current sandbox output list, save selected/all files into durable storage.

Backend work:

- Add an ingest route:

```text
POST /api/agent/sessions/:sessionId/assets/ingest
```

Request:

```json
{
  "paths": ["/tmp/qcut-output/frame-001.png"],
  "projectId": null,
  "collectionId": null,
  "mode": "selected"
}
```

Response:

```json
{
  "assets": [
    {
      "id": "asset_id",
      "assetType": "image",
      "storagePath": "user/project/qcut/run/image/frame-001.png"
    }
  ]
}
```

Implementation notes:

- reuse existing Daytona file download/read path;
- stream files to Supabase Storage;
- insert asset rows in one transaction when possible;
- best-effort rollback storage if metadata insert fails;
- preserve original sandbox path in metadata;
- record source session id, command/job if known, file bytes, MIME type.

Frontend work:

- add "Save to Assets" action to file context menu;
- add "Save folder to Assets" for folders;
- add status and error reporting;
- keep download/preview behavior unchanged.

Testing:

- unit tests for path validation and file classification;
- integration test for ingest route with mocked Daytona FS and mocked storage;
- Playwright E2E: create image/json/text files in `/tmp/qcut-output`, save to assets, verify library list.

Estimated effort: 5-8 days.

## Phase 2: Asset Library UI

Goal: users can browse durable QCut assets without needing the sandbox alive.

UI options:

1. Add an asset tab/page to current static `chat-agent.html`.
2. Build a React page and gradually move Chat Agent UI into React.
3. Integrate QCut into WZRD and use WZRD's existing AssetLibrary patterns.

Recommended MVP:

- keep current static UI;
- add a lightweight assets panel using plain JS and license-server APIs;
- do not block on a React migration.

Library features:

- list assets;
- filter by type;
- preview image/text/json/video;
- download;
- copy asset id/path;
- show source command/session;
- delete/archive;
- select assets for reuse.

Backend routes:

```text
GET    /api/assets
GET    /api/assets/:assetId
GET    /api/assets/:assetId/download
POST   /api/assets/:assetId/signed-url
PATCH  /api/assets/:assetId
DELETE /api/assets/:assetId
```

Testing:

- route authorization tests;
- UI tests for preview/download/copy path;
- user isolation test.

Estimated effort: 1-2 weeks.

## Phase 3: Reuse Assets in QCut Runs

Goal: selected assets become inputs/references for new QCut commands.

Backend work:

- add route to import assets into current Daytona sandbox:

```text
POST /api/agent/sessions/:sessionId/assets/import
```

Request:

```json
{
  "assetIds": ["asset_1", "asset_2"],
  "targetFolder": "/tmp/qcut-input/assets",
  "writeReferencesJson": true
}
```

Response:

```json
{
  "files": [
    {
      "assetId": "asset_1",
      "path": "/tmp/qcut-input/assets/asset_1.png"
    }
  ],
  "referencesPath": "/tmp/qcut-input/references.json"
}
```

Frontend work:

- asset selection mode;
- "Use in next prompt" or "Import to sandbox";
- display generated local paths;
- optionally inject a suggested command snippet into Codex input.

QCut CLI consideration:

- existing commands can already accept normal file paths in many cases;
- for complex multi-reference workflows, a `--references` JSON option would be cleaner than many repeated flags;
- this can be added incrementally per command, starting with image/video reference flows.

Testing:

- import image asset into sandbox;
- run a real QCut image/video command using imported reference;
- verify `asset_usage` or equivalent records the reuse.

Estimated effort: 1-2 weeks depending on how much CLI reference normalization is required.

## Phase 4: Processing, Provenance, and Hardening

Goal: make it production-grade.

Processing:

- thumbnail for images;
- poster frame and low-res preview for video;
- waveform or duration metadata for audio;
- text/json previews with size caps;
- EXIF/media metadata extraction where useful.

Provenance:

- source command;
- prompt;
- model;
- provider;
- seed;
- runtime duration;
- parent asset ids;
- QCut flow stage: characters, portraits, storyboard, video, final export.

Security:

- private originals;
- signed URLs;
- user/project RLS;
- path normalization;
- no arbitrary sandbox path ingestion outside allowed roots.

Operations:

- storage quota;
- cleanup orphan rows/files;
- retry failed processing;
- clear error states;
- admin audit view.

Testing:

- RLS/user isolation;
- large video ingest/download;
- signed URL expiry;
- thumbnail generation failure path;
- retry and cleanup jobs.

Estimated effort: 2-3 additional weeks.

## Migration Sequence

Recommended order:

1. Do not remove current sandbox file browser.
2. Add durable asset schema and storage bucket.
3. Add server-side ingest from `/tmp/qcut-output`.
4. Add "Save to Assets" from file/folder context menu.
5. Add asset library list/preview/download.
6. Add import selected assets back into `/tmp/qcut-input`.
7. Add usage/derivation tracking.
8. Add thumbnails/previews and cleanup jobs.

## Implementation Plan Conclusion

The smallest valuable version is:

```text
Generate in QCut -> save selected outputs to Assets -> preview/download later -> import selected assets into next QCut run
```

That can be built without rewriting the whole web app.

---

# 实施计划：QCut Outputs 到可复用 Web Assets

日期：2026-05-22

## Phase 0：定义 Contract

目标：在改代码前先稳定词汇和边界。

需要决策：

- 使用 WZRD `project_assets` 风格，还是创建 QCut-specific `qcut_assets`。
- project id 是必需还是可选。
- `agent_artifacts` 只保留 job history，还是和 durable assets 建立链接。
- storage bucket names。
- 支持的 asset types：image、video、audio、document、json、text、folder/archive、other。
- reference injection mode：local copy、signed URL，或两者都支持。

推荐决策：

- `agent_artifacts` 保持 job/session history。
- 新增 durable asset table，或复用 `project_assets`。
- 加一个 linking field/table：`agent_artifact_id -> asset_id`。

交付物：

- schema plan；
- API contract；
- UI 文案：`Sandbox files` vs `Assets`。

预计工作量：1-2 天。

## Phase 1：把 QCut Outputs 持久化成 Assets

目标：从当前 sandbox output list 里，把 selected/all files 保存到 durable storage。

Backend work：

- 新增 ingest route：

```text
POST /api/agent/sessions/:sessionId/assets/ingest
```

Request：

```json
{
  "paths": ["/tmp/qcut-output/frame-001.png"],
  "projectId": null,
  "collectionId": null,
  "mode": "selected"
}
```

Response：

```json
{
  "assets": [
    {
      "id": "asset_id",
      "assetType": "image",
      "storagePath": "user/project/qcut/run/image/frame-001.png"
    }
  ]
}
```

实现注意：

- 复用现有 Daytona file download/read path；
- stream files 到 Supabase Storage；
- 尽可能用 transaction 插入 asset rows；
- metadata insert 失败时 best-effort rollback storage；
- 保留 original sandbox path；
- 记录 source session id、command/job、file bytes、MIME type。

Frontend work：

- file context menu 加 `Save to Assets`；
- folder context menu 加 `Save folder to Assets`；
- 加 status 和 error reporting；
- 保持现有 download/preview behavior 不变。

Testing：

- path validation 和 file classification 的 unit tests；
- mocked Daytona FS + mocked storage 的 ingest route integration test；
- Playwright E2E：在 `/tmp/qcut-output` 创建 image/json/text files，save to assets，验证 library list。

预计工作量：5-8 天。

## Phase 2：Asset Library UI

目标：用户不需要 sandbox 还活着，也能浏览 durable QCut assets。

UI options：

1. 给当前 static `chat-agent.html` 加 asset tab/page。
2. 建一个 React page，并逐步把 Chat Agent UI 迁过去。
3. 把 QCut 整合进 WZRD，使用 WZRD 现有 AssetLibrary patterns。

推荐 MVP：

- 保持当前 static UI；
- 用 plain JS + license-server APIs 加一个 lightweight assets panel；
- 不要让 React migration 卡住 MVP。

Library features：

- list assets；
- filter by type；
- preview image/text/json/video；
- download；
- copy asset id/path；
- show source command/session；
- delete/archive；
- select assets for reuse。

Backend routes：

```text
GET    /api/assets
GET    /api/assets/:assetId
GET    /api/assets/:assetId/download
POST   /api/assets/:assetId/signed-url
PATCH  /api/assets/:assetId
DELETE /api/assets/:assetId
```

Testing：

- route authorization tests；
- preview/download/copy path 的 UI tests；
- user isolation test。

预计工作量：1-2 周。

## Phase 3：在 QCut Runs 中复用 Assets

目标：被选中的 assets 能成为新 QCut commands 的 inputs/references。

Backend work：

- 新增 route，把 assets import 到当前 Daytona sandbox：

```text
POST /api/agent/sessions/:sessionId/assets/import
```

Request：

```json
{
  "assetIds": ["asset_1", "asset_2"],
  "targetFolder": "/tmp/qcut-input/assets",
  "writeReferencesJson": true
}
```

Response：

```json
{
  "files": [
    {
      "assetId": "asset_1",
      "path": "/tmp/qcut-input/assets/asset_1.png"
    }
  ],
  "referencesPath": "/tmp/qcut-input/references.json"
}
```

Frontend work：

- asset selection mode；
- `Use in next prompt` 或 `Import to sandbox`；
- 展示生成的 local paths；
- 可选：把推荐 command snippet 注入 Codex input。

QCut CLI consideration：

- 许多现有 commands 已经能接受普通 file paths；
- 对复杂 multi-reference workflows，`--references` JSON option 会比很多重复 flags 更清晰；
- 可以按 command 逐步添加，先从 image/video reference flows 开始。

Testing：

- import image asset into sandbox；
- run real QCut image/video command using imported reference；
- 验证 `asset_usage` 或同等记录写入 reuse。

预计工作量：1-2 周，取决于 CLI reference normalization 的范围。

## Phase 4：Processing、Provenance、Hardening

目标：达到生产级。

Processing：

- image thumbnails；
- video poster frame 和 low-res preview；
- audio waveform 或 duration metadata；
- text/json previews with size caps；
- 必要时提取 EXIF/media metadata。

Provenance：

- source command；
- prompt；
- model；
- provider；
- seed；
- runtime duration；
- parent asset ids；
- QCut flow stage：characters、portraits、storyboard、video、final export。

Security：

- private originals；
- signed URLs；
- user/project RLS；
- path normalization；
- 禁止 ingest allowed roots 以外的 arbitrary sandbox path。

Operations：

- storage quota；
- cleanup orphan rows/files；
- retry failed processing；
- clear error states；
- admin audit view。

Testing：

- RLS/user isolation；
- large video ingest/download；
- signed URL expiry；
- thumbnail generation failure path；
- retry and cleanup jobs。

预计工作量：额外 2-3 周。

## 迁移顺序

推荐顺序：

1. 不移除当前 sandbox file browser。
2. 添加 durable asset schema 和 storage bucket。
3. 添加从 `/tmp/qcut-output` ingest 的 server route。
4. 给 file/folder context menu 加 `Save to Assets`。
5. 添加 asset library list/preview/download。
6. 把 selected assets import 回 `/tmp/qcut-input`。
7. 添加 usage/derivation tracking。
8. 添加 thumbnails/previews 和 cleanup jobs。

## 实施计划结论

最小有价值版本是：

```text
Generate in QCut -> save selected outputs to Assets -> preview/download later -> import selected assets into next QCut run
```

这个版本不需要重写整个 web app。
