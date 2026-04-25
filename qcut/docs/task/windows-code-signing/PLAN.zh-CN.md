# Windows 安装包代码签名 — 总体方案

**对应 issue：** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**分支：** `gpt-image-2`
**创建日期：** 2026-04-25（同日修订，加入 SignPath Foundation 路线）

## 目标

通过对 `electron-builder` 产出的 NSIS `.exe` 进行 Authenticode 签名，
消除 QCut Windows 安装包上"发布者：未知发布者"的警告。签名工作在
GitHub Actions 发布流水线里完成。

按 `CLAUDE.md` 的优先级顺序，长期目标是：

1. **可维护性** — 一次配置好，以后每次发布都能自动签，无需手工干预。
2. **可扩展性** — 密钥/签名身份放在云服务里，不绑定到某个开发者
   的电脑。新维护者也能正常发布，不用拿 USB 令牌。
3. **性能** — 签名不应明显增加发布 CI 时间（目标：Windows 任务额外
   不超过 60 秒）。
4. **短期收益** — *不是*目标。我们不会用自签证书或一次性 hack 来
   敷衍 v2026.5。

## 这件事不一定要"买 license"

`qcut/LICENSE` 是 MIT 类许可证，`qcut/package.json:308` 把 QCut 描述成
"Open-source AI video editor" — 这两条满足了 **SignPath Foundation**
的资格。SignPath Foundation 是面向开源项目的免费 Authenticode 签名计划
（Blender、OBS Studio、Inkscape、Krita、GIMP、KeePass、Notepad++ 等都用
它）。

**计划：** 先申请 SignPath Foundation（免费，约 1–2 周审批）。只有
SignPath 拒绝了，才去买 Azure Trusted Signing（约 USD 10/月）。完整的
厂商对比和 v1 不选 DigiCert/Sectigo/EV 的理由见
[`CERTIFICATE-OPTIONS.zh-CN.md`](CERTIFICATE-OPTIONS.zh-CN.md)。

## 路径决策（取决于子任务 1 结果）

实现有两种风格。子任务 1 的结果决定走哪条。

| | **Path A — SignPath（首选）** | **Path B — Azure（fallback）** |
|-|-------------------------------|--------------------------------|
| 成本 | $0 | 约 $120/年 |
| 签名时机 | 构建后通过 SignPath GitHub Action 签 | 构建过程中 `electron-builder` 通过 `azureSignOptions` 内联签 |
| `electron-builder` win 配置 | `forceCodeSigning: false`、`signAndEditExecutable: false`（SignPath 在构建后才签，否则 builder 不知道怎么签） | `forceCodeSigning: true`、`signAndEditExecutable: true`，加上 `azureSignOptions` |
| 新增 CI 步骤 | "Submit signing request to SignPath"，用 `signpath/github-action-submit-signing-request@v1` | 无 — 签名在原有 build 步骤里发生 |
| 新增仓库 secret | `SIGNPATH_API_TOKEN`、`SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`、`SIGNPATH_SIGNING_POLICY_SLUG`、`SIGNPATH_ARTIFACT_SLUG` | `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`、`AZURE_TRUSTED_SIGNING_ENDPOINT`、`AZURE_TRUSTED_SIGNING_ACCOUNT`、`AZURE_CERTIFICATE_PROFILE`、`WINDOWS_PUBLISHER_NAME` |
| 校验脚本 (`verify-windows-signature.ts`) | **相同** — 用 `signtool /pa /v` 校验，匹配 `WINDOWS_PUBLISHER_NAME` 环境变量 | **相同** |

校验脚本和人工 VM 演练与具体路径无关。其它子任务在
[`IMPLEMENTATION.zh-CN.md`](IMPLEMENTATION.zh-CN.md) 里都有 "Path A / Path B"
分支说明。

## 子任务拆分

整个工作明显**超过 20 分钟**（如果算上厂商审核，可能要几天）。
下面的子任务按顺序排列，每个都可以独立合并、独立 review。

| # | 子任务 | 操作内容 | 是否改代码 | 预估耗时 | 详细文件 |
|---|--------|----------|-----------|----------|----------|
| 1a | **申请 SignPath Foundation** | 提交开源项目申请 | 否 | 1–2 周（审核） | [CERTIFICATE-OPTIONS.zh-CN.md §SignPath](CERTIFICATE-OPTIONS.zh-CN.md#signpath-foundation怎么申请) |
| 1b | Azure 采购 *（仅 1a 被拒时执行）* | 在 Azure 申请 Trusted Signing 身份 | 否 | 1–7 天 | [CERTIFICATE-OPTIONS.zh-CN.md §Azure](CERTIFICATE-OPTIONS.zh-CN.md#azure-trusted-signing采购步骤仅-fallback-时执行) |
| 2 | 改 `electron-builder` Windows 配置 | 路径相关，编辑 `qcut/package.json` 的 `build.win` | 是 | 30 分钟 | [IMPLEMENTATION.zh-CN.md §A1 / §B1](IMPLEMENTATION.zh-CN.md) |
| 3 | 改本地 `dist:win*` 脚本 | 删掉 `forceCodeSigning=false` 覆盖，保留一个未签名变体 | 是 | 20 分钟 | [IMPLEMENTATION.zh-CN.md §A2 / §B2](IMPLEMENTATION.zh-CN.md) |
| 4 | 改发布工作流 | Path A：加 SignPath 提交步骤。Path B：删除 `--config.win.*=false`，注入 Azure secret。 | 是 | 30–60 分钟 | [IMPLEMENTATION.zh-CN.md §A3 / §B3](IMPLEMENTATION.zh-CN.md) |
| 5 | 加构建后签名校验 | 新增脚本 + CI 步骤（与路径无关） | 是 | 1 小时 | [IMPLEMENTATION.zh-CN.md §4](IMPLEMENTATION.zh-CN.md#4-增加构建后签名校验共享) |
| 6 | 文档 | 维护者签名设置指南 + 发布文档更新 | 是（文档） | 45 分钟 | [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) |
| 7 | 测试 | 校验脚本单元测试 + 工作流 YAML 守门测试（路径相关） | 是 | 1 小时 | [TESTING.zh-CN.md](TESTING.zh-CN.md) |
| 8 | 发布演练 | 推 `rc` tag，在干净 Windows VM 上验证签名 `.exe` | 否 | 1 小时 | [IMPLEMENTATION.zh-CN.md §5](IMPLEMENTATION.zh-CN.md#5-发布演练人工验证共享) |

**工程总耗时（不含厂商审核）：两条路都是约 5 小时。**

## 本方案会动到的文件

下面是权威清单。**[A]** 仅 Path A，**[B]** 仅 Path B，**[共享]** 两条
路都涉及。

### 需要修改

- `qcut/package.json` — 第 84、86、88、89 行（`scripts` 块）和第
  231–240 行（`build.win` 块）。
  - **[A]** `build.win` 只把 `verifyUpdateCodeSignature` 改成 `true`；
    `forceCodeSigning` 保持 `false`，因为 SignPath 在构建后才签。
  - **[B]** 三个签名 flag 全部改成 `true`，并加 `azureSignOptions` 块。
- `qcut/.github/workflows/release.yml` — 第 96 行 "Build Electron
  application" 步骤和周边 env 块（约第 60–98 行）。
  - **[A]** 删掉 `forceCodeSigning=false` 覆盖；在 build 之后加新的
    "Submit signing request to SignPath" + "Download signed artifact"
    步骤。
  - **[B]** 删掉覆盖；给 build 步骤的 env 块加 Azure secret。
- `qcut/docs/release.md` — 加一段签名前置条件说明（如果文件不存在，
  新建）。

### 需要新增

- **[共享]** `qcut/scripts/verify-windows-signature.ts` — Bun/Node 包装
  脚本，调用 `signtool verify /pa /v`，签名异常或发布者不匹配时退出
  非零。
- **[共享]** `qcut/scripts/__tests__/verify-windows-signature.test.ts` —
  Vitest 单元测试。
- **[共享]** `qcut/scripts/__tests__/package-json-signing.test.ts` —
  `package.json` 形态守门（路径相关：能识别 Path A 或 Path B 配置）。
- **[共享]** `qcut/scripts/__tests__/release-workflow-signing.test.ts` —
  工作流 YAML 守门（路径相关）。
- **[共享]** `qcut/docs/setup/windows-code-signing.md` — 维护者签名
  设置指南。覆盖 Path A（SignPath）和 Path B（Azure）的凭据设置。
- `qcut/docs/task/windows-code-signing/` — 本目录。

### 故意不动

- `qcut/build/icon.ico` — 图标保持原样。
- `qcut/scripts/release.ts` — 发布编排脚本不需要知道签名细节。
- `qcut/package.json` 的 `build.mac` 块 — macOS 签名是另一个独立任务
  （目前 CI 里 macOS 也没真正签名；另开 issue 跟踪）。

## 风险与待定问题

1. **SignPath 审核时间** — 一般 1–2 周。子任务 1a 必须*先于*工程改动
   启动，否则会卡发布。
2. **SignPath 拒绝路径** — 如果被拒，子任务 1b（Azure）还要再 1–7 天
   等微软身份验证。发布节奏要据此规划。
3. **SmartScreen 信誉滞后** — 即使签了名，*前几个*签名版本仍可能显示
   "不常见的应用"警告，要等信誉积累。这条要写进面向用户的发布说明。
4. **macOS / Linux 不受影响** — 本方案故意只覆盖 Windows。macOS *目前*
   在 CI 里**也**没签名（`mac.identity` 和 Apple secret 都没配），是
   独立的另一个任务。
5. **证书续期**
   - Path A：SignPath 自动轮换，不需要日历提醒。
   - Path B：profile 自动轮换，但 Azure 订阅账单要设告警。

## 验收标准

参考 issue 的验收标准，转化为可测的形式：

- [ ] `signtool verify /pa /v QCut*Setup*.exe` 在发布产物上退出 0。
- [ ] `Get-AuthenticodeSignature` 报告 `Status: Valid`，
      `SignerCertificate.Subject` 是预期发布者（SignPath 颁发或
      Azure 颁发）。
- [ ] `qcut/package.json` 的 `build.win` 是当前路径下的正确签名配置
      （见上文路径决策表）。
- [ ] CI 发布任务在签名失败时立即失败（不发布到 release）。
- [ ] 在干净 Windows VM 上首次安装时，能看到经过验证的发布者名称。
- [ ] 维护者签名指南已发布在 `qcut/docs/setup/windows-code-signing.md`。

## 本方案不覆盖的部分

- macOS 公证（notarization）相关改动。
- Microsoft Store 提交（issue 提了将来可作为信誉补充，单独立 issue）。
- 自动更新签名校验里 `electron-builder` 的
  `verifyUpdateCodeSignature: true` 以外的额外校验。
