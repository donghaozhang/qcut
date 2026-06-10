# Windows:QCut 无法打开 —— 潜在 Bug 调查

针对"Windows 用户无法打开 QCut"的报告所做的调查。这个问题没有单一根因;
本文梳理了打包版 Windows 构建中每一条启动关键路径,并按用户感知到的故障
形态列出每条路径可能失败的具体方式。

姊妹文档:[windows-code-signing](../windows-code-signing/)(SmartScreen 签名问题),
英文版:[README.md](README.md)。

## 启动流水线(打包版)

```
双击 exe
  → SmartScreen / 杀毒软件拦截                        (阶段 A)
  → Electron 主进程启动 (main.ts)
  → 单实例锁                                          (main.ts:679)
  → app.whenReady().then(async () => {                (main.ts:775)
      createStaticServer()  ← await,可能 reject      (main.ts:791)
      createWindow()                                  (main.ts:793)
        loadURL:NODE_ENV 判断 → app://./index.html   (main.ts:605-613)
      注册 25+ 个 IPC handler(各自有 try/catch)
    })                       ← 整条链没有 .catch
```

在 `createWindow()` 之前任何一步失败,都意味着**窗口永远不会出现**,而任务
管理器里可能还挂着一个 `QCut AI Video Editor.exe` 进程——用户的描述正是
"QCut 打不开"。

## 阶段 A —— Electron 还没运行就被拦下

### A1. SmartScreen "未知发布者"(已知问题,跟踪于 #289)

安装包未签名——[package.json](../../../package.json) 中显式关闭了签名
(`win.forceCodeSigning: false`、`verifyUpdateCodeSignature: false`、
`signAndEditExecutable: false`),release workflow 同样传了禁用参数。
Defender SmartScreen 弹出"Windows 已保护你的电脑",且"仍要运行"按钮不
明显;非技术用户到这里就停了,然后报告"打不开"。**这是新装用户最可能的
真实原因。** 修复路径:购买证书 + 接入签名流程,见
[windows-code-signing](../windows-code-signing/)。

### A2. 杀毒软件隔离未签名的二进制文件

安装目录里有未签名的 `QCut AI Video Editor.exe` 以及打包的原生二进制
(ffmpeg/ffprobe、AICP)。杀毒软件经常隔离未签名的 Electron 应用,或在安装
后偷偷删掉个别二进制文件。取决于被删的是什么,应用要么完全起不来,要么
启动后渲染进程残缺(asar 内容缺失 → 白屏)。长期修复同 A1;短期:让受影响
用户查看杀软的隔离记录。

## 阶段 B —— 进程启动了,但窗口没出现

### B1. 静态服务器端口绑定失败,在创建窗口之前就中止了启动

[main.ts:791](../../../electron/main.ts) 在 `createWindow()`(793 行)
**之前** await 了 `createStaticServer()`,而外层的
`app.whenReady().then(...)` 链**没有 `.catch`**。`createStaticServer` 的重试
循环([main.ts:472-499](../../../electron/main.ts))只处理 `EADDRINUSE`,
且只重试到 8090 端口;其他任何错误都会直接 reject。

在 Windows 上这是真实风险:Hyper-V / WSL2(WinNAT)会保留动态的**排除端口
区间**(excluded port range),经常正好覆盖 8080-8090。在排除区间内绑定端口
报的是 **`EACCES` 而不是 `EADDRINUSE`**——重试循环根本不会触发,Promise
直接 reject,这个 rejection 又被当作 unhandled rejection 静默吞掉,
`createWindow()` 永远不会被调用。进程留在任务管理器里,没有任何窗口。
用户可以这样自查:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

**修复建议(代码修复里优先级最高):**
1. 给 whenReady 链加 `.catch`,用 `dialog.showErrorBox` 报错,不要静默死亡。
2. 重试循环把 `EACCES` 当 `EADDRINUSE` 同等处理;8090 之后回退到
   `server.listen(0)`(随机空闲端口)——端口本来就是通过 `staticServerPort`
   动态传递的,没有任何地方硬编码 8080。
3. 考虑把创建窗口放到静态服务器之前(该服务器只是后续给 FFmpeg WASM 供文件)。

### B2. 残留的单实例锁 / 僵尸进程

[main.ts:679-704](../../../electron/main.ts):拿不到
`requestSingleInstanceLock()` 时,新进程**静默** `app.quit()`。正常情况下,
已运行的实例会收到 `second-instance` 事件并把自己聚焦——但如果之前的 QCut
进程已挂起(比如卡在上面 B1 的状态,或某个残留的无头进程),它握着锁却没有
窗口可聚焦,用户每次双击都瞬间退出、毫无反应。
用户侧补救:在任务管理器结束 `QCut AI Video Editor.exe`。
代码加固:锁丢失时打日志;`second-instance` 处理器里当 `mainWindow` 为
null 时重建窗口,而不是什么都不做。

### B3. GPU 进程崩溃循环(没有任何兜底)

整个 `electron/` 目录里**没有** `--disable-gpu` 兜底,也没有
`child-process-gone` / `render-process-gone` 处理器(grep 验证过)。在 GPU
驱动有问题的机器上(老 Intel 核显、远程桌面环境很常见),Chromium 的 GPU
进程可能崩溃循环,表现为没有窗口或冻结的黑窗口。诊断方法:用
`"QCut AI Video Editor.exe" --disable-gpu` 启动,如果能开就是这个问题。
代码加固:监听 `app.on("child-process-gone")`,当 `type === "GPU"` 时调用
`app.disableHardwareAcceleration()` 并重启。

## 阶段 C —— 窗口开了,但一直白屏/空白

### C1. 打包版误判 `NODE_ENV=development`(具体 bug)

[main.ts:605-613](../../../electron/main.ts):

```ts
const isDev = process.env.NODE_ENV === "development";
if (isDev) {
    mainWindow.loadURL("http://localhost:5173");   // 开发服务器——用户机器上并不存在
} else {
    mainWindow.loadURL("app://./index.html");
}
```

这个判断依据的是**继承来的环境变量**,而不是 `app.isPackaged`。如果用户
机器上全局设置了 `NODE_ENV=development`(开发者、装过某些开发工具的机器),
打包版应用会去加载 `http://localhost:5173`,连接被拒绝 → 窗口永久白屏。
又因为没有 `did-fail-load` 处理器,这个失败完全是静默的。

**修复建议(一行):**`const isDev = !app.isPackaged &&
process.env.NODE_ENV === "development";` —— 同时加一个 `did-fail-load`
监听器,记日志并展示错误页。

### C2. 渲染资源或 preload 缺失/被删

打包后的渲染文件通过 `app://` 协议从 asar 内部提供
([app-protocol-handler.ts:28](../../../electron/app-protocol-handler.ts)
映射到 `app.getAppPath()/apps/web/dist`),preload 是
`dist/electron/preload.js`([main.ts:575](../../../electron/main.ts))。
如果某次构建打包不完整,或者杀软从安装目录删了文件,`index.html` 或
preload 会 404 → 白屏(渲染进程起不来,或起来了但没有
`window.electronAPI`,早期就崩溃)。同样没有 `did-fail-load` 把问题暴露
出来。缓解:和 C1 一样加 `did-fail-load` 日志;release 构建已有
ffmpeg/aicp 的存在性校验(`verify:packaged-*`),可以类似地在打包后断言
asar 里存在 `apps/web/dist/index.html`。

### C3. `%APPDATA%` 里的 Chromium 配置损坏

用户数据位于 `%APPDATA%\QCut AI Video Editor`(electron-log 的
`logs\main.log` 也在这里)。GPU 缓存 / IndexedDB(项目存储的回退层之一)
损坏可能导致渲染进程启动即白屏。用户侧补救:重命名该文件夹后重新启动。
在做任何代码修改之前,值得先写进面向用户的 FAQ。

## 排查指南(向受影响用户收集什么)

| 步骤 | 命令 / 操作 | 能说明什么 |
|------|-------------|------------|
| 1 | 双击后现象截图 | SmartScreen(A1)vs 毫无反应(B)vs 白屏窗口(C) |
| 2 | 任务管理器里有没有 `QCut AI Video Editor.exe` | B1/B3(有进程没窗口)vs A(没进程) |
| 3 | 发来 `%APPDATA%\QCut AI Video Editor\logs\main.log` | 静态服务器 / handler 报错都落在这里 |
| 4 | 终端里加 `--enable-logging` 运行 | 能看到渲染/网络错误 |
| 5 | `netsh interface ipv4 show excludedportrange protocol=tcp` | B1(8080-8090 落在排除区间内) |
| 6 | 试 `--disable-gpu` | 确认 B3 |
| 7 | `echo %NODE_ENV%` | 确认 C1 |
| 8 | 重命名 `%APPDATA%\QCut AI Video Editor` 后重启 | 确认 C3 |
| 9 | 杀软隔离记录 | 确认 A2 |

## 修复优先级建议

1. **B1** —— whenReady 链加 `.catch` + 错误弹窗;`EACCES` 重试 +
   `listen(0)` 兜底。改动小,消灭一整类静默失败。
2. **C1** —— 开发服务器加载改为以 `!app.isPackaged` 为前提。一行。
3. **C1/C2** —— 加 `did-fail-load` + `render-process-gone` 日志和错误页。
   让所有渲染失败都能从 `main.log` 诊断。
4. **B2** —— `second-instance` 时若 `mainWindow` 为 null 则重建窗口;锁
   丢失打日志。
5. **B3** —— GPU 崩溃回退软件渲染。
6. **A1** —— 代码签名(单独跟踪于
   [windows-code-signing](../windows-code-signing/),阻塞在证书购买)。

## 状态

- [x] `electron/main.ts` / `app-protocol-handler.ts` 启动路径审计
- [x] 实施修复 1-3(见 [FIX-PLAN.zh-CN.md](FIX-PLAN.zh-CN.md);`electron/launch-policy.ts` + `main.ts`,单元测试在 `electron/__tests__/launch-policy.test.ts`)
- [ ] 在排除端口区间覆盖 8080-8090 的 Windows 虚拟机上复现 B1
- [ ] 实施修复 4-5
- [ ] 面向用户的 FAQ 条目(SmartScreen、杀软、配置重置)
