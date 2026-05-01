# macOS 代码签名 — 任务目录

为 QCut 的 macOS 发布产物（`.dmg` / `.zip` / 内层 `.app`）做 Apple
Developer ID 签名 + Apple 公证服务（notarization）。

**决策背景：** QCut 之后可能闭源，所以买商用 Apple Developer Program
会员，而不是走开源免费路线。这样无论 QCut 开源或闭源，Mac 签名方案
都不变。

姊妹任务：[`docs/task/windows-code-signing/`](../windows-code-signing/)。

## 本目录文件说明

| 文件 | 内容 |
|------|------|
| [PLAN.zh-CN.md](PLAN.zh-CN.md) | 总体方案、子任务拆分、验收标准、风险。**先看这个。** |
| [PROCUREMENT.zh-CN.md](PROCUREMENT.zh-CN.md) | Apple Developer Program 注册流程 — D-U-N-S Number、证书生成、App-Specific Password、Team ID。**用户手工操作。** |
| [IMPLEMENTATION.zh-CN.md](IMPLEMENTATION.zh-CN.md) | 每个子任务的实现细节，含文件路径和 diff。 |
| [TESTING.zh-CN.md](TESTING.zh-CN.md) | 单元测试、工作流测试、人工 VM 验证。 |
| [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) | 维护者文档，需随代码一起更新。 |

英文原版位于同目录的 `README.md` / `PLAN.md` / 等等。

## 进度

- [x] 方案已草拟
- [x] 子任务 1：D-U-N-S Number — `893394655`（Quriosity Pty Ltd，2026-04-25 签发）
- [x] 子任务 2：Apple Developer Program 已注册 — Team ID `JQ3Q27U24X`，账号持有人 `zdhpeter@gmail.com`（2026-04-30 激活）
- [x] 子任务 3：Developer ID Application 证书已生成，已导入登录钥匙串，导出为 `.p12`（证书哈希 `363E778CF99E6C0D76484ECFDEF45927DC7EEE86`）
- [x] 子任务 4：App-Specific Password 已生成，Team ID 已记录
- [x] 子任务 5：`electron-builder` `mac.identity` + `mac.notarize: true` 已写入 `package.json` — commit `39eb7169d`
- [x] 子任务 6：GitHub Actions `release.yml` `build-macos` 任务接入了 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；secrets 已推到 `Quriosity-agent/qcut` — commit `3803151ef`
- [x] 子任务 7：`scripts/verify-macos-signature.ts` + `verify:macos-signature` npm 脚本
- [x] ~~子任务 8~~ 维护者文档 —— 部分完成；PROCUREMENT / IMPLEMENTATION 文档覆盖了流程，但还没单独写 `docs/setup/macos-code-signing.md`
- [ ] 子任务 9：verify 脚本的自动化测试（延后）
- [x] 子任务 10：本机演练（2026-05-01）—— 双击 DMG、拖到 Applications、双击启动全部成功；`spctl: accepted, source=Notarized Developer ID`

### 计划外（额外完成）

- [x] **自定义 hdiutil DMG（`scripts/build-mac-dmg.ts`）** 绕过 dmg-builder@26.8.1 在 macOS Tahoe 上把 175 MB Electron Framework 二进制丢失的 bug — 详见 commit `3803151ef` 和 memory 中的 `dmg_builder_tahoe_bug.md`。`mac.target` 缩减为 `["zip"]`；DMG 在 electron-builder 跑完后用 `hdiutil create` 对已签名/已公证/已 staple 的 `.app` 直接生成。

### 还没做

- [ ] 建议：推一个 RC tag 在 GitHub-hosted Mac runner 上完整跑一次 `release.yml` `build-macos`——本机构建工作良好，但 CI 路径（`CSC_LINK` base64 解码到临时钥匙串）还没真正跑过。
- [ ] 可选：给 `electron-userland/electron-builder` 提一个 upstream issue，附本次任务的复现步骤。
