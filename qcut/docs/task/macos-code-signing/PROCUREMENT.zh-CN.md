# macOS 签名 — 采购步骤

这是用户在 Apple 官网手工完成的、与代码无关的工作。对应
[`PLAN.zh-CN.md`](PLAN.zh-CN.md) 子任务 1–4。

> **顺序很重要。** D-U-N-S 卡注册，注册卡证书生成，证书卡 CI 集成。
> **子任务 1 今天就开始。**

## 1. D-U-N-S Number

Apple 要求所有"组织席位"申请人都有 Dun & Bradstreet 的
**D-U-N-S Number** — 一个免费的 9 位数全球公司唯一编号，证明法人
实体真实存在。

### 步骤 1.1 — 先查（Quriosity 可能已经有了）

1. 打开 https://developer.apple.com/enroll/duns-lookup/。
2. 填：
   - 法人名称：**Quriosity Pty Ltd**（用 ASIC 公司注册时的精确名称）
   - 国家：**Australia**
   - 地址：注册营业地址
3. 提交。

**查到了：** 记下 9 位数字，跳到子任务 2。

**没查到：** Apple 的查询页会显示 "Request a D-U-N-S Number" 按钮，
继续步骤 1.2。

### 步骤 1.2 — 申请 D-U-N-S Number（仅查不到时执行）

1. 在同一页点 "Request a D-U-N-S Number" — 这会向 Dun & Bradstreet
   提交免费申请。
2. 提供：
   - 法人名称（必须与 ASIC 完全一致）
   - ABN
   - 注册营业地址
   - 注册电话（这点很关键，见下面"陷阱"）
   - 主要联系邮箱
   - 简短的业务描述
3. 等 **5–14 个工作日**让 D&B 验证并签发编号。D&B 可能发邮件让你
   澄清信息 — 收到要立刻回。

### 为什么 D-U-N-S 是关键路径

很多人到要注册 Apple 账号那一刻才发现"还要等 2 周 D-U-N-S"。
**先把这步提交了**，再读后面的内容。

### 陷阱

- D-U-N-S 上登记的电话会是 Apple 之后可能拨打的号码。**确保这个
  号码工作时间会有人接。**
- D-U-N-S 上的法人名称**必须和** ASIC 上的、Apple Developer 注册时填的
  **完全一致**。"Quriosity Pty Ltd" ≠ "Quriosity Pty. Ltd." — Apple
  会拒绝不一致。
- D&B 可能会主动联系你确认信息。24 小时内回复，避免重新排队。

## 2. Apple Developer Program 注册

D-U-N-S 拿到后：

### 步骤 2.1 — 决定 Apple ID

挑一个会员资格归属的 Apple ID。建议：

- **用组织共享邮箱**，不要用个人邮箱。例如 `apple-dev@qcut.app` 或
  `support@qcut.app`。任何人离开都不影响。
- **开启 2FA**，绑定多个可信电话/设备。Apple 绝对不会帮你撤销开发者
  账号的 2FA — 全部 2FA 因子丢失就是一场恢复噩梦。
- **把恢复码存到 1Password**。

### 步骤 2.2 — 提交注册

1. 用上一步的 Apple ID 登录 https://developer.apple.com/programs/enroll/。
2. 选 **Organization**。
3. 填：
   - 法人名称（必须和 D-U-N-S 记录一致）
   - D-U-N-S Number
   - 地址、电话、国家
   - 授权签字人信息 — 必须是法律上能代表公司签字的人（董事，或被
     委托授权的人）
4. 付 USD 99。Apple 按当地货币计费 — 澳洲一般是 AUD 149.99 左右。
5. 等 Apple 验证。
   - Apple 可能会按 D-U-N-S 上的电话给你公司打电话，确认授权签字人。
   - 一般 1–2 个工作日，最多可能 1 周。
   - 电话打不通会一直卡住。

### 步骤 2.3 — 确认

收到 Apple 邮件，标题类似 "Welcome to the Apple Developer Program"。
登录 https://developer.apple.com/account 确认 "Apple Developer
Program Membership" 已显示。

## 3. Developer ID Application 证书

这是用来签 `.app`、**在 Mac App Store 之外分发**的证书。QCut **只**
需要这一种 — 不需要 "Developer ID Installer"、"Mac App Distribution"
等其他类型。

### 步骤 3.1 — 在 Mac 上生成证书签名请求 (CSR)

1. 打开**钥匙串访问**（Applications → Utilities → Keychain Access）。
2. 菜单：**钥匙串访问 → 证书助理 → 从证书颁发机构请求证书…**。
3. 填：
   - 用户邮件地址：组织 Apple ID（例如 `apple-dev@qcut.app`）
   - 常用名称：`Quriosity Apple Developer ID`
   - CA 邮件：留空
   - **存储到磁盘：** 选中
   - **让我指定密钥对信息：** 选中（RSA，2048-bit）
4. 保存生成的 `.certSigningRequest` 文件（例如桌面）。

### 步骤 3.2 — 上传 CSR 下载证书

1. https://developer.apple.com/account → **Certificates, Identifiers
   & Profiles** → **Certificates** → **+**。
2. 选 **Developer ID Application**。
3. 上传 3.1 步生成的 `.certSigningRequest`。
4. 下载得到的 `.cer`。
5. **双击 `.cer`** — 它会导入钥匙串。证书会出现在**登录**钥匙串里，
   并带上对应的私钥（因为 CSR 是本地生成的）。

### 步骤 3.3 — 导出 `.p12`（给 CI 用）

GitHub-hosted Mac runner 没有你的钥匙串，需要 base64 编码的 `.p12`
里同时包含证书和私钥。

1. 打开钥匙串访问。
2. 找到新证书。它叫类似 `Developer ID Application: Quriosity Pty
   Ltd (TEAMID)`。展开三角形 — 应该看到两行：证书本身 + 作为子项的
   匹配私钥。
3. **选中两行**（cmd-click）。
4. 右键 → **导出 2 项**。
5. 格式：**个人信息交换 (.p12)**。
6. 文件名：`quriosity-developer-id.p12`。
7. 设一个强导出密码 — 这会成为 GitHub secret `MAC_CSC_KEY_PASSWORD`。

> ⚠️ 常见错误：**只**导出证书那一行，会得到一个**没有私钥**的 `.p12`，
> CI 用不了。**两行都要选**（证书 + 私钥子行）。

### 步骤 3.4 — 转 base64 给 CI

```bash
base64 -i quriosity-developer-id.p12 | pbcopy
```

剪贴板里就是 base64 编码。粘贴到 GitHub secret `MAC_CSC_LINK`。

### 步骤 3.5 — 备份

把原始 `.p12` 文件和导出密码存到 1Password（或团队的密码管理器），
条目命名 "QCut release credentials"。

丢了的话，可以撤销旧证书重新签发 — 麻烦但不是世界末日，几小时
追回进度。

## 4. App-Specific Password 和 Team ID

### 步骤 4.1 — App-Specific Password（给公证用）

Apple 的公证服务用 Apple ID + 一个独立的 "app-specific password" 做
认证（因为 2FA，你不能直接用 Apple ID 主密码）。

1. 用组织 Apple ID 登录 https://appleid.apple.com。
2. **Sign-In and Security** → **App-Specific Passwords** → **+**。
3. 名称：`QCut release notarization`。
4. 生成。**只显示一次** — 立刻复制。
5. 存到 GitHub secret `APPLE_APP_SPECIFIC_PASSWORD`。

### 步骤 4.2 — Team ID

10 位字符串，是你 Apple Developer team 的标识。

1. https://developer.apple.com/account → **Membership Details**。
2. 复制 10 位 "Team ID"（形如 `ABCDE12345`）。
3. 存到 GitHub variable（不是 secret）`APPLE_TEAM_ID` — 不敏感。

### 步骤 4.3 — Apple ID

注册时用的 Apple ID。

- 存到 GitHub secret `APPLE_ID`（是邮箱地址 — 严格说也可以用
  variable，但 secret 更安全，避免被扫描收集）。

## 5. CLI 快捷路径（可选，混合方式）

第 1–4 节给的是纯 GUI 路径。这一节是**混合路径**：能用命令行的步
骤就用命令行，剩下两个**无法绕过**的网页步骤单独标出。一次性首
次设置约 5 分钟。

### 什么可以走 CLI

| 步骤 | 命令 |
|------|------|
| 生成 CSR | `openssl req -new …`（替代钥匙串访问对话框） |
| 把 `.cer + .key` 合成 `.p12` | `openssl pkcs12 -export …` |
| 导入到登录钥匙串 | `security import …` |
| 验证签名身份 | `security find-identity -v -p codesigning` |
| base64 编码给 CI | `base64 -i … \| pbcopy` |

### 什么必须走网页

1. **把 CSR 提交给 Apple 拿回 `.cer`** — 没有公开 CLI。可选方案：
   - **网页**：developer.apple.com（3 分钟）— 推荐一次性使用。
   - **App Store Connect API**（`fastlane cert` 或直接调 API）— 但
     创建 API Key 本身仍是网页步骤，只有要长期自动化证书轮换时
     才值得。
2. **App-Specific Password** — 完全没有 API，必须在 account.apple.com
   网页生成。可考虑改用 App Store Connect API Key 做公证（见
   "后续加固"一节），可绕开 App-Specific Password。

### 混合路径完整脚本

#### ① CLI 生成 CSR

```bash
cd ~/Desktop
openssl genrsa -out quriosity-developer-id.key 2048
openssl req -new -key quriosity-developer-id.key \
  -out quriosity-developer-id.csr \
  -subj "/emailAddress=apple-dev@qcut.app/CN=Quriosity Apple Developer ID/C=AU"
```

#### ② 网页操作（约 4 分钟）

- developer.apple.com → **Certificates** → **+** → **Developer ID
  Application** → 上传 `.csr` → 下载 `.cer`（保存为
  `developerID_application.cer`）。
- account.apple.com → **Sign-In and Security** → **App-Specific
  Passwords** → 生成 `QCut release notarization`，立刻复制保存。

#### ③ CLI 合成 `.p12` 并导入

```bash
# 把 .cer + .key 打包成 .p12（提示输入导出密码 = MAC_CSC_KEY_PASSWORD）
openssl pkcs12 -export \
  -out quriosity-developer-id.p12 \
  -inkey quriosity-developer-id.key \
  -in developerID_application.cer \
  -name "Developer ID Application: Quriosity Pty Ltd (JQ3Q27U24X)"

# 导入到登录钥匙串（让本地 `bun run dist:mac` 找得到）
security import quriosity-developer-id.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "$P12_PASSWORD" \
  -T /usr/bin/codesign

# 验证签名身份已就绪
security find-identity -v -p codesigning | grep "Developer ID Application"

# base64 编码给 GitHub Actions secret MAC_CSC_LINK
base64 -i quriosity-developer-id.p12 | pbcopy
```

> ⚠️ 用 OpenSSL 生成 CSR 时，**私钥 `quriosity-developer-id.key` 务必
> 妥善保管**（1Password 或加密备份）。丢了 = 证书作废需重申请。
> 钥匙串访问的 GUI 路径默认把私钥保存在登录钥匙串里，不会散落
> 桌面 — 这是 GUI 路径相对 CLI 路径唯一的便利点。

### 选择建议

| 场景 | 推荐路径 |
|------|----------|
| 一次性首次设置 | **混合**（本节，约 5 分钟） |
| 不熟悉钥匙串访问 | 混合（CLI 命令比 GUI 流程更直接） |
| 完全不想碰命令行 | 纯 GUI（第 3 节） |
| 长期自动化（多年后证书轮换） | App Store Connect API + `fastlane cert`（见"后续加固"） |

## 总结：GitHub 仓库设置

四个子任务都做完后，**Settings → Secrets and variables → Actions**
里要有：

| 名称 | 类型 | 内容 |
|------|------|------|
| `MAC_CSC_LINK` | secret | `quriosity-developer-id.p12` 的 base64 |
| `MAC_CSC_KEY_PASSWORD` | secret | §3.3 设的 `.p12` 导出密码 |
| `APPLE_ID` | secret | 组织 Apple ID 邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | secret | §4.1 生成的密码 |
| `APPLE_TEAM_ID` | variable | §4.2 抄的 10 位 Team ID |

这一节做完后就可以开始 [`IMPLEMENTATION.zh-CN.md`](IMPLEMENTATION.zh-CN.md)
里的工程改动。

## 后续加固：App Store Connect API Key

长远来看，把 `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` 换成 **App
Store Connect API Key**（`.p8` 文件 + key ID + issuer ID）。优势：

- 公证不再依赖某个具体 Apple ID 账号。
- 团队成员变动也不影响。
- 可以独立撤销。

Apple 文档：https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api

单独立 issue 跟踪，不在 v1 范围里。
