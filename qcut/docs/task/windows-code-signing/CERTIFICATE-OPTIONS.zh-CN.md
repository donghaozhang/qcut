# 代码签名证书选型

这就是用户提到的"license"。Authenticode 签名必须用商用证书，
自签证书没法满足 SmartScreen。

## 一句话推荐

**Azure Trusted Signing — Public Trust 身份**。约 USD 10/月。
最适合 CI 驱动的 Electron 发布流水线。issue #289 推荐的也是这条路。

## 对比表

| 厂商 / 产品 | 价格（USD/年） | SmartScreen 暖机 | CI 友好？ | 验证方式 | 备注 |
|------------|----------------|-------------------|-----------|----------|------|
| **Azure Trusted Signing**（Public Trust） | ~$120（$10/月） | 普通（信誉随时间累积） | ✅ 通过 `azureSignOptions` 原生支持 | 组织或个人 | **推荐**。云端密钥，无 HSM，微软签发。 |
| **Azure Trusted Signing**（Private Trust） | ~$120 | 不适用（仅内网） | ✅ | 组织 | 没用 — Private Trust 是给单租户内部业务系统用的。 |
| **DigiCert OV** | $400–600 | 慢（数周到数月） | ⚠️ USB 令牌或 KSP | 组织 | 传统方案。OV = 组织验证。 |
| **DigiCert EV** | $600–800 | **立即**有 SmartScreen 信誉 | ⚠️ 仅硬件令牌 / 云 HSM | 严格组织验证 | 用户体验最好，CI 集成最难。EV 私钥必须放在 FIPS HSM 里。 |
| **Sectigo OV** | $200–400 | 慢 | ⚠️ 令牌 / KSP | 组织 | 便宜的 OV 选项。 |
| **Sectigo EV** | $400–600 | 立即 | ⚠️ HSM | 严格 | 便宜的 EV 选项。 |
| **SSL.com EV（eSigner）** | $300–500 | 立即 | ✅ 通过 REST API 用云 HSM | 严格 | 如果非 EV 不可，这个折中方案不错。 |
| **GlobalSign OV/EV** | $250–700 | 慢 / 立即 | ⚠️ / ✅ | 组织 / 严格 | 与 DigiCert 差不多。 |
| **自签证书** | $0 | 永远不被信任 | ✅ | 无 | **解决不了问题**，列在这里只是为了显式排除。 |

## 为什么 QCut 选 Azure Trusted Signing

1. **不用 USB 硬件令牌** — 硬件令牌没法插进 GitHub-hosted 的 Windows
   runner。要用就得寄到自托管 runner（运维负担大），或者用云 HSM。
   Trusted Signing 默认就是云 HSM。
2. **`electron-builder` 一等支持** — `azureSignOptions` 有官方文档和
   完整测试。
3. **价格便宜** — 每月 10 美金远低于 DigiCert/Sectigo OV 的 400+/年，
   更比 EV 的成本低很多。
4. **微软直签** — 由微软根证书签发，SmartScreen 显示的发布者字符串
   不会有第三方 CA 链相关的奇怪问题。
5. **与 issue 一致** — issue #289 直接推荐了这条路线，跟 reporter 的
   思路保持一致。

## 什么时候考虑升级到 EV

EV 证书带来**立即生效**的 SmartScreen 信誉。下面情况下值得升级：

- Trusted Signing 的初始版本下载量超过 1000 后还是会触发"不常见的应用"
  警告；并且
- 这些警告确实导致安装转化下降（需要"下载 → 首次启动"的 telemetry
  数据来证实）。

如果将来要走 EV，**SSL.com eSigner** 是推荐供应商，因为它提供云签名
REST API，不用自托管 runner 插 USB 令牌就能替换 `azureSignOptions`。

## 采购步骤（Azure Trusted Signing）

下面是工程子任务开始之前需要做的人工操作。

1. 用 Quriosity 的组织账号登录
   [Azure 门户](https://portal.azure.com)。
2. 在支持 Trusted Signing 的区域（East US、West Central US 等）创建一个
   **Trusted Signing Account** 资源。
3. 创建一个 **Certificate Profile**，类型选 **Public Trust → Public Trust
   Identity Validation**（组织证书）或 **Public Trust Individual
   Validation**（个人证书）。
4. 向微软提交身份验证材料。**这一步要 1–7 天**，要早做。
5. 验证通过后，记下 `electron-builder` 需要的几个值：
   - **Endpoint** — 例如 `https://eus.codesigning.azure.net/`
   - **Code Signing Account Name** — 步骤 2 里 Trusted Signing 资源名。
   - **Certificate Profile Name** — 步骤 3 里创建的 profile 名。
   - **Publisher Name** — 准确的证书 subject CN，会在
     `Get-AuthenticodeSignature` 里显示。必须与 Azure 颁发的证书 subject
     完全一致。
6. 创建一个**服务主体 (service principal)**，给它授予 Trusted Signing
   资源上的 `Trusted Signing Certificate Profile Signer` 角色。记下：
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`（或者用 OIDC 联邦身份 — 长期更优，见下文）

## 长期优化：用 OIDC 联邦身份替代客户端密钥

要降低长期维护成本，建议给服务主体配置**联邦凭据 (federated credential)**，
让 GitHub Actions 通过 OIDC 认证，这样 GitHub Secret 里就完全不用存
`AZURE_CLIENT_SECRET`。这是基本流程跑通后的加固任务，跟踪在
[`IMPLEMENTATION.zh-CN.md §6`](IMPLEMENTATION.zh-CN.md#6-后续加固单独跟踪)。

## 续期

Trusted Signing 的 certificate profile 会自动轮换证书，没有年度续期任务。
**Trusted Signing Account 本身**按月计费，是普通 Azure 资源 — 在订阅里
设置一个账单告警就好。
