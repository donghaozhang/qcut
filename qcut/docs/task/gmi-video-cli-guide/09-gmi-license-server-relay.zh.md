# 计划 — 将 GMI Cloud 接入 License Server 中继

目标：已登录的 QCut 用户在使用任何 GMI 模型（Seedance 2.0 260128、Veo 3.1 Lite、Kling V3、Kling V3 Omni、SkyReels V4）生成视频时，**不应**再需要本地的 `VITE_GMI_API_KEY`。密钥已经保存在 license server 上，客户端只需在存在会话 token 时通过它进行路由即可。

## 为什么需要这个功能

- 现象：登录状态下点击 `gmi_seedance_2_0_260128_t2v` 的 **Generate** 按钮没有任何反应。处理器抛出 `"GMI API key not configured"`，调用方把它包装成 `shouldSkip`，而 `use-ai-generation-core.ts:444` 只做了一次 `console.log`。静默失败。
- 根因是不对称：登录用户的处理模式在 FAL 侧已经建立好（`apps/web/src/lib/ai-video/core/fal-request.ts:151-191`）。license server 也已经知道如何代理 GMI（`packages/license-server/src/routes/ai-proxy.ts:57,269-270`）。**唯独 GMI 客户端缺失中继这一环**。

## 当前状态（已核实）

| 层                                                                         | 是否支持 GMI 中继？  |
| -------------------------------------------------------------------------- | -------------------- |
| License server `POST /api/ai/proxy` — `provider-keys` GMI 分支             | ✅ 支持              |
| License server `GET /api/ai/status?provider=gmi&requestId=…`               | ✅ 支持              |
| `gmiClient.submit` (`apps/web/src/lib/ai-clients/gmi-client.ts:74-107`)    | ❌ 仅直连 GMI        |
| `gmiClient.poll` (`apps/web/src/lib/ai-clients/gmi-client.ts:109-176`)     | ❌ 仅直连 GMI        |

服务端对 happy path 无需改动。所有工作都在客户端 `gmi-client.ts` 上，外加当中继也不可用时把错误暴露出来。

## 设计 — 照搬 FAL 的模式

在 `gmiClient.submit` 和 `gmiClient.poll` 中按优先级依次尝试三个分支：

1. **本地密钥**（环境变量或 Electron 安全存储）—— 保留当前行为，支持离线/自托管场景。
2. **License server 中继** —— 没有本地密钥时，通过 `platform().license.getAuthToken()` 拿到会话 token，提交走 `${LICENSE_SERVER_URL}/api/ai/proxy`，轮询走 `${LICENSE_SERVER_URL}/api/ai/status?provider=gmi&requestId=…`。
3. **带可操作信息的硬错误** —— 只有在 (1) 和 (2) 都不可用时才触发。通过 toast 显示，而不仅仅是控制台。

长期不变量：

- **保持 `ProviderClient` 接口不变。** `providerRouter.submit("seedance-2-0-260128", payload, "gmi")` 的调用方不应关心是走直连还是中继。
- **把中继辅助函数集中起来。** 将 `fal-request.ts` 中共享的 `getSessionToken` 与 `LICENSE_SERVER_URL` 抽到 `apps/web/src/lib/ai-video/core/license-relay.ts`，以便将来的 provider（Runway、通过 license server 的 ElevenLabs 等）可以直接接入而无需复制粘贴。
- **不要把额度扣减耦合进这次改动。** `/api/ai/proxy` 的 `credits` 字段是可选的；把它接起来属于更大的额度系统分支工作。留一个 `TODO` 和跟踪备注即可。

## 子任务

每个子任务控制在 20 分钟以内，并列出涉及的文件。

### T1 — 抽取共享的 license-relay 辅助模块（新模块）

- **新文件：** `apps/web/src/lib/ai-video/core/license-relay.ts`
  - 导出 `LICENSE_SERVER_URL`（从 `fal-request.ts:125-127` 迁过来）。
  - 导出 `async function getSessionToken(): Promise<string>`（从 `fal-request.ts:130-145` 迁过来）。
  - 导出 `async function proxySubmit(opts: { provider, endpoint, method?, body }): Promise<Response>` —— 封装 `POST /api/ai/proxy`。
  - 导出 `async function proxyStatus(opts: { provider, requestId, endpoint?, statusUrl? }): Promise<Response>` —— 封装 `GET /api/ai/status`。
  - 全链路使用 `signal?: AbortSignal`。
- **重构：** `apps/web/src/lib/ai-video/core/fal-request.ts` 改为从 `license-relay.ts` 导入，而不是本地定义 `LICENSE_SERVER_URL` + `getSessionToken`。
- **验收：** FAL 中继仍然工作（现有 `fal-request` 相关测试全部通过且无需改动）。

### T2 — 为 `gmiClient.submit` 增加中继回退

- **文件：** `apps/web/src/lib/ai-clients/gmi-client.ts:74-107`
- 本地密钥检查之后的流程：
  1. 若没有 `apiKey`，调用 `getSessionToken()`。
  2. 若拿到 token，调用 `proxySubmit({ provider: "gmi", endpoint: `${GMI_API_BASE}/requests`, method: "POST", body: { model, payload } })`。
  3. 若响应不 ok，抛出包含状态码和解析后 detail 的错误（与直连错误保持相同结构）。
  4. 返回 `{ requestId, provider: "gmi" }`。
- 若密钥与 token 都不存在，抛出可操作的错误：
  > `"GMI unavailable. Sign in to your QCut account, or set VITE_GMI_API_KEY."`

### T3 — 为 `gmiClient.poll` 增加中继回退

- **文件：** `apps/web/src/lib/ai-clients/gmi-client.ts:109-176`
- 采用同样的解析顺序。走中继时调用 `proxyStatus({ provider: "gmi", requestId })`。响应体结构与直连一致（`GmiRequestStatusResponse`），因为 license server 是原样转发的（`ai-proxy.ts:122-128`）。
- 保持现有的轮询循环、间隔、`onProgress` 和超时语义。只改变传输层。

### T4 — 将 skip 原因暴露给用户

- **文件：** `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts:441-503`
- 把三处 `console.log("⚠️ Skipping model - ...")` 都替换为 `toast.error(handlerResult.skipReason)`（或走项目里的 toast 工具），同时保留 console 日志。
- 对连发做去重：同一次生成流程中相同的 `skipReason` 多次触发时，只 toast 一次。
- **原因：** 阻止所有 provider 的静默失败，而不只是 GMI。

### T5 — 中继回退的单元测试

- **新增/更新文件：** `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`
  - Mock `platform().license.getAuthToken` 返回一个会话 token。
  - Mock `fetch`，在没有本地密钥但有会话 token 的情况下断言：
    - `submit` 命中 `${LICENSE_SERVER_URL}/api/ai/proxy` 并带有正确的请求体。
    - `poll` 命中 `${LICENSE_SERVER_URL}/api/ai/status?provider=gmi&requestId=…`。
  - 断言当两者都缺失时，`submit` 抛出可操作的 "Sign in or set VITE_GMI_API_KEY" 错误信息。
- **新文件：** `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`
  - 独立地对 `proxySubmit` 与 `proxyStatus` 做单元测试（URL 构造、auth header、signal 传递）。

### T6 — 文档 + 回归清单

- **文件：** `docs/task/gmi-video-cli-guide/05-troubleshooting.md`
  - 增加 "GMI generation does nothing" 一节，说明三种状态：(a) 已登录且正常工作；(b) 未登录 + 无本地密钥 → 出现 toast；(c) 本地 `VITE_GMI_API_KEY` 覆盖中继。
- **文件：** `docs/task/gmi-video-cli-guide/04-gmi-models.md`
  - 为每个模型追加一行说明："已登录用户通过 license-server 中继开箱即用；离线使用需 `VITE_GMI_API_KEY`。"

### T7 — 人工验证

- 使用 `.env.test-accounts` 中的 `qcutlove@qcut.app` 登录，**不设置** `VITE_GMI_API_KEY`，执行 `bun run electron:dev`。
- 每个 GMI 模型各跑一次：Seedance 2.0 260128、Veo 3.1 Lite、Kling V3、Kling V3 Omni、SkyReels V4。确认视频正常返回。
- 退出登录 → 再试一个模型 → 确认出现 "Sign in or set VITE_GMI_API_KEY" 的 toast 而不是静默跳过。

## 测试 — 文件路径汇总

| 测试文件                                                                           | 覆盖范围                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/lib/ai-clients/__tests__/gmi-client.test.ts`                         | `submit` + `poll` 的中继回退，错误路径              |
| `apps/web/src/lib/ai-video/core/__tests__/license-relay.test.ts`                   | 共享辅助模块的单元测试                              |
| `apps/web/src/lib/ai-video/core/__tests__/fal-request.test.ts`（若存在）           | 回归：重构后 FAL 中继仍然工作                       |

运行：`bun run test`

## 范围之外（后续工作）

- 通过 `/api/ai/proxy { credits: { amount, modelKey, description } }` 做额度扣减。license server 已支持（`ai-proxy.ts:79-107`）；这部分属于额度系统分支，应统一适用于所有 provider，而不仅是 GMI。
- 与 provider 无关的 `submitViaRelay(providerId, …)`，由 `providerRouter` 透明调用。等到第三个 provider（例如 Runway）需要同样处理时再回来重构是值得的 —— 那时客户端层面的分支会变得重复，有必要上移到 router。
- 最近一次会话 token 的离线缓存，避免短暂网络波动让用户在任务中途被迫重新登录。

## 风险 / 权衡

- **`gmiClient` 内部存在两条传输路径**：本地密钥走直连，已登录用户走中继。通过 T1 的共享辅助模块和统一的请求/响应结构来缓解 —— 两条分支的输出不会分叉。
- **License server 延迟**多一跳。实际上 GMI 自己的队列模型每次轮询就要花掉若干秒，经过 worker 多出来的 ~50–150 ms 可以忽略不计。
- **轮询中途会话 token 过期。** 今天的 FAL 中继也有同样的暴露面；本次范围之外。若确实成为问题，`proxyStatus` 内部在 401 时刷新是干净的切入点。
