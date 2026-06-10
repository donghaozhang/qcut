# 修复方案 —— Windows "QCut 打不开"(优先级 1-3)

在分支 `docs/windows-cannot-open-qcut` 上以单个 PR 实施
[README.zh-CN.md](README.zh-CN.md) 中的修复 1-3。修复 4-5(second-instance
重建窗口、GPU 兜底)和 A1(代码签名)不在本次范围内。

英文版:[FIX-PLAN.md](FIX-PLAN.md)。

## 设计:把决策逻辑抽成无副作用的 policy 模块

两个 Bug 都埋在 `electron/main.ts` 的闭包里,无法直接测试(import main.ts
就会启动 Electron)。修复方式是把两处决策抽到一个新的纯函数模块,让
Vitest 可以覆盖,`main.ts` 改为调用它。

新文件:`electron/launch-policy.ts`

```ts
type PortBindAction = "retry-next" | "fallback-random" | "reject";

// 新增 EACCES:Windows WinNAT 排除端口区间(Hyper-V/WSL2)内绑定端口
// 报的是 EACCES 而不是 EADDRINUSE。
export function nextPortAction({ code, port, maxPort }): PortBindAction;

// 打包版绝不能信任继承来的 NODE_ENV。
export function resolveRendererTarget({ isPackaged, nodeEnv }):
  { isDev: boolean; url: string };
```

## 改动 1 —— 静态服务器绑定失败不再静默杀死启动

文件:`electron/main.ts`

1. `createStaticServer` 的 `errorHandler`(约 477 行)改为调用
   `nextPortAction`:
   - `EADDRINUSE` **或 `EACCES`** 且低于 `MAX_PORT` → 试下一个端口
     (现状只处理 `EADDRINUSE`)。
   - 到达/超过 `MAX_PORT` → `server.listen(0)`(操作系统分配空闲端口),
     不再 reject。`staticServerPort` 从 `server.address()` 读回,其余代码
     没有任何地方硬编码 8080,所以 CSP 里的
     `connect-src http://localhost:${staticServerPort}` 依然正确。
   - 其他错误 → reject(现在会被暴露出来,见改动 2)。

2. 正常应用的 `app.whenReady().then(async () => {...})` 链(约 775 行)
   加 `.catch`:记日志并弹 `dialog.showErrorBox("QCut failed to start",
   ...)` —— 把"静默无窗口"变成可见、可上报的错误。

## 改动 2 —— 打包版忽略继承的 NODE_ENV

文件:`electron/main.ts`(约 605 行)

```ts
// 修改前
const isDev = process.env.NODE_ENV === "development";
// 修改后
const { isDev, url } = resolveRendererTarget({
  isPackaged: app.isPackaged,
  nodeEnv: process.env.NODE_ENV,
});
```

`isDev` 继续控制 DevTools 自动打开。打包版从此无论用户环境变量如何,
一律加载 `app://./index.html`。

## 改动 3 —— 渲染进程失败变得可观测

文件:`electron/main.ts` 的 `createWindow()` 内:

- `webContents.on("did-fail-load")` —— 记录错误码/描述/URL;主框架
  (main frame)失败时额外弹 `dialog.showErrorBox`(这正是白屏场景;
  子框架/资源失败只记日志)。
- `webContents.on("render-process-gone")` —— 记录 reason + exitCode。
- `app.on("child-process-gone")`(GPU)—— 只记日志;自动回退软件渲染
  不在本次范围(修复 5)。

`ERR_ABORTED`(-3)不弹窗:正常导航中断也会触发它。

## 测试

单元测试(`electron/__tests__/launch-policy.test.ts`,Vitest):

| 用例 | 期望 |
|------|------|
| `EADDRINUSE`,port < max | `retry-next` |
| `EACCES`,port < max | `retry-next` |
| `EADDRINUSE`/`EACCES`,port ≥ max | `fallback-random` |
| 其他错误码(如 `EPERM`),任意端口 | `reject` |
| 打包 + `NODE_ENV=development` | `app://./index.html`,`isDev: false` |
| 打包 + 未设置 | `app://./index.html` |
| 未打包 + `development` | `http://localhost:5173`,`isDev: true` |
| 未打包 + 未设置 | `app://./index.html`,`isDev: false` |

手动 / 集成验证(不进本次 CI):

- macOS:`NODE_ENV=development open "…/QCut AI Video Editor.app"` →
  修复后必须正常打开(修复前可复现 Bug 2 白屏)。
- 任意系统:用 11 个空监听占住 8080-8090,再启动开发版 → 窗口必须照常
  出现(落在随机端口)。
- Windows 虚拟机:管理员执行 `netsh int ipv4 add excludedportrange
  protocol=tcp startport=8080 numberofports=11` 后启动 → 窗口必须出现;
  修复前可复现"有进程无窗口"。测完用 `delete excludedportrange` 清理。

回归门槛:`bun run test electron/__tests__/launch-policy.test.ts`、
`npx tsc -p electron/tsconfig.json --noEmit`、改动文件的 biome 检查。

## 风险

- `listen(0)` 分配的端口落在 8080-8090 之外:CSP 已按实际端口插值;
  FFmpeg WASM 的 URL 通过 IPC 由 `staticServerPort` 构建。已确认没有
  消费方硬编码这个区间。
- 启动错误弹窗可能过度打扰:只在 whenReady 链失败和主框架加载失败
  (排除 -3)时弹——这两种情况在修复前本来就等于应用已死。
