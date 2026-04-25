# Windows 代码签名 — 文档任务

随代码一起提交的、面向维护者的文档；以及面向用户的下载页文案，
缓解首次运行 SmartScreen 摩擦。

## 新增文件：`qcut/docs/setup/windows-code-signing.md`

**读者：** 任何要搭建一台新的发布机、排查发布失败、或轮换 Certum
凭据的人。

**大纲：**

```markdown
# Windows 代码签名 — 设置指南

## 证书供应商
- 提供商：**Certum SimplySign**（https://shop.certum.eu/）
- 产品：Standard Code Signing in Cloud（**不**是 USB 版）
- 席位：Organization
- 证书 subject：`Quriosity Pty Ltd`
- 价格：约 USD 200/年（€189/年）。2026 CA/B Forum 规则下必须每年续期（最长 460 天有效期）。

## GitHub 仓库设置
我们**不**在 GitHub Actions 里存任何签名凭据。签名在维护者本地 Windows
机器上进行（CI 出未签名 artifact 之后）。架构原因见
`docs/task/windows-code-signing/IMPLEMENTATION.zh-CN.md`。

唯一的 Windows 相关仓库设置：

| 名称 | 类型 | 内容 |
|------|------|------|
| WINDOWS_PUBLISHER_NAME | variable | "Quriosity Pty Ltd" — `verify:win-signature` 用它断言证书 subject |

## 本地签名机配置
在专门的 Windows 签名机上（如果维护者主用 macOS 就在 Windows VM 里）：

1. **手机装 SimplySign App**（iOS/Android），与 Certum 账号配对。
2. **桌面装 SimplySign 签名工具**，从 https://www.certum.eu/en/cert_expert_simply_sign/ 下载。
3. **装 Windows SDK signtool**：`winget install --id Microsoft.WindowsSDK`。
4. **认证桌面工具**，用手机扫二维码。
5. **找证书 SHA1 thumbprint**：
   \`\`\`powershell
   certutil -store -user My
   \`\`\`
   找 "Developer ID Application: Quriosity Pty Ltd" — 抄 SHA1 thumbprint（40 位 hex）。
6. **设环境变量**：
   \`\`\`powershell
   [Environment]::SetEnvironmentVariable("QCUT_WIN_CERT_THUMBPRINT", "<thumbprint>", "User")
   \`\`\`

## 每次发布的签名流程

\`\`\`bash
# 1. 等 CI 跑完（build-windows 任务）
# 2. 下载 windows-build-unsigned artifact
# 3. 把 QCut*Setup*.exe 和 latest.yml 放到 qcut/dist-electron/
cd qcut
bun run sign:win
# 4. 在手机上批准签名（SimplySign App 推送，约 30 秒）
# 5. 校验
bun run verify:win-signature
# 6. 手工把签名后的 .exe 和 latest.yml 上传到 GitHub Release 页面
\`\`\`

## 校验签名安装包

\`\`\`powershell
# 任何 Windows 机器上：
signtool verify /pa /v .\QCut*Setup*.exe
Get-AuthenticodeSignature .\QCut*Setup*.exe
\`\`\`

预期：
- `signtool verify` 退出 0，输出 "Successfully verified"。
- `Get-AuthenticodeSignature` 报告 `Status: Valid`，`SignerCertificate.Subject` 包含 "CN=Quriosity Pty Ltd"。

## 故障排查

### `signtool: error 0x80092004 — Cannot find object or property`
证书 thumbprint 在用户证书库找不到。检查：
- SimplySign 桌面工具有没有运行 + 已认证（证书只在工具暴露 Cloud HSM 身份时才出现）。
- `QCUT_WIN_CERT_THUMBPRINT` 是否与 `certutil -store -user My` 里的 thumbprint 一致。

### 手机收不到推送通知
- SimplySign App 需要手机有网。
- 重新认证桌面工具 — SimplySign 会话有时空闲几小时后过期。

### `signtool sign` 成功但 `signtool verify` 失败
- 时间戳服务可能悄悄失败了。换一个 `/tr` URL 重签（备选：`http://timestamp.digicert.com`、`http://timestamp.sectigo.com`）。

### 签名后用户仍看到 SmartScreen 警告
这对**每个新版本**的前几百到几千次下载都是**预期的**。SmartScreen 信誉按文件 hash 算，需要时间积累。完整背景见 `docs/task/windows-code-signing/CERTIFICATE-OPTIONS.zh-CN.md` § "SmartScreen 信誉的现实"。

## 凭据轮换

### 证书续期（每年）
1. 到期前在 shop.certum.eu 付续费。
2. 重做身份验证（如果资料没变 Certum 可能简化）。
3. 同一 SimplySign 账号下签发新证书；新 thumbprint。
4. 更新签名机上的 `QCUT_WIN_CERT_THUMBPRINT`。
5. 旧签名版本仍然有效（时间戳反签名了）。

### 添加第二个团队成员
1. 在 Certum 组织下添加新用户。
2. 他用自己的凭据装 SimplySign App + 桌面工具。
3. 现在 Donghao 和新成员都可以批准签名 — 休假覆盖有用。

## 续期日历提醒
**到期前 60 天**设日历提醒。Certum 控制台显示到期日期。
```

## 修改：`qcut/docs/release.md`

加（或与 macOS 签名章节合并）：

```markdown
## Windows 发布前置条件
Windows 发布产物**必须**用 Quriosity 的 Certum 签发的 Authenticode
证书签名。**签名是手工步骤**，CI build 出未签名 artifact 之后在维护者
本地机器上完成 — 详见 `docs/setup/windows-code-signing.md`。

这是有意为之：Certum SimplySign 要求每次签名操作都通过手机批准，
GitHub Actions 不能自动化。这个权衡是经过考虑的（成本 vs. 自动化）；
见 `docs/task/windows-code-signing/CERTIFICATE-OPTIONS.zh-CN.md`。
```

## 修改：`qcut/CLAUDE.md`

在 "Architecture Guidelines → DON'T" 一节下追加一条：

```markdown
- 不要把未签名 Windows `.exe` 自动挂到 GitHub Release。Windows artifact
  必须先手工签名再发布 — 见 `docs/setup/windows-code-signing.md`。
  Windows 任务故意产出 `windows-build-unsigned` artifact，**不**直接发到 Release。
```

这样将来 Claude Code 会话能看到这条约束。

## Windows 下载页面向用户的文案

QCut 的 Windows 下载页面（不管是哪条路由，例如 `qcut.app/download`）
应该在 Windows 下载按钮附近放下面这段。这是**面向终端用户**的文案，
不是给维护者看的。

### 英文版

> 💡 **First time installing? You may see a Windows security warning.**
>
> When you run `QCut.AI.Video.Editor-Setup.exe`, Windows SmartScreen may
> show "Windows protected your PC" — this is normal for new software
> versions, even after we've signed our installer.
>
> 1. Click **More info** in the warning dialog.
> 2. Confirm the publisher shown is **Quriosity Pty Ltd** — that's us.
> 3. Click **Run anyway**.
>
> The Windows User Account Control prompt that follows should also show
> **"Verified publisher: Quriosity Pty Ltd"** — you can safely click Yes.

### 中文版

> 💡 **首次安装时可能出现 Windows 安全警告。**
>
> 运行 `QCut.AI.Video.Editor-Setup.exe` 时，Windows SmartScreen 可能弹
> "Windows protected your PC" — 这对新版本软件是正常现象，即使我们已签名。
>
> 1. 点弹窗里的 **More info（更多信息）**。
> 2. 确认发布者显示为 **Quriosity Pty Ltd** — 就是我们。
> 3. 点 **Run anyway（仍然运行）**。
>
> 接下来的 Windows 用户账户控制弹窗会显示 **"Verified publisher: Quriosity Pty Ltd"** — 可以放心点"是"。

### 这段文案为什么重要

没这段引导，那个 Unblock-File 截图里的用户（2026-04 抓到的，对话历史
里有）只能用另一个 AI agent 帮他写 PowerShell 才能装 QCut。每个碰到
这个问题没人引导的用户多半放弃。这段文案免费、立即生效，能显著降低
SmartScreen 警告窗口期（每次发版后约前几百次安装）的流失率。

## 不需要写的内容

- 证书的真实 SHA1 thumbprint — 敏感，只存在签名机的 `QCUT_WIN_CERT_THUMBPRINT` 和 Certum 控制台里。
- "SmartScreen 内部怎么工作"逐步说明 — 微软文档已有。
- Microsoft Store 提交 — 不同证书路径，单独立任务。
- iOS / 移动端分发 — 不在范围内。
