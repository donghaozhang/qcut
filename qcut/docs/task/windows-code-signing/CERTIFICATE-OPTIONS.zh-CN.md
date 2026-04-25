# 代码签名证书选型

这就是用户提到的"license"。Authenticode 签名必须用受信任 CA 颁发的证书，
自签证书没法满足 SmartScreen。

> **重要背景（2026-04-25 通过看代码确认）：**
> `qcut/LICENSE` 是 MIT 类许可证（"Permission is hereby granted, free of
> charge…"），`qcut/package.json:308` 把自己描述成 "Open-source AI video
> editor"。两者都满足 **SignPath Foundation** 免费签名计划的资格。本文档
> 第一版漏了这条 — 现修正。

## 一句话推荐

1. **先申请 [SignPath Foundation](https://signpath.io/foundation/) — 对开源项目免费，QCut 完全符合资格。** 审批一般 1–2 周。
2. **如果 SignPath 拒绝（开源项目极少被拒，但有可能） → 退到 Azure Trusted Signing — Public Trust 身份，约 USD 10/月。**

我们故意**不**推荐 v1 走 DigiCert / Sectigo OV/EV。原因见下文。

## 行业对比

| 厂商 / 产品 | 价格（USD/年） | 开源资格？ | SmartScreen 暖机 | CI 友好？ | 验证方式 | 备注 |
|------------|----------------|------------|-------------------|-----------|----------|------|
| **SignPath Foundation** | **$0** | ✅ 必须 | 普通 | ✅ 官方 GitHub Action | 人工开源认证 | **QCut 推荐方案。** Blender、OBS Studio、Inkscape、Krita、GIMP、KeePass、Notepad++、Audacity、ImHex 都用它。 |
| **Azure Trusted Signing**（Public Trust） | ~$120（$10/月） | 不适用 | 普通 | ✅ 通过 `azureSignOptions` 原生支持 | 组织或个人 | 推荐的 fallback。 |
| **DigiCert OV** | $400–600 | 否 | 慢（数周到数月） | ⚠️ USB 令牌或 KSP | 组织 | 传统方案，CI 不友好。 |
| **DigiCert EV** | $600–800 | 否 | **立即** | ⚠️ 仅硬件令牌 / 云 HSM | 严格 | 用户体验最好，CI 集成最难。 |
| **Sectigo OV** | $200–400 | 否 | 慢 | ⚠️ 令牌 / KSP | 组织 | 便宜的传统方案。 |
| **Sectigo EV** | $400–600 | 否 | 立即 | ⚠️ HSM | 严格 | 便宜的 EV。 |
| **SSL.com EV（eSigner）** | $300–500 | 否 | 立即 | ✅ 通过 REST API 用云 HSM | 严格 | EV 里 CI 集成最好的。 |
| **自签证书** | $0 | — | 永远不被信任 | ✅ | 无 | **解决不了问题。** |

## 为什么 QCut 选 SignPath Foundation

1. **QCut 完全符合资格。** MIT 许可证 + 公开 GitHub 仓库 + CI 驱动构建 =
   完美贴合 SignPath Foundation 的资格画像。证据已在仓库里：
   - `qcut/LICENSE` — MIT
   - `qcut/.github/workflows/release.yml` — CI 构建链
   - `qcut/package.json:308` — 自描述为 "Open-source AI video editor"
2. **$0 vs $120/年。** 项目长期能省下持续支出。
3. **行业验证过。** 几乎所有发布签名 Windows 构建的主要开源桌面应用都
   用 SignPath Foundation：Blender、OBS Studio、Inkscape、Krita、GIMP、
   KeePass、Notepad++、Audacity、ImHex 等。风险画像很清楚。
4. **GitHub Actions 一等集成。** 官方提供
   `signpath/github-action-submit-signing-request@v1`。
5. **唯一的卡点是资格** — 实现复杂度跟 Azure 方案差不多。

## 为什么 Azure Trusted Signing 是合适的 fallback

如果 SignPath 因为构建可复现性、治理或活跃度等原因拒绝 QCut，
Azure Trusted Signing 仍然是次优解：

1. **不用硬件令牌** — 云 HSM，能在 GitHub-hosted Windows runner 上跑。
2. **`electron-builder` 一等支持**，通过 `azureSignOptions`。
3. **商业方案里最便宜** — $10/月 比 DigiCert/Sectigo 便宜 $300+/年。
4. **微软直签** — 由微软根证书签发。

## 为什么 v1 跳过 DigiCert / Sectigo / EV

- **OV 证书** — 必须把 USB 令牌寄到构建机，或额外付费用 KSP 托管签名
  服务。对 CI 驱动的开源项目来说运维很麻烦。
- **EV 证书** — 立即有 SmartScreen 信誉，但贵 4–8 倍而且必须用 FIPS
  HSM。只有在已经签名后**仍然**有信誉问题时再考虑。

## SignPath Foundation：怎么申请

1. **确认资格：**
   - OSI 批准的许可证（MIT ✅，见 `qcut/LICENSE`）。
   - 公开源代码仓库（✅，GitHub 上）。
   - CI 驱动构建（✅，`qcut/.github/workflows/release.yml`）。
   - 活跃开发（✅，master 上有近期提交）。
2. **去 https://signpath.io/foundation/ 提交申请。**
3. **提供资料：**
   - 项目名：QCut
   - 仓库 URL：https://github.com/Quriosity-agent/qcut
   - 许可证位置：`qcut/LICENSE`（MIT）
   - 构建流水线位置：`qcut/.github/workflows/release.yml`
   - 维护者联系方式（例如 `support@qcut.app`，已在
     `qcut/package.json:290` 出现）
4. **等 1–2 周审核。** SignPath 可能追问构建可复现性、二进制信任链、
   发布频率等问题。
5. **批准后会拿到：**
   - Organization ID（UUID）。
   - Project slug（例如 `qcut`）。
   - Signing policy slug（例如 `release-signing`）。
   - Artifact configuration slug（例如 `qcut-installer`）。
   - API Token — 存进 GitHub 仓库 secret `SIGNPATH_API_TOKEN`。

SignPath 路径的实现细节见
[`IMPLEMENTATION.zh-CN.md` Path A](IMPLEMENTATION.zh-CN.md#path-a-signpath推荐)。

## Azure Trusted Signing：采购步骤（仅 fallback 时执行）

只有 SignPath 拒绝 QCut 后才执行这一节。

1. 用 Quriosity 的组织账号登录 [Azure 门户](https://portal.azure.com)。
2. 在支持 Trusted Signing 的区域（East US、West Central US 等）创建
   **Trusted Signing Account**。
3. 创建 **Certificate Profile**，类型选 **Public Trust → Public Trust
   Identity Validation**。
4. 向微软提交身份验证材料。**1–7 天。**
5. 记下 `electron-builder` 需要的几个值：
   - Endpoint（例如 `https://eus.codesigning.azure.net/`）
   - Code Signing Account Name
   - Certificate Profile Name
   - Publisher Name（subject CN，会在 `Get-AuthenticodeSignature` 里显示）
6. 创建一个**服务主体**，授予 `Trusted Signing Certificate Profile
   Signer` 角色。记下：
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`（或用 OIDC 联邦身份 — 长期更优）

## 长期优化：用 OIDC 联邦身份替代客户端密钥（Azure 路径）

如果最终走 Azure 路径，建议给服务主体配置**联邦凭据**，让 GitHub
Actions 通过 OIDC 认证，GitHub Secret 里完全不存
`AZURE_CLIENT_SECRET`。跟踪在
[`IMPLEMENTATION.zh-CN.md §6`](IMPLEMENTATION.zh-CN.md#6-后续加固单独跟踪)。

## 续期

- **SignPath Foundation**：证书自动轮换，只要项目保持开源 + 活跃就
  永久免费。
- **Azure Trusted Signing**：profile 自动轮换；Trusted Signing Account
  按月计费，是普通 Azure 资源 — 在订阅里设个账单告警。
