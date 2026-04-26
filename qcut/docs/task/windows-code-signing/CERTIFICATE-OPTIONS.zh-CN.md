# 代码签名证书选型

## 一句话推荐

**[Certum SimplySign Standard Code Signing](https://shop.certum.eu/standard-code-signing-in-cloud.html) — Organization 席位，约 USD 200/年（€189/年）。**

QCut/Quriosity 资格情况：
- ✅ 澳洲可买
- ✅ 没有公司年限要求
- ✅ 云签名（不需要 USB token）
- ⚠️ 每次签名都需要在 SimplySign 手机 App 上点确认 — 半手工，**不能完全自动化 CI**。详见 [IMPLEMENTATION.zh-CN.md §架构决策](IMPLEMENTATION.zh-CN.md#架构决策签名在哪里发生)

如果完全自动化 CI 比 **~$220/年的差价**更重要：**备选：SSL.com eSigner OV — 约 USD 439–479/年（$239 证书 + $200–240/年 eSigner 订阅），REST API，全自动化。**

> **定价真相（2026-04-25 在 SSL.com 结账页核实）：** SSL.com 是**双重收费**产品，不是单一价格。证书本身 $239/年，但云签名要另外订阅 `eSigner`（Tier 1：$20/月 或 $200/年，20 次签名/月）。很多二手来源只报证书价格，漏掉 eSigner 订阅费 — 本文档早期草稿也犯了同样的错。

## 其它路径为什么被排除

### ❌ Azure Trusted Signing（Microsoft Artifact Signing）

两个**独立**的拦路石：

1. **国家资格**。微软 2026-01 官方 FAQ：*"For Public Trust certificates, Artifact Signing is currently available to organizations in the USA, Canada, the European Union, and the United Kingdom."* 澳洲不在名单。
2. **公司年限**。微软要求 *"at least three years of verifiable history"*。Quriosity 注册于 2024-06-10，要到 2027-06-10 才符合。

微软 Q&A 里明确说**没有 exception process**。来源：[Microsoft Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)。

### ❌ SignPath Foundation（开源免费）

要求项目持续保持 OSI 批准的开源许可证。QCut 之后可能闭源，SignPath
Foundation 资格不能延续到闭源项目。

### ❌ SSL.com EV / DigiCert EV

2024 年之前，EV 证书有"立即获得 SmartScreen 信誉"的特权 — EV 签名的
程序首次下载也不弹警告。**微软 2024 年取消了这个特权**，更新了
Trusted Root Program 要求。

到 2026 年，OV 和 EV 在 SmartScreen 层面**功能完全一样** — 都要靠
下载量积累信誉。EV 多花 2 倍价钱已经不划算。

来源：[Reputation with OV certificates and are EV certificates still the better option? — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/417016/reputation-with-ov-certificates-and-are-ev-certifi)。

### ❌ Sectigo / DigiCert OV 通过传统分销商（~$170–230/年）

纸面便宜，但多数还是要用 USB 硬件令牌。USB token 没法插到
GitHub-hosted Windows runner 上，自托管 + 寄送/管理 token 的运维成本
比省下来的证书钱多。

云签名版本（DigiCert KeyLocker、SSL.com eSigner）的 OV 起价 $400+，
比 Certum 贵明显。

## 行业对比（2026-04）

| 厂商 | 价格（USD/年） | CI 自动化 | 开源资格 | 澳洲可买 | 新公司可买 | 备注 |
|------|---------------|-----------|---------|---------|----------|------|
| **Certum SimplySign Standard** | **~$200** | ⚠️ 手机确认 | ✅ ✅ | ✅ | ✅ | **QCut 推荐**。Inkdrop 等大量 indie Electron 项目都用。 |
| **SSL.com eSigner OV** | **~$439–479**（$239 证书 + $200–240 eSigner 订阅） | ✅ REST API | ✅ ✅ | ✅ | ✅ | 全自动 CI，但**比 Certum 贵 ~2 倍**。双重收费（证书 + 强制 eSigner 订阅）在结账前不明显。 |
| SSL.com eSigner EV | ~$590–740（$350–500 证书 + $200–240 eSigner 订阅） | ✅ | ✅ ✅ | ✅ | ✅ | EV 自 2024 起不再值溢价。 |
| Sectigo OV（分销商） | $170–230 | ⚠️ USB token | ✅ ✅ | ✅ | ✅ | 不友好 GitHub-hosted CI。 |
| DigiCert OV/EV | $400–800 | ⚠️ USB / KSP | ✅ ✅ | ✅ | ✅ | 贵，没必要。 |
| Azure Artifact Signing | $120 | ✅ | 不适用 | ❌ | ❌ | **Quriosity 不能买。** |
| SignPath Foundation | $0 | ✅ | 仅开源 | ✅ | ✅ | **绑死开源。** |

## 签了实际改变什么（vs. 没改变什么）

诚实披露 — 不要被供应商话术骗，签名解决一些事，但不解决另一些。

### ✅ 立即生效（签完当天）

- **UAC 弹窗**：黄色"Unknown publisher" → 蓝色"Verified publisher: Quriosity Pty Ltd"
- **企业 IT 策略**禁未签名 .exe 的，QCut 现在能装
- **杀毒软件误报率**显著下降（卡巴斯基、360、火绒、Avast、Defender 启发式）
- **浏览器下载警告**减少
- **winget / Chocolatey / scoop** 包管理器愿意收 QCut
- **自动更新完整性**：`electron-updater` 能校验每个更新都来自同一发布者

### 📈 渐进生效（积累几百到几千次安装）

- **SmartScreen "Windows protected your PC"** 警告频率降低，最终消失
- 信誉按文件 hash 积累，**也**慢慢按发布者积累

### ❌ 不会改变

- **Mark of the Web (MOTW)**：Windows 仍会给下载文件打标记，**这是浏览器加的，跟签名无关**。用户可能仍会看到"Open File - Security Warning"对话框。
- **前几百次安装仍可能触发 SmartScreen** — 但有验证过的发布者名（"Quriosity Pty Ltd"）显示，转化率显著提升。
- **用户对陌生品牌的不信任**：签名只能证明"是 Quriosity"，不能证明"Quriosity 值得信任"。新公司还是会被看作新公司。

## SmartScreen 信誉的现实（2026）

**关键披露：** SmartScreen 信誉是按**文件 hash** 算的，不是按证书也不是按发布者。每次发新版（v2026.5.0 → v2026.6.0），新 `.exe` 哈希不一样，**信誉重头积累**，无视过去发了多少签名版本。

实际意味着：

- QCut v2026.6.0 第一个下载用户**仍会看到** SmartScreen 警告（即使我们签了名）。
- 信誉随用户安装且无负面反馈而增长。
- ~几百到几千次无问题安装后，警告停止。
- 频繁版本更新会重置信誉 — 发布节奏会影响这个。

### 缓解策略

- 不要为每个小改动发新版 — 批量打包成版本化发布。
- 鼓励用户保留下载缓存（同一 hash 重复运行能积累信誉）。
- 长期稳定的发布者，新 hash 也会被宽松扫描。
- 在 Windows 下载页加一段说明，告诉用户新版本警告是预期的。

## 价格趋势（2026 行业现状）

- **2026 年 3 月起：** CA/Browser Forum 把代码签名证书最长有效期从 39 个月缩短到 **460 天（约 15 个月）**。从那以后所有签发的证书都受这个限制。**续期变成年度，不再有多年期。**
- **EV 证书在 2024 年失去了独有的"SmartScreen 立即信誉"特权。** OV 和 EV 现在 SmartScreen 行为完全一致。
- **Azure Trusted Signing 在 2025 年收紧资格** — 先窄到美/加（要 3 年公司历史），后稍微扩到 EU/UK。澳洲等地至 2026-Q1 仍被排除。
- **云 HSM 签名**（不要 USB token）成为 indie 默认选择。Certum SimplySign、SSL.com eSigner、DigiCert KeyLocker 都支持。

## Certum SimplySign：怎么申请

1. **下单** https://shop.certum.eu/standard-code-signing-in-cloud.html
   - 类型：Standard Code Signing **in Cloud**（**不**是 USB 版）
   - 期限：1 年（2026 CA/B 规则下最长就 15 个月）
   - 验证：**Organization**（证书 subject = "Quriosity Pty Ltd"）
2. **提交身份材料** — Certum 会邮件列出清单。常见包括：
   - Quriosity ASIC 公司注册（你已有）
   - D-U-N-S Number 893394655（明显加快验证）
   - 授权代表身份证明（政府签发的带照片身份证件 + 近期住址证明，如水电气账单或银行对账单）
   - 公司注册地址证明（开具给 Quriosity Pty Ltd、寄送至其注册经营地址的租约或近期账单）
3. **身份验证。** Certum 审核 3–7 个工作日（已有 D-U-N-S 会更快）。
4. **激活 SimplySign 账号。** Certum 发激活链接 → 在 Donghao 手机装 SimplySign App → 在他的 Mac/Windows 机器装桌面签名工具。
5. **签发的证书**存在 Certum 云 HSM 里。每次 `signtool sign` 操作都会让 Donghao 手机弹窗确认。

针对这套凭据的工程实现见 [`IMPLEMENTATION.zh-CN.md`](IMPLEMENTATION.zh-CN.md)。

## 续期

- **每年**（CA/B 强制 15 个月上限）。
- 提前 60 天设日历提醒。
- 续期**不**保留 SmartScreen 信誉（信誉本来就是按文件 hash 算的；续期也不会改变已发出去的旧版本，那些保留它们自己的信誉）。

## 未来迁移路径

如果 Certum 的手机确认变成瓶颈：
- **SSL.com eSigner OV**（每年多 ~$220+，详见对比表的双重收费结构） — REST API 全自动化 CI 签名。**只在高频发版（每周 1 次以上）时值得**；低频下手动确认每年总成本只有几分钟，省不下 $220。
- **等到 Azure 资格满足** 2027-06（Quriosity 满 3 年）— 还要看微软是否扩大国家名单到澳洲。如果都满足，$120/年 + 全自动 CI，Azure 完胜。
- **以后再升 EV** — 如果 SmartScreen 信誉死活积累不上去（不太可能，因为 EV 现在也不立即了）。
