# Windows 安装包代码签名 — 总体方案

**对应 issue：** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**分支：** `gpt-image-2`
**创建日期：** 2026-04-25

## 目标

通过对 `electron-builder` 产出的 NSIS `.exe` 进行 Authenticode 签名，
消除 QCut Windows 安装包上"发布者：未知发布者"的警告。签名工作在
GitHub Actions 发布流水线里完成。

按 `CLAUDE.md` 的优先级顺序，长期目标是：

1. **可维护性** — 一次配置好，以后每次发布都能自动签，无需手工干预。
2. **可扩展性** — 密钥放在 GitHub Actions / 云 KMS 里，不绑定到某个开发者
   的电脑。换一个维护者也能正常发布。
3. **性能** — 签名不应明显增加发布 CI 时间（目标：Windows 任务额外
   不超过 60 秒）。
4. **短期收益** — *不是*目标。我们不会用自签证书或一次性 hack 来
   敷衍 v2026.5。

## 为什么这件事需要"买 license"

Authenticode 签名要求由 Windows 信任的 CA 颁发的**商用代码签名证书**。
自签证书无法消除 SmartScreen 警告。证书选型、价格和推荐方案见
[`CERTIFICATE-OPTIONS.zh-CN.md`](CERTIFICATE-OPTIONS.zh-CN.md)。

**推荐：** Azure Trusted Signing（Public Trust 身份），约 USD 10/月，
原因：

- 云原生，不需要带 USB HSM 硬件令牌。
- `electron-builder` 原生支持 `azureSignOptions`。
- 身份验证比 EV 证书宽松（组织或个人均可）。
- 这条路线在 issue #289 里就是作者推荐的。

## 子任务拆分

整个工作明显**超过 20 分钟**（如果算上微软审核证书的时间，可能要好几天）。
下面的子任务按顺序排列，每个都可以独立合并、独立 review。

| # | 子任务 | 操作内容 | 是否改代码 | 预估耗时 | 详细文件 |
|---|--------|----------|-----------|----------|----------|
| 1 | 购买证书 | 在 Azure 上申请 Trusted Signing 身份，等微软审核 | 否 | 1–7 天（看微软审核） | [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md) |
| 2 | 改 `electron-builder` Windows 配置 | 三个 flag 翻成 true，加 `azureSignOptions` | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §1](IMPLEMENTATION.zh-CN.md#1-修改-electron-builder-windows-配置) |
| 3 | 改本地 `dist:win*` 脚本 | 删掉 `forceCodeSigning=false` 覆盖，保留一个未签名的本地开发变体 | 是 | 20 分钟 | [IMPLEMENTATION.zh-CN.md §2](IMPLEMENTATION.zh-CN.md#2-修改本地-distwin-脚本) |
| 4 | 改发布工作流 | 删除 `--config.win.*=false` 覆盖，注入 Azure secret | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §3](IMPLEMENTATION.zh-CN.md#3-修改-github-actions-发布工作流) |
| 5 | 加构建后签名校验 | 新增脚本 + CI 步骤，签名失败立即让 release 失败 | 是 | 1 小时 | [IMPLEMENTATION.zh-CN.md §4](IMPLEMENTATION.zh-CN.md#4-增加构建后签名校验) |
| 6 | 文档 | 维护者签名设置指南 + 发布文档更新 | 是（文档） | 45 分钟 | [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) |
| 7 | 测试 | 校验脚本的单元测试 + 工作流 YAML 守门测试 | 是 | 1 小时 | [TESTING.zh-CN.md](TESTING.zh-CN.md) |
| 8 | 发布演练 | 在干净 Windows VM 上跑 `rc` tag，确认签名 `.exe` 的发布者 | 否 | 1 小时 | [IMPLEMENTATION.zh-CN.md §5](IMPLEMENTATION.zh-CN.md#5-发布演练人工验证) |

**工程总耗时（不含等待证书审核）：约 5 小时。**

## 本方案会动到的文件

下面是权威清单 — 如果范围有变化，请同步更新。

### 需要修改

- `qcut/package.json`
  - 第 84、86、88、89 行（`scripts` 块）
  - 第 231–240 行（`build.win` 块）
- `qcut/.github/workflows/release.yml`
  - 第 96 行 "Build Electron application" 步骤
  - 周边 env 块（约第 60–98 行）
- `qcut/docs/release.md` — 加一段签名前置条件说明（如果文件不存在，新建）。

### 需要新增

- `qcut/scripts/verify-windows-signature.ts` — Bun/Node 脚本，调用
  `signtool verify /pa /v`（或 PowerShell `Get-AuthenticodeSignature`），
  签名异常或发布者不匹配时退出非零。
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — Vitest
  单元测试，mock `child_process`。
- `qcut/scripts/__tests__/package-json-signing.test.ts` — `package.json`
  形态守门测试。
- `qcut/scripts/__tests__/release-workflow-signing.test.ts` — 工作流
  YAML 守门测试。
- `qcut/docs/setup/windows-code-signing.md` — 维护者签名设置指南
  （Azure 租户配置、GitHub secret、本地签名）。
- `qcut/docs/task/windows-code-signing/` — 本目录。

### 故意不动

- `qcut/build/icon.ico` — 图标保持原样。
- `qcut/scripts/release.ts` — 发布编排脚本不需要知道签名细节，
  `electron-builder` 会处理。

## 风险与待定问题

1. **Azure 审核时间** — 微软的身份验证最长可能要一周。子任务 1 必须
   *先于*工程改动启动，否则会卡发布。
2. **SmartScreen 信誉滞后** — 即使签了名，*前几个*签名版本仍可能显示
   "不常见的应用"警告，要等信誉积累。这条要写进面向用户的发布说明。
3. **证书续期** — 设置一个日历提醒，到期前 30 天准备续期。证书买好后
   补到 `IMPLEMENTATION.zh-CN.md §6`。
4. **macOS / Linux 不受影响** — 本方案故意只覆盖 Windows。macOS 已经
   有 Apple Developer ID 签名（在 `qcut/package.json` 的 `build.mac` 里
   能确认）。

## 验收标准

参考 issue 的验收标准，转化为可测的形式：

- [ ] `signtool verify /pa /v QCut*Setup*.exe` 在发布产物上退出码为 0。
- [ ] `Get-AuthenticodeSignature` 报告 `Status: Valid`，且
      `SignerCertificate.Subject` 是预期的发布者。
- [ ] `qcut/package.json` 中 `build.win.forceCodeSigning` 为 `true`。
- [ ] CI 发布任务在签名失败时立即失败（不发布到 release）。
- [ ] 在干净 Windows VM 上首次安装时，能看到经过验证的发布者名称。
- [ ] 维护者签名指南已发布在 `qcut/docs/setup/windows-code-signing.md`。

## 本方案不覆盖的部分

- macOS 公证（notarization）相关改动。
- Microsoft Store 提交（issue 提了将来可作为信誉补充，单独立 issue）。
- 自动更新签名校验里 `electron-builder` 的 `verifyUpdateCodeSignature: true`
  以外的额外校验。
