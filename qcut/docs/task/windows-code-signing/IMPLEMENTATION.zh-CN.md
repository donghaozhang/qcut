# Windows 代码签名 — 实现细节

每个工程子任务的具体步骤。子任务按顺序排列，每个都是一个独立 PR。
所有路径如无特别说明，均相对于仓库根目录。

> **看下面之前先选路径。** [`PLAN.zh-CN.md`](PLAN.zh-CN.md) 里子任务 1
> 的结果决定走 **Path A（SignPath，免费，开源）** 还是 **Path B
> （Azure Trusted Signing，付费，fallback）**。§A* 节适用于 Path A，
> §B* 节适用于 Path B，§4–§6 是共享的。**只实现一条路径。**

---

## Path A — SignPath（推荐）

**前置条件：** 子任务 1a 完成，下面这些已存进 GitHub Actions 的
secret / variables：

- `SIGNPATH_API_TOKEN`（secret）
- `SIGNPATH_ORGANIZATION_ID`（variable，UUID）
- `SIGNPATH_PROJECT_SLUG`（variable，例如 `qcut`）
- `SIGNPATH_SIGNING_POLICY_SLUG`（variable，例如 `release-signing`）
- `SIGNPATH_ARTIFACT_SLUG`（variable，例如 `qcut-installer`）
- `WINDOWS_PUBLISHER_NAME`（variable，期望的 subject CN — SignPath
  审批通过时会告诉你）

### A1. 修改 `electron-builder` Windows 配置

**文件：** `qcut/package.json`（第 231–240 行的 `build.win` 块）。

```json
"win": {
  "target": "nsis",
  "icon": "build/icon.ico",
  "forceCodeSigning": false,
  "verifyUpdateCodeSignature": true,
  "signAndEditExecutable": false,
  "requestedExecutionLevel": "asInvoker",
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "compression": "store"
}
```

**为什么 Path A 选这些值：**

- `forceCodeSigning: false` — SignPath 在 `electron-builder` **完成之后**
  才签名，所以 builder 不能在内联签名上卡住。
- `verifyUpdateCodeSignature: true` — 自动更新仍然要校验后续更新链到
  同一发布者。
- `signAndEditExecutable: false` — 同 `forceCodeSigning` 的原因。
  SignPath 的 signing policy 可以配置成同时签内层 `app.exe` 和外层
  安装包，那是服务端的事。

### A2. 修改本地 `dist:win*` 脚本

**文件：** `qcut/package.json`（第 84、86、88、89 行）。

`dist:win` 和 `dist:win:release` 里的 `forceCodeSigning=false` 覆盖
**还是要去掉**（与新配置重复）。`dist:win:unsigned` 和 `dist:win:fast`
保留显式 `forceCodeSigning=false`，方便本地开发故意做未签名构建。

| 脚本 | 新值 |
|------|-----|
| `dist:win` | `electron-builder --win --publish never` |
| `dist:win:unsigned` | 不变 |
| `dist:win:release` | `electron-builder --win --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp`（这里**不**跑 `verify:windows-signature` — 那个在 CI 里 SignPath 返回签名产物**之后**才跑，见 §A3） |
| `dist:win:fast` | 不变 |

`scripts` 块还要新加：

```json
"verify:windows-signature": "bun scripts/verify-windows-signature.ts"
```

（CI 在 §A3 第 3 步会调它。）

### A3. 修改 GitHub Actions 发布工作流

**文件：** `qcut/.github/workflows/release.yml`（Windows 任务，
第 56–108 行）。

**第 1 步 — 修改** "Build Electron application"（第 94–98 行），
去掉 `forceCodeSigning=false` 覆盖：

```yaml
- name: Build Electron application
  run: |
    npx electron-builder --win --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**第 2 步 — 新增** "Submit signing request to SignPath"，放在
build 之后、"Upload artifacts" 之前：

```yaml
- name: Upload unsigned artifact for signing
  id: upload-unsigned
  uses: actions/upload-artifact@v7
  with:
    name: windows-unsigned
    path: qcut/dist-electron/QCut*Setup*.exe
    if-no-files-found: error

- name: Submit signing request to SignPath
  id: signpath
  uses: signpath/github-action-submit-signing-request@v1
  with:
    api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
    organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
    project-slug: ${{ vars.SIGNPATH_PROJECT_SLUG }}
    signing-policy-slug: ${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}
    artifact-configuration-slug: ${{ vars.SIGNPATH_ARTIFACT_SLUG }}
    github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
    wait-for-completion: true
    output-artifact-directory: qcut/dist-electron-signed

- name: Replace unsigned artifact with signed
  shell: pwsh
  run: |
    Remove-Item qcut/dist-electron/QCut*Setup*.exe
    Move-Item qcut/dist-electron-signed/QCut*Setup*.exe qcut/dist-electron/
```

**第 3 步 — 新增**签名校验（与 §4 / §B3 同一步）：

```yaml
- name: Verify Windows signature
  shell: pwsh
  env:
    WINDOWS_PUBLISHER_NAME: ${{ vars.WINDOWS_PUBLISHER_NAME }}
  run: |
    cd qcut
    bun run verify:windows-signature
```

**第 4 步 — 调整** "Upload artifacts"（第 100 行）使其上传**已签名**的
文件（路径不变，因为我们把签名文件移回了 `dist-electron/`）。

> **`latest.yml` 注意事项：** `dist-electron/` 里的 `latest.yml` 是
> electron-builder 基于*未签名*文件的哈希生成的。SignPath 替换文件后，
> `latest.yml` 里的 SHA512 就错了，自动更新会拒绝产物。修复方法：
> 在替换步骤之后重新生成 `latest.yml`。SignPath 的文档有覆盖这个，
> 常见做法是写个小脚本重新计算 SHA512 并改写 `latest.yml`。如果到
> 实施时 SignPath 官方 action 还没内置，单独立一个子 PR 跟踪。

---

## Path B — Azure Trusted Signing（fallback）

**前置条件：** 子任务 1b 完成，下面这些是 GitHub Actions
secret / variables：

- `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`（secret）
- `AZURE_TRUSTED_SIGNING_ENDPOINT`、`AZURE_TRUSTED_SIGNING_ACCOUNT`、
  `AZURE_CERTIFICATE_PROFILE`、`WINDOWS_PUBLISHER_NAME`（variable）

### B1. 修改 `electron-builder` Windows 配置

**文件：** `qcut/package.json`（第 231–240 行）。

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

**每个 flag 的意义：**

- `forceCodeSigning: true` — 签名配置错误时构建立即失败，避免悄悄发出
  未签名版本。
- `verifyUpdateCodeSignature: true` — 自动更新拒绝签名链不匹配的更新。
- `signAndEditExecutable: true` — 顺带给内层 `app.exe` 签名。
- `${env.*}` 占位让密钥不进 `package.json`。

### B2. 修改本地 `dist:win*` 脚本

形式与 §A2 一致，但未签名脚本（`dist:win:unsigned`、`dist:win:fast`）
对没有 Azure 权限的开发者仍然有用。

| 脚本 | 新值 |
|------|-----|
| `dist:win` | `electron-builder --win --publish never` |
| `dist:win:unsigned` | 不变（`forceCodeSigning=false` 覆盖保留，给本地未签名构建用） |
| `dist:win:release` | `electron-builder --win --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp && bun run verify:windows-signature` |
| `dist:win:fast` | 不变 |

也要按 §A2 加 `verify:windows-signature` 脚本条目。

### B3. 修改 GitHub Actions 发布工作流

**文件：** `qcut/.github/workflows/release.yml`。

修改 "Build Electron application"（第 94–98 行）：

```yaml
- name: Build Electron application
  run: |
    npx electron-builder --win --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
    AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
    AZURE_TRUSTED_SIGNING_ENDPOINT: ${{ vars.AZURE_TRUSTED_SIGNING_ENDPOINT }}
    AZURE_TRUSTED_SIGNING_ACCOUNT: ${{ vars.AZURE_TRUSTED_SIGNING_ACCOUNT }}
    AZURE_CERTIFICATE_PROFILE: ${{ vars.AZURE_CERTIFICATE_PROFILE }}
    WINDOWS_PUBLISHER_NAME: ${{ vars.WINDOWS_PUBLISHER_NAME }}
```

加签名校验步骤（与 §A3 第 3 步相同），放在 build **之后**、
"Upload artifacts" **之前**。

`latest.yml` 在这条路径下是天然正确的，因为签名是内联完成。

---

## 4. 增加构建后签名校验（共享）

与路径无关。Path A 和 Path B 都用。

**新增文件：**

- `qcut/scripts/verify-windows-signature.ts` — 实现。
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — 见
  [`TESTING.zh-CN.md`](TESTING.zh-CN.md)。

### 行为规范

1. 在 `qcut/dist-electron/QCut*Setup*.exe` 里找发布产物（取最新修改时间）。
2. Windows 上跑 `signtool verify /pa /v <path>`。非 Windows 上打 warn
   然后跳过（这个脚本只在 Windows runner 上是权威校验）。
3. 解析输出。要求：
   - 退出码为 0。
   - 如果设置了 `process.env.WINDOWS_PUBLISHER_NAME`，subject CN 必须匹配。
4. 失败时退出非零，并输出明确信息。
5. 不做静默 fallback。文件不存在就立即报错。

### 代码草稿

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
- 跨平台安全 — 在 macOS/Linux 开发机上能 no-op，不会让
  `dist:win:release` 链断掉。

---

## 5. 发布演练（人工验证，共享）

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

- **（仅 Path B）Azure 认证用 OIDC 联邦身份** — 用 `azure/login@v2` +
  工作负载身份联邦取代 GitHub Secret 里的 `AZURE_CLIENT_SECRET`。
  永远不用轮换密钥。
- **（仅 Path A）`latest.yml` 完整性** — SignPath 替换签名安装包后，
  必须在上传前重算 `latest.yml` 的 SHA512，否则自动更新会拒收。
- **EV 证书评估** — v1 上线 6 个月后，看看 SmartScreen 警告率，决定
  是否升级到 EV。
- **Microsoft Store 渠道** — 单独的渠道、单独的证书、单独的审核流程。
  issue #289 提到这能加分，但不在本方案范围内。
- **macOS 签名** — 目前 CI 里**也**没配（没有 `mac.identity`，
  `release.yml` 没 Apple secret）。单独立 issue 跟踪，不要跟 Windows
  这次的工作捆绑。
