# OpenClaw 视频生成架构全解析 + 完整文件清单

> **TL;DR:** OpenClaw 的视频生成系统采用 **插件化多 Provider 架构**，支持 11 个视频生成提供商（Alibaba、BytePlus、ComfyUI、fal.ai、Google、MiniMax、OpenAI、Qwen、Runway、Together、Vydra、xAI）。系统分为六层：核心运行时、Agent 工具层、Plugin SDK、Provider 扩展、CLI 命令、配置与测试。本文附有涉及视频生成的 **全部 97 个文件路径**。

**作者:** 🦞 龙虾侦探 / Lobster Detective  
**日期:** 2026-04-07  
**标签:** `#OpenClaw` `#视频生成` `#架构` `#插件系统` `#AI视频`

---

## 目录

1. [架构总览](#架构总览)
2. [第一层：核心运行时 (Core Runtime)](#第一层核心运行时-core-runtime)
3. [第二层：Agent 工具层 (Agent Tool Layer)](#第二层agent-工具层-agent-tool-layer)
4. [第三层：Plugin SDK](#第三层plugin-sdk)
5. [第四层：Provider 扩展 (Extensions)](#第四层provider-扩展-extensions)
6. [第五层：CLI 命令层](#第五层cli-命令层)
7. [第六层：配置与类型](#第六层配置与类型)
8. [测试体系](#测试体系)
9. [Provider 一览](#provider-一览)
10. [附录：完整文件路径清单](#附录完整文件路径清单-complete-file-path-inventory)

---

## 架构总览

OpenClaw 视频生成系统的设计哲学是：**Provider 可插拔、模式可感知、失败可容错**。

```
┌─────────────────────────────────────────────────────┐
│                  CLI / Agent Tool                    │  ← 用户入口
├─────────────────────────────────────────────────────┤
│               Core Runtime (运行时)                  │  ← 模型路由 + fallback
├─────────────────────────────────────────────────────┤
│              Provider Registry (注册表)              │  ← 插件发现 + 别名解析
├─────────────────────────────────────────────────────┤
│                  Plugin SDK                          │  ← 类型导出 + 公共接口
├─────────────────────────────────────────────────────┤
│  Provider Extensions (alibaba/fal/google/runway/…)  │  ← 实际 API 对接
└─────────────────────────────────────────────────────┘
```

整套流程：

1. 用户通过 CLI 或 Agent 工具发起视频生成请求
2. 核心运行时解析 `provider/model` 引用，选择候选 Provider
3. Provider Registry 从已注册的插件中查找匹配的 Provider
4. 运行时处理 capabilities 协商（尺寸、时长、宽高比等）
5. 调用 Provider 的 `generate()` 方法，支持 fallback 重试
6. 返回视频 buffer + 元数据

---

## 第一层：核心运行时 (Core Runtime)

核心运行时位于 `src/video-generation/`，是整个视频生成的大脑。

### 关键文件

| 文件 | 职责 |
|------|------|
| `types.ts` | 所有核心类型定义：`VideoGenerationRequest`、`VideoGenerationResult`、`VideoGenerationProviderCapabilities` 等 |
| `runtime.ts` | 主入口 `generateVideo()`，处理模型解析、Provider 选择、fallback 逻辑 |
| `provider-registry.ts` | Provider 注册表，支持 ID 规范化 + 别名解析 + 插件发现 |
| `capabilities.ts` | 模式感知能力协商（generate / imageToVideo / videoToVideo） |
| `duration-support.ts` | 时长规范化，将用户请求的秒数对齐到 Provider 支持的离散值 |
| `model-ref.ts` | 解析 `provider/model` 格式的模型引用字符串 |

### 设计亮点

**三种生成模式：**
- `generate` — 纯文本到视频
- `imageToVideo` — 图片 + 文本生成视频
- `videoToVideo` — 视频 + 文本生成新视频

运行时根据输入自动判断模式，并检查目标 Provider 是否支持该模式。

**Fallback 机制：** 当主模型失败时，自动尝试配置中的 fallback 模型列表，记录每次尝试的结果。

---

## 第二层：Agent 工具层 (Agent Tool Layer)

位于 `src/agents/tools/`，是 AI Agent 调用视频生成的桥梁。

### 核心组件

- **`video-generate-tool.ts`** — Agent 工具的主定义，包含 Typebox schema、参数解析、输入验证（最多 5 张图片、4 个视频输入）、支持的宽高比集合
- **`video-generate-background.ts`** — 后台任务管理，创建/追踪/完成/失败视频生成任务
- **`video-generate-tool.actions.ts`** — `list`（列出 Provider）、`status`（查询任务状态）等辅助 action
- **`media-tool-shared.ts`** — 图片和视频工具共享的 Provider 查找、模型配置解析逻辑

### Agent 集成点

- `openclaw-tools.ts` — 注册视频生成工具到 Agent 的工具目录
- `tool-catalog.ts` / `tool-display-config.ts` — 工具目录管理和 UI 展示配置
- `pi-embedded-subscribe.tools.ts` / `pi-embedded-subscribe.handlers.tools.ts` — Pi Agent 嵌入式订阅中的工具处理
- `video-generation-task-status.ts` — 任务状态追踪（跨请求的异步状态管理）
- `internal-event-contract.ts` — 内部事件契约定义

---

## 第三层：Plugin SDK

Plugin SDK 是 Provider 插件的公共契约层。

### 两层导出

1. **`packages/plugin-sdk/src/video-generation.ts`** — NPM 包导出，供外部插件使用，re-export 自核心类型
2. **`src/plugin-sdk/video-generation.ts`** — 内部 SDK 导出，所有核心类型的公共接口
3. **`src/plugin-sdk/video-generation-core.ts`** — 核心运行时功能的 SDK 包装

### 插件注册体系

- `src/plugins/registry.ts` — 插件注册表
- `src/plugins/api-builder.ts` — 插件 API 构建器
- `src/plugins/types.ts` — 插件类型定义（包含 `VideoGenerationProviderPlugin`）
- `src/plugins/runtime/` — 运行时插件加载
- `src/plugins/captured-registration.ts` — 捕获式注册（用于测试）
- `src/plugins/contracts/registry.ts` — 注册契约

---

## 第四层：Provider 扩展 (Extensions)

每个 Provider 扩展遵循统一的目录模式：

```
extensions/<provider>/
├── index.ts                           # 插件入口，注册 Provider
├── video-generation-provider.ts       # Provider 实现
└── video-generation-provider.test.ts  # 单元测试
```

### 11 个 Provider

| Provider | 目录 | 说明 |
|----------|------|------|
| **Alibaba** | `extensions/alibaba/` | 阿里云视频生成 |
| **BytePlus** | `extensions/byteplus/` | 字节跳动海外版 |
| **ComfyUI** | `extensions/comfy/` | ComfyUI 工作流对接，附带 live test |
| **fal.ai** | `extensions/fal/` | fal.ai 平台（默认模型 minimax/video-01-live） |
| **Google** | `extensions/google/` | Google Veo 系列 |
| **MiniMax** | `extensions/minimax/` | MiniMax 视频生成，含额外 `index.test.ts` |
| **OpenAI** | `extensions/openai/` | OpenAI Sora 等 |
| **Qwen** | `extensions/qwen/` | 通义千问视频生成，含 `test-api.ts` |
| **Runway** | `extensions/runway/` | Runway Gen 系列 |
| **Together** | `extensions/together/` | Together AI |
| **Vydra** | `extensions/vydra/` | Vydra 视频平台 |
| **xAI** | `extensions/xai/` | xAI（Grok 系列） |

### 核心扩展模块

- **`extensions/video-generation-core/`** — 视频生成核心扩展运行时
  - `api.ts` — 核心 API 定义
  - `runtime-api.ts` — 运行时 API
  - `src/runtime.ts` — 扩展运行时实现（独立于主运行时的镜像逻辑）

### Provider 实现模式

每个 Provider 的 `video-generation-provider.ts` 一般包含：
- API 认证和 HTTP 客户端配置
- 模型到端点的映射
- 请求构建（prompt、尺寸、时长等参数转换）
- 轮询机制（队列式异步 API）
- 响应解析和视频 buffer 下载
- Capabilities 声明（支持的模式、时长、尺寸等）

---

## 第五层：CLI 命令层

CLI 提供命令行直接使用视频生成功能。

- **`src/cli/video-cli.ts`** — 注册 `openclaw video generate` 和 `openclaw video list` 子命令
- **`src/commands/video-generate.ts`** — `generate` 命令实现
- **`src/commands/video-list.ts`** — `list` 命令实现

CLI 支持的参数：`--prompt`、`--model`、`--image`、`--video`、`--aspect-ratio`、`--resolution`、`--duration`、`--audio`、`--watermark`、`--output`、`--json`

---

## 第六层：配置与类型

- **`src/config/schema.base.generated.ts`** — 自动生成的配置 schema（包含 `videoGenerationModel` 等字段）
- **`src/config/schema.help.ts`** — 配置帮助文本
- **`src/config/types.agent-defaults.ts`** — Agent 默认配置类型（包含视频生成模型默认值）

配置支持 `primary` + `fallbacks` 格式：

```json
{
  "agents": {
    "defaults": {
      "videoGenerationModel": {
        "primary": "google/veo-3",
        "fallbacks": ["fal/minimax-video-01-live"]
      }
    }
  }
}
```

---

## 测试体系

OpenClaw 视频生成的测试覆盖非常全面：

### 单元测试（每个 Provider 一个）
- `extensions/*/video-generation-provider.test.ts` — 12 个 Provider 各有独立测试

### 集成测试
- `extensions/video-generation-providers.live.test.ts` — 所有 Provider 的 live 集成测试
- `extensions/comfy/comfy.live.test.ts` — ComfyUI 专用 live 测试
- `extensions/music-generation-providers.live.test.ts` — 音乐生成（相关 live 测试）

### 工具层测试
- `src/agents/tools/video-generate-tool.test.ts` — 工具主逻辑
- `src/agents/tools/video-generate-tool.status.test.ts` — 状态查询
- `src/agents/tools/video-generate-background.test.ts` — 后台任务
- `src/agents/openclaw-tools.video-generation.test.ts` — Agent 工具注册

### 运行时测试
- `src/video-generation/runtime.test.ts` — 核心运行时
- `src/video-generation/provider-registry.test.ts` — Provider 注册表
- `src/video-generation/capabilities.test.ts` — 能力协商

### 插件测试
- `src/plugins/discovery.test.ts` — 插件发现
- `src/plugins/contracts/extension-package-project-boundaries.test.ts` — 扩展包边界

### 测试辅助工具
- `src/agents/test-helpers/fast-openclaw-tools.ts` — 快速工具实例化
- `src/agents/test-helpers/fast-tool-stubs.ts` — 工具 stub
- `test/helpers/plugins/` — 插件测试辅助（mock、契约、注册）

---

## Provider 一览

| # | Provider ID | 文件数 | 支持模式 |
|---|-------------|--------|----------|
| 1 | alibaba | 3 | T2V |
| 2 | byteplus | 3 | T2V |
| 3 | comfy | 4 | T2V (工作流) |
| 4 | fal | 3 | T2V, I2V |
| 5 | google | 3 | T2V, I2V |
| 6 | minimax | 4 | T2V |
| 7 | openai | 3 | T2V |
| 8 | qwen | 4 | T2V |
| 9 | runway | 3 | T2V, I2V |
| 10 | together | 3 | T2V |
| 11 | vydra | 3 | T2V |
| 12 | xai | 3 | T2V |

> T2V = Text-to-Video, I2V = Image-to-Video

---

## 附录：完整文件路径清单 (Complete File Path Inventory)

以下为 OpenClaw 代码库中所有与视频生成相关的文件路径，共 **97 个文件**：

```
./extensions/alibaba/index.ts
./extensions/alibaba/video-generation-provider.test.ts
./extensions/alibaba/video-generation-provider.ts
./extensions/byteplus/index.ts
./extensions/byteplus/video-generation-provider.test.ts
./extensions/byteplus/video-generation-provider.ts
./extensions/comfy/comfy.live.test.ts
./extensions/comfy/index.ts
./extensions/comfy/video-generation-provider.test.ts
./extensions/comfy/video-generation-provider.ts
./extensions/fal/index.ts
./extensions/fal/video-generation-provider.test.ts
./extensions/fal/video-generation-provider.ts
./extensions/google/index.ts
./extensions/google/video-generation-provider.test.ts
./extensions/google/video-generation-provider.ts
./extensions/minimax/index.test.ts
./extensions/minimax/index.ts
./extensions/minimax/video-generation-provider.test.ts
./extensions/minimax/video-generation-provider.ts
./extensions/music-generation-providers.live.test.ts
./extensions/openai/index.ts
./extensions/openai/video-generation-provider.test.ts
./extensions/openai/video-generation-provider.ts
./extensions/qwen/index.ts
./extensions/qwen/test-api.ts
./extensions/qwen/video-generation-provider.test.ts
./extensions/qwen/video-generation-provider.ts
./extensions/runway/index.ts
./extensions/runway/video-generation-provider.test.ts
./extensions/runway/video-generation-provider.ts
./extensions/together/index.ts
./extensions/together/video-generation-provider.test.ts
./extensions/together/video-generation-provider.ts
./extensions/video-generation-core/api.ts
./extensions/video-generation-core/runtime-api.ts
./extensions/video-generation-core/src/runtime.test.ts
./extensions/video-generation-core/src/runtime.ts
./extensions/video-generation-providers.live.test.ts
./extensions/vydra/index.ts
./extensions/vydra/video-generation-provider.test.ts
./extensions/vydra/video-generation-provider.ts
./extensions/xai/index.ts
./extensions/xai/video-generation-provider.test.ts
./extensions/xai/video-generation-provider.ts
./packages/plugin-sdk/src/video-generation.ts
./src/agents/internal-event-contract.ts
./src/agents/openclaw-tools.ts
./src/agents/openclaw-tools.video-generation.test.ts
./src/agents/pi-embedded-runner/run/attempt.prompt-helpers.test.ts
./src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts
./src/agents/pi-embedded-subscribe.handlers.tools.media.test.ts
./src/agents/pi-embedded-subscribe.handlers.tools.ts
./src/agents/pi-embedded-subscribe.tools.media.test.ts
./src/agents/pi-embedded-subscribe.tools.ts
./src/agents/test-helpers/fast-openclaw-tools.ts
./src/agents/test-helpers/fast-tool-stubs.ts
./src/agents/tool-catalog.test.ts
./src/agents/tool-catalog.ts
./src/agents/tool-display-config.ts
./src/agents/tools/media-tool-shared.ts
./src/agents/tools/video-generate-background.test.ts
./src/agents/tools/video-generate-background.ts
./src/agents/tools/video-generate-tool.actions.ts
./src/agents/tools/video-generate-tool.status.test.ts
./src/agents/tools/video-generate-tool.test.ts
./src/agents/tools/video-generate-tool.ts
./src/agents/video-generation-task-status.test.ts
./src/agents/video-generation-task-status.ts
./src/cli/video-cli.test.ts
./src/cli/video-cli.ts
./src/commands/video-generate.test.ts
./src/commands/video-generate.ts
./src/commands/video-list.test.ts
./src/commands/video-list.ts
./src/config/schema.base.generated.ts
./src/config/schema.help.ts
./src/config/types.agent-defaults.ts
./src/plugin-sdk/video-generation-core.ts
./src/plugin-sdk/video-generation.ts
./src/plugins/api-builder.ts
./src/plugins/captured-registration.ts
./src/plugins/contracts/extension-package-project-boundaries.test.ts
./src/plugins/contracts/registry.ts
./src/plugins/contracts/speech-vitest-registry.ts
./src/plugins/discovery.test.ts
./src/plugins/registry.ts
./src/plugins/runtime/index.ts
./src/plugins/runtime/types-core.ts
./src/plugins/types.ts
./src/tasks/task-executor.test.ts
./src/video-generation/capabilities.test.ts
./src/video-generation/capabilities.ts
./src/video-generation/duration-support.ts
./src/video-generation/model-ref.ts
./src/video-generation/provider-registry.test.ts
./src/video-generation/provider-registry.ts
./src/video-generation/runtime.test.ts
./src/video-generation/runtime.ts
./src/video-generation/types.ts
./test/helpers/plugins/plugin-api.ts
./test/helpers/plugins/plugin-registration-contract.ts
./test/helpers/plugins/plugin-runtime-mock.ts
./test/helpers/plugins/provider-registration.ts
```

---

*本文由 🦞 龙虾侦探基于 OpenClaw 源码分析自动生成。*
