# macOS 代码签名 — 实现细节

工程子任务。每个都能独立合并。

> **前置条件：** [`PROCUREMENT.zh-CN.md`](PROCUREMENT.zh-CN.md) 子任务
> 1–4 全部完成，5 个 GitHub 仓库 secret/variable
> （`MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`APPLE_ID`、
> `APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`）已配好。

---

## 1. 修改 `electron-builder` mac 配置

**文件：** `qcut/package.json`（`build.mac` 块，第 265–286 行）。

### 修改前

```json
"mac": {
  "category": "public.app-category.video",
  "icon": "build/icon.icns",
  "target": [
    {"target": "dmg", "arch": ["arm64"]},
    {"target": "zip", "arch": ["arm64"]}
  ],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

### 修改后

```json
"mac": {
  "category": "public.app-category.video",
  "icon": "build/icon.icns",
  "target": [
    {"target": "dmg", "arch": ["arm64"]},
    {"target": "zip", "arch": ["arm64"]}
  ],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "identity": "Quriosity Pty Ltd (JQ3Q27U24X)",
  "notarize": true
}
```

### 每个 flag 的意义

- **`identity`** — 显式指定签名身份的名字。不写的话，
  `electron-builder` 会自动选钥匙串里第一个匹配的证书；如果钥匙串里
  有多张 Apple Developer 证书就会出错。显式指定也让失败更明显
  （会报 "identity not found"），不会悄无声息地跳过签名。
- **`notarize: true`** — 在 `electron-builder ≥26` 中 `notarize` 字段
  是 boolean（旧版本是对象 `{ teamId }`）。设为 `true` 启用 `@electron/notarize`
  集成；team ID 完全从环境变量 `APPLE_TEAM_ID` 读取，配置里不再重复。
  公证激活需要环境变量三选一组合：
  1. `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`（推荐，长期方案）
  2. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`（当前方案）
  3. `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`

  构建会：
  1. 签名 `.app` 和内层二进制。
  2. 提交给 Apple 公证服务。
  3. 等结果（一般 5–10 分钟）。
  4. 把公证票据 staple 到 `.dmg` 和 `.app`。

  不需要 `afterSign` 钩子。
- **`hardenedRuntime: true`** — 已存在，公证必需。没开 hardened runtime
  的 bundle 公证会拒。
- **`entitlements`** — 已存在。当前授权
  （`com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`、
  `disable-library-validation`、`audio-input`、`camera`、
  `files.user-selected.read-write`）是 FFmpeg WASM 和动态加载**必需的**。
  这些是显式声明的授权（不是空白豁免），公证会接受。

### 合并前本地验证

如果本地钥匙串有证书且环境变量都设了：

```bash
cd qcut
APPLE_ID="..." APPLE_APP_SPECIFIC_PASSWORD="..." APPLE_TEAM_ID="..." \
  bun run dist:mac
```

观察日志里：

- `signing app file ... mac-arm64/QCut.app`
- `notarization started`、`notarization succeeded`
- `stapling app file ...`

---

## 2. 修改 GitHub Actions 发布工作流

**文件：** `qcut/.github/workflows/release.yml`（`build-macos` 任务，
约第 110–200 行）。

### 2.1 — 在 "Build Electron application" 的 env 块里加 Apple secret

当前步骤（约第 170 行）大致是：

```yaml
- name: Build Electron application
  run: |
    rm -rf dist-electron
    echo "::group::Electron Builder"
    time npx electron-builder --mac --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
    echo "::endgroup::"
    ls -lah dist-electron/
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    USE_HARD_LINKS: false
```

把 `env:` 块改成：

```yaml
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    USE_HARD_LINKS: false
    CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}
```

`electron-builder` 会自动：

1. 把 base64 的 `CSC_LINK` 解码，导入到一个临时钥匙串。
2. 用 `CSC_KEY_PASSWORD` 解锁 `.p12`。
3. 用 `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` 做
   公证。

### 2.2 — 在 build 之后、upload 之前加校验步骤

```yaml
- name: Verify macOS signature and notarization
  run: cd qcut && bun run verify:macos-signature
  env:
    APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}
```

（脚本在 §3 里。）

### 2.3 — 自托管 Mac runner 的考虑

`release.yml` 已经有 `USE_SELF_HOSTED_MAC` 开关。两种 runner 在上面的
env 块下都能跑：

- **GitHub-hosted runner**：`electron-builder` 把 `CSC_LINK` 里的 `.p12`
  导入到一个临时钥匙串。
- **自托管 runner**：如果证书已经在 runner 用户钥匙串里，
  `electron-builder` 会直接用。`CSC_LINK` 仍然有效 — 它会再导入一次到
  临时钥匙串，构建结束后清理，不冲突。

为了保持一致，**`CSC_LINK` 和 `CSC_KEY_PASSWORD` 都保留在 env 块里** —
钥匙串已经有证书时它们是 no-op，但能避免两种 runner 行为发散。

---

## 3. 增加签名/公证校验脚本

**新增文件：** `qcut/scripts/verify-macos-signature.ts`。

### 行为规范

1. 在 `qcut/dist-electron/` 找最新的 `QCut*.dmg`。
2. 找对应的 `QCut.app`（`electron-builder` 构建期间会解包到
   `qcut/dist-electron/mac-arm64/QCut.app`）。
3. 按顺序跑：
   - `codesign --verify --deep --strict --verbose=2 <QCut.app>` → 退出 0。
   - `spctl -a -t exec -vv <QCut.app>` → 必须报告 `accepted` **并且**
     `source=Notarized Developer ID`。
   - `xcrun stapler validate <QCut.dmg>` → 必须报告
     `The validate action worked!`。
4. 如果设置了 `APPLE_TEAM_ID`，跑 `codesign -dvv <QCut.app>` 并确认
   Team ID 在输出里。
5. 任一失败就退出非零，并输出明确信息。
6. 非 macOS 主机上打 warn 后跳过。

### 代码草稿

```ts
// qcut/scripts/verify-macos-signature.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const expectedTeamId = process.env.APPLE_TEAM_ID;

function findLatestDmg(): string {
  if (!existsSync(distDir)) {
    throw new Error(`找不到 dist-electron：${distDir}`);
  }
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*\.dmg$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`${distDir} 里找不到 QCut*.dmg`);
  }
  return join(distDir, candidates[0].f);
}

function findApp(): string {
  const candidate = join(distDir, "mac-arm64", "QCut.app");
  if (!existsSync(candidate)) {
    throw new Error(`找不到 ${candidate}`);
  }
  return candidate;
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

if (process.platform !== "darwin") {
  console.warn("[verify-macos-signature] 非 macOS 主机，跳过");
  process.exit(0);
}

const app = findApp();
const dmg = findLatestDmg();

console.log(`[verify-macos-signature] codesign --verify ${app}`);
const codesignOut = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
console.log(codesignOut);

console.log(`[verify-macos-signature] spctl --assess ${app}`);
const spctlOut = run("spctl", ["-a", "-t", "exec", "-vv", app]);
console.log(spctlOut);
if (!spctlOut.includes("accepted")) {
  throw new Error("spctl 没有接受这个 app");
}
if (!spctlOut.includes("Notarized Developer ID")) {
  throw new Error("spctl 报告 app 已签名但未公证");
}

console.log(`[verify-macos-signature] xcrun stapler validate ${dmg}`);
const staplerOut = run("xcrun", ["stapler", "validate", dmg]);
console.log(staplerOut);
if (!staplerOut.includes("worked")) {
  throw new Error("stapler 校验失败");
}

if (expectedTeamId) {
  const codesignDisplayOut = run("codesign", ["-dvv", app]);
  if (!codesignDisplayOut.includes(`(${expectedTeamId})`)) {
    throw new Error(`签名 team 不匹配；期望 ${expectedTeamId}`);
  }
}

console.log("[verify-macos-signature] OK");
```

加到 `qcut/package.json` 的 `scripts`：

```json
"verify:macos-signature": "bun scripts/verify-macos-signature.ts"
```

### 为什么单独做一次校验

`electron-builder` 已经会在签名或公证失败时让构建失败。但单独的校验
步骤还有几个好处：

1. 抓到构建后任何被改过的情况（例如某步重新打包 `.app` 破坏了签名
   附着）。
2. 在日志里输出明确的成功/失败信息，将来人工排查时能快速定位。
3. 大约 5 秒（**不**会发请求到 Apple — 这些工具是基于 staple 的票据
   本地校验）。

---

## 4. 在干净 macOS VM 上做发布演练

所有 PR 落地后，做一次端到端人工测试：

1. 推 `v2026.5.0-rc.1` tag。
2. 等 `build-macos` 成功。
3. 从 artifact 下载 `.dmg`。
4. 在干净的 macOS Sequoia 或 Sonoma VM（或新用户账号）上：
   - 双击 `.dmg`。
   - 把 `QCut.app` 拖到 `/Applications`。
   - 从 Applications 打开 QCut。
   - **预期：** macOS 显示"QCut.app 是从互联网下载的，确定要打开
     吗？"带"打开"按钮。**不应**显示"无法打开，因为无法验证开发者"。
   - 点"打开" — 应用启动。
5. 终端里跑：
   ```bash
   codesign --verify --deep --strict --verbose=2 /Applications/QCut.app
   spctl -a -t exec -vv /Applications/QCut.app
   xcrun stapler validate /Applications/QCut.app
   ```
   三个都要成功。

任何一步失败就**不要**把 rc tag 提升为 release。回滚工作流改动，
排查问题。

---

## 5. 后续加固（单独跟踪）

- **App Store Connect API key** 替代 `APPLE_ID` +
  `APPLE_APP_SPECIFIC_PASSWORD`。Apple ID 持有者变化也不影响。详见
  [`PROCUREMENT.zh-CN.md` § 后续加固](PROCUREMENT.zh-CN.md#后续加固app-store-connect-api-key)。
- **通用二进制（x64 + arm64）** — 如果以后要重新支持 Intel Mac。
  目前 target 只配了 arm64。
- **electron-updater 签名校验** — macOS 默认就有；在 setup 文档里
  说明一下。
- **迁移到自托管 Mac runner** — 如果 GitHub-hosted runner 的费用或
  排队时间成为问题再考虑。
