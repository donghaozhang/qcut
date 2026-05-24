# Effort, Risks, and Testing

Date: 2026-05-22

## Work Estimate

| Area | MVP effort | Production effort | Notes |
| --- | ---: | ---: | --- |
| Schema and storage buckets | 1-2 days | 3-5 days | More if sharing WZRD tables requires migration compatibility |
| Ingest sandbox outputs to assets | 3-5 days | 1-2 weeks | Streaming, rollback, folders, large videos, MIME detection |
| Asset library list/preview/download | 4-7 days | 2-3 weeks | Current preview code helps, but durable routes/auth are new |
| Asset reuse into Daytona input | 3-6 days | 1-2 weeks | Local copy is easier than provider URL support |
| Usage/provenance tracking | 2-4 days | 1-2 weeks | Important for generated media chains |
| Thumbnails/proxy previews | 3-5 days | 1-2 weeks | Video proxies are the expensive part |
| E2E and security tests | 3-5 days | 1-2 weeks | Must cover user isolation and large files |

## Total Estimate

### MVP

Roughly 2-3 weeks for one engineer.

MVP definition:

- save selected QCut `/tmp/qcut-output` files to durable Supabase assets;
- list and preview durable assets;
- download durable assets;
- import selected assets into `/tmp/qcut-input`;
- prove one real reuse flow E2E.

### Production-Ready

Roughly 4-6 weeks.

Production definition:

- robust private storage and signed URLs;
- thumbnails/previews;
- folder ingest;
- large video handling;
- asset usage and derivation graph;
- cleanup/retry;
- broad tests;
- usable UI polish.

### Full WZRD-Level Media System

Roughly 6-10 weeks.

This includes collections, advanced search, quotas, processing queue, CDN/R2 migration path, team/project permissions, billing-aware storage, and a richer React-style asset management surface.

## Main Risks

### 1. Confusing Sandbox Files with Assets

Risk: users may not understand why a file appears in `/tmp/qcut-output` but is not in the library.

Mitigation:

- keep labels explicit: "Sandbox files" and "Saved assets";
- add one action: "Save to Assets";
- show saved state on sandbox files when possible.

### 2. Large Video Files

Risk: large videos can break base64 uploads, browser memory, worker memory, and proxy downloads.

Mitigation:

- stream server-side from Daytona to Storage;
- do not base64 video payloads;
- use signed URLs for download where possible;
- cap preview text and proxy video sizes;
- keep `bytes` as bigint-compatible, as QCut already started doing for artifacts.

### 3. Permissions and Storage Paths

Risk: path-based storage security can become accidental public access.

Mitigation:

- originals should be private;
- storage path starts with user id;
- all list/download/import routes verify user ownership;
- signed URLs expire quickly;
- RLS policies mirror the user/project model.

### 4. Provider Reference Compatibility

Risk: not every image/video provider accepts the same reference format.

Mitigation:

- first support local file references in Daytona;
- later add provider-specific URL/reference adapters;
- store references in a normalized JSON file for complex workflows.

### 5. Metadata Drift

Risk: QCut commands produce different metadata shapes, making search/provenance inconsistent.

Mitigation:

- define a small stable metadata core: prompt, model, provider, command, stage, parent assets;
- allow extra command-specific JSON in `generation_metadata`;
- add tests for each flow that should emit metadata.

### 6. UI Framework Split

Risk: WZRD uses React, QCut website is static JS. Copying components directly can create a half-migrated UI.

Mitigation:

- use WZRD as schema/service inspiration;
- build a small static-JS asset panel first;
- only migrate to React when there is a wider product reason.

## Testing Plan

### Unit Tests

Cover:

- safe storage path generation;
- sandbox path allowlist: `/tmp/qcut-output`, `/tmp/qcut-input` where appropriate;
- MIME/kind detection;
- asset metadata normalization;
- signed URL expiry handling;
- command/reference JSON generation.

### Integration Tests

Cover:

- ingest one image file from mocked Daytona FS to mocked Supabase Storage;
- ingest folder with image/json/text/video files;
- failed DB insert rolls back uploaded object;
- failed upload leaves no asset row;
- user A cannot ingest/list/download user B assets;
- import selected assets back into sandbox.

### E2E Tests

Minimum real Daytona E2E:

```text
1. Open production chat-agent page with local branch override if needed.
2. Connect to real Daytona sandbox.
3. Generate or create small image/json/text outputs in /tmp/qcut-output.
4. Save selected outputs to Assets.
5. Refresh or start a new session.
6. Confirm assets still appear without relying on the old sandbox.
7. Preview image and text/json.
8. Download one asset locally.
9. Import one image asset into /tmp/qcut-input/assets.
10. Run a small QCut command using that imported file as a reference.
11. Confirm usage/provenance links exist.
```

Large-file E2E:

```text
1. Generate or upload a short video.
2. Save video to Assets.
3. Confirm no base64 path is used.
4. Download through signed URL or authenticated route.
5. Generate preview/poster if enabled.
```

Security E2E:

```text
1. User A saves asset.
2. User B attempts list/download/import by id/path.
3. All access fails.
```

## Decision Matrix

| Decision | Recommendation |
| --- | --- |
| Replace sandbox file browser? | No, keep it as live workspace |
| Build durable assets? | Yes, separate layer |
| Reuse WZRD code directly? | Mostly no, reuse architecture first |
| Use private originals? | Yes |
| Store generated QCut metadata? | Yes, from day one |
| Support asset reuse? | Yes, via local copy first |
| Add React migration now? | Not required for MVP |

## Final Assessment

This is a medium-high complexity project because it touches product UX, storage, security, worker/runtime paths, and QCut CLI reference semantics.

But it is a good project structurally. QCut already has a strong live-generation base, and WZRD already demonstrates the asset-library pattern. The right implementation is incremental:

```text
Live sandbox files stay live.
Saved assets become durable.
Durable assets become references for future QCut generation.
```

That is the bridge from "downloads in a temporary workspace" to "a real web creative asset system".

---

# 工作量、风险与测试

日期：2026-05-22

## 工作量估算

| Area | MVP 工作量 | 生产级工作量 | 说明 |
| --- | ---: | ---: | --- |
| Schema and storage buckets | 1-2 天 | 3-5 天 | 如果要兼容 WZRD tables，migration 会更复杂 |
| Ingest sandbox outputs to assets | 3-5 天 | 1-2 周 | Streaming、rollback、folders、大视频、MIME detection |
| Asset library list/preview/download | 4-7 天 | 2-3 周 | 现有 preview code 有帮助，但 durable routes/auth 是新的 |
| Asset reuse into Daytona input | 3-6 天 | 1-2 周 | Local copy 比 provider URL support 更容易 |
| Usage/provenance tracking | 2-4 天 | 1-2 周 | 对 generated media chain 很重要 |
| Thumbnails/proxy previews | 3-5 天 | 1-2 周 | Video proxy 是最花时间的部分 |
| E2E and security tests | 3-5 天 | 1-2 周 | 必须覆盖 user isolation 和 large files |

## 总估算

### MVP

一个工程师大约 2-3 周。

MVP 定义：

- 保存 selected QCut `/tmp/qcut-output` files 到 durable Supabase assets；
- list 和 preview durable assets；
- download durable assets；
- import selected assets 到 `/tmp/qcut-input`；
- 用一次真实 E2E 证明 reuse flow。

### Production-Ready

大约 4-6 周。

生产可用定义：

- robust private storage 和 signed URLs；
- thumbnails/previews；
- folder ingest；
- large video handling；
- asset usage 和 derivation graph；
- cleanup/retry；
- broad tests；
- UI polish。

### Full WZRD-Level Media System

大约 6-10 周。

包括 collections、advanced search、quotas、processing queue、CDN/R2 migration path、team/project permissions、billing-aware storage，以及更丰富的 React-style asset management surface。

## 主要风险

### 1. 混淆 Sandbox Files 和 Assets

风险：用户可能不理解为什么文件出现在 `/tmp/qcut-output`，但没有出现在 library。

缓解：

- 明确 label：`Sandbox files` 和 `Saved assets`；
- 提供一个清晰 action：`Save to Assets`；
- 可能的话，在 sandbox files 上显示 saved state。

### 2. 大视频文件

风险：大视频会打爆 base64 uploads、browser memory、worker memory、proxy downloads。

缓解：

- server-side stream from Daytona to Storage；
- 不要把视频走 base64 payload；
- 尽可能用 signed URLs download；
- preview text 和 proxy video 都加 size cap；
- `bytes` 保持 bigint-compatible，QCut artifacts 已经朝这个方向走了。

### 3. 权限和 Storage Paths

风险：path-based storage security 容易变成意外 public access。

缓解：

- originals 应该 private；
- storage path 以 user id 开头；
- 所有 list/download/import routes 校验 user ownership；
- signed URLs 短期过期；
- RLS policies 对齐 user/project model。

### 4. Provider Reference Compatibility

风险：不是所有 image/video provider 都接受同一种 reference format。

缓解：

- 先支持 Daytona local file references；
- 之后再加 provider-specific URL/reference adapters；
- 复杂 workflows 用 normalized JSON file 存 references。

### 5. Metadata Drift

风险：QCut commands 产出的 metadata shape 不统一，会导致 search/provenance 混乱。

缓解：

- 定义小而稳定的 metadata core：prompt、model、provider、command、stage、parent assets；
- command-specific JSON 放进 `generation_metadata`；
- 对每个应该 emit metadata 的 flow 加 tests。

### 6. UI Framework Split

风险：WZRD 使用 React，QCut website 是 static JS。直接 copy components 容易变成半迁移 UI。

缓解：

- WZRD 主要作为 schema/service inspiration；
- MVP 先做小的 static-JS asset panel；
- 只有在更大产品原因出现时，再迁 React。

## 测试计划

### Unit Tests

覆盖：

- safe storage path generation；
- sandbox path allowlist：`/tmp/qcut-output`、必要时 `/tmp/qcut-input`；
- MIME/kind detection；
- asset metadata normalization；
- signed URL expiry handling；
- command/reference JSON generation。

### Integration Tests

覆盖：

- 从 mocked Daytona FS ingest 一张 image 到 mocked Supabase Storage；
- ingest folder with image/json/text/video files；
- DB insert 失败时 rollback uploaded object；
- upload 失败时不留下 asset row；
- user A 不能 ingest/list/download user B assets；
- import selected assets back into sandbox。

### E2E Tests

最小 real Daytona E2E：

```text
1. 打开 production chat-agent page，必要时用 local branch override。
2. 连接真实 Daytona sandbox。
3. 在 /tmp/qcut-output 生成或创建小 image/json/text outputs。
4. Save selected outputs to Assets。
5. Refresh 或 start new session。
6. 确认 assets 不依赖旧 sandbox 仍然出现。
7. Preview image 和 text/json。
8. Download one asset locally。
9. Import one image asset into /tmp/qcut-input/assets。
10. Run a small QCut command using that imported file as a reference。
11. 确认 usage/provenance links 存在。
```

Large-file E2E：

```text
1. 生成或上传短视频。
2. Save video to Assets。
3. 确认没有使用 base64 path。
4. 通过 signed URL 或 authenticated route 下载。
5. 如启用，生成 preview/poster。
```

Security E2E：

```text
1. User A 保存 asset。
2. User B 尝试通过 id/path list/download/import。
3. 所有访问都失败。
```

## 决策矩阵

| Decision | Recommendation |
| --- | --- |
| Replace sandbox file browser? | No，保留为 live workspace |
| Build durable assets? | Yes，作为单独一层 |
| Reuse WZRD code directly? | Mostly no，先复用 architecture |
| Use private originals? | Yes |
| Store generated QCut metadata? | Yes，从第一天开始 |
| Support asset reuse? | Yes，先走 local copy |
| Add React migration now? | MVP 不需要 |

## 最终评估

这是一个中高复杂度项目，因为它同时触碰 product UX、storage、security、worker/runtime paths、QCut CLI reference semantics。

但结构上这是个值得做的项目。QCut 已经有很强的 live-generation base，WZRD 已经证明了 asset-library pattern。正确实现方式是 incremental：

```text
Live sandbox files stay live.
Saved assets become durable.
Durable assets become references for future QCut generation.
```

这就是从“临时 workspace 里的下载文件”走向“真正 web creative asset system”的桥。
