# Windows 代码签名 — 实现细节（Certum SimplySign）

工程子任务。每个都能独立合并。路径：Certum SimplySign Standard
Code Signing（Cloud）。其他路径为什么排除见
[CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md)。

> **前置条件：** [PROCUREMENT 子任务 1–2](PLAN.zh-CN.md#子任务拆分)
> 已完成 — Certum 订单已付款、身份验证通过、证书已签发并绑定到
> SimplySign Cloud HSM 身份。

---

## 架构决策：签名在哪里发生

Certum SimplySign 要求**每次** `signtool` 调用都通过手机确认 — 推送
到 Donghao 的手机，他点 "Approve"，签名才进行。这是 Cloud HSM 的
安全模型，**无法关闭**。

意味着：GitHub Actions 不能完全自动化签名步骤。三种架构干净的选项：

| 方案 | 签名在哪里发生 | 权衡 |
|------|--------------|------|
| **A（采用）：CI 出未签名包，本地签后再发布** | CI 出未签名 `.exe` artifact；维护者下载、本地 Windows 机签、把签好的 artifact 上传到 GitHub Release | 每次发布人工 ~5 分钟。Inkdrop 也是这个工作流。 |
| B：自托管 Windows runner 装 SimplySign | runner 触发签名；Donghao 仍然要在手机上点确认 | 增加 runner 托管成本和 SimplySign 常驻运维。手机确认还是要 — 没省什么。 |
| C：换成 SSL.com eSigner OV | CI 用 REST API token 签 | 每年多 ~$50，全自动。如果 A 变痛点的迁移路径。 |

**采用方案 A。** 这是 indie Electron 圈的行业惯例，而且最便宜。
迁移到 C 作为未来加固保留。

---

## 0. 工具链准备

**Donghao 的电脑上一次性配置**（如果他主用 macOS，需要在 Windows VM 里配 — 见 [PLAN.zh-CN.md 风险 #2](PLAN.zh-CN.md#风险与待定问题)）。

1. **装 SimplySign 手机 App** — iOS/Android。用身份验证通过后 Certum 邮件里的激活码配对。
2. **装 SimplySign 桌面签名工具** — `proCertumCardManager` 或新版 SimplySign desktop。下载地址：https://www.certum.eu/en/cert_expert_simply_sign/。
3. **装 Windows SDK signtool** — 需要 `signtool.exe`。两种方式：
   - 单独装：`winget install --id Microsoft.WindowsSDK`，然后用 `C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\signtool.exe`，或
   - 装 Visual Studio Build Tools。
4. **认证 SimplySign 桌面工具** — 打开它，输 Certum 登录信息，用手机扫 SimplySign 二维码。工具会通过 PKCS#11 把 Cloud HSM 身份暴露给 Windows CryptoAPI / signtool。
5. **验证** — PowerShell 跑：
   ```powershell
   certutil -store -user My
   ```
   应该能看到 Quriosity Pty Ltd 的 Developer ID Application 证书，私钥引用指向 SimplySign 的 CSP。

任何一步失败，后面的实现都做不了。

---

## 1. 修改 `electron-builder` Windows 配置

**文件：** `qcut/package.json`（`build.win` 块，第 231–240 行）。

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
  "forceCodeSigning": false,
  "verifyUpdateCodeSignature": true,
  "signAndEditExecutable": false,
  "requestedExecutionLevel": "asInvoker",
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "compression": "store"
}
```

### 为什么这些值

- **`forceCodeSigning: false`** — 仍然 `false`，因为签名发生在 electron-builder **完成之后**（我们的本地签名步骤里）。如果设成 `true`，electron-builder 会在 build 期间想签，但 runner 钥匙串里没证书，构建会失败。
- **`verifyUpdateCodeSignature: true`** — 从 `false` 翻成 `true`。自动更新会拒绝签名链不匹配同一发布者的更新。防御更新服务器被入侵的场景。
- **`signAndEditExecutable: false`** — 仍然 `false`，因为我们在本地签名步骤里签**外层**安装包 `.exe`。安装包内的 `app.exe` 也在那一步签。
- **没有 `azureSignOptions`** — Azure 路径已排除（见 [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md#-azure-trusted-signingmicrosoft-artifact-signing)）。

### 改本地 `dist:win*` npm 脚本

**文件：** `qcut/package.json`（第 84、86、88、89 行）。

去掉 `forceCodeSigning=false` 覆盖 — 跟新的 `build.win.forceCodeSigning: false` 重复，将来维护者会困惑两边为什么都设。

| 脚本 | 旧 | 新 |
|------|----|----|
| `dist:win` | `… -c.win.forceCodeSigning=false` | `… --publish never`（去掉覆盖） |
| `dist:win:unsigned` | 不变 | 不变 — 显式表示"不打算签的构建" |
| `dist:win:release` | `… --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false …` | `… --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp` |
| `dist:win:fast` | 不变 | 不变 — 本地快速迭代变体 |

加到 `scripts`：

```json
"sign:win": "bun scripts/sign-windows-release.ts",
"verify:win-signature": "bun scripts/verify-windows-signature.ts"
```

---

## 2. 修改 GitHub Actions 发布工作流

**文件：** `qcut/.github/workflows/release.yml`（Windows 任务，第 56–108 行）。

Windows CI build 出**未签名**的 `.exe` 并上传作为 artifact。维护者下载、本地签、把签好的 `.exe` 手工上传回 Release。

### 2.1 — 改 "Build Electron application" 步骤

```yaml
- name: Build Electron application（unsigned — sign locally per release）
  run: |
    npx electron-builder --win --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

（删了 `--config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false` 覆盖 — `package.json` 已经给了正确的默认值。）

### 2.2 — 调整 artifact 上传

Windows 任务继续上传未签名 `.exe`。release publish 步骤**不**自动把 Windows artifact 挂到 GitHub Release 上，要等签好。

```yaml
- name: Upload unsigned Windows artifact
  uses: actions/upload-artifact@v7
  with:
    name: windows-build-unsigned
    path: |
      qcut/dist-electron/QCut*Setup*.exe
      qcut/dist-electron/latest.yml
    if-no-files-found: error
```

（artifact 重命名为 `windows-build-unsigned`，让 Actions UI 上能看出状态。）

### 2.3 — 改 release-publish 步骤

聚合的 `release` job（约第 277 行附近）当前下载 `windows-build` 并把 `.exe` 挂到 Release。改成：

- 不再自动挂未签名的 Windows 文件。两种做法：
  - **(2.3a)** 在 release-publish 步骤里**完全跳过** Windows 文件 — 维护者本地跑 `bun run sign:win` 后手工上传签名 `.exe` 到 Release。简单。
  - **(2.3b)** 加一个 "等待签名 Windows artifact" 的步骤，轮询维护者上传的签名 artifact，然后再发布。自动化更好但复杂度高。

v1 选 **2.3a**。把手工步骤写清楚：

> 📋 **发布操作员手册：**
> 1. 等 `build-windows` 任务成功。
> 2. 下载 `windows-build-unsigned` artifact。
> 3. 跑 `bun run sign:win`（前提是 SimplySign 桌面工具已认证）。
> 4. 在手机上批准签名（约 30 秒）。
> 5. 把签好的 `.exe` 和更新过的 `latest.yml` 手工上传到 GitHub Release。

### 2.4 — `latest.yml` 完整性

`latest.yml` 里有 `.exe` 的 SHA512。签名改了字节，所以 `latest.yml` 里的 SHA512 就错了。本地签名脚本（下一节）会重新计算并写回 `latest.yml`。

---

## 3. 加本地签名辅助脚本

**新增文件：** `qcut/scripts/sign-windows-release.ts`。

### 行为规范

1. 在 `qcut/dist-electron/` 找最新的未签名 `QCut*Setup*.exe`。
2. 跑 `signtool sign /tr http://timestamp.acs.microsoft.com /td sha256 /fd sha256 /sha1 <thumbprint> /sm <exe>`。
   - `sha1 <thumbprint>` — 从 SimplySign 暴露的身份库选 Quriosity 证书。
   - `tr` — RFC 3161 时间戳服务。微软的对 SmartScreen 信誉对齐最好。
   - `td sha256` 和 `fd sha256` — 现代 SHA-256 算法（CA/B Forum 2024 后强制要求）。
3. SimplySign 手机 App 弹窗确认。Donghao 点批准。
4. 签完跑 `signtool verify /pa /v <exe>` 确认。
5. 更新 `latest.yml`：
   - 重新计算签名后 `.exe` 的 SHA512。
   - 重新计算文件大小。
   - 写回 `latest.yml`。
6. 输出汇总。

### 代码草稿

```ts
// qcut/scripts/sign-windows-release.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const certThumbprint = process.env.QCUT_WIN_CERT_THUMBPRINT;
if (!certThumbprint) {
  throw new Error("设置 QCUT_WIN_CERT_THUMBPRINT 为 Quriosity 证书的 SHA1");
}

function findUnsignedInstaller(): string {
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*Setup.*\.exe$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`${distDir} 里找不到 QCut*Setup*.exe`);
  }
  return join(distDir, candidates[0].f);
}

const exe = findUnsignedInstaller();
console.log(`[sign-windows-release] 签名 ${exe}`);
console.log("[sign-windows-release] 在手机的 SimplySign App 上批准...");

execFileSync("signtool", [
  "sign",
  "/tr", "http://timestamp.acs.microsoft.com",
  "/td", "sha256",
  "/fd", "sha256",
  "/sha1", certThumbprint,
  "/sm",
  exe,
], { stdio: "inherit" });

execFileSync("signtool", ["verify", "/pa", "/v", exe], { stdio: "inherit" });

// 更新 latest.yml
const latestYmlPath = join(distDir, "latest.yml");
if (existsSync(latestYmlPath)) {
  const buffer = readFileSync(exe);
  const sha512 = createHash("sha512").update(buffer).digest("base64");
  const size = buffer.length;
  let yml = readFileSync(latestYmlPath, "utf8");
  yml = yml.replace(/sha512: .+/g, `sha512: ${sha512}`);
  yml = yml.replace(/size: \d+/g, `size: ${size}`);
  writeFileSync(latestYmlPath, yml);
  console.log("[sign-windows-release] 更新了 latest.yml 的 SHA512 + size");
}

console.log("[sign-windows-release] 完成");
```

### 为什么用 `.ts` 脚本（不直接写 `.ps1`）

- 与现有约定一致 — 见 `qcut/scripts/verify-packaged-ffmpeg.ts` 和 `verify-packaged-aicp.ts`（已确认存在）。
- Vitest 单测好写。
- 跨平台路径处理。

---

## 4. 加签名后的校验脚本

**新增文件：** `qcut/scripts/verify-windows-signature.ts`。

行为跟之前几版方案里那个校验脚本一样 — 跑 `signtool verify /pa /v`，断言发布者 subject 匹配期望的 `WINDOWS_PUBLISHER_NAME` 环境变量（设为 `"Quriosity Pty Ltd"`）。

### 代码草稿

```ts
// qcut/scripts/verify-windows-signature.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const expectedPublisher = process.env.WINDOWS_PUBLISHER_NAME ?? "Quriosity Pty Ltd";

function findInstaller(): string {
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*Setup.*\.exe$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`${distDir} 里找不到 QCut*Setup*.exe`);
  }
  return join(distDir, candidates[0].f);
}

if (process.platform !== "win32") {
  console.warn("[verify-windows-signature] 非 Windows 主机，跳过");
  process.exit(0);
}

const installer = findInstaller();
const out = execFileSync("signtool", ["verify", "/pa", "/v", installer], { encoding: "utf8" });
console.log(out);

if (!out.includes(expectedPublisher)) {
  throw new Error(`签名发布者不匹配；期望在 signtool 输出里看到 "${expectedPublisher}"`);
}

console.log("[verify-windows-signature] OK");
```

这个脚本在两个地方跑：
- `bun run sign:win` 之后（上传 Release 前的 sanity check）。
- 在 GitHub Release 页面下载已发布 `.exe` 后人工跑（冒烟测试）。

---

## 5. 未来加固（单独跟踪）

- **迁移到 SSL.com eSigner OV** — 如果手工签名变成瓶颈。完全自动化 CI；每年多 ~$50。
- **给 Certum 账号加第二个团队成员**，避免 Donghao 离线时签不了。
- **加快信誉积累**：发布频率别太高（不要每周发版），让下载尽量走稳定 URL，加速 hash 信誉积累。
- **2027-06 重新评估 Azure Artifact Signing** — Quriosity 满 3 年时，看微软是否扩大了国家资格到澳洲。如果两个条件都满足，$120/年 + 全自动 CI 让 Azure 重新有吸引力。

---

## 6. 在干净 Windows VM 上做发布演练

所有 PR 落地后，做一次端到端人工测试：

1. CI：推 `v2026.5.0-rc.1` tag，等 `build-windows` 出 `windows-build-unsigned` artifact。
2. 把 artifact 下载到本地配好 SimplySign 的 Windows 机。
3. 跑 `bun run sign:win`。在手机批准。确认脚本输出 "完成"。
4. 跑 `bun run verify:win-signature`。期望 "OK"。
5. 把签名 `.exe` + `latest.yml` 手工上传到 GitHub Release 页面。
6. 在**干净** Windows Sequoia/11 VM（无开发工具，新用户）上：
   - 从 Release 页面下载 `.exe`。
   - 双击。SmartScreen 可能弹警告（"Windows protected your PC"）。点 "More info" → 确认看到 "Quriosity Pty Ltd"。点 "Run anyway"。
   - **预期 UAC 弹窗：** 蓝色背景，"Verified publisher: Quriosity Pty Ltd"。点 "Yes"。
   - QCut 正常安装。
7. VM 的 PowerShell 里：
   ```powershell
   Get-AuthenticodeSignature "C:\Users\<你>\Downloads\QCut*Setup*.exe"
   ```
   期望 `Status: Valid`，`SignerCertificate.Subject` 包含 "Quriosity Pty Ltd"。

任一步失败都**不要**把 rc tag 提升为 release。回滚排查问题。
