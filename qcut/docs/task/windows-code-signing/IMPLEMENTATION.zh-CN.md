# Windows 代码签名 — 实现细节

每个工程子任务的具体步骤。子任务按顺序排列，每个都是一个独立 PR。
所有路径如无特别说明，均相对于仓库根目录。

> **前置条件：** 子任务 1（购买证书，见
> [`CERTIFICATE-OPTIONS.zh-CN.md`](CERTIFICATE-OPTIONS.zh-CN.md)）已完成，
> 下面这些值已经存到 GitHub Actions secret 里：
> `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`、
> `AZURE_TRUSTED_SIGNING_ENDPOINT`、`AZURE_TRUSTED_SIGNING_ACCOUNT`、
> `AZURE_CERTIFICATE_PROFILE`、`WINDOWS_PUBLISHER_NAME`。

---

## 1. 修改 `electron-builder` Windows 配置

**文件：** `qcut/package.json`（第 231–240 行的 `build.win` 块）。

### 修改前

```json
"win": {
  "target": "nsis",
  "icon": "build/icon.ico",
  "forceCodeSigning": false,
  "verifyUpdateCodeSignature": false,
  "signAndEditExecutable": false,
  "requestedExecutionLevel": "asInvoker",
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "compression": "store"
}
```

### 修改后

```json
"win": {
  "target": "nsis",
  "icon": "build/icon.ico",
  "forceCodeSigning": true,
  "verifyUpdateCodeSignature": true,
  "signAndEditExecutable": true,
  "requestedExecutionLevel": "asInvoker",
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "compression": "store",
  "azureSignOptions": {
    "publisherName": "${env.WINDOWS_PUBLISHER_NAME}",
    "endpoint": "${env.AZURE_TRUSTED_SIGNING_ENDPOINT}",
    "certificateProfileName": "${env.AZURE_CERTIFICATE_PROFILE}",
    "codeSigningAccountName": "${env.AZURE_TRUSTED_SIGNING_ACCOUNT}"
  }
}
```

### 每个 flag 的意义

- `forceCodeSigning: true` — 签名配置错误时构建立即失败，避免悄悄发出
  未签名版本。这是 issue 验收标准里要求的。
- `verifyUpdateCodeSignature: true` — 自动更新会拒绝签名链不匹配同一
  发布者的更新包。可防御更新服务器被入侵的场景。
- `signAndEditExecutable: true` — 不仅给安装包外层签名，还会给安装包里
  的 `app.exe` 签名。否则**安装后**的程序在系统看来仍然未签名。
- 所有值都用 `${env.*}` 占位，让本地和 CI 用同一份 `package.json`，
  机密永远不会进 Git。

### 自检

- `bun check-types` — 配置只是 JSON，类型上没影响，但稳妥起见还是跑一遍。
- `cd qcut && npx electron-builder --help | grep -i azure` — 确认当前
  装的 `electron-builder` 版本支持 `azureSignOptions`。

---

## 2. 修改本地 `dist:win*` 脚本

**文件：** `qcut/package.json`（第 84、86、88、89 行）。

当前脚本里写死了 `--config.win.forceCodeSigning=false` 和
`--config.win.verifyUpdateCodeSignature=false`。子任务 1 落地后，这些
覆盖参数会**阻止**那些已经设置了 Azure secret 的开发机签名。

### 改动

| 脚本 | 旧 | 新 |
|------|----|----|
| `dist:win` | `electron-builder --win --publish never -c.win.forceCodeSigning=false` | `electron-builder --win --publish never` |
| `dist:win:unsigned` | （维持原样） | **保持不变** — 显式的本地未签名变体。可以加注释说明意图。 |
| `dist:win:release` | `electron-builder --win --publish never --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false && …` | `electron-builder --win --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp && bun run verify:windows-signature` |
| `dist:win:fast` | `… --config.win.forceCodeSigning=false --config.compression=store --config.nsis.differentialPackage=false` | **保持不变** — 故意未签名的快速本地构建。 |

### 设计意图

- `dist:win:unsigned` 和 `dist:win:fast` 故意保持未签名 — 没有 Azure
  访问权限的开发者也要能本地构建做冒烟测试。这两个脚本不会被发布
  流水线使用。
- `dist:win:release` 是正式发布脚本，新加的 `verify:windows-signature`
  作为双保险（子任务 5 里加进 `package.json` 的 `scripts` 块）：

```json
"verify:windows-signature": "bun scripts/verify-windows-signature.ts"
```

跟现有 `verify:packaged-ffmpeg`、`verify:packaged-aicp` 放一起。

### 自检

- 在 Windows 机上跑 `cd qcut && bun run dist:win:unsigned` — 应该仍能
  生成未签名的安装包供本地测试。
- 在导出了 Azure secret 的 Windows 机上跑 `cd qcut && bun run dist:win:release`
   — 应生成签名过的安装包，退出码 0。

---

## 3. 修改 GitHub Actions 发布工作流

**文件：** `qcut/.github/workflows/release.yml`（Windows 任务，第 56–108 行）。

### 改动

修改第 94–98 行 "Build Electron application" 步骤：

**改前：**

```yaml
- name: Build Electron application
  run: |
    npx electron-builder --win --publish never --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**改后：**

```yaml
- name: Build Electron application
  run: |
    npx electron-builder --win --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
    AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
    AZURE_TRUSTED_SIGNING_ENDPOINT: ${{ secrets.AZURE_TRUSTED_SIGNING_ENDPOINT }}
    AZURE_TRUSTED_SIGNING_ACCOUNT: ${{ secrets.AZURE_TRUSTED_SIGNING_ACCOUNT }}
    AZURE_CERTIFICATE_PROFILE: ${{ secrets.AZURE_CERTIFICATE_PROFILE }}
    WINDOWS_PUBLISHER_NAME: ${{ secrets.WINDOWS_PUBLISHER_NAME }}
```

在 "Build Electron application" 之**后**、"Upload artifacts" 之**前**
加一个新步骤：

```yaml
- name: Verify Windows signature
  shell: pwsh
  run: |
    cd qcut
    bun run verify:windows-signature
```

### 为什么要单独做一次校验

`forceCodeSigning: true` 已经会在签名失败时让构建失败，但单独的校验
步骤还有几个好处：

1. 对**最终上传**的产物路径再跑一次 `signtool verify /pa /v`，能抓到
   构建后被人改过的情况。
2. 在日志里输出明确的成功/失败信息，将来排查"为什么这次发布显示未知
   发布者"时（无论是人还是 `prtaskit`）能快速定位。
3. 整个步骤大概 2 秒钟，性价比极高。

### 自检

- `actionlint qcut/.github/workflows/release.yml`（或
  `npx @action-validator/cli`） — YAML 语法 + secret 引用检查。
- 推一个 `vX.Y.Z-rc.1` tag 触发 release，签名应该成功，校验步骤应输出
  "Successfully verified"。

---

## 4. 增加构建后签名校验

**新增文件：**

- `qcut/scripts/verify-windows-signature.ts` — 实现。
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — 见
  [`TESTING.zh-CN.md`](TESTING.zh-CN.md)。

### 行为规范

1. 在 `qcut/dist-electron/QCut*Setup*.exe` 里找发布产物（取最新修改时间）。
2. Windows 上跑 `signtool verify /pa /v <path>`。非 Windows 上如果有
   `osslsigncode` 就用它校验，否则只打 warning 然后退出 0（这个脚本
   只在 Windows runner 上是权威校验）。
3. 解析输出。要求：
   - 退出码为 0。
   - 如果设置了 `process.env.WINDOWS_PUBLISHER_NAME`，subject CN 必须匹配。
4. 失败时退出非零，并输出明确信息。
5. 不做静默 fallback。文件不存在就立即报错。

### 代码草稿（最终代码以新文件为准）

```ts
// qcut/scripts/verify-windows-signature.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const expectedPublisher = process.env.WINDOWS_PUBLISHER_NAME;

function findInstaller(): string {
  if (!existsSync(distDir)) {
    throw new Error(`找不到 dist-electron：${distDir}`);
  }
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*Setup.*\.exe$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`${distDir} 里找不到 QCut*Setup*.exe`);
  }
  return join(distDir, candidates[0].f);
}

function verify(installer: string): void {
  if (process.platform !== "win32") {
    console.warn("[verify-windows-signature] 非 Windows 主机，跳过");
    return;
  }
  const out = execFileSync("signtool", ["verify", "/pa", "/v", installer], {
    encoding: "utf8",
  });
  console.log(out);
  if (expectedPublisher && !out.includes(expectedPublisher)) {
    throw new Error(
      `发布者不一致；期望在 signtool 输出里看到 "${expectedPublisher}"`,
    );
  }
}

const installer = findInstaller();
console.log(`[verify-windows-signature] 校验 ${installer}`);
verify(installer);
console.log("[verify-windows-signature] OK");
```

### 为什么用 `.ts` 脚本（不直接写 `.ps1`）

- 与现有约定一致 — 见 `qcut/scripts/verify-packaged-ffmpeg.ts` 和
  `qcut/scripts/verify-packaged-aicp.ts`（已确认存在）。
- 单元测试更容易（Vitest 可以 mock `child_process`）。
- 跨平台安全 — 在 macOS/Linux 开发机上能做 no-op，不会让
  `dist:win:release` 链断掉。

### 自检

- 本地签名构建后跑 `cd qcut && bun run verify:windows-signature` →
  退出 0。
- `dist:win:unsigned` 构建后跑同样命令 → 退出非零。

---

## 5. 发布演练（人工验证）

在干净 Windows 虚拟机（无开发工具、新用户配置）上做冒烟测试：

1. 推一个 `v2026.5.0-rc.1` tag，触发 release 工作流。
2. 等 `build-windows` 成功，下载 `windows-build` artifact。
3. 在 VM 上双击 `.exe`。
4. **预期：** Windows 显示 `发布者：<WINDOWS_PUBLISHER_NAME>`
   （不是"未知发布者"）。SmartScreen 仍可能显示"Windows protected
   your PC"，要等信誉积累 — 见 [`PLAN.zh-CN.md`](PLAN.zh-CN.md) 风险章节。
5. 在 VM 里打开 PowerShell：
   ```powershell
   Get-AuthenticodeSignature .\QCut*Setup*.exe
   ```
   期望 `Status: Valid`，`SignerCertificate.Subject` 不为空。
6. `signtool verify /pa /v .\QCut*Setup*.exe` → 退出 0，输出
   "Successfully verified"。

任何一步失败都**不要**把 rc tag 提升为 release。回滚工作流改动，
排查问题。

---

## 6. 后续加固（单独跟踪）

不属于 v1，但值得另开 issue 跟踪：

- **Azure 认证用 OIDC 联邦身份** — 用 `azure/login@v2` + 工作负载身份
  联邦取代 GitHub Secret 里的 `AZURE_CLIENT_SECRET`。永远不用轮换密钥。
  详见 [`CERTIFICATE-OPTIONS.zh-CN.md`](CERTIFICATE-OPTIONS.zh-CN.md)
  最后一节。
- **EV 证书评估** — v1 上线 6 个月后，看看 SmartScreen 警告率，决定
  是否升级到 EV（见 [`CERTIFICATE-OPTIONS.zh-CN.md`](CERTIFICATE-OPTIONS.zh-CN.md)）。
- **Microsoft Store 渠道** — 单独的渠道、单独的证书、单独的审核流程。
  issue #289 提到这能加分，但不在本方案范围内。
- **可复现产物** — sign-in-place 和 sign-then-archive 对可复现性的影响
  不同；如果 QCut 将来要做 SLSA 风格的证明，再回过头处理。
