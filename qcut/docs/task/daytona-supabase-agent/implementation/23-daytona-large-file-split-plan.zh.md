# Daytona Sandbox 大文件拆分记录

日期：2026-05-19
分支：`cli-image-v7`

## 结果

已实现。活跃的 Daytona sandbox worker、API route、网站 chat script，以及它们对应的聚焦测试文件，现在都低于 800 行。

## 拆分总结

| 区域 | 之前 | 之后 | 状态 |
| --- | ---: | ---: | --- |
| `packages/agent-worker/src/run-on-daytona.ts` | 1089 | 244 | 拆到 `packages/agent-worker/src/daytona/*`。 |
| `packages/agent-worker/src/run-on-daytona.test.ts` | 1200 | 已移除 | 拆成四个聚焦测试，加 `run-on-daytona.test-utils.ts`。 |
| `packages/license-server/src/routes/agent.ts` | 1857 | 156 | 拆到 `packages/license-server/src/routes/agent-parts/*`。 |
| `packages/license-server/src/routes/agent.test.ts` | 1298 | 已移除 | 拆成 route-group 测试，加 `agent.test-utils.ts`。 |
| `packages/nexusai-website/js/agent-chat.js` | 2329 | 35 | 改成浏览器/CommonJS loader，加载拆分后的 script parts。 |
| `packages/nexusai-website/js/agent-chat.test.js` | 1036 | 已移除 | 拆成 API、download、prompt 三个测试文件加共享 test util。 |

## 新结构

Worker 模块：

| 文件 | 职责 |
| --- | --- |
| `packages/agent-worker/src/daytona/constants.ts` | Daytona 镜像/资源默认值和时间常量。 |
| `packages/agent-worker/src/daytona/types.ts` | Daytona 依赖和 sandbox 接口。 |
| `packages/agent-worker/src/daytona/events.ts` | Agent event 插入辅助方法。 |
| `packages/agent-worker/src/daytona/command.ts` | QCut/Codex 命令构造和 shell 引号处理。 |
| `packages/agent-worker/src/daytona/env.ts` | Agent secret 加载和 sandbox 环境变量构造。 |
| `packages/agent-worker/src/daytona/remote-files.ts` | 远端读取、archive 下载和解压。 |
| `packages/agent-worker/src/daytona/sessions.ts` | Sandbox 复用、session 生命周期和清理。 |
| `packages/agent-worker/src/daytona/streaming.ts` | Stream cursor、event 解析和去重。 |

License-server route 模块：

| 文件 | 职责 |
| --- | --- |
| `packages/license-server/src/routes/agent-parts/constants.ts` | 共享路由常量。 |
| `packages/license-server/src/routes/agent-parts/validation.ts` | 命令、文件路径和文件名校验。 |
| `packages/license-server/src/routes/agent-parts/serializers.ts` | Job/session/artifact/file 响应序列化。 |
| `packages/license-server/src/routes/agent-parts/data-access.ts` | 共享 DB 查询辅助。 |
| `packages/license-server/src/routes/agent-parts/auth.ts` | Agent 认证和默认用户解析。 |
| `packages/license-server/src/routes/agent-parts/sessions.ts` | Session 创建/复用/结束路由。 |
| `packages/license-server/src/routes/agent-parts/daytona.ts` | Daytona SDK 客户端和终端 sandbox 创建。 |
| `packages/license-server/src/routes/agent-parts/terminal.ts` | PTY token 和 relay response 路由。 |
| `packages/license-server/src/routes/agent-parts/jobs.ts` | Agent job 提交路由。 |
| `packages/license-server/src/routes/agent-parts/files.ts` | Sandbox file 浏览、上传和下载路由。 |

网站 script parts：

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `packages/nexusai-website/js/agent-chat/01-runtime-api.js` | 797 | 运行时常量、prompt 辅助、API 封装和导出 `AgentChatAPI`。 |
| `packages/nexusai-website/js/agent-chat/02-ui-files.js` | 765 | Message/artifact 渲染、sandbox 文件浏览器、上传和下载。 |
| `packages/nexusai-website/js/agent-chat/03-terminal-job.js` | 630 | Terminal websocket、Codex 输入、job 轮询和实时状态处理。 |
| `packages/nexusai-website/js/agent-chat/04-bootstrap.js` | 125 | 页面初始化和 event 绑定。 |

测试文件：

| 文件 | 行数 |
| --- | ---: |
| `packages/agent-worker/src/run-on-daytona.command.test.ts` | 148 |
| `packages/agent-worker/src/run-on-daytona.ephemeral.test.ts` | 387 |
| `packages/agent-worker/src/run-on-daytona.sessions.test.ts` | 324 |
| `packages/agent-worker/src/run-on-daytona.cleanup.test.ts` | 227 |
| `packages/license-server/src/routes/agent.validation.test.ts` | 105 |
| `packages/license-server/src/routes/agent.sessions.test.ts` | 95 |
| `packages/license-server/src/routes/agent.terminal-token.test.ts` | 155 |
| `packages/license-server/src/routes/agent.files.test.ts` | 561 |
| `packages/license-server/src/routes/agent.artifacts.test.ts` | 85 |
| `packages/license-server/src/routes/agent.jobs.test.ts` | 163 |
| `packages/nexusai-website/js/agent-chat.api.test.js` | 424 |
| `packages/nexusai-website/js/agent-chat.download.test.js` | 368 |
| `packages/nexusai-website/js/agent-chat.prompt.test.js` | 250 |

## 验证

通过：

- `cd packages/agent-worker && bun run test` — 46 个测试。
- `cd packages/license-server && bun run test` — 129 个测试。
- `node --test packages/nexusai-website/js/agent-chat.*.test.js` — 33 个测试。
- `npx @biomejs/biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/daytona packages/agent-worker/src/run-on-daytona*.test.ts packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent-parts packages/license-server/src/routes/agent*.test.ts packages/nexusai-website/js/agent-chat.js packages/nexusai-website/js/agent-chat*.test.js packages/nexusai-website/js/agent-chat.test-utils.js`
- `cd packages/agent-worker && bunx tsc --noEmit`

行数审计：

- `rg -l "Daytona|daytona|sandbox|Sandbox|agent-chat|qcut-output|qcut-input" packages docs/task/daytona-supabase-agent | xargs wc -l | awk '$1 > 800'` 没有返回任何超过 800 行的活跃 Daytona sandbox 文件。（`rg -l` 的结果管道给 `wc -l`，再用 `awk` 过滤出行数超过 800 的文件。）

已知的验证备注：

- `cd packages/license-server && bunx tsc --noEmit` 仍然会在源码检查前以 `TS2688: Cannot find type definition file for 'sharp'` 失败。这是 package 已有的类型解析问题，不是本次 Daytona 拆分引入的。

## 行为说明

- 网站保留现有的 `chat-agent.html` script 路径。`agent-chat.js` 现在在浏览器中同步加载四个 script parts，在 CommonJS 测试中把同样的 parts 拼接到当前 module。
- 新增了一个 loader 测试，验证浏览器对拆分后前端文件的 script 注入。
- 拆分 `agent.test.ts` 时暴露了 terminal-token 测试中隐藏的 test-order 依赖。受影响的测试现在创建自己的 `db.insert` mock fixture。

## 排除项

审计有意排除 `docs/task/provider-expansion/openclaw-files/` 下的生成/参考代码，以及 `electron/native-pipeline/cli/command-registry.ts` 这个大型 CLI registry。这些文件可能提到 sandbox 相关文本，但不是活跃的 Daytona web、API 或 worker 实现。
