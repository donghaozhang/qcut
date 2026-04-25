# Windows 安装包代码签名 — 总体方案

**对应 issue：** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**分支：** `gpt-image-2`
**创建日期：** 2026-04-25（同日修订，排除掉 Azure / SignPath / EV 路径之后定方案）

## 目标

用 Authenticode 证书（颁发给 **Quriosity Pty Ltd**）签 QCut 的 Windows
NSIS 安装包，使：

1. UAC 弹窗显示蓝色 "Verified publisher: Quriosity Pty Ltd"，不再是
   黄色 "Unknown publisher"。
2. 禁未签名 .exe 的企业 IT 策略不再拦 QCut。
3. 杀毒软件误报率下降。
4. SmartScreen "Windows protected your PC" 警告至少能显示发布者名
   （早期下载仍会触发 — 详见
   [CERTIFICATE-OPTIONS.zh-CN.md §SmartScreen 信誉的现实](CERTIFICATE-OPTIONS.zh-CN.md#smartscreen-信誉的现实2026)）。

按 `CLAUDE.md` 优先级顺序：
1. **可维护性** — 签名能融入发布流程，手工开销可控。
2. **可扩展性** — 凭据和身份在云 HSM 里，不绑定到某台电脑。
3. **性能** — 签名不应让发布墙上时间多于几分钟。
4. **短期收益** — *不是*目标。我们不会为了便宜 50 美金买一个带 USB
   token 运维债的 OV 分销证书。

## 为什么要买

QCut 之后可能闭源，免费/仅开源路径（SignPath Foundation）不兼容。
团队决定走商业证书路径。

## 选定路径：Certum SimplySign Standard Code Signing

- **价格：** 约 USD 200/年（€189/年）
- **类型：** OV（Organization Validation），云 HSM
- **Subject：** "Quriosity Pty Ltd"
- **为什么是这个**：见 [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md)。简版：Azure 不可用（国家+年限）、SignPath 仅开源、EV 自 2024 起不再值溢价、Sectigo/DigiCert OV 要 USB token。
- **要接受的权衡：** 每次 `signtool sign` 都会通过 SimplySign 手机
  App 让 Donghao 确认。发布**不再**完全无人值守 — 签名步骤是手工的，
  每次发布需要约 30 秒人工确认。

如果手工签名变成痛点（比如要每周热修发版），迁移路径是
**SSL.com eSigner OV**（约 $250/年，REST API 全自动）。详见
[IMPLEMENTATION.zh-CN.md §未来加固](IMPLEMENTATION.zh-CN.md#5-未来加固单独跟踪)。

## 子任务拆分

| # | 子任务 | 操作内容 | 改代码？ | 耗时 | 详情 |
|---|--------|----------|---------|------|------|
| 1 | Certum 下单 | 在 shop.certum.eu 付 €189 | 否 | 15 分钟 | [CERTIFICATE-OPTIONS.zh-CN.md §怎么申请](CERTIFICATE-OPTIONS.zh-CN.md#certum-simplysign怎么申请) |
| 2 | 提交身份验证材料 | 上传 ASIC、D-U-N-S、护照、地址证明 | 否 | 提交 30 分钟 + Certum 审核 3–7 天 | 同上 |
| 3 | 装 SimplySign 手机 App + 桌面签名工具 | 在 Donghao 的手机和签名机 | 否 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §0](IMPLEMENTATION.zh-CN.md#0-工具链准备) |
| 4 | 改 `electron-builder` Windows 配置 | 从 `qcut/package.json` 删 signing-disable 标志 | 是 | 20 分钟 | [IMPLEMENTATION.zh-CN.md §1](IMPLEMENTATION.zh-CN.md#1-修改-electron-builder-windows-配置) |
| 5 | 改 GitHub Actions 发布工作流 | CI 出未签名包，artifact 留给本地签 | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §2](IMPLEMENTATION.zh-CN.md#2-修改-github-actions-发布工作流) |
| 6 | 加本地签名辅助脚本 | 新增 `qcut/scripts/sign-windows-release.ts` | 是 | 1 小时 | [IMPLEMENTATION.zh-CN.md §3](IMPLEMENTATION.zh-CN.md#3-加本地签名辅助脚本) |
| 7 | 加签名后校验脚本 | 新增 `qcut/scripts/verify-windows-signature.ts` | 是 | 1 小时 | [IMPLEMENTATION.zh-CN.md §4](IMPLEMENTATION.zh-CN.md#4-加签名后的校验脚本) |
| 8 | Windows 下载页加警告文案 | 解释 SmartScreen 首次运行体验 | 是（网站） | 30 分钟 | [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) |
| 9 | 维护者文档 | 新增 `qcut/docs/setup/windows-code-signing.md` | 是（文档） | 45 分钟 | 同上 |
| 10 | 测试 | 校验脚本 + workflow 守门 | 是 | 1 小时 | [TESTING.zh-CN.md](TESTING.zh-CN.md) |
| 11 | 在干净 Windows VM 上做发布演练 | 人工验证 | 否 | 1 小时 | [IMPLEMENTATION.zh-CN.md §6](IMPLEMENTATION.zh-CN.md#6-在干净-windows-vm-上做发布演练) |

**工程总耗时：约 5 小时。墙上时间主要被 Certum 的 3–7 天身份审核占据。**

## 本方案会动到的文件

### 需要修改

- `qcut/package.json`
  - 第 84、86、88、89 行（`scripts` 块） — 删 `forceCodeSigning=false` 覆盖
  - 第 231–240 行（`build.win` 块） — 保持 `forceCodeSigning: false`，因为我们在 electron-builder **完成之后**手工本地签；把 `verifyUpdateCodeSignature` 改成 `true`
- `qcut/.github/workflows/release.yml` — 第 96 行附近：删 `--config.win.*=false` 覆盖；说明签名在 CI 之后手工进行
- `qcut/docs/release.md` — 加签名前置条件说明（不存在则新建）

### 需要新增

- `qcut/scripts/sign-windows-release.ts` — 调 `signtool sign` 用 Certum SimplySign 云 HSM 身份的 wrapper；前提是 SimplySign 桌面工具已安装并已认证。
- `qcut/scripts/verify-windows-signature.ts` — 跑 `signtool verify /pa /v`，签名缺失或发布者错时退出非零。
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — Vitest 单测。
- `qcut/scripts/__tests__/package-json-signing.test.ts` — `package.json` 形态守门。
- `qcut/scripts/__tests__/release-workflow-signing.test.ts` — 工作流 YAML 守门。
- `qcut/docs/setup/windows-code-signing.md` — 维护者签名设置指南。
- `qcut/docs/task/windows-code-signing/` — 本目录。

### 故意不动

- `qcut/build/icon.ico` — 图标保持原样。
- `qcut/scripts/release.ts` — 发布编排脚本不需要知道签名细节。
- `qcut/package.json` 的 `build.mac` 块 — macOS 签名是另一个任务。

## 风险与待定问题

1. **Certum 身份审核延迟。** 一般 3–7 个工作日。已有 D-U-N-S 会偏快一端。
2. **SimplySign 桌面工具的平台支持。** Certum 官方支持 Windows。Mac/Linux 签名要么 VM 跑 Windows 工具，要么找替代方案。Donghao 目前主用 macOS — 上线前确认 SimplySign 工作流在他这边能跑通。
3. **每次发布都要手机能用。** Donghao 要在 SimplySign App 上确认每次 `signtool` 操作。如果他离线（飞机、休假），就发不出签名包。缓解：证书签发后给 Certum 账号添加第二个团队成员。
4. **SmartScreen 信誉不会立即生效。** 即使签了，新版本前 ~几百次下载仍会触发 SmartScreen。这在 2026 年是不可避免的（详见 [CERTIFICATE-OPTIONS.zh-CN.md §SmartScreen 信誉的现实](CERTIFICATE-OPTIONS.zh-CN.md#smartscreen-信誉的现实2026)）。缓解：在下载页加说明，告诉用户首次运行警告是预期的。
5. **证书续期。** 460 天上限（2026 CA/B Forum 规则）。提前 60 天日历提醒。续期不保留任何东西 — 信誉本来就按文件 hash 算，且续期不影响已发布的旧版本（它们各自保留自己的信誉）。
6. **macOS / Linux 不受影响。** 本方案故意只覆盖 Windows。macOS 在 CI 里**也**目前没签（没有 `mac.identity`，`release.yml` 没 Apple secret），跟踪在 [`docs/task/macos-code-signing/`](../macos-code-signing/)。

## 验收标准

参考 GitHub issue #289 验收，转化成可测形式：

- [ ] `signtool verify /pa /v QCut*Setup*.exe` 在发布产物上退出 0。
- [ ] `Get-AuthenticodeSignature` 报告 `Status: Valid`，`SignerCertificate.Subject` 包含 "Quriosity Pty Ltd"。
- [ ] `qcut/package.json` 的 `build.win` 在 npm 脚本里不再有 `forceCodeSigning: false` 覆盖。
- [ ] 在干净 Windows VM 上双击安装包，UAC 弹**蓝色** "Verified publisher: Quriosity Pty Ltd"（不再是黄色"Unknown publisher"）。
- [ ] 维护者签名指南已发布在 `qcut/docs/setup/windows-code-signing.md`。
- [ ] QCut 网站 Windows 下载页有一段说明，告诉用户首次运行的 SmartScreen 警告是正常的、怎么继续。

## 本方案不覆盖的部分

- macOS 公证相关改动（独立任务）。
- Microsoft Store 提交（完全不同的证书路径；issue 提了将来可作为信誉补充）。
- 自动更新签名校验里 `electron-builder` 的 `verifyUpdateCodeSignature: true` 以外的额外校验。
- 迁移到完全自动化 CI 签名（SSL.com eSigner） — 在 Certum 手工流程跑通后单独跟踪。
