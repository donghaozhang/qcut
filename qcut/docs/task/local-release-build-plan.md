# Local Release Build Plan

## Problem

GitHub hosted macOS runners cost **10x minutes** (1 real minute = 10 billed minutes). With frequent releases (up to 3/day), this burns through the free 2,000 minutes/month quota in under a week.

Current release workflow (`scripts/github-release-workflow.yml`) runs on `windows-latest` only, but adding macOS builds would make costs unsustainable:

| Platform | Multiplier | ~Build Time | Billed Minutes |
|----------|-----------|-------------|----------------|
| macOS    | 10x       | 15 min      | 150 min        |
| Windows  | 2x        | 12 min      | 24 min         |
| Linux    | 1x        | 10 min      | 10 min         |

At 3 releases/day with macOS + Windows: **(150 + 24) x 3 x 30 = 15,660 min/month** — far exceeding the free tier.

---

## Solution Options

### Option 1: Dedicated Build Directory (Recommended for Now)

Fresh `git clone` into a dedicated build directory on each machine. A shell script handles the full release pipeline: clone, install, build, package, upload.

**Pros:**
- Zero cost — runs on hardware you already own
- Works immediately — no infrastructure setup
- Full control over the build environment
- Can build macOS on Mac Mini, Windows on home PC

**Cons:**
- Manual trigger (run a script) instead of push-to-release
- Build environment drift if machines aren't maintained
- No automatic retry on failure
- Relies on machines being available and online

### Option 2: Docker

Containerized builds for reproducibility.

**Pros:**
- Reproducible environment
- Easy to version the build toolchain

**Cons:**
- **Not viable for macOS** — no native macOS Docker containers exist (Docker Desktop on Mac runs Linux containers)
- macOS codesigning requires native Keychain access, which Docker cannot provide
- Electron macOS builds need native `codesign` and `notarytool` binaries
- Would only work for Linux/Windows builds, defeating the main purpose

**Verdict: Not viable for the primary use case (macOS builds).**

### Option 3: GitHub Self-Hosted Runner on Mac Mini (Most Professional, Long-Term)

Register the Mac Mini as a GitHub Actions self-hosted runner. Workflows trigger automatically on tag push, just like hosted runners, but execute locally.

**Pros:**
- Same workflow YAML — just change `runs-on: self-hosted`
- Automatic trigger on tag push (no manual script)
- GitHub UI shows build status, logs, artifacts
- Zero per-minute cost
- Team members can trigger releases without SSH access to build machines

**Cons:**
- Initial setup (~30 min to register runner)
- Mac Mini must stay online and connected
- Security: self-hosted runners on public repos can execute arbitrary code from PRs (mitigated by keeping repo private or using `environment` protection rules)
- Runner process needs to survive reboots (launchd service)

### Option 4: VM Isolation

Run builds inside a macOS VM (Parallels/UTM on Mac, Hyper-V on Windows).

**Pros:**
- Complete isolation from host
- Snapshot/restore for clean builds

**Cons:**
- macOS VMs are slow and finicky (even on Apple Silicon)
- Licensing complexity (macOS VM only legal on Apple hardware)
- Overkill — QCut builds don't need VM-level isolation
- More overhead than any benefit gained

**Verdict: Overkill. The build process is deterministic and doesn't need VM isolation.**

---

## Recommended Approach: Option 1 + Option 3 Hybrid

**Phase 1 (now):** Use Option 1 — a local build script on Mac Mini and Windows PC. Ship releases today with zero cost.

**Phase 2 (when ready):** Migrate to Option 3 — register the Mac Mini as a self-hosted runner. Keep Windows on GitHub hosted runners (2x multiplier is tolerable for occasional builds) or add the Windows PC as a second self-hosted runner if costs matter.

This gives immediate value with a clear upgrade path.

---

## Option 1 Implementation: Local Build Script

### Prerequisites

Both machines need:
- **Git** (with push access to the repo)
- **Bun** (v1.3.10+ per `packageManager` field)
- **Node.js** 20+ (fallback for native modules)
- **GitHub CLI** (`gh`) — authenticated with `gh auth login`
- Platform-specific: Xcode CLI tools (macOS), Visual Studio Build Tools (Windows)

### macOS Build Script (Mac Mini)

Save as `scripts/local-release-mac.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Configuration
REPO="Quriosity-agent/qcut"
BUILD_DIR="$HOME/qcut-builds"
CLONE_DIR="$BUILD_DIR/qcut-$(date +%Y%m%d-%H%M%S)"

echo "=== QCut Local Release Build (macOS) ==="
echo "Build directory: $CLONE_DIR"

# Step 1: Fresh clone
echo "[1/7] Cloning repository..."
mkdir -p "$BUILD_DIR"
git clone --depth 1 "git@github.com:$REPO.git" "$CLONE_DIR"
cd "$CLONE_DIR/qcut"

# Step 2: Install dependencies (frozen lockfile for reproducibility)
echo "[2/7] Installing dependencies..."
bun install --frozen-lockfile

# Step 3: Bump version
echo "[3/7] Bumping version..."
RELEASE_TYPE="${1:-stable}"
bun scripts/release.ts "$RELEASE_TYPE"

# The release script handles: version bump, build, checksums, git tag
# At this point we have:
#   - Built installer in dist-electron/
#   - SHA256SUMS.txt
#   - Git tag created locally

# Step 4: Extract version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Version: v$VERSION"

# Step 5: Push tag to trigger any CI listeners
echo "[4/7] Pushing tag..."
git push origin main
git push origin "v$VERSION"

# Step 6: Upload to GitHub Releases
echo "[5/7] Creating GitHub Release..."
INSTALLER=$(find dist-electron -name "QCut*.dmg" -o -name "QCut*.zip" | head -1)
if [ -z "$INSTALLER" ]; then
    echo "ERROR: No installer found in dist-electron/"
    exit 1
fi

gh release create "v$VERSION" \
    --repo "$REPO" \
    --title "QCut Video Editor v$VERSION" \
    --notes-file dist-electron/RELEASE_NOTES.md \
    "$INSTALLER" \
    dist-electron/SHA256SUMS.txt \
    dist-electron/latest-mac.yml 2>/dev/null || true

echo "[6/7] Verifying release..."
gh release view "v$VERSION" --repo "$REPO"

# Step 7: Cleanup old builds (keep last 5)
echo "[7/7] Cleaning up old builds..."
cd "$BUILD_DIR"
ls -dt qcut-* | tail -n +6 | xargs rm -rf 2>/dev/null || true

echo ""
echo "=== Release v$VERSION published successfully ==="
echo "URL: https://github.com/$REPO/releases/tag/v$VERSION"
```

### Windows Build Script (Home PC)

Save as `scripts/local-release-win.ps1`:

```powershell
$ErrorActionPreference = "Stop"

# Configuration
$REPO = "Quriosity-agent/qcut"
$BUILD_DIR = "$env:USERPROFILE\qcut-builds"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$CLONE_DIR = "$BUILD_DIR\qcut-$TIMESTAMP"

Write-Host "=== QCut Local Release Build (Windows) ===" -ForegroundColor Cyan
Write-Host "Build directory: $CLONE_DIR"

# Step 1: Fresh clone
Write-Host "[1/7] Cloning repository..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BUILD_DIR | Out-Null
git clone --depth 1 "git@github.com:$REPO.git" $CLONE_DIR
Set-Location "$CLONE_DIR\qcut"

# Step 2: Install dependencies
Write-Host "[2/7] Installing dependencies..." -ForegroundColor Yellow
bun install --frozen-lockfile

# Step 3: Run release script (bumps version, builds, generates checksums, tags)
Write-Host "[3/7] Running release..." -ForegroundColor Yellow
$RELEASE_TYPE = if ($args[0]) { $args[0] } else { "stable" }
bun scripts/release.ts $RELEASE_TYPE

# Step 4: Extract version
$VERSION = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "Version: v$VERSION" -ForegroundColor Green

# Step 5: Push
Write-Host "[4/7] Pushing tag..." -ForegroundColor Yellow
git push origin main
git push origin "v$VERSION"

# Step 6: Upload to GitHub Releases
Write-Host "[5/7] Creating GitHub Release..." -ForegroundColor Yellow
$INSTALLER = Get-ChildItem -Path "dist-electron" -Filter "QCut*Setup*.exe" | Select-Object -First 1

if (-not $INSTALLER) {
    Write-Host "ERROR: No installer found in dist-electron/" -ForegroundColor Red
    exit 1
}

$ASSETS = @($INSTALLER.FullName, "dist-electron\SHA256SUMS.txt")
$LATEST_YML = "dist-electron\latest.yml"
if (Test-Path $LATEST_YML) { $ASSETS += $LATEST_YML }

gh release create "v$VERSION" `
    --repo $REPO `
    --title "QCut Video Editor v$VERSION" `
    --notes-file "dist-electron\RELEASE_NOTES.md" `
    @ASSETS

# Step 7: Verify
Write-Host "[6/7] Verifying release..." -ForegroundColor Yellow
gh release view "v$VERSION" --repo $REPO

# Step 8: Cleanup old builds (keep last 5)
Write-Host "[7/7] Cleaning up old builds..." -ForegroundColor Yellow
Get-ChildItem -Path $BUILD_DIR -Directory -Filter "qcut-*" |
    Sort-Object CreationTime -Descending |
    Select-Object -Skip 5 |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Release v$VERSION published successfully ===" -ForegroundColor Green
Write-Host "URL: https://github.com/$REPO/releases/tag/v$VERSION"
```

### Build Steps Breakdown

The existing `bun scripts/release.ts` already handles the core pipeline:

1. **Check git status** — ensures clean working directory
2. **Bump version** — date-based `YYYY.MM.DD.N` format (e.g., `2026.03.03.1`)
3. **Generate release doc** — `docs/releases/vX.X.X.X.md`
4. **Build web app** — `bun run build` (Vite + TanStack Router + Electron TypeScript)
5. **Build Electron app** — platform-detected:
   - macOS: `bun run stage-ffmpeg-binaries && bun run stage-aicp-binaries && electron-builder --mac --publish never`
   - Windows: `bun run dist:win:release` (includes `compile-afterpack`, staging, electron-builder with unsigned config)
6. **Generate checksums** — SHA256 of installer files
7. **Create git tag** — `v2026.03.03.1`
8. **Generate release notes** — template in `dist-electron/RELEASE_NOTES.md`

The local build scripts then add:
- Push tag + commit to remote
- Upload artifacts to GitHub Releases via `gh release create`
- Cleanup old build directories

### Version Bumping

QCut uses date-based versioning: `YYYY.MM.DD.N`

- First release of the day: `2026.03.03.1`
- Second release same day: `2026.03.03.2`
- Pre-release channels: `2026.03.03.1-alpha.1`, `2026.03.03.1-beta.1`, `2026.03.03.1-rc.1`
- Promote: `2026.03.03.1-rc.2` → `2026.03.03.1`

All handled by `scripts/release.ts`. Pass the channel as an argument:
```bash
bun scripts/release.ts          # stable
bun scripts/release.ts alpha    # alpha pre-release
bun scripts/release.ts beta     # beta
bun scripts/release.ts rc       # release candidate
bun scripts/release.ts promote  # promote rc to stable
```

### Code Signing Considerations

**macOS:**
- Currently unsigned (`--publish never`, no signing config in electron-builder)
- To add signing: set `CSC_LINK` (p12 cert) and `CSC_KEY_PASSWORD` env vars before build
- Notarization: set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- These are local env vars on the Mac Mini — no secrets in the repo

**Windows:**
- Currently unsigned (`forceCodeSigning=false`, `verifyUpdateCodeSignature=false`)
- SmartScreen warning is expected and documented in release notes
- To add signing later: purchase an EV code signing certificate, set `CSC_LINK` + `CSC_KEY_PASSWORD`

### Verifying Build Matches CI Output

1. **Checksums**: Both local and CI builds generate `SHA256SUMS.txt`. Compare hashes.
2. **Version**: `package.json` version should match the git tag and installer filename.
3. **Contents**: Run `dist:dir` (unpacked build) and diff the file listing against CI artifacts.
4. **Smoke test**: Install the locally-built artifact and verify:
   - App launches
   - Version shown in About matches
   - FFmpeg operations work (import a video, export a clip)
   - Auto-updater `latest.yml` / `latest-mac.yml` is present

---

## Option 3 Implementation: Self-Hosted Runner Setup

### Step 1: Register Mac Mini as a GitHub Self-Hosted Runner

```bash
# On the Mac Mini:

# 1. Create a directory for the runner
mkdir -p ~/actions-runner && cd ~/actions-runner

# 2. Download the latest runner package (check GitHub for current URL)
curl -o actions-runner-osx-arm64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-osx-arm64-2.321.0.tar.gz

# 3. Extract
tar xzf actions-runner-osx-arm64.tar.gz

# 4. Configure — this will prompt for the repo URL and a registration token
#    Get the token from: GitHub repo → Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/Quriosity-agent/qcut --token YOUR_TOKEN_HERE

# 5. Install as a launchd service (survives reboots)
sudo ./svc.sh install
sudo ./svc.sh start

# 6. Verify it's running
sudo ./svc.sh status
```

### Step 2: Workflow Changes

Update the release workflow to use self-hosted for macOS, keep GitHub-hosted for Windows:

```yaml
name: Release Build

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build-mac:
    runs-on: [self-hosted, macOS]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        run: |
          export BUN_INSTALL="$HOME/.bun"
          export PATH="$BUN_INSTALL/bin:$PATH"
          bun --version

      - name: Install dependencies
        run: bun install --frozen-lockfile
        working-directory: qcut

      - name: Build
        run: bun run build
        working-directory: qcut

      - name: Package macOS
        run: bun run dist:mac
        working-directory: qcut

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mac-installer
          path: |
            qcut/dist-electron/*.dmg
            qcut/dist-electron/*.zip
            qcut/dist-electron/latest-mac.yml
            qcut/dist-electron/SHA256SUMS.txt

  build-win:
    runs-on: windows-latest  # Keep on GitHub-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: bun install
        working-directory: qcut
      - name: Build
        run: bun run build
        working-directory: qcut
      - name: Package Windows
        run: bun run dist:win:release
        working-directory: qcut
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: win-installer
          path: |
            qcut/dist-electron/*Setup*.exe
            qcut/dist-electron/latest.yml

  release:
    needs: [build-mac, build-win]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            mac-installer/*
            win-installer/*
```

### Step 3: Security Considerations

- **Private repos**: Self-hosted runners are safe. Workflows only run on trusted code.
- **Public repos**: Risk — anyone can open a PR that runs arbitrary code on your Mac Mini.
  - Mitigate with: `environment` protection rules requiring approval, or keep the repo private.
  - Alternatively, only trigger self-hosted jobs on tag pushes (not PRs). The workflow above does this since it triggers on `push: tags`.
- **Secrets**: Store code signing certs, API keys as GitHub Actions secrets or as local env vars on the runner machine. Prefer local env vars for signing certs to avoid them ever touching GitHub's infrastructure.

### Step 4: Cleanup Between Builds

Self-hosted runners don't auto-clean like hosted runners. Add cleanup steps:

```yaml
      - name: Pre-build cleanup
        run: |
          rm -rf node_modules/.cache
          rm -rf qcut/dist-electron
          rm -rf qcut/dist
          git clean -fdx -e node_modules
```

Or configure the runner with `--ephemeral` flag for single-use mode (re-registers after each job, slower but cleaner).

### Step 5: Keep Windows on GitHub Hosted

Windows hosted runners use a 2x multiplier. At 12 min build time × 2x = 24 billed min per release. At 3 releases/day: 24 × 3 × 30 = **2,160 min/month** — slightly over free tier but manageable. If costs matter, add the Windows PC as a second self-hosted runner using the same process (download the Windows runner package from GitHub).

---

## Cost Analysis

### Current: All GitHub Hosted

| Platform | Build Time | Multiplier | Billed/Build | 3/day × 30 days |
|----------|-----------|------------|--------------|-----------------|
| macOS    | 15 min    | 10x        | 150 min      | 13,500 min      |
| Windows  | 12 min    | 2x         | 24 min       | 2,160 min       |
| **Total** |          |            | **174 min**  | **15,660 min**  |

Free tier: 2,000 min/month. **Overage: 13,660 min → ~$545/month** at $0.04/min.

### After: Self-Hosted Mac + GitHub Windows

| Platform | Build Time | Multiplier | Billed/Build | 3/day × 30 days |
|----------|-----------|------------|--------------|-----------------|
| macOS    | 15 min    | **0x** (self-hosted) | 0 min  | 0 min          |
| Windows  | 12 min    | 2x         | 24 min       | 2,160 min       |
| **Total** |          |            | **24 min**   | **2,160 min**   |

**Monthly savings: ~13,500 minutes (86% reduction)**. Windows stays slightly over free tier; add Windows as self-hosted to hit **$0/month**.

### After: Both Self-Hosted

| Platform | Cost/Month |
|----------|-----------|
| macOS    | $0 (Mac Mini already owned) |
| Windows  | $0 (Home PC already owned)  |
| Electricity | ~$5-10 (Mac Mini idle power) |
| **Total** | **~$5-10/month** |

---

## Data Safety

The build process is completely isolated from user data. Here's why:

### What the build touches

- Source code (fresh git clone or CI checkout)
- `node_modules/` (npm/bun dependencies)
- `dist/` and `dist-electron/` (build output)
- Temporary build artifacts in the build directory

### What the build NEVER touches

| User Data Location | Purpose | Risk |
|-------------------|---------|------|
| `~/Library/Application Support/QCut/` (macOS) | User projects, settings, cache | **None** — build doesn't read or write here |
| `%APPDATA%/QCut/` (Windows) | User projects, settings, cache | **None** |
| `~/.qcut/.env` | API keys, environment secrets | **None** — build uses its own env vars |
| Timeline data, media files | User content | **None** — stored in Application Support |
| IndexedDB / localStorage | Editor state | **None** — lives in Electron's user data dir |

### Why it's safe

1. **Fresh clone**: Option 1 clones into a dedicated `~/qcut-builds/` directory. It never `cd`s into your development workspace.
2. **No runtime execution**: The build compiles and packages the app. It does NOT launch QCut or access any Electron user data directories.
3. **electron-builder isolation**: `electron-builder` reads `package.json` build config and outputs to `dist-electron/`. It has no concept of user data.
4. **Self-hosted runner**: The runner operates in `~/actions-runner/_work/`. Completely separate from any QCut installation or user data.

Even if a build fails catastrophically, the worst case is a corrupted build directory — `rm -rf` and rebuild. No user data is at risk.
