# macOS Code Signing — Implementation

Engineering subtasks. Each is independently mergeable.

> **Prerequisite:** [`PROCUREMENT.md`](PROCUREMENT.md) subtasks 1–4
> completed and the five GitHub repo secrets/variables (`MAC_CSC_LINK`,
> `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
> `APPLE_TEAM_ID`) are set.

---

## 1. Update `electron-builder` mac config

**File:** `qcut/package.json` (the `build.mac` block, lines 265–286).

### Before

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

### After

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

### Why every flag matters

- **`identity`** — pins the signing identity by name. Without this, `electron-builder` picks the first matching cert in keychain, which can break if multiple Apple Developer certs are present. Two gotchas verified during initial setup (2026-04-30):
  - **Do NOT include the `Developer ID Application:` prefix** — electron-builder rejects that prefix with "Please remove prefix" and asks you to provide just the team part.
  - **`${env.APPLE_TEAM_ID}` interpolation does NOT reliably work in this field.** electron-builder silently falls back to ad-hoc signing (`identityName=- identityHash=none`) when interpolation fails. **Hardcode the team ID** in the literal string. The team ID is publicly embedded in any signed binary anyway, so it is not a secret.
- **`notarize: true`** — in `electron-builder ≥26` this field is a **boolean** (older versions accepted an object `{ teamId }`). Set to `true` to enable the `@electron/notarize` integration. Team ID is read entirely from the `APPLE_TEAM_ID` env var, not from config. To activate notarization, set one of these env-var combinations:
  1. `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` (recommended long-term)
  2. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (the current setup)
  3. `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`

  The build will:
  1. Sign the `.app` and inner binaries.
  2. Submit to Apple's notary service.
  3. Wait for verdict (typically 5–10 minutes).
  4. Staple the notarization ticket to the `.dmg` and `.app`.

  No `afterSign` hook needed.
- **`hardenedRuntime: true`** — already present and required for notarization. Notarization rejects bundles without hardened runtime.
- **`entitlements`** — already present. The current entitlements
  (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`,
  `disable-library-validation`, `audio-input`, `camera`,
  `files.user-selected.read-write`) are *necessary* for FFmpeg WASM and
  dynamic loading. Notarization accepts these because they are explicit
  entitlements, not blanket exceptions.

### Verify locally before merging

If you have the cert in your local keychain and the env vars set:

```bash
cd qcut
APPLE_ID="..." APPLE_APP_SPECIFIC_PASSWORD="..." APPLE_TEAM_ID="..." \
  bun run dist:mac
```

Watch the log for:

- `signing app file ... mac-arm64/QCut.app`
- `notarization started`, `notarization succeeded`
- `stapling app file ...`

---

## 2. Update GitHub Actions release workflow

**File:** `qcut/.github/workflows/release.yml` (`build-macos` job, around lines 110–200).

### 2.1 — Add Apple secrets to the "Build Electron application" env block

The current step (around line 170) looks roughly like:

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

Change the `env:` block to:

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

`electron-builder` automatically:

1. Decodes `CSC_LINK` from base64 and imports the `.p12` into a temporary keychain.
2. Uses `CSC_KEY_PASSWORD` to unlock the `.p12`.
3. Uses `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` for notarization.

### 2.2 — Add a verification step after build, before upload

```yaml
- name: Verify macOS signature and notarization
  run: cd qcut && bun run verify:macos-signature
  env:
    APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}
```

(Script added in §3.)

### 2.3 — Self-hosted Mac runner consideration

`release.yml` already has a `USE_SELF_HOSTED_MAC` toggle. Both runner
types work with the env block above:

- **GitHub-hosted runner**: `electron-builder` imports the `.p12` from `CSC_LINK` into a temporary keychain.
- **Self-hosted runner**: if the cert is already in the runner's user keychain, `electron-builder` uses it directly. The `CSC_LINK` env var is still respected — it imports into a temporary keychain for the build duration, then cleans up. No conflict.

For consistency, **keep `CSC_LINK` and `CSC_KEY_PASSWORD` in the env
block** — they are no-ops when the keychain already has the cert and
avoid divergent behaviour between runner types.

---

## 3. Add signature/notarization verifier

**New file:** `qcut/scripts/verify-macos-signature.ts`.

### Behaviour spec

1. Find the latest `QCut*.dmg` in `qcut/dist-electron/`.
2. Find the corresponding `QCut.app` (`electron-builder` unpacks during build to `qcut/dist-electron/mac-arm64/QCut.app`).
3. Run, in order:
   - `codesign --verify --deep --strict --verbose=2 <QCut.app>` → exit 0.
   - `spctl -a -t exec -vv <QCut.app>` → must report `accepted` AND `source=Notarized Developer ID`.
   - `xcrun stapler validate <QCut.dmg>` → must report `The validate action worked!`.
4. If `APPLE_TEAM_ID` is set, run `codesign -dvv <QCut.app>` and confirm the Team ID is in the output.
5. Exit non-zero on any failure with a clear message.
6. On non-macOS hosts, warn and skip.

### Sketch

```ts
// qcut/scripts/verify-macos-signature.ts
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "..", "dist-electron");
const expectedTeamId = process.env.APPLE_TEAM_ID;

function findLatestDmg(): string {
  if (!existsSync(distDir)) {
    throw new Error(`dist-electron not found at ${distDir}`);
  }
  const candidates = readdirSync(distDir)
    .filter((f) => /^QCut.*\.dmg$/i.test(f))
    .map((f) => ({ f, mtime: statSync(join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`No QCut*.dmg found in ${distDir}`);
  }
  return join(distDir, candidates[0].f);
}

function findApp(): string {
  const candidate = join(distDir, "mac-arm64", "QCut.app");
  if (!existsSync(candidate)) {
    throw new Error(`QCut.app not found at ${candidate}`);
  }
  return candidate;
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

if (process.platform !== "darwin") {
  console.warn("[verify-macos-signature] non-macOS host, skipping");
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
  throw new Error("spctl did not accept the app");
}
if (!spctlOut.includes("Notarized Developer ID")) {
  throw new Error("spctl reports app is signed but not notarized");
}

console.log(`[verify-macos-signature] xcrun stapler validate ${dmg}`);
const staplerOut = run("xcrun", ["stapler", "validate", dmg]);
console.log(staplerOut);
if (!staplerOut.includes("worked")) {
  throw new Error("stapler validation failed");
}

if (expectedTeamId) {
  const codesignDisplayOut = run("codesign", ["-dvv", app]);
  if (!codesignDisplayOut.includes(`(${expectedTeamId})`)) {
    throw new Error(`Signed by unexpected team; expected ${expectedTeamId}`);
  }
}

console.log("[verify-macos-signature] OK");
```

Add to `qcut/package.json` `scripts`:

```json
"verify:macos-signature": "bun scripts/verify-macos-signature.ts"
```

### Why a separate verify step

`electron-builder` already fails the build if signing or notarization
fails. The separate verify step:

1. Catches any post-build mutation (e.g. a step that re-zips the `.app` and breaks signature attachment).
2. Produces explicit log output that humans can scan when debugging.
3. Costs ~5 seconds (network calls to Apple are NOT made — these tools verify locally against the stapled ticket).

---

## 4. Dry-run release on clean macOS VM

After all PRs land, do a manual end-to-end test:

1. Push a `v2026.5.0-rc.1` tag.
2. Wait for `build-macos` to succeed.
3. Download the `.dmg` from the artifact.
4. On a clean macOS Sequoia or Sonoma VM (or a fresh user account):
   - Double-click the `.dmg`.
   - Drag `QCut.app` to `/Applications`.
   - Open QCut from Applications.
   - **Expected:** macOS shows "QCut.app was downloaded from the Internet. Are you sure you want to open it?" with an "Open" button. **Not** "cannot be opened because the developer cannot be verified".
   - Click Open — app launches.
5. From terminal:
   ```bash
   codesign --verify --deep --strict --verbose=2 /Applications/QCut.app
   spctl -a -t exec -vv /Applications/QCut.app
   xcrun stapler validate /Applications/QCut.app
   ```
   All three should succeed.

If anything fails, **do not promote** the rc tag. Roll back the workflow change and investigate.

---

## 5. Future hardening (track separately)

- **App Store Connect API key** to replace `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`. Survives Apple ID owner changes. See [`PROCUREMENT.md` § Future hardening](PROCUREMENT.md#future-hardening-app-store-connect-api-key).
- **Universal binary (x64 + arm64)** if/when Intel Mac support is required again. Currently the `target` is arm64-only.
- **electron-updater signature verification** — already used by default on macOS; document in setup guide.
- **Migrate to a self-hosted Mac runner** if GitHub-hosted runner cost or queue time becomes a problem.
