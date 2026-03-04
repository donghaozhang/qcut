# Auto-Edit IPC Bridge 故障复盘（2026-03-05）

## 1. 现象

复现命令（Step 3）：

```bash
bun run pipeline editor:editing:auto-edit \
  --project-id 59084b5d-fac6-472f-89a6-203bfa2b461b \
  --element-id 0a21e95d-49e3-4f17-a875-38f5f2e7abeb \
  --media-id media_YWktbmV3cy10ZXN0Lm1wNA \
  --remove-fillers \
  --poll \
  --json
```

错误表现：

- 先返回 `pending`（有 `jobId`）
- 随后作业失败，报错：`IPC bridge unavailable for batch cut execution`

## 2. 最终定位

失败发生在自动剪辑最后一步“应用批量切割”阶段：

- `autoEdit(...)` 会调用 `executeBatchCuts(...)`
- `executeBatchCuts(...)` 内部先做 IPC 可用性检查
- 检查失败时抛出 `IPC bridge unavailable for batch cut execution`

关键调用链：

- `electron/claude/handlers/claude-auto-edit-handler.ts`
- `electron/claude/handlers/claude-cuts-handler.ts`
- `electron/claude/utils/renderer-ipc-guard.ts`

## 3. 实际修复内容

### 3.1 代码修复

修复文件：

- `electron/claude/handlers/claude-cuts-handler.ts`

修复点：

- 把 `ipcMain` 获取方式统一成静态导入路径（与其它 handler 一致）。
- 避免在该路径上因运行态差异导致 IPC 可用性判断异常。

修复后关键代码（语义）：

- `import { ipcMain } from "electron"`
- `const ipcMainInstance = ipcMain`

### 3.2 验证结果

通过验证：

1. 单独执行 `editor:editing:batch-cuts` 成功。
2. 重新执行 Step 3 成功，状态 `ok`，并完成 `9 cuts applied`。

## 4. 为什么这个问题难修

这次问题难点不在单点逻辑，而在“多进程 + 异步作业 + 通用错误文案”的组合：

1. 运行链路跨进程  
   CLI -> HTTP -> utility/main -> renderer。任一跳出问题，用户端看到的都是同一条高层错误。

2. 异步作业掩盖即时上下文  
   `--poll` 先返回 `pending`，真正异常在后台发生，CLI 只拿到收敛后的失败文本。

3. 错误信息粒度不足  
   现有报错没有直接告诉你“失败发生在 auto-edit 的第几步、哪个进程、哪个 channel”。

4. 旧进程与新代码的错觉  
   代码修复后，如果运行态没有完全刷新，会出现“我明明改了，但现场仍报旧错”的判断噪音。

## 5. 当前鲁棒性评估

结论：**可用性尚可，但可观测性不够，导致定位效率偏低。**

已有优点：

- 有健康检查、作业状态、日志文件。
- 关键路径有 guard，能避免静默失败。

当前缺口：

- 错误上下文不结构化。
- 缺少跨进程统一追踪 ID 在错误输出中的强绑定。
- `auto-edit` 阶段内失败点没有显式暴露给 CLI。

## 6. 建议的设计改进（让同类错误更容易发现）

1. 结构化错误对象  
   为编辑管线统一返回：`stage`、`process`、`channel`、`check`、`hint`。  
   例如：`stage=autoEdit.applyCuts`, `process=utility`, `check=ipcMain.on missing`。

2. 全链路关联 ID  
   从 CLI 请求开始，贯穿 HTTP、job、IPC 请求，统一 `correlationId`，并在所有失败返回中透出。

3. 健康检查分层  
   `editor:health` 增加可选深度项：  
   `ipcMain-ready`、`utility-main bridge`、`renderer responders`、`auto-edit cut apply probe`。

4. 显式记录“走了哪条分支”  
   在路由层打日志：是否使用 `accessor.startAutoEditJob`、是否走 fallback、本次请求所在进程角色。

5. CLI 调试模式  
   增加 `--debug-trace`，把失败阶段和关键 guard 结果直接打印到命令输出，而不只在日志文件里。

6. 启动后自检关键路径  
   在开发态或诊断命令里增加轻量自检：  
   `auto-edit(start) -> status -> dry-run/apply-cuts probe`，提前暴露桥接异常。

## 7. 这次修复给出的结论

- 功能本身不是“算法错误”，而是“运行态 IPC 可用性判断/路径一致性”问题。  
- 代码层面修复后，必须配合运行态刷新验证。  
- 后续应优先提升错误可观测性和链路可追踪性，减少类似问题的定位成本。

