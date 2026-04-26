# Windows Code Signing — Implementation (Certum SimplySign)

Engineering subtasks. Each is independently mergeable. Path: Certum
SimplySign Standard Code Signing (Cloud). See
[CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) for why other paths
were ruled out.

> **Prerequisite:** [PROCUREMENT subtasks 1–2](PLAN.md#subtask-map)
> complete — Certum order paid, identity validation approved, certificate
> issued and bound to a SimplySign Cloud HSM identity.

---

## Architecture decision: where signing happens

Certum SimplySign requires phone-based confirmation for **every**
`signtool` invocation — Donghao's phone gets a push notification, he
taps "Approve", and signing proceeds. This is the security model of the
Cloud HSM and **cannot be disabled**.

Implication: GitHub Actions cannot fully automate the signing step.
Three architecturally clean options:

| Option | Where signing happens | Tradeoff |
|--------|----------------------|----------|
| **A (chosen): Build unsigned in CI, sign locally before publish** | CI produces an unsigned `.exe` artifact; maintainer downloads it, signs on local Windows machine, uploads signed artifact to GitHub Release | Manual ~5 min per release. Same workflow Inkdrop uses. |
| B: Self-hosted Windows runner with SimplySign installed | Runner triggers signing; Donghao still gets phone push and approves | Adds runner hosting cost and SimplySign always-running operational overhead. Phone confirmation still required — saves nothing. |
| C: Switch to SSL.com eSigner OV | CI signs with REST API token | ~$220+/year more (dual cost: ~$239/year cert + ~$200–240/year eSigner Cloud Signing — see §5), full automation. Migration path if Option A becomes painful. |

**Option A is the chosen path.** It matches industry norms for indie
Electron projects and keeps the cost low. Migration to Option C is
preserved as a future-hardening track.

---

## 0. Tooling setup

**One-time setup on Donghao's machine** (Windows VM if Donghao primarily uses macOS — see Risk #2 in [PLAN.md](PLAN.md#risks--open-questions)).

1. **Install SimplySign mobile app** — iOS/Android. Pair with Certum account using the activation code emailed after identity validation.
2. **Install SimplySign desktop signing tool** — `proCertumCardManager` or the newer SimplySign desktop app. Download from https://www.certum.eu/en/cert_expert_simply_sign/.
3. **Install Windows SDK signtool** — needed for `signtool.exe`. Either:
   - Standalone via `winget install --id Microsoft.WindowsSDK` and use `signtool.exe` from `C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\`, or
   - Install Visual Studio Build Tools.
4. **Authenticate SimplySign desktop tool** — open it, enter Certum login, scan SimplySign QR code on phone. The tool now exposes the Cloud HSM identity to Windows CryptoAPI / signtool via PKCS#11.
5. **Verify** — run from PowerShell:
   ```powershell
   certutil -store -user My
   ```
   The Windows Authenticode code-signing certificate issued to `Quriosity Pty Ltd` (subject CN `Quriosity Pty Ltd`) should appear, with a private-key reference pointing to SimplySign's CSP. (`Developer ID Application` is the Apple naming convention and does not apply on Windows.)

If any of these steps fail, the rest of this implementation cannot proceed.

---

## 1. Update `electron-builder` Windows config

**File:** `qcut/package.json` (the `build.win` block, lines 231–240).

### Before

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

### After

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

### Why these values

- **`forceCodeSigning: false`** — kept `false` because signing happens **after** electron-builder finishes (in our local sign step). If we set this to `true`, electron-builder would try to sign during build and fail because no cert is available in the runner's keychain.
- **`verifyUpdateCodeSignature: true`** — flipped from `false`. Auto-updater will refuse updates whose signature does not chain to the same publisher. Defends against compromised update-server scenarios.
- **`signAndEditExecutable: false`** — kept `false` because **we run `signtool` only on the outer NSIS `Setup.exe` in our local step**. The inner `app.exe` is signed by electron-builder during the **unpacked stage** (before NSIS bundles it) when `signtool.exe` and a cert are present in the build environment; `signtool` invoked on the already-built `Setup.exe` does **not** re-sign nested binaries. If a future change requires CI builds to skip the unpacked-stage sign (e.g., no cert on the runner), the local sign script must be extended to unpack → sign `app.exe` → repack → sign `Setup.exe`. Auto-update signature verification (`verifyUpdateCodeSignature: true`) only checks the signature of the file electron-updater downloads — for QCut that's the `Setup.exe`, so this two-stage subtlety doesn't affect updater behavior, but it matters for SmartScreen reputation on the inner binary.
- **No `azureSignOptions`** — Azure path is ruled out (see [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md#-azure-trusted-signing-microsoft-artifact-signing)).

### Update local `dist:win*` npm scripts

**File:** `qcut/package.json` (lines 84, 86, 88, 89).

Strip the `forceCodeSigning=false` overrides — they are redundant with the new `build.win.forceCodeSigning: false` and confusing if a future maintainer wonders why both are set.

| Script | Old | New |
|--------|-----|-----|
| `dist:win` | `… -c.win.forceCodeSigning=false` | `… --publish never` (drop the override) |
| `dist:win:unsigned` | unchanged | unchanged — explicit alias for "build without intent to sign" |
| `dist:win:release` | `… --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false …` | `… --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp` |
| `dist:win:fast` | unchanged | unchanged — local fast-iteration variant |

Add to `scripts`:

```json
"sign:win": "bun scripts/sign-windows-release.ts",
"verify:win-signature": "bun scripts/verify-windows-signature.ts"
```

---

## 2. Update GitHub Actions release workflow

**File:** `.github/workflows/release.yml` (Windows job, lines 56–108).

The Windows CI build produces an **unsigned** `.exe` and uploads it as an artifact. The maintainer downloads, signs locally, and uploads the signed `.exe` back to the Release.

### 2.1 — Modify "Build Electron application" step

```yaml
- name: Build Electron application (unsigned — sign locally per release)
  run: |
    npx electron-builder --win --publish never --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

(Removed the `--config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false` overrides — `package.json` already provides the right defaults.)

### 2.2 — Update artifact upload

The Windows job continues to upload the unsigned `.exe`. The release publish step does NOT auto-attach Windows artifacts to the GitHub Release until they have been signed.

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

(Renamed `windows-build` → `windows-build-unsigned` to make the artifact's status visible in the Actions UI.)

### 2.3 — Modify the release-publish step

The aggregated release job (`release` near line 277) currently downloads `windows-build` and attaches `.exe` files to the release. Update it to:

- Stop auto-attaching unsigned Windows files. Either:
  - **(2.3a)** Skip Windows files in the release-publish step entirely — maintainer manually uploads signed `.exe` to the Release after running `bun run sign:win` locally. Simpler.
  - **(2.3b)** Add a "wait for signed-windows artifact" step that polls for a maintainer-uploaded signed artifact, then publishes. More automation but more complexity.

Choose **2.3a** for v1. Document the manual step clearly:

> 📋 **Release operator runbook:**
> 1. Wait for `build-windows` job to succeed.
> 2. Download `windows-build-unsigned` artifact.
> 3. Run `bun run sign:win` (with SimplySign desktop app authenticated).
> 4. Approve signing on phone (~30 seconds).
> 5. Upload signed `.exe` and updated `latest.yml` to the GitHub Release manually.

### 2.4 — `latest.yml` integrity

`latest.yml` contains a SHA512 of the `.exe`. Signing changes the bytes, so the SHA512 in `latest.yml` becomes wrong. The local sign script (next section) regenerates `latest.yml`.

---

## 3. Add local signing helper script

**New file:** `qcut/scripts/sign-windows-release.ts`.

### Behaviour spec

1. Find the latest unsigned `QCut*Setup*.exe` in `qcut/dist-electron/`.
2. Run `signtool sign /tr https://timestamp.acs.microsoft.com /td sha256 /fd sha256 /sha1 <thumbprint> /sm <exe>`.
   - `sha1 <thumbprint>` — selects the Quriosity cert from SimplySign's exposed identity store.
   - `tr` is the RFC 3161 timestamp authority. Microsoft's is recommended for SmartScreen reputation alignment.
   - `td sha256` and `fd sha256` — modern SHA-256 algorithms (CA/B Forum requires post-2024).
3. SimplySign mobile app prompts for approval. Donghao taps Approve.
4. After signing, run `signtool verify /pa /v <exe>` to confirm.
5. Update `latest.yml`:
   - Recompute SHA512 of the signed `.exe`.
   - Recompute file size.
   - Rewrite `latest.yml`.
6. Print summary with paths.

### Sketch

```ts
// qcut/scripts/sign-windows-release.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const certThumbprint = process.env.QCUT_WIN_CERT_THUMBPRINT;
if (!certThumbprint) {
  throw new Error("Set QCUT_WIN_CERT_THUMBPRINT to the SHA1 of the Quriosity cert");
}

function findUnsignedInstaller(): string {
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*Setup.*\.exe$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`No QCut*Setup*.exe found in ${distDir}`);
  }
  return join(distDir, candidates[0].f);
}

const exe = findUnsignedInstaller();
console.log(`[sign-windows-release] signing ${exe}`);
console.log("[sign-windows-release] approve on your phone via SimplySign app...");

execFileSync("signtool", [
  "sign",
  "/tr", "https://timestamp.acs.microsoft.com",
  "/td", "sha256",
  "/fd", "sha256",
  "/sha1", certThumbprint,
  "/sm",
  exe,
], { stdio: "inherit" });

execFileSync("signtool", ["verify", "/pa", "/v", exe], { stdio: "inherit" });

// Update latest.yml
const latestYmlPath = join(distDir, "latest.yml");
if (existsSync(latestYmlPath)) {
  const buffer = readFileSync(exe);
  const sha512 = createHash("sha512").update(buffer).digest("base64");
  const size = buffer.length;
  let yml = readFileSync(latestYmlPath, "utf8");
  yml = yml.replace(/sha512: .+/g, `sha512: ${sha512}`);
  yml = yml.replace(/size: \d+/g, `size: ${size}`);
  writeFileSync(latestYmlPath, yml);
  console.log("[sign-windows-release] updated latest.yml SHA512 + size");
}

console.log("[sign-windows-release] done");
```

### Why a `.ts` script (not raw `.ps1`)

- Matches existing convention — see `qcut/scripts/verify-packaged-ffmpeg.ts` and `verify-packaged-aicp.ts` (confirmed present).
- Easier to unit-test with Vitest.
- Cross-platform path handling.

---

## 4. Add post-signing signature verifier

**New file:** `qcut/scripts/verify-windows-signature.ts`.

Same behaviour as the verifier sketched in earlier iterations of this
plan — runs `signtool verify /pa /v` and asserts the publisher subject
matches the expected `WINDOWS_PUBLISHER_NAME` env var (set to `"Quriosity Pty Ltd"`).

### Sketch

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
    throw new Error(`No QCut*Setup*.exe found in ${distDir}`);
  }
  return join(distDir, candidates[0].f);
}

if (process.platform !== "win32") {
  console.warn("[verify-windows-signature] non-Windows host, skipping");
  process.exit(0);
}

const installer = findInstaller();
const out = execFileSync("signtool", ["verify", "/pa", "/v", installer], { encoding: "utf8" });
console.log(out);

if (!out.includes(expectedPublisher)) {
  throw new Error(`Signed by unexpected publisher; expected "${expectedPublisher}" in signtool output`);
}

console.log("[verify-windows-signature] OK");
```

This script runs in two places:
- After `bun run sign:win` (sanity check before uploading to Release).
- Manually on the published `.exe` from the GitHub Release page (smoke test).

---

## 5. Future hardening (track separately)

- **Migrate to SSL.com eSigner OV** if manual signing becomes a bottleneck. Adds full CI automation. Adds **~$220+/year** ($239/year cert + $200–240/year eSigner Cloud Signing subscription, dual cost — earlier drafts erroneously claimed "~$50 more"). Justified only at >1 release/week — at QCut's current cadence the manual phone-approval cost is ~minutes/year, not worth $220.
- **Add team member to Certum account** so signing is not blocked when Donghao is offline.
- **Reputation acceleration**: keep release frequency moderate (don't release weekly), encourage downloads to flow through stable URLs that aggregate hash reputation faster.
- **Re-evaluate Azure Artifact Signing in 2027-06** once Quriosity hits 3-year mark — and if Microsoft has expanded country eligibility to AU. If both are true, $120/year + full CI automation makes Azure attractive again.

---

## 6. Dry-run release on clean Windows VM

After all PRs land, do a manual end-to-end test:

1. CI: tag `v2026.5.0-rc.1`, wait for `build-windows` to produce `windows-build-unsigned` artifact.
2. Download artifact to local Windows machine where SimplySign is set up.
3. Run `bun run sign:win`. Approve on phone. Confirm script outputs "done".
4. Run `bun run verify:win-signature`. Expect "OK".
5. Manually upload signed `.exe` + `latest.yml` to the GitHub Release page.
6. On a **clean** Windows 11 VM (or Windows 10/11, no developer tools, fresh user):
   - Download the `.exe` from the Release page.
   - Double-click. SmartScreen may pop the warning ("Windows protected your PC"). Click "More info" → confirm "Quriosity Pty Ltd" appears. Click "Run anyway".
   - **Expected UAC dialog:** blue background, "Verified publisher: Quriosity Pty Ltd". Click "Yes".
   - QCut installs normally.
7. From PowerShell on the VM:
   ```powershell
   Get-AuthenticodeSignature "C:\Users\<you>\Downloads\QCut*Setup*.exe"
   ```
   Expect `Status: Valid` and `SignerCertificate.Subject` containing "Quriosity Pty Ltd".

If any step fails, **do not promote** the rc tag. Roll back and investigate.
