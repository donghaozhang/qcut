# Windows 代码签名 — 文档任务

为了满足 issue 中"文档需说明所需签名机密和发布配置"这一项验收标准，
下面这些文档要随代码改动一起提交。文档面向**维护者**（执行发布的人），
不是终端用户。

## 新增文件：`qcut/docs/setup/windows-code-signing.md`

**读者：** 任何要搭建一台新的发布机、排查发布失败、或轮换 Azure 密钥
的人。

**大纲：**

```markdown
# Windows 代码签名 — 设置指南

## 前置条件
- Quriosity 名下的 Azure 订阅。
- Trusted Signing Account + Certificate Profile（采购流程见
  docs/task/windows-code-signing/CERTIFICATE-OPTIONS.zh-CN.md；采购完成
  后那份文档作为历史记录留档，运营时以本文件为准）。
- 一个被授予 `Trusted Signing Certificate Profile Signer` 角色的服务主体。

## GitHub Actions secret
仓库下面这些 secret 必须存在：

| Secret | 来源 | 示例 |
|--------|------|------|
| AZURE_TENANT_ID | 服务主体所在的 Azure AD 租户 | 00000000-0000-0000-0000-000000000000 |
| AZURE_CLIENT_ID | 服务主体 App ID | 00000000-0000-0000-0000-000000000000 |
| AZURE_CLIENT_SECRET | 服务主体客户端密钥 | （每 6 个月轮换） |
| AZURE_TRUSTED_SIGNING_ENDPOINT | 区域端点 | https://eus.codesigning.azure.net/ |
| AZURE_TRUSTED_SIGNING_ACCOUNT | Trusted Signing Account 名称 | qcut-signing |
| AZURE_CERTIFICATE_PROFILE | Profile 名称 | qcut-public-trust |
| WINDOWS_PUBLISHER_NAME | 颁发证书的 Subject CN | Quriosity Pty Ltd |

## 本地签名构建
有 Azure 服务主体访问权限的维护者可以本地构建签名安装包：

\`\`\`powershell
$env:AZURE_TENANT_ID="..."
$env:AZURE_CLIENT_ID="..."
$env:AZURE_CLIENT_SECRET="..."
$env:AZURE_TRUSTED_SIGNING_ENDPOINT="..."
$env:AZURE_TRUSTED_SIGNING_ACCOUNT="..."
$env:AZURE_CERTIFICATE_PROFILE="..."
$env:WINDOWS_PUBLISHER_NAME="..."
cd qcut
bun run dist:win:release
\`\`\`

如果只想做本地未签名构建（不需要 Azure 权限）：

\`\`\`bash
bun run dist:win:unsigned
\`\`\`

## 校验签名安装包
\`\`\`powershell
signtool verify /pa /v .\dist-electron\QCut*Setup*.exe
Get-AuthenticodeSignature .\dist-electron\QCut*Setup*.exe
\`\`\`

## 故障排查
- "Sign error 0x80070002" → Azure 服务主体角色缺失，重新分配角色。
- verify-windows-signature.ts 报 "发布者不一致" → WINDOWS_PUBLISHER_NAME
  和实际证书 subject 不一致；更新 secret。
- 工作流签名步骤卡住超过 5 分钟 → Trusted Signing 端点可能故障，
  查 Azure 状态页；**不要**绕过签名。

## 轮换服务主体密钥
1. 在 Azure 门户生成新的客户端密钥（App registrations → <SP 名> →
   Certificates & secrets）。
2. 更新仓库 secret 中的 `AZURE_CLIENT_SECRET`。
3. 推一个 `*-rc.N` tag 触发发布，确认工作流成功。
4. 在 Azure 门户删掉旧的客户端密钥。

## 续期
Public Trust 证书 profile 自动轮换证书，没有人工续期任务。在 Azure
里给 Trusted Signing 资源设个账单告警就行。
```

## 修改：`qcut/docs/release.md`

如果文件还不存在就新建。在文件靠前位置加一节：

```markdown
## Windows 发布前置条件
Windows 发布构建**必须**做 Authenticode 签名。如果签名配置错了，
发布工作流会失败 — 这是设计如此，**不要**为了发布绕过签名。
设置和故障排查见 `docs/setup/windows-code-signing.md`。
```

## 修改：`qcut/CLAUDE.md`

在 "Architecture Guidelines → DON'T" 一节下追加一条：

```markdown
- 不要在发布工作流里禁用 Windows 代码签名（`forceCodeSigning=false`）。
  详见 `docs/setup/windows-code-signing.md`。本地未签名开发构建用
  `bun run dist:win:unsigned`。
```

这样将来 Claude Code 会话能看到这条规则，避免悄悄退化。

## 可选低优先级：PR 模板

如果 `qcut/.github/PULL_REQUEST_TEMPLATE.md` 已经存在，加一个 checkbox：

```markdown
- [ ] 如果改动了 `release.yml` 或 `package.json` 的 `build.win`，
      我没有禁用代码签名。
```

如果 PR 模板还不存在，**不要**专门为这个新建一个。

## 不需要写的内容

- **真实的 Azure secret 值。**永远不要把密钥提交进库，也不要写让人
  误以为是真值的"示例"。
- **面向终端用户的"本程序已签名"宣传。** SmartScreen 弹窗是微软的
  界面，我们控制不了。如果当作 feature 写进文档，万一微软改弹窗就
  变成了空头承诺。
- **单独的用户 FAQ 条目。** 这次改动对用户来说应该是无感的；只需要
  发布工程相关的文档更新。
