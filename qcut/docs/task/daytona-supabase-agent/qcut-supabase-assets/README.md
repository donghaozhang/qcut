# QCut Supabase Asset Library Migration

Date: 2026-05-22

## Question

If we want to turn the current QCut Daytona generation flow into a web-first experience with a reusable asset library backed by Supabase Storage, how hard is it?

This analysis is about QCut:

- QCut CLI generation in Daytona sandboxes.
- Files produced under `/tmp/qcut-output`.
- The current website Chat Agent artifact/file browser.
- A future durable asset library where generated images, videos, audio, JSON, Markdown, and text can be reused as references for later QCut runs.

It uses `wzrdagentstudio-main` as the reference implementation for Supabase-style asset storage, not as code to copy wholesale.

## Short Answer

The work is feasible, but it is not just a storage upload task.

The current QCut web path already has the hard first piece: a real Daytona sandbox, `/tmp/qcut-input` uploads, `/tmp/qcut-output` artifacts, preview, right-click download, folder download, and job artifacts persisted to the `artifacts` bucket for headless jobs.

What is missing is the durable product layer:

- asset records that survive beyond the current sandbox/session;
- thumbnails/previews and metadata extraction;
- a library UI for browsing, searching, selecting, grouping, and reusing assets;
- a reference contract so selected assets can be injected back into `/tmp/qcut-input` or passed to QCut CLI as URLs/local files;
- provenance from QCut command, model, prompt, provider, source files, and parent assets;
- RLS/private storage and signed download/preview URLs.

## Difficulty

| Scope | Difficulty | Rough effort |
| --- | --- | --- |
| Persist current QCut outputs into a Supabase asset table and bucket | Medium | 5-8 engineer-days |
| Usable web asset library for generated QCut artifacts, preview/download/reuse | Medium-high | 2-3 weeks |
| Production-grade library with signed URLs, thumbnails, quotas, cleanup, usage tracking, and robust E2E | High | 4-6 weeks |
| Full WZRD-like media OS with collections, advanced processing, billing-aware storage, CDN/R2 migration path, and multi-project collaboration | High+ | 6-10 weeks |

Best practical path: ship this in phases. Start by ingesting QCut outputs into a durable asset table while keeping the existing Daytona file browser. Then add the library and reuse flow.

## Recommended Document Order

1. [Current State](01-current-state.md)
2. [Target Architecture](02-target-architecture.md)
3. [Implementation Plan](03-implementation-plan.md)
4. [Effort, Risks, and Testing](04-effort-risk-testing.md)

## Key Recommendation

Do not replace the current Daytona file browser first. Keep it as the live workspace view. Add a separate durable "Assets" layer beside it:

```text
Daytona sandbox filesystem
  /tmp/qcut-input
  /tmp/qcut-output
        |
        | ingest selected/all generated files
        v
Supabase Storage + asset metadata
        |
        | browse/select/reuse
        v
next QCut run references
```

That keeps live debugging simple while giving users a cleaner, reusable asset library.

---

# QCut Supabase 资产库迁移

日期：2026-05-22

## 问题

如果我们想把现在 QCut Daytona 生成流程改成一个网页端优先、并且由 Supabase Storage 支撑的可复用资产库，难度有多大？

这里分析的是 QCut：

- QCut CLI 在 Daytona sandbox 里生成内容。
- 产物默认写到 `/tmp/qcut-output`。
- 当前网站 Chat Agent 里的 artifacts/file browser。
- 未来的持久资产库：生成出来的图片、视频、音频、JSON、Markdown、文本，都可以作为后续 QCut 运行的 reference 再次使用。

`wzrdagentstudio-main` 在这里是 Supabase 风格资产系统的参考，不代表要直接照搬 UI 代码。

## 简短结论

这件事可行，但它不只是“上传到 Storage”这么简单。

QCut 现在已经有一个很重要的基础：真实 Daytona sandbox、`/tmp/qcut-input` 上传、`/tmp/qcut-output` 生成产物、预览、右键下载、文件夹下载，以及 headless job artifact 持久化到 `artifacts` bucket。

缺的是产品层的 durable asset library：

- 资产记录要脱离当前 sandbox/session 长期存在；
- 缩略图、预览、metadata 抽取；
- 用于浏览、搜索、选择、分组、复用的 library UI；
- 一套 reference contract，让选中的资产可以被拷回 `/tmp/qcut-input`，或以 URL/local file 形式传给 QCut CLI；
- provenance：QCut command、model、prompt、provider、source files、parent assets；
- RLS/private storage 和 signed download/preview URL。

## 难度

| 范围 | 难度 | 粗略工作量 |
| --- | --- | --- |
| 把当前 QCut outputs 持久化到 Supabase asset table 和 bucket | 中等 | 5-8 个工程日 |
| 可用的网页资产库：generated artifacts 可预览/下载/复用 | 中高 | 2-3 周 |
| 生产级资产库：signed URL、thumbnail、quota、cleanup、usage tracking、完整 E2E | 高 | 4-6 周 |
| 完整 WZRD 风格 media OS：collection、高级处理、计费、CDN/R2、协作权限 | 更高 | 6-10 周 |

最实际的路线是分阶段做：先把 QCut outputs ingest 成 durable assets，同时保留现有 Daytona file browser；然后再加资产库和复用流程。

## 推荐阅读顺序

1. [现状 / Current State](01-current-state.md)
2. [目标架构 / Target Architecture](02-target-architecture.md)
3. [实施计划 / Implementation Plan](03-implementation-plan.md)
4. [工作量、风险、测试 / Effort, Risks, and Testing](04-effort-risk-testing.md)

## 核心建议

不要第一步就替换当前 Daytona file browser。它应该继续作为 live workspace。旁边增加一个 durable "Assets" 层：

```text
Daytona sandbox filesystem
  /tmp/qcut-input
  /tmp/qcut-output
        |
        | ingest selected/all generated files
        v
Supabase Storage + asset metadata
        |
        | browse/select/reuse
        v
next QCut run references
```

这样既保留了 live debug 的简单性，又给用户一个更清晰、可复用的资产库。
