# Windows Code Signing — Implementation

Detailed engineering subtasks. Sequenced so each can be a single PR.
File paths are relative to the repository root unless noted.

> **Prerequisite:** Subtask 1 (cert procurement, see
> [`CERTIFICATE-OPTIONS.md`](CERTIFICATE-OPTIONS.md)) is complete and the
> following values are known and stored as GitHub Actions secrets:
> `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
> `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`,
> `AZURE_CERTIFICATE_PROFILE`, `WINDOWS_PUBLISHER_NAME`.

---

## 1. Update `electron-builder` Windows config

**Files:** `qcut/package.json` (lines 231–240, the `build.win` block).

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

### Why every flag matters

- `forceCodeSigning: true` — fails the build if signing is misconfigured
  instead of silently shipping unsigned bytes. Required by the issue's
  acceptance criteria.
- `verifyUpdateCodeSignature: true` — the auto-updater will refuse to
  apply an update whose signature does not chain to the same publisher.
  Defends against compromised update-server scenarios.
- `signAndEditExecutable: true` — signs the `app.exe` inside the installer
  too, not just the installer wrapper. Otherwise the *installed* app still
  appears unsigned to the OS.
- Values reference `${env.*}` so the same `package.json` works in CI and
  locally without committing secrets.

### Verification

- `bun check-types` — config is JSON, no type impact, but run anyway.
- `cd qcut && npx electron-builder --help | grep -i azure` — confirm the
  installed `electron-builder` version supports `azureSignOptions`.

---

## 2. Update local `dist:win*` npm scripts

**File:** `qcut/package.json` (lines 84, 86, 88, 89).

The current scripts hard-code `--config.win.forceCodeSigning=false` and
`--config.win.verifyUpdateCodeSignature=false`. Once subtask 1 lands,
these overrides will *prevent* signing even on machines that have the
Azure secrets exported.

### Changes

| Script | Old | New |
|--------|-----|-----|
| `dist:win` | `electron-builder --win --publish never -c.win.forceCodeSigning=false` | `electron-builder --win --publish never` |
| `dist:win:unsigned` | (same as before) | **Keep as-is** — explicitly unsigned local-dev variant. Rename intent in script comment if helpful. |
| `dist:win:release` | `electron-builder --win --publish never --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false && …` | `electron-builder --win --publish never && bun run verify:packaged-ffmpeg && bun run verify:packaged-aicp && bun run verify:windows-signature` |
| `dist:win:fast` | `electron-builder --win --publish never --config.win.forceCodeSigning=false --config.compression=store --config.nsis.differentialPackage=false` | `electron-builder --win --publish never --config.win.forceCodeSigning=false --config.compression=store --config.nsis.differentialPackage=false` (**unchanged**) |

### Rationale

- `dist:win:unsigned` and `dist:win:fast` are deliberately kept unsigned —
  developers without Azure access still need a way to build a working
  installer for local smoke tests. They are not used by the release
  pipeline.
- `dist:win:release` is the canonical signed release script; it now runs
  the new `verify:windows-signature` script (added in subtask 5) as a
  belt-and-braces check.
- Script `verify:windows-signature` will be added in `package.json`
  `scripts` block alongside the other `verify:*` entries:

```json
"verify:windows-signature": "bun scripts/verify-windows-signature.ts"
```

### Verification

- Run `cd qcut && bun run dist:win:unsigned` on a Windows machine — should
  still produce an unsigned installer for local dev.
- Run `cd qcut && bun run dist:win:release` with Azure secrets exported —
  should produce a signed installer and exit 0.

---

## 3. Update GitHub Actions release workflow

**File:** `qcut/.github/workflows/release.yml` (Windows job, lines 56–108).

### Changes

Step "Build Electron application" at line 94–98:

**Before:**

```yaml
- name: Build Electron application
  run: |
    npx electron-builder --win --publish never --config.win.forceCodeSigning=false --config.win.verifyUpdateCodeSignature=false --config.publish.channel=${{ needs.prepare.outputs.channel }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**After:**

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

Add a new step **after** "Build Electron application" and **before**
"Upload artifacts":

```yaml
- name: Verify Windows signature
  shell: pwsh
  run: |
    cd qcut
    bun run verify:windows-signature
```

### Why a separate verify step

`forceCodeSigning: true` already aborts the build on signing failure, but
a separate verify step:

1. Runs `signtool verify /pa /v` against the *final* artifact path that
   uploads to the release — catches any post-build mutation.
2. Produces explicit log output that humans (and `prtaskit`) can scan
   when investigating "why is this release showing unknown publisher" in
   the future.
3. Costs ~2 seconds; the value-to-cost ratio is excellent.

### Verification

- `actionlint qcut/.github/workflows/release.yml` (or
  `npx @action-validator/cli`) — YAML syntax + secret-reference sanity.
- Tag a `vX.Y.Z-rc.1` release and watch the workflow — signing should
  succeed, the verify step should print `Successfully verified`.

---

## 4. Add post-build signature verification

**New files:**

- `qcut/scripts/verify-windows-signature.ts` — implementation.
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — see
  [`TESTING.md`](TESTING.md).

### Behaviour spec

1. Locate the release artifact (`qcut/dist-electron/QCut*Setup*.exe`,
   first match by mtime).
2. On Windows, run `signtool verify /pa /v <path>`. On non-Windows, run
   `osslsigncode verify <path>` if available; otherwise log a warning
   and exit 0 (the script is only authoritative on Windows runners).
3. Parse output. Require:
   - Exit code 0.
   - Subject CN matches `process.env.WINDOWS_PUBLISHER_NAME` if set.
4. Exit non-zero with a clear message on failure.
5. No silent fallbacks. If the artifact does not exist, fail loudly.

### Sketch (final code lives in the new file)

```ts
// qcut/scripts/verify-windows-signature.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const expectedPublisher = process.env.WINDOWS_PUBLISHER_NAME;

function findInstaller(): string {
  if (!existsSync(distDir)) {
    throw new Error(`dist-electron not found at ${distDir}`);
  }
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*Setup.*\.exe$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`No QCut*Setup*.exe found in ${distDir}`);
  }
  return join(distDir, candidates[0].f);
}

function verify(installer: string): void {
  if (process.platform !== "win32") {
    console.warn("[verify-windows-signature] non-Windows host, skipping");
    return;
  }
  const out = execFileSync("signtool", ["verify", "/pa", "/v", installer], {
    encoding: "utf8",
  });
  console.log(out);
  if (expectedPublisher && !out.includes(expectedPublisher)) {
    throw new Error(
      `Signed by unexpected publisher; expected "${expectedPublisher}" in signtool output`,
    );
  }
}

const installer = findInstaller();
console.log(`[verify-windows-signature] verifying ${installer}`);
verify(installer);
console.log("[verify-windows-signature] OK");
```

### Why a `.ts` script (not a raw `.ps1`)

- Matches existing convention — see `qcut/scripts/verify-packaged-ffmpeg.ts`
  and `qcut/scripts/verify-packaged-aicp.ts`.
- Easier to unit test (Vitest can mock `child_process`).
- Cross-platform-safe: it can no-op on macOS/Linux dev machines without
  blowing up the script chain in `dist:win:release`.

### Verification

- `cd qcut && bun run verify:windows-signature` after a signed local
  build → exits 0.
- Same command after a `dist:win:unsigned` build → exits non-zero.

---

## 5. Dry-run release & manual verification

Manual smoke test on a clean Windows VM (no developer tools, fresh
profile):

1. Push a tag like `v2026.5.0-rc.1` to trigger the release workflow.
2. Wait for `build-windows` to succeed; download the `windows-build`
   artifact.
3. On the VM, double-click the `.exe`.
4. **Expected:** Windows shows `Publisher: <WINDOWS_PUBLISHER_NAME>`
   (not "Unknown publisher"). SmartScreen may still display "Windows
   protected your PC" until reputation builds — see "Risks" in
   [`PLAN.md`](PLAN.md).
5. Open PowerShell on the VM:
   ```powershell
   Get-AuthenticodeSignature .\QCut*Setup*.exe
   ```
   Expect `Status: Valid` and a non-empty `SignerCertificate.Subject`.
6. `signtool verify /pa /v .\QCut*Setup*.exe` → exit 0, "Successfully
   verified".

If any step fails, **do not promote** the rc tag to a release. Roll back
the workflow change and investigate.

---

## 6. Future hardening (track separately)

Out of scope for the v1 implementation but worth filing follow-up issues:

- **OIDC federation for Azure auth** — replace `AZURE_CLIENT_SECRET` in
  GitHub Actions with `azure/login@v2` + workload identity federation. No
  rotating secrets to manage. See
  [`CERTIFICATE-OPTIONS.md`](CERTIFICATE-OPTIONS.md) §"Long-term: prefer
  OIDC federation".
- **EV cert evaluation** — six months after v1 ships, review SmartScreen
  warning rate and decide whether to upgrade to EV (see
  [`CERTIFICATE-OPTIONS.md`](CERTIFICATE-OPTIONS.md)).
- **Microsoft Store distribution** — separate channel, separate
  certificate, separate review process. Issue #289 mentions it as a
  reputation booster but it is not part of this plan.
- **Reproducible artifacts** — sign-in-place vs. sign-then-archive can
  affect reproducibility; revisit if QCut adopts SLSA-style attestations.
