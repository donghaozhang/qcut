# macOS 代码签名 + 公证 — 总体方案

**分支：** `gpt-image-2`
**创建日期：** 2026-04-25

## 目标

对 QCut 的 macOS 发布产物（`.dmg`、`.zip`、内层 `.app`）做签名和公证，
使其：

1. 用户首次打开时 Gatekeeper 不拦（不弹"无法打开 QCut.app，因为无法
   验证开发者"）。
2. 用户不需要"右键 → 打开"绕过。
3. 安全弹窗里显示已验证的开发者名 "Quriosity Pty Ltd"。

团队决议是**买商用证书**（不走任何免费路径），因为 QCut 之后可能闭源。
Apple Developer Program 在开源/闭源两种状态下都适用，**不需要**重选
方案。

## 你要买的东西

**Apple Developer Program — 组织席位（Organization tier），USD 99/年。**

这一份会员包含：

- Mac + iOS 开发资格（我们只用 Mac）。
- **无限张证书** — Apple **不**按张计费。
- **公证服务** — Apple 的恶意软件扫描，免费包含。
- 后续无成本添加团队成员。

跨平台对比：

| 平台 | 厂商 | 年成本 | 包含 |
|------|------|--------|------|
| **Mac** | Apple | $99 | 无限 Developer ID 证书 + 公证 + iOS 资格 |
| **Windows** | Certum SimplySign（OV） | ~$200 | 云端 HSM Authenticode 证书 + 手机审批签名 — 详见 [windows-code-signing/CERTIFICATE-OPTIONS.zh-CN.md](../windows-code-signing/CERTIFICATE-OPTIONS.zh-CN.md) |
| **合计** | | **~$299/年** | 双平台齐全 |

## 子任务拆分

| # | 子任务 | 改代码？ | 耗时 | 详情 |
|---|--------|---------|------|------|
| 1 | 查找 / 申请 Quriosity 的 D-U-N-S Number | 否 | 查 5 分钟；申请要等 5–14 天 | [PROCUREMENT.zh-CN.md §1](PROCUREMENT.zh-CN.md#1-d-u-n-s-number) |
| 2 | 注册 Apple Developer Program（组织席位） | 否 | 提交 30 分钟 + 审核 1–2 天 | [PROCUREMENT.zh-CN.md §2](PROCUREMENT.zh-CN.md#2-apple-developer-program-注册) |
| 3 | 生成 Developer ID Application 证书，导出 .p12 | 否 | 15 分钟 | [PROCUREMENT.zh-CN.md §3](PROCUREMENT.zh-CN.md#3-developer-id-application-证书) |
| 4 | App-Specific Password + 记下 Team ID | 否 | 5 分钟 | [PROCUREMENT.zh-CN.md §4](PROCUREMENT.zh-CN.md#4-app-specific-password-和-team-id) |
| 5 | 改 `electron-builder` mac 配置 | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §1](IMPLEMENTATION.zh-CN.md#1-修改-electron-builder-mac-配置) |
| 6 | 改 GitHub Actions mac 任务 | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §2](IMPLEMENTATION.zh-CN.md#2-修改-github-actions-发布工作流) |
| 7 | 加构建后签名 + 公证校验 | 是 | 1 小时 | [IMPLEMENTATION.zh-CN.md §3](IMPLEMENTATION.zh-CN.md#3-增加签名公证校验脚本) |
| 8 | 文档 | 是（文档） | 45 分钟 | [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) |
| 9 | 测试 | 是 | 1 小时 | [TESTING.zh-CN.md](TESTING.zh-CN.md) |
| 10 | 在干净 macOS VM 上做发布演练 | 否 | 1 小时 | [IMPLEMENTATION.zh-CN.md §4](IMPLEMENTATION.zh-CN.md#4-在干净-macos-vm-上做发布演练) |

**工程总耗时：约 5 小时。墙上时间取决于 Apple — D-U-N-S 1–14 天 + 注册审核 1–2 天。**

## 本方案会动到的文件

### 需要修改
- `qcut/package.json` — `build.mac` 块（第 265–286 行）：加 `identity` 和 `notarize` 配置。
- `qcut/.github/workflows/release.yml` — `build-macos` 任务（约第 110–200 行）：在 env 块加 Apple secret，加 verify 步骤。
- `qcut/docs/release.md` — 加签名前置条件说明（不存在则新建）。

### 需要新增
- `qcut/scripts/verify-macos-signature.ts` — `codesign` + `spctl` + `xcrun stapler` 校验。
- `qcut/scripts/__tests__/verify-macos-signature.test.ts` — Vitest 单元测试。
- `qcut/scripts/__tests__/package-json-mac-signing.test.ts` — `package.json` 形态守门。
- `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts` — 工作流 YAML 守门。
- `qcut/docs/setup/macos-code-signing.md` — 维护者签名设置指南。
- `qcut/docs/task/macos-code-signing/` — 本目录。

### 故意不动
- `qcut/build/entitlements.mac.plist` — 已经是对的。当前授权
  （`com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`、
  `disable-library-validation`、`audio-input`、`camera`、
  `files.user-selected.read-write`）是 FFmpeg WASM 和动态加载必需的。
  这些是显式声明的授权，不是空白豁免，公证会接受。
- `qcut/build/icon.icns` — 图标保持原样。
- iOS 路径 — QCut 是 Electron 桌面，没有 iOS 提交。

## 风险与待定问题

1. **D-U-N-S 延迟是关键路径。** 如果 Quriosity 还没有 D-U-N-S Number，
   后面所有事都卡这里，5–14 天。**子任务 1 今天就开始。**
2. **Apple 核实电话。** Apple 可能会打 D-U-N-S 上登记的电话验证授权
   签字人。号码不对的话会一直卡。
3. **公证可能因不明显的原因失败。** `.app` 里任何嵌套二进制如果未
   签名或缺权限，整个 bundle 都会被拒。QCut 通过
   `stage-ffmpeg-binaries` 和 `stage-aicp-binaries`（见
   `qcut/package.json:98-99`）打包了原生二进制；这些**必须**能干净
   签名。预留 1–2 轮调试时间。
4. **GitHub-hosted vs 自托管 Mac runner。** `release.yml` 里有
   `USE_SELF_HOSTED_MAC` 开关。两条路都能用 `CSC_LINK` env 变量；
   自托管 Mac 把证书提前装进钥匙串会更快。
5. **App-Specific Password 绑定到一个 Apple ID。** 如果 Apple ID 的
   持有者离开 Quriosity，密码就废了。缓解：
   - 把 Apple ID 注册到组织共享邮箱（例如 `apple-dev@qcut.app`），
     不要用任何人的个人邮箱。
   - 计划迁移到 App Store Connect API key（后续加固，见
     [`IMPLEMENTATION.zh-CN.md §5`](IMPLEMENTATION.zh-CN.md#5-后续加固单独跟踪)）。
6. **证书续期。** Apple Developer Program $99/年自动续费。如果续费
   失败（卡过期等），约 30 天内**所有**签名会失效。给 Apple ID 设
   账单告警。

## 验收标准

- [x] `codesign --verify --deep --strict --verbose=2 QCut.app` 退出 0。*（2026-05-01 通过 `verify:macos-signature` 脚本验证）*
- [x] `spctl -a -t exec -vv QCut.app` 报告 `accepted` 且 `source=Notarized Developer ID`。*（2026-05-01 验证）*
- [x] ~~`xcrun stapler validate QCut.dmg` 报告 `The validate action worked!`。~~ 调整：stapler 校验的是 **DMG 里的 `.app`**（通过），不是 DMG 本身。electron-builder 26 不再直接 staple `.dmg`，因为 Gatekeeper 启动时检查的是内层 `.app`。`verify:macos-signature` 把 DMG-staple 视作 advisory。*（2026-05-01 验证）*
- [x] 在开发者本机（macOS 26.4.1 Tahoe）双击 `.dmg`、拖到 Applications、打开，只弹了标准"从互联网下载 → 打开"对话框 —— 没有"无法打开"，也不需要右键 → 打开。*（2026-05-01 验证）*。**还没在干净 VM / 新建用户账号上验证** —— 见 [README.zh-CN.md](README.zh-CN.md#还没做) 的"还没做"。
- [x] macOS 安全弹窗里显示的开发者名是 "Quriosity Pty Ltd"。*（2026-05-01 验证）*
- [ ] 维护者签名指南 `qcut/docs/setup/macos-code-signing.md` —— 部分完成：PROCUREMENT.md 和 IMPLEMENTATION.md 覆盖了流程，但还没合并写出一份独立的 setup 指南。

## 本方案不覆盖的部分

- Mac App Store 提交（不同证书、沙盒约束、应用审核）。
- iOS / iPadOS 分发。
- 从 app-specific password 迁移到 App Store Connect API key（后续
  加固，单独立任务）。
- 通用二进制（目前只支持 arm64 — 若以后要重新支持 Intel Mac，单独
  跟踪）。
