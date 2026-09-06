# Compose 云任务与实验室接入

更新：2026-09-06。代码分支：`timeline-fixed-prfix`。

## 实现范围

| 原缺口 | 当前代码路径 |
| --- | --- |
| fal unsupported | 独立 FAL 队列适配器：提交、查询、结果下载、取消请求；记录远端 request_id |
| qcut 只是 OpenRouter 别名 | 认证 HTTP API + PostgreSQL 持久任务队列 + 独立 Bun worker；worker 内部使用 OpenRouter 规划 |
| Snapshot beats/shots 为空 | 调用现有本地节拍和场景检测；可选 AI 帧分析提供镜头描述、对象、情绪和构图标签 |
| 字幕样式丢失 | 字幕预设映射；编辑器内置模板/文字预设展开；Font Lab 字体引用、花字和原生模板/动画绑定进入文字时间线 |
| Broker 只有三类资源 | 增加滤镜、字体、文字模板、花字、文字动画、当前项目已保存的生成图片/视频 |

资源发现不等于渲染验证。候选带许可、可用性及运行时需求；preview-only 文字和不可用滤镜不进入候选池。私有素材包不提交到 Git，也不上传至规划服务。

## 云端运行

服务端入口为 `packages/license-server/src/routes/compose.ts`，路径：

- `POST /api/compose/jobs`：认证用户提交，job ID + 输入摘要实现幂等。
- `GET /api/compose/jobs/:id`：仅本人可读状态。
- `GET /api/compose/jobs/:id/result`：完成后取结果。
- `POST /api/compose/jobs/:id/cancel`：取消本人未完成任务。

上线需要运维执行，**本次没有部署或修改生产数据库**：

1. 用项目正常迁移流程应用 `packages/db/migrations/0010_compose_jobs.sql`。Drizzle schema、journal、snapshot 已同步。数据库连接必须使用受信服务角色；表启用了 RLS，没有给公共角色开放策略。
2. 为独立 worker 配置 `DATABASE_URL`、`OPENROUTER_API_KEY`，可选 `QCUT_COMPOSE_MODEL`。不要把密钥写进仓库、快照或日志。
3. 从仓库运行 `bun run scripts/compose-worker.ts`，由部署平台管理重启；可运行多个 worker。
4. API 与 worker 使用同一数据库，准备就绪后设置 API 的 `QCUT_COMPOSE_ENABLED=true`。默认不开通付费规划入口。
5. 客户端登录 QCut，必要时设置 `QCUT_COMPOSE_API_URL` 指向部署后的 API。仅允许 HTTPS 或本机 HTTP 开发地址。

任务认领使用 `FOR UPDATE SKIP LOCKED`，租约 5 分钟，模型调用限时 120 秒。进程退出后，过期租约可被接管，最多 3 次认领；只有当前有效租约可以写回结果，取消不能被迟到结果覆盖。模型调用是至少一次语义：提交模型后崩溃可能产生重复模型费用，不宣称 exactly-once billing。

当前准入上限为每用户 3 个未完成任务、滚动 24 小时 20 次新任务；请求体上限 2 MiB。这是受控启用的初始配额，不是订阅积分结算系统。终态记录保留在数据库，生产环境需要制定保留与清理策略。

## 客户端使用和恢复

```bash
qcut compose snapshot --output snapshot.json --json
# 可选：调用已配置的视觉分析提供商，可能消耗额度。
qcut compose snapshot --analysis-type visual --output visual-snapshot.json --json
qcut compose plan --snapshot snapshot.json --provider qcut --intent full-compose --output patch.json --json
qcut compose plan --snapshot snapshot.json --provider fal --intent full-compose --output fal-patch.json --json
qcut compose plan --job-id SAVED_JOB_ID --output resumed-patch.json --json
```

FAL 使用 `FAL_KEY`，默认路由模型为 `google/gemini-2.5-flash`。任务完整恢复记录位于 `~/.qcut/compose/jobs/`，可用 `QCUT_COMPOSE_JOB_DIR` 改写；文件权限 0600，原子替换，使用进程间锁。输出目录中的 `compose/jobs/*.json` 只是状态报告，不是完整恢复记录。

恢复使用原始快照、意图和 provider；不要同时传入新的 `--snapshot` 或 `--intent`。轮询次数用尽不会取消远端任务。OpenRouter 直接适配器和 local 适配器仍不是持久队列，不支持此恢复方式。

FAL 提交响应丢失时无法安全断言服务端是否已受理，因此保留 uploading 状态并拒绝自动重复提交。需要人工在 FAL 查询 request_id 后修复本地恢复记录的 remoteTaskId/status，保留其他字段；操作前备份该记录。FAL 的取消响应只证明请求已发送，不保证运行中的模型停止或免计费。

接口依据：[FAL Router API](https://fal.ai/models/openrouter/router/api)、[FAL Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue)。适配器不跟随远端返回的任意 URL，认证信息只发给固定服务地址。

## 分析和时间线

- 普通快照提取本地节拍和场景边界；`--analysis-type visual` 才执行视觉分析，每个媒体最多 20 个采样点。镜头描述作为 `shots[].label` 进入云端规划输入。
- 按 media ID 复用分析，再按每个片段的 trimStart 和固定 playbackRate 映射时间；静音片段不提供节拍。逆放或变速关键帧暂不分析，并给出警告。
- 分析不可用时保留警告，不虚构语义；无场景结果时的未标注 shot 只是片段边界，不是检测成功证据。
- `add-caption.stylePresetId` 使用字幕预设：default、cinematic、bold、minimal、karaoke、news。普通字幕仍是 captions 元素；需要富文字能力的字幕变成可编辑 text 元素，保留语言和内容。
- `textTemplateId` 使用现有内置文字模板注册表；文字叠加的 `stylePresetId` 使用文字预设注册表。未知 ID 报错，不默默变成纯文本。
- `font`、`asset`（原生文字模板）、`fancyWord`、`textAnimation` 必须引用已发现的资源。字体文件先验证再持久化 fontAsset；原生效果保存 packageHash 和动画绑定，通过现有文字渲染链路处理。
- 一个元素选择一个原生模板或花字样式；剪映文字动画要求配套原生运行时模板，不能任意叠到 plain 模板上。没有可用绑定时明确失败，不降级成 plain content。
- 生成素材只枚举当前项目中已保存、存在且非空的图片/视频，不自动发起生成，也暂不枚举生成音频。身份包含文件大小与修改时间；应用时重新解析，拒绝已替换文件及错误媒体类型。

## 验证与边界

本次自动验证：Compose/时间线相关 217 项、服务端 272 项、editor-core 协议 31 项，共 520 项；Electron、Web、license-server TypeScript 检查通过；Bun CLI `--help` 可启动。SQL 测试在独立 PGlite/PostgreSQL 实例中执行真实迁移、配额、幂等、租约接管、取消及重试上限，不连接生产数据库。

测试包括 provider 进程重建后的恢复、并发重复提交、取消后旧句柄查询、远端地址注入防护、模型伪造资源拒绝、文字绑定和素材版本变化。Provider 网络由模拟接口替代；未进行付费 FAL/OpenRouter 真实规划。未运行本次新增样式的桌面应用、重开、播放或导出实测，因此不宣称像素级剪映一致性或生产云服务已经上线。
