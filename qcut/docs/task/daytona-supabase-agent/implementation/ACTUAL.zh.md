# 实际落地的样子

这份文件记录原 PR 规约（01-09）和**真正打进生产 QCut 后端**的差距。
先读这份再看具体 spec——那些 spec 还描述原计划，文件顶部有 banner
指向这里。

## 一句话

PR 03/06/07/09 原 spec 假设 Supabase Auth + `workspace_id` 概念。
QCut 真实架构是：**Better Auth 跑在 license-server Cloudflare
Worker 上**、schema 是 **Drizzle 管 Hyperdrive 后面的 Postgres**
（就是 Supabase 项目 `kbrtxitvavpuimuihppz` 那个 Postgres）、
**严格按用户走**——没有 workspace。重构把 sandbox/agent 路径合并到
这套架构里。

## 提交日志

| Commit                                 | 内容                                                                                                                                                                                       | 对应 spec                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `90ce05709`                            | `qcut system doctor --json --skip-health`                                                                                                                                                  | PR 01 ✅ 不变                                              |
| `fbae951f6`                            | Dockerfile + entrypoint + smoke + `build:cli-image`                                                                                                                                        | PR 02 ✅ 不变                                              |
| `2add844f2`                            | （后被取代）agent\_\* 的 Supabase migration                                                                                                                                                | PR 03 ❌ 被 `f4d4cd1` 取代                                 |
| `7f5f5b728` → `b9458750c`（rebase 后） | （后被重构）agent-worker 用 `workspace_id`                                                                                                                                                 | PR 04 ⚠️ 被 `665d05f19` 重构                               |
| `9719bf874`                            | Daytona devcontainer + dogfood + worker swap-in                                                                                                                                            | PR 05 ✅ 不变                                              |
| `2a8e16589`                            | （后被取代）sandbox_sessions 的 Supabase migration                                                                                                                                         | PR 06 ❌ 被 `f4d4cd1` 取代                                 |
| `79f2c8734`                            | （后被取代）Deno Edge Function `/sandbox-spawn`                                                                                                                                            | PR 07 ❌ 被本次 PR 取代                                    |
| `170924319`                            | `@qcut/relay` Cloudflare Worker（DO + token 校验）                                                                                                                                         | PR 08 ✅ 结构不变；本次 PR 改了列名                        |
| `f3caa17`（wzrdagentstudio）           | xterm.js 终端调 Supabase Functions                                                                                                                                                         | PR 09 ⚠️ 本次 PR 改了端点                                  |
| `f4d4cd1`                              | **PR 10** —— schema 对齐：Drizzle 为源，`user_id` 替换 `workspace_id`，migration `0004_agent_sandbox_tables.sql`                                                                           | 取代 03+06                                                 |
| `665d05f19`                            | **PR 11** —— agent-worker 源码改 `userId`，所有 INSERT 显式带 `created_at`                                                                                                                 | 更新 04                                                    |
| 本次 PR                                | **PR 12** —— Phase 2 对齐：sandbox-spawn 搬到 `packages/license-server/src/routes/sandbox.ts` 的 Hono 路由，接 Better Auth + 扣费；relay 审计列改名；wzrdagentstudio 前端打 license-server | 取代 07；更新 08+09                                        |
| `b536d61b2`                            | **Phase 3 follow-up** —— GHCR 镜像 workflow、当前 `@daytona/sdk` worker 路径、Daytona runner 测试、镜像启动文档                                                                            | 完成 PR 05 Daytona swap-in 的代码部分；provider 验证仍待做 |
| `ed99a4ac9` + 本轮 follow-up           | **Phase 3 verification** —— GHCR owner 大小写修复、public `qcut-cli:v0` 发布、Daytona dogfood、worker row normalize、Daytona 可写输出目录                                                  | 完成 PR 05 Daytona swap-in 的 provider 验证                |
| `ce02d4968`                            | `Dockerfile.cli` 现在安装固定版本 Codex CLI `0.130.0` 和 Claude Code CLI `2.1.142`；`qcut-smoke` 会硬检查两个 binary 和版本；GHCR `v0` 已重新发布                                              | 更新 PR 02 镜像契约                                       |
| 本轮 follow-up                         | Chat Agent Codex 模式：license-server 只接受固定的 `codex exec --skip-git-repo-check --json -`，worker 用 base64 env 传 prompt，entrypoint 从 `CODEX_AUTH_JSON` 或受控 `OPENAI_API_KEY` 启动 Codex 登录 | 扩展 PR 02 + PR 04，支持 coding-agent sandbox 任务         |
| `qcut-cli-v2` follow-up                | Daytona CLI 镜像补 YouTube 下载能力：预装固定版本 `yt-dlp` `2026.03.17`、Deno `2.7.4`，并写入 `/etc/yt-dlp.conf` 的 `--remote-components ejs:github`；Codex prompt 也要求临时安装/cache 不要写进 `/tmp/qcut-output` | 扩展 PR 02 镜像契约和 PR 04 Codex artifact 卫生            |
| `qcut-cli-v2` follow-up                | Daytona job 现在会在 sandbox command 仍在运行时实时写 `agent_events`；website 的 Codex pending 气泡会摘要最近的 lifecycle / Codex events；上传 artifact 时会排除内部 `.qcut-agent-*` 控制文件             | 更新 PR 04 worker telemetry 和 Chat Agent website          |

## 生产环境实测

下面这些都在 `kbrtxitvavpuimuihppz` 项目（ap-southeast-2）+ qcutlove
用户 `79bf60b02770d2cc510da53e471590f4` 上跑过：

| 检查                                                                       | 结果                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 通过 Management API 应用 migration 0004                                    | 5 张表 + RPC + 13 个索引建好；`pg_tables`/`pg_indexes` 查询确认                                                               |
| Realtime publication 加上 `agent_jobs`、`agent_events`、`sandbox_sessions` | `pg_publication_tables` 确认                                                                                                  |
| `claim_one_agent_job` RPC smoke                                            | INSERT → claim → 标 succeeded → 清理 全过                                                                                     |
| Worker 对生产实跑                                                          | claim 到真行、runner_id 落 DB、状态走到 `failed`（本机没 docker daemon，符合预期）                                            |
| license-server `/api/license`                                              | 返 `1000.3` 余额、plan `free`、reset `2026-06-11`                                                                             |
| GHCR `qcut-cli:v0` 发布                                                    | workflow run `25893277360` 成功；image digest `sha256:b1b35894c4c9b77fc79522ed209d610cfd2f3816479056f8aa61d6a8bcce2356`       |
| 匿名 GHCR pull + smoke                                                     | package 改 public 后，`docker pull --platform linux/amd64 ghcr.io/quriosity-agent/qcut-cli:v0` 成功；`qcut-smoke` 通过        |
| Daytona dogfood worker 路径                                                | job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca` 成功，exit `0`；artifact row `234936d9-3e87-4ca9-ba68-cff42299726b` 已上传 |
| 本地 amd64 agent CLI 镜像 smoke                                           | `docker buildx build --platform linux/amd64 --tag qcut-cli:agents-smoke ...` 成功；`qcut-smoke` 验到 `codex-cli 0.130.0` 和 `2.1.142 (Claude Code)` |
| GHCR agent CLI 镜像发布                                                    | workflow run `25899152153` 重新发布 `ghcr.io/quriosity-agent/qcut-cli:v0`；digest `sha256:07ab8298aefb308a5aeefd5c2a7a3b64493c446c84f323c384b0ebeb16ae673a`；推后 smoke 验到 Codex 和 Claude Code |
| GHCR native-cli skill 镜像发布                                             | workflow run `25902797671` 重新发布 `ghcr.io/quriosity-agent/qcut-cli:v0`；digest `sha256:2b9b8c7aa80bc2e5db874f04ccca302bbce0693a7d90274fe2b8645049fdbb7b`；推后 smoke 验到 `.claude/skills/native-cli/SKILL.md` |
| 本地 Codex auth bootstrap smoke                                           | `qcut-cli:codex-auth-smoke` 按 `linux/amd64` 构建；假的 `CODEX_AUTH_JSON` 能写成权限 `0600` 的 `~/.codex/auth.json`；`QCUT_CODEX_PROMPT_B64` 在镜像内能正确解码 |
| Website Codex → QCut CLI 图片 E2E                                         | Chat Agent job `9b8a7693-00e0-4cff-8635-a7d78135d2d8` 成功，exit `0`；Codex 实际跑了 `qcut gen image ... -o /tmp/qcut-output`；上传了 JPG artifact `flux_dev_small-blue-square-icon-on-a-clean-white-background_1778827141210.jpg` |
| 本地 YouTube-capable CLI 镜像 smoke                                      | `qcut-cli:youtube-fix` 按 `linux/amd64` 构建；`qcut-smoke` 通过；`yt-dlp` + Deno 能把 YouTube `.mp4` 下载进 `/tmp/qcut-output`，且不会把工具安装到 artifact 目录 |
| GHCR YouTube-capable 镜像发布                                             | workflow run `25949183927` 发布 `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`；digest `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`；推后 smoke 和本地 pull smoke 都通过 |
| Website Codex → YouTube artifact E2E                                      | Chat Agent job `3b19b2cd-cb17-4576-add0-89ba9aca2e4e` 成功，exit `0`；Codex 用 `/tmp/qcut-tools` 做 cache 跑预装 `yt-dlp`；artifacts 包含可下载的 `youtube-e2e.mp4`（464.8 KB）和 summary JSON |
| Website Codex realtime streaming E2E                                      | Chat Agent job `9d870b84-f2ba-4b43-b9df-c5ac9c2d14a9` 成功，exit `0`；job 仍在 running 时，Codex pending 气泡已经显示 `daytona_command_started`、`thread.started`、`turn.started`、`item.started`；artifact 包含 `ui-stream-summary.json` |
| Daytona artifact 控制文件清理                                             | `qcut --help --json` job `229f19e9-50ad-40f7-a83d-84df1f454c77` 成功，exit `0`；上传 artifact 是 `qcut-exit.json`、`qcut-stdout.txt`、`qcut-stderr.txt`、`qcut-output.tar`，内部 `.qcut-agent-*` 文件不再暴露 |

## `b536d61b2` 之后已经完成的事

1. **GHCR 发布 workflow 已有。** `.github/workflows/cli-image.yml`
   会构建 `Dockerfile.cli`、跑 `qcut-smoke`，然后推
   `ghcr.io/<owner>/qcut-cli:<tag>` 和 `:latest`。
2. **Daytona worker 已接当前 SDK。**
   `packages/agent-worker/src/run-on-daytona.ts` 现在使用
   `@daytona/sdk`（`daytona.create`、session command、sandbox
   filesystem download、`daytona.delete`），不再是旧的
   `sandboxes.create/exec/downloadDir` 近似写法。
3. **Daytona command/env 行为有测试。**
   `packages/agent-worker/src/run-on-daytona.test.ts` 覆盖
   entrypoint 包装、secret 注入、拒绝 shell metacharacter、
   sandbox 删除、artifact 下载、artifact fallback event。
4. **agent-worker 包可独立 type-check。**
   `packages/agent-worker/tsconfig.json` 把 ambient types 限到 Bun，
   避免根目录无关 type stub 漏进来。
5. **GHCR provider 验证完成。**
   根 workflow 已修成 lowercase GHCR owner，workflow run `25893277360`
   发布了 `ghcr.io/quriosity-agent/qcut-cli:v0` 和 `:latest`，package
   已 public，Daytona 可以直接拉。
6. **Daytona worker dogfood 完成。**
   dogfood 脚本插入真实 `agent_jobs`，worker claim，Daytona 拉 GHCR
   镜像，`qcut system doctor --json --skip-health` 通过，
   `qcut-output.tar` 已落到 `artifacts` Storage bucket。
7. **dogfood 暴露出来的 worker bug 已修。**
   `claim_one_agent_job` row 先从 Supabase snake_case normalize 成
   Drizzle camelCase，再给 worker 用；Daytona 改到
   `/tmp/qcut-output` 写 artifact，不再让非 root 镜像用户创建 `/output`。
8. **下一版 qcut-cli 镜像会带 coding agent CLI。**
   `Dockerfile.cli` 安装 Node/npm，再安装固定版本的 npm native binary：
   Codex CLI `0.130.0`、Claude Code `2.1.142`。`qcut-smoke`
   现在会在 `codex` 或 `claude` 缺失时直接让镜像构建失败。
9. **GHCR `v0` 已经带这些 agent CLI。**
   workflow run `25902797671` 推送刷新后的镜像，然后又从 GHCR 拉回
   `ghcr.io/quriosity-agent/qcut-cli:v0` 跑 `qcut-smoke`。smoke 日志确认
   `/usr/local/bin/codex`、`/usr/local/bin/claude` 和
   `.claude/skills/native-cli/SKILL.md` 都存在。这个发布镜像也已经带上
   `qcut-entrypoint` 的 Codex runtime auth bootstrap。
10. **Codex chat job 已接入现有 agent 路径。**
    website 的 Chat Agent 页现在可以提交 Codex 模式任务。license-server
    只接受固定的 stdin 版 Codex command；prompt 走 `args.codexPrompt`；
    worker 把它 base64 成 `QCUT_CODEX_PROMPT_B64`；Daytona 里实际跑：
    `codex exec --skip-git-repo-check --sandbox danger-full-access --json --output-last-message ... -`。
    这里显式指定 sandbox mode，是因为 Daytona 已经提供外层隔离；
    Codex 默认命令 sandbox 在这个镜像里可能会在 shell 启动前失败。
11. **Codex 登录只在运行时处理。**
    `CODEX_AUTH_JSON` 从 `agent_secrets` 投影进 sandbox env，entrypoint
    把它写成权限 `0600` 的 `~/.codex/auth.json`。如果没有 auth JSON，
    Codex 任务会设置 `QCUT_BOOTSTRAP_CODEX=1`，entrypoint 才会用
    `OPENAI_API_KEY` 跑 `codex login --with-api-key`。普通 qcut 任务不会
    触发这条登录路径。
12. **website 的 Codex prompt 现在会把 QCut 工作导回 QCut CLI。**
    Codex 模式会加一段短的 QCut 专用运行提示：需要处理 QCut 时用
    shell command；图片生成走 `qcut gen image`；生成文件写到
    `/tmp/qcut-output`，这样 worker 能继续上传 artifact。
13. **Daytona CLI 镜像现在包含 native-cli skill。**
    `Dockerfile.cli` 会把 `.claude/skills/native-cli` 拷到
    `/home/qcut/qcut/.claude/skills/native-cli`；`qcut-smoke`
    会检查这个 skill 的 `SKILL.md`，不存在就让镜像构建失败。Daytona job
    `b6ce291d-3853-4a41-b70f-c989c159c633` 已在 live sandbox 验证推上去的
    镜像，并返回 `NATIVE_CLI_SKILL_READY`。
14. **Website artifacts 现在可以下载。**
    license-server 新增了带认证的二进制下载接口：
    `/api/agent/jobs/:jobId/artifacts/:artifactId/download`。Chat Agent 页会
    给每个 artifact 渲染 Download 按钮，用用户的 QCut auth token 或服务端
    配置的默认 agent account 去 fetch blob，然后触发浏览器下载；Supabase
    service-role key 不会暴露到前端。
15. **Daytona qcut job 现在会把 CLI stdout/stderr 也作为 artifact 保存。**
    E2E 探测发现：`qcut system check-keys --json` 这类非生成命令虽然
    `exit_code=0`，但只上传空的 `qcut-output.tar`；失败命令也会出现
    `error=null`、用户看不到失败原因。Daytona runner 现在会给每个 qcut
    job 写入 `qcut-stdout.txt`、`qcut-stderr.txt` 和 `qcut-exit.json`。
    wrapper 会记录真实 CLI exit code，但不会主动关闭 Daytona persistent
    session shell。live 回归已验证失败路径
    `575b396e-db81-480d-922d-20835650a63e` 和真实图片生成路径
    `9785346b-b385-4d45-bde1-525e8139d088`。
16. **下一版 CLI 镜像可以跑 YouTube 下载工作流。**
    上一次 Codex YouTube probe 有两个独立问题：测试视频 `BaW_jenozKc`
    现在本身就返回 `Video unavailable`；同时已发布的 CLI 镜像没有
    `yt-dlp` 和 JavaScript runtime，导致 Codex 临时把工具装进
    `/tmp/qcut-output`，污染 artifact。现在 `Dockerfile.cli` 会预装
    `yt-dlp` `2026.03.17`、Deno `2.7.4`，并写入
    `/etc/yt-dlp.conf` 的 `--remote-components ejs:github`。Codex 的运行
    prompt 也要求临时工具 / cache 放到 `/tmp/qcut-tools` 或 `/tmp`，
    `/tmp/qcut-output` 只放最终产物和小诊断文件。
    workflow run `25949183927` 已把这个镜像发布成
    `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`；Daytona
    runner 的默认镜像 digest 已更新到
    `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`。
17. **Daytona job 现在边跑边 stream。**
    worker 会把 sandbox command 放到后台运行，每 2 秒轮询相关输出文件，
    把新增的完整行实时插入 `agent_events`，不再等 job 结束才一次性写。
    Codex job stream `codex-events.jsonl`；直接 qcut job stream
    `qcut-stdout.txt` 和 `qcut-stderr.txt`。主 worker 会识别 Daytona
    runner 已经 stream 过 events，结束时不会再重复写 stderr。这轮 live
    probe 抓到了一个 async start 的 shell bug（生成了 `&;`）；现在已经改成
    合法后台命令，并且 start command 非 0 会立刻写
    `daytona_command_start_failed`，不会再假 running 30 分钟。
18. **Chat Agent 会在对话里显示 live Codex 进度。**
    website 原来的 Events panel 继续保留；现在 pending 的 Codex 回复气泡
    也会显示最近 events 的滚动摘要。job
    `9d870b84-f2ba-4b43-b9df-c5ac9c2d14a9` 已验证：完成前气泡显示了
    Daytona session event 和 Codex 的 `thread.started`、`turn.started`、
    `item.started`；完成后替换成
    `UI_STREAM_DONE /tmp/qcut-output/ui-stream-summary.json`。

## Live CLI E2E 覆盖和耗时

这一轮一共验证了 **9 个 live agent job**，覆盖 **5 类 CLI 命令形态**：
help、auth/key 检查、model 列表、预期内参数校验失败、真实图片生成。
下面的耗时来自生产 `agent_jobs.created_at`、`claimed_at`、`finished_at`：
`queue` 是等 worker claim 的时间，`run` 是 Daytona sandbox 执行加 artifact
下载 / 上传时间。

| Job | Command | 结果 | 总耗时 | Queue | Run | Artifacts | 验证点 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `bcec5b30` | `qcut gen image -t small-blue-square-icon-on-a-clean-white-background -m flux_dev --json` | succeeded / 0 | 12.1s | 1.1s | 11.0s | 3 | Website Chat Agent 可以跑真实图片生成，并返回 image/json/tar artifacts。 |
| `0dd0e898` | `qcut --help --json` | succeeded / 0 | 5.3s | 1.2s | 4.2s | 1 | 修复前探测：命令成功但只有空 tar，暴露 stdout artifact 缺失。 |
| `c6732148` | `qcut system check-keys --json` | succeeded / 0 | 7.5s | 4.3s | 3.2s | 1 | 修复前探测：auth/key 命令成功，但用户看不到输出。 |
| `7d823624` | `qcut system models --json` | succeeded / 0 | 10.5s | 6.7s | 3.8s | 1 | 修复前探测：model 列表也有同样的输出不可见问题。 |
| `d7e6813f` | `qcut gen image -m flux_dev --json` | failed / 1 | 4.8s | 0.5s | 4.3s | 1 | 修复前失败探测：参数校验失败时 `error=null`，没有可读原因。 |
| `575b396e` | `qcut gen image -m flux_dev --json` | failed / 1 | 235.0s | 229.0s | 6.0s | 4 | 修复后失败探测：`qcut-stdout.txt` 现在能看到 `Missing --text/-t`；总耗时长是因为它排在一个被手动失败的 hung-wrapper probe 后面。 |
| `da5a8216` | `qcut system check-keys --json` | succeeded / 0 | 6.1s | 0.9s | 5.2s | 4 | 修复后成功探测：非生成命令现在会上传 stdout/stderr/exit artifacts。 |
| `9785346b` | `qcut gen image -t tiny-red-circle-icon-on-white-background -m flux_dev --json` | succeeded / 0 | 13.5s | 1.1s | 12.4s | 6 | 修复后真实图片生成仍然正常；返回 image/json 加 stdout/stderr/exit artifacts。 |
| `899a9d6c` | `qcut --help --json` | succeeded / 0 | 7.4s | 1.3s | 6.1s | 4 | 已部署 license-server source probe，同时验证修复后的 help command artifact。 |

修复后的稳定耗时大概是：

- 轻量 CLI（`help`、`check-keys`）总耗时通常 **6-8 秒**。
- 预期内参数校验失败被 claim 后大概 **6 秒 run time**。
- 真实 `flux_dev` 图片生成在这条 Daytona 路径里大概 **12-14 秒总耗时**。
- 单 worker 空闲时 queue 通常约 **1 秒**；`575b396e` 是异常值，因为它排在
  我们故意打出来的 hung-wrapper probe 后面，中间重启过 worker。

## Live Codex 多轮对话和 YouTube artifact 测试

website Codex 模式用真实浏览器跑了三轮：

| Job | Prompt 形态 | 结果 | 总耗时 | Queue | Run | Artifacts | 验证点 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `8bac5fba` | 让 Codex 记住 `sapphire-bridge-481` | succeeded / 0 | 11.1s | 1.4s | 9.8s | 3 | 第一轮回复 `stored sapphire-bridge-481`，并上传 `codex-last-message.md`。 |
| `19ff765e` | 不重复短语，直接问上一轮记住了什么 | succeeded / 0 | 12.7s | 1.0s | 11.8s | 3 | 当前多轮上下文可用：前端把历史消息重新拼进下一轮 `codexPrompt`，Codex 回答了 `sapphire-bridge-481`。 |
| `619d2ec1` | 把公开的 youtube-dl 测试视频 `BaW_jenozKc` 下载到 `/tmp/qcut-output` | succeeded / 0 | 104.4s | 1.4s | 103.0s | 7 | 修复前 probe：Codex 执行了 shell 步骤并上传诊断文件，但 YouTube/yt-dlp 返回 `Video unavailable`；没有生成 `.mp4` artifact。 |
| `3b19b2cd` | 把当前可访问的 YouTube URL `jNQXAC9IVRw` 下载到 `/tmp/qcut-output` | succeeded / 0 | 约 2m | live website poll | live Daytona run | 5 | 修复后 E2E：Codex 用预装 `yt-dlp` + Deno 写出 `youtube-e2e.mp4` 和 summary JSON；website Download 按钮也成功下载 MP4。 |
| `4ceb713b` | Realtime streaming E2E：4 步 shell loop 后写 `realtime-stream-summary.json` | succeeded / 0 | 约 31s | live website poll | live Daytona run | 5 | worker 在完成前已经 stream Daytona lifecycle events 和 Codex JSONL events；最终回复 `STREAM_TEST_DONE /tmp/qcut-output/realtime-stream-summary.json`。 |
| `9d870b84` | Realtime UI smoke：2 步 shell loop 后写 `ui-stream-summary.json` | succeeded / 0 | 约 18s | live website poll | live Daytona run | 5 | website pending Codex 气泡在 running 中显示最近的 `daytona_command_started` 和 `codex_event` 摘要，完成后解析成 `UI_STREAM_DONE ...`。 |

当前 Codex 对话行为：

- 页面不刷新时，多轮对话是可用的，因为前端会把之前的 user/assistant
  messages 拼进下一次 `codexPrompt`。
- 这还不是持久化 Codex session。每一轮仍然是新的 Daytona job；刷新页面后，
  内存里的历史会丢，除非后续补 job history reload。
- Codex 文件 artifact 是通的：`codex-events.jsonl`、`codex-last-message.md`
  和写进 `/tmp/qcut-output` 的文件都会上传。

YouTube 下载结果：

- 这轮生成了 `youtube-download-summary.json`、
  `youtube-download-stdout.txt`、`youtube-download-error.txt`。
- `youtube-download-summary.json` 里是 `exit_status: 1`、
  `downloaded_filename: ""`、`byte_size: 0`。
- `youtube-download-error.txt` 里是
  `ERROR: [youtube] BaW_jenozKc: Video unavailable`。
- 因为下载没有完成，所以 artifacts 里没有 `.mp4`。
- follow-up 修复已端到端验证：workflow run `25949183927` 发布刷新后的
  镜像；本地 worker 用
  `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`
  重启；website job `3b19b2cd-cb17-4576-add0-89ba9aca2e4e` 产出：
  - `youtube-e2e.mp4`（`video`，464.8 KB）
  - `youtube-e2e-summary.json`（`json`，96 bytes，`exit_status: 0`）
  - `qcut-output.tar`（480.0 KB）
  - `codex-last-message.md`
  - `codex-events.jsonl`
- website artifact 下载接口也验证过：点击 `youtube-e2e.mp4` 的 Download
  按钮会请求
  `/api/agent/jobs/3b19b2cd-cb17-4576-add0-89ba9aca2e4e/artifacts/.../download`，
  返回 HTTP 200，并在 Playwright session 保存 `youtube-e2e.mp4`。
- 之前的 `BaW_jenozKc` 不能再当成功 probe，因为它现在脱离 QCut 也会返回
  unavailable。

## 还没做的（依赖外部凭证 / 服务）

1. **review 后合并 `qcut-cli-v2` follow-up 分支**，把 stdio artifact
   capture、YouTube 镜像修复、realtime streaming worker、website
   progress UI 和这轮 E2E 记录进主线。
2. **设 / 确认 license-server 密钥**（`wrangler secret put`）：
   `E2B_API_KEY`、`RELAY_SIGNING_SECRET`、`RELAY_HOST`、`QCUT_IMAGE_TAG`。
3. **合并后决定是重发 `v0` / `latest`，还是保留已验证 digest pin。**
   当前测过的镜像 tag 是
   `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`，worker 默认 pin
   已指向它的 digest。
4. **部署 / 确认 `@qcut/relay`**：`packages/qcut-relay` 下
   `wrangler deploy`。
5. **轮换泄露的 Supabase PAT**（`sbp_b303...`）——GitHub secret
   scanner 已看到。去 supabase.com/dashboard/account/tokens 新建一个。
6. **wzrdagentstudio 接 QCut 登录**。SandboxPage 当前读
   `localStorage.qcut_auth_token` 作为 v0 暂存——换成真正的 QCut
   sign-in 组件。
7. **spawn 失败时退费**。PR 12 的 `routes/sandbox.ts` 先扣费，但
   E2B 失败后没退。
8. **docker 不在时 stderr 抓不到**。PR 11 worker 退出码会落 DB，
   但 `error` 列在 execa 起不来时是 null。

## 怎么读各 spec

- **01、02、05** —— 准确，无 banner。
- **03、06、07** —— 已被取代；banner 指向本文件。
- **04、08、09** —— 原地更新；banner 说明改了什么。

总索引看 [`../README.zh.md`](../README.zh.md)。
