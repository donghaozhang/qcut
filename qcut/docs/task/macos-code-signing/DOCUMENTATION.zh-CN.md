# macOS 代码签名 — 文档任务

随代码一起提交的、面向维护者的文档。

## 新增文件：`qcut/docs/setup/macos-code-signing.md`

**读者：** 任何要搭建一台新的发布机、排查发布失败、或轮换 Apple
凭据的人。

**大纲：**

```markdown
# macOS 代码签名 — 设置指南

## Apple Developer Program
- 会员席位：**Organization**，USD 99/年。
- Apple ID：组织共享邮箱（例如 `apple-dev@qcut.app`），永远不要用
  个人邮箱。
- 2FA：在多个可信设备上启用。Apple **不会**帮你撤销 2FA。
- Team ID：存到 GitHub variable `APPLE_TEAM_ID`。
- 续费：自动续费。**给 Apple ID 设账单告警** — 续费失败的话约 30 天内
  所有签名都会失效。
- D-U-N-S Number：见 `docs/task/macos-code-signing/PROCUREMENT.zh-CN.md`。

## GitHub Actions secret / variable

| 名称 | 类型 | 来源 |
|------|------|------|
| MAC_CSC_LINK | secret | `quriosity-developer-id.p12` 的 base64（存在 1Password） |
| MAC_CSC_KEY_PASSWORD | secret | `.p12` 导出密码（1Password） |
| APPLE_ID | secret | 组织 Apple ID 邮箱 |
| APPLE_APP_SPECIFIC_PASSWORD | secret | appleid.apple.com → App-Specific Passwords |
| APPLE_TEAM_ID | variable | developer.apple.com → Membership Details 里的 10 位 Team ID |

> ⚠️ **工作流接线属于实现 PR，不属于这份规划文档。** 当前
> `.github/workflows/release.yml` 的 `build-macos` 任务（约 169–178 行）的
> "Build Electron application" 步骤只把 `GH_TOKEN` 和 `USE_HARD_LINKS` 塞进
> `env:`。签名/公证那个 PR 必须扩充该 `env:` 块，再把 `MAC_CSC_LINK`、
> `MAC_CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和
> `APPLE_TEAM_ID` 也透传过去 — 没有这一步，即使仓库里已经有这些 secret，
> electron-builder 仍会回退到产出未签名、未公证的 `.app`。

## 本地签名构建
本地钥匙串里有证书 + 环境变量都设好后：

\`\`\`bash
cd qcut && \
  APPLE_ID="apple-dev@qcut.app" \
  APPLE_APP_SPECIFIC_PASSWORD="..." \
  APPLE_TEAM_ID="ABCDE12345" \
  bun run dist:mac
\`\`\`

> Bash 中 `VAR=value` 前缀只作用于命令链里的**第一个**命令。如果写在 `cd qcut && bun run dist:mac` 之前，环境变量只会作用于 `cd`，等 `bun run` 启动时已经丢失 — 必须把赋值放在 `&&` 之后，才能传给 `bun run dist:mac`。

如果证书**不在**钥匙串里，再设 CSC_LINK + CSC_KEY_PASSWORD。

## 校验签名安装包
\`\`\`bash
codesign --verify --deep --strict --verbose=2 /Applications/QCut.app
spctl -a -t exec -vv /Applications/QCut.app
xcrun stapler validate ~/Downloads/QCut*.dmg
\`\`\`

预期：
- `codesign` 安静地退出 0。
- `spctl` 打印 `accepted` 且 `source=Notarized Developer ID`。
- `xcrun stapler validate` 打印 `The validate action worked!`。

## 故障排查

### 签名时报 "User interaction is not allowed"
构建在 CI runner 上想用登录钥匙串。确保 `CSC_LINK` 和
`CSC_KEY_PASSWORD` 已设，这样会创建一个临时钥匙串。

### "errSecInternalComponent"
钥匙串被锁，或密码错。检查 `CSC_KEY_PASSWORD` 与 PROCUREMENT 文档
§3.3 设的 `.p12` 导出密码一致。

### 公证状态 "Invalid"
Apple 公证拒绝了 bundle。拿详细日志：

\`\`\`bash
xcrun notarytool log <submission-id> \
  --apple-id <APPLE_ID> \
  --password <APPLE_APP_SPECIFIC_PASSWORD> \
  --team-id <APPLE_TEAM_ID>
\`\`\`

最常见的原因：嵌套二进制（FFmpeg、AICP）未签名或权限不匹配。重新
签名或修权限后重试。

### 公证成功但 stapling 失败
离线机器或 Apple 端瞬时抖动的已知问题。手工 staple：

\`\`\`bash
xcrun stapler staple /path/to/QCut.dmg
\`\`\`

### 已签名，但 Gatekeeper 还拦
看是不是真的*公证*过：
\`\`\`bash
spctl -a -t exec -vv /Applications/QCut.app
\`\`\`

如果输出是 `signed Developer ID`（没有 "Notarized"），说明签名成功
但公证悄悄失败了。回去看构建日志。

## 凭据轮换

### App-Specific Password
1. 登录 appleid.apple.com → App-Specific Passwords。
2. 撤销旧的。
3. 生成新的，名字 `QCut release notarization`（可加日期后缀）。
4. 更新 GitHub secret `APPLE_APP_SPECIFIC_PASSWORD`。
5. 推一个 `*-rc.N` tag，确认工作流成功。

### 证书 (.p12)
1. 在 developer.apple.com 生成新的 Developer ID Application 证书。
2. 导出 .p12（带私钥，见 PROCUREMENT.zh-CN.md §3.3）。
3. base64 编码后更新 `MAC_CSC_LINK` 和 `MAC_CSC_KEY_PASSWORD`。
4. 旧证书对已签名的旧版本仍然有效；除非泄漏，否则不撤销。

### Apple ID 持有者变更
1. 在 App Store Connect 邀请新持有者加入 team。
2. 转移所有权。
3. 更新 GitHub secret `APPLE_ID`。
4. 在新账号下生成新的 App-Specific Password。
5. 更新 `APPLE_APP_SPECIFIC_PASSWORD`。

## 续期
Apple Developer Program：USD 99/年，自动续费。**每 6 个月确认一次
Apple ID 上的账单卡有效**。续费失败的话约 30 天内所有签名都会失效。
```

## 修改：`qcut/docs/release.md`

在文件靠前位置加一节（或与 Windows 签名章节合并）：

```markdown
## macOS 发布前置条件
macOS 发布产物**必须**用 Quriosity 的 Developer ID Application 证书
签名**并且**经过 Apple 公证。任一步失败发布工作流都会失败 — **不要**
绕过。设置和凭据轮换见 `setup/macos-code-signing.md`。
```

## 修改：`qcut/CLAUDE.md`

在 "Architecture Guidelines → DON'T" 一节下追加一条：

```markdown
- 不要在发布工作流里禁用 macOS 代码签名或公证。详见
  `docs/setup/macos-code-signing.md`。本地未签名开发构建用
  `bun run dist:mac`（不设 Apple 环境变量）。
```

这样将来 Claude Code 会话能看到这条规则，避免悄悄退化。

## 可选低优先级：PR 模板

如果 `qcut/.github/PULL_REQUEST_TEMPLATE.md` 已经存在，加一个 checkbox：

```markdown
- [ ] 如果改动了 `release.yml` 的 build-macos 任务或 `package.json` 的
      `build.mac`，我没有禁用代码签名或公证。
```

如果 PR 模板还不存在，**不要**专门为这个新建一个。

## 不需要写的内容

- 任何 secret / variable 的真实值。
- "Gatekeeper 是怎么工作的" — Apple 文档已有。
- Mac App Store 提交 — 不同证书、不同审核，单独立任务。
- iOS 分发 — 不在范围内。
