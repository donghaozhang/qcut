# Local Release Build Plan

## Status: Implemented (Option 3 — Self-Hosted Runner)

**Completed 2026-03-03.** The Mac Mini (`qcut-mac-peters-mac-mini`) is registered as a GitHub self-hosted runner. macOS release builds now run locally at zero cost, triggered automatically on tag push.

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | Release workflow with `vars.USE_SELF_HOSTED_MAC` toggle |
| `scripts/setup-self-hosted-runner.sh` | Runner registration & launchd setup script |
| `~/actions-runner/` | Runner installation directory on Mac Mini |

---

## Problem

GitHub hosted macOS runners cost **10x minutes** (1 real minute = 10 billed minutes). With frequent releases (up to 3/day), this burns through the free 2,000 minutes/month quota in under a week.

| Platform | Multiplier | ~Build Time | Billed Minutes |
|----------|-----------|-------------|----------------|
| macOS    | 10x       | 15 min      | 150 min        |
| Windows  | 2x        | 12 min      | 24 min         |
| Linux    | 1x        | 10 min      | 10 min         |

At 3 releases/day with macOS + Windows: **(150 + 24) x 3 x 30 = 15,660 min/month** — far exceeding the free tier.

---

## Solution: Self-Hosted Runner on Mac Mini

The Mac Mini is registered as a GitHub Actions self-hosted runner. The release workflow (`release.yml`) uses a repo variable toggle to route macOS builds to the self-hosted runner while keeping Windows/Linux on GitHub-hosted runners.

### How It Works

1. Push a `v*` tag (e.g., `git push origin v2026.03.03.1`)
2. GitHub Actions triggers the Release workflow
3. `build-macos` job routes to the Mac Mini via `vars.USE_SELF_HOSTED_MAC`
4. Windows and Linux jobs run on GitHub-hosted runners as before
5. All artifacts are collected and published as a GitHub Release

### Workflow Toggle

The `build-macos` job in `.github/workflows/release.yml` uses:

```yaml
runs-on: ${{ vars.USE_SELF_HOSTED_MAC == 'true' && fromJSON('["self-hosted", "macOS", "ARM64"]') || 'macos-latest' }}
```

When `USE_SELF_HOSTED_MAC=true`:
- Skips `oven-sh/setup-bun` (Bun pre-installed on Mac Mini)
- Skips `actions/cache` steps (local disk persists)
- Adds pre-build cleanup to remove stale artifacts
- Adds Bun/Node version verification step

When `USE_SELF_HOSTED_MAC` is unset or `false`:
- Falls back to `macos-latest` (GitHub-hosted)
- Standard setup-bun and cache steps run

### Runner Details

| Property | Value |
|----------|-------|
| Name | `qcut-mac-peters-mac-mini` |
| Labels | `self-hosted`, `macOS`, `ARM64` |
| Install dir | `~/actions-runner/` |
| Work dir | `~/actions-runner/_work/` |
| Service | launchd (auto-starts on boot) |
| PATH config | `~/actions-runner/.env` (Bun + Node + Homebrew) |

### Management Commands

```bash
~/actions-runner/svc.sh status     # Check status
~/actions-runner/svc.sh stop       # Stop runner
~/actions-runner/svc.sh start      # Start runner
~/actions-runner/svc.sh uninstall  # Remove service
```

### Enable/Disable

```bash
# Enable self-hosted macOS builds
gh variable set USE_SELF_HOSTED_MAC --body "true" --repo Quriosity-agent/qcut

# Disable (fall back to GitHub-hosted)
gh variable set USE_SELF_HOSTED_MAC --body "false" --repo Quriosity-agent/qcut
```

---

## Workflow Changes Made

### Removed: ImageMagick Icon Generation

The macOS build job previously installed ImageMagick via Homebrew and regenerated `build/icon.icns` from `build/icon.ico` every run. Since `icon.icns` is already committed to the repo, this step was redundant and has been removed. This benefits both hosted and self-hosted builds.

### Added: Conditional Steps for Self-Hosted

Steps gated on `vars.USE_SELF_HOSTED_MAC == 'true'`:

```yaml
# Clean stale artifacts (self-hosted only)
- name: Clean previous build artifacts
  if: ${{ vars.USE_SELF_HOSTED_MAC == 'true' }}
  run: |
    rm -rf dist-electron dist apps/web/dist
    git clean -fdx -e node_modules -e .bun

# Verify toolchain (self-hosted only)
- name: Verify Bun (self-hosted)
  if: ${{ vars.USE_SELF_HOSTED_MAC == 'true' }}
  run: |
    echo "Bun: $(bun --version)"
    echo "Node: $(node --version)"
```

Steps skipped on self-hosted:
- `oven-sh/setup-bun` — Bun pre-installed, PATH set via `.env`
- `actions/cache` (Bun modules) — local disk persists
- `actions/cache` (Electron binary) — `~/Library/Caches/electron` persists

---

## Setup Script

`scripts/setup-self-hosted-runner.sh` automates the full registration:

1. Checks prerequisites (ARM64, Bun, Node, Git)
2. Downloads GitHub Actions runner
3. Configures with registration token
4. Creates `.env` with PATH for launchd context
5. Installs as launchd service

Usage:
```bash
chmod +x scripts/setup-self-hosted-runner.sh
./scripts/setup-self-hosted-runner.sh
```

### launchd PATH Note

launchd services don't source shell profiles (`.zshrc`, `.bash_profile`). The runner loads `~/actions-runner/.env` at startup, which must include Bun and Node on PATH:

```
PATH=/Users/peter/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

---

## Cost Analysis

### Before: All GitHub Hosted

| Platform | Build Time | Multiplier | Billed/Build | 3/day x 30 days |
|----------|-----------|------------|--------------|-----------------|
| macOS    | 15 min    | 10x        | 150 min      | 13,500 min      |
| Windows  | 12 min    | 2x         | 24 min       | 2,160 min       |
| **Total** |          |            | **174 min**  | **15,660 min**  |

Free tier: 2,000 min/month. **Overage: 13,660 min -> ~$545/month** at $0.04/min.

### After: Self-Hosted Mac + GitHub Windows/Linux

| Platform | Build Time | Multiplier | Billed/Build | 3/day x 30 days |
|----------|-----------|------------|--------------|-----------------|
| macOS    | 15 min    | **0x** (self-hosted) | 0 min  | 0 min          |
| Windows  | 12 min    | 2x         | 24 min       | 2,160 min       |
| Linux    | 10 min    | 1x         | 10 min       | 900 min         |
| **Total** |          |            | **34 min**   | **3,060 min**   |

**Monthly savings: ~12,600 minutes (81% reduction)**. Fits within or near the free tier.

### Future: Both Self-Hosted

| Platform | Cost/Month |
|----------|-----------|
| macOS    | $0 (Mac Mini already owned) |
| Windows  | $0 (Home PC as second runner) |
| Electricity | ~$5-10 (Mac Mini idle power) |
| **Total** | **~$5-10/month** |

---

## Security

- **Tag-only trigger**: The workflow only runs on `push: tags: v*`, not on PRs. Self-hosted runners never execute untrusted fork code.
- **Secrets**: `secrets.GITHUB_TOKEN` is injected per-job by GitHub, not stored on the runner.
- **Code signing certs**: When added, store as local env vars on the Mac Mini (not in GitHub Secrets) to avoid them touching GitHub's infrastructure.

---

## Data Safety

The build process is completely isolated from user data.

### What the build touches

- Source code (CI checkout into `~/actions-runner/_work/`)
- `node_modules/` (bun dependencies)
- `dist/` and `dist-electron/` (build output)

### What the build NEVER touches

| User Data Location | Purpose | Risk |
|-------------------|---------|------|
| `~/Library/Application Support/QCut/` | User projects, settings, cache | **None** |
| `~/.qcut/.env` | API keys, environment secrets | **None** |
| Timeline data, media files | User content | **None** |
| IndexedDB / localStorage | Editor state | **None** |

The runner operates in `~/actions-runner/_work/`. Even a catastrophic build failure only corrupts the work directory — `rm -rf` and rebuild. No user data is at risk.

---

## Reference: Build Pipeline

The existing `scripts/release.ts` handles the core pipeline:

1. **Check git status** — ensures clean working directory
2. **Bump version** — date-based `YYYY.MM.DD.N` format
3. **Generate release doc** — `docs/releases/vX.X.X.X.md`
4. **Build web app** — `bun run build`
5. **Build Electron app** — platform-detected (`electron-builder --mac`)
6. **Generate checksums** — SHA256 of installer files
7. **Create git tag** — `v2026.03.03.1`
8. **Generate release notes** — `dist-electron/RELEASE_NOTES.md`

### Version Bumping

QCut uses date-based versioning: `YYYY.MM.DD.N`

```bash
bun scripts/release.ts          # stable (2026.03.03.1)
bun scripts/release.ts alpha    # alpha pre-release
bun scripts/release.ts beta     # beta
bun scripts/release.ts rc       # release candidate
bun scripts/release.ts promote  # promote rc to stable
```

### Code Signing

**macOS** — currently unsigned. To add:
- Set `CSC_LINK` (p12 cert) and `CSC_KEY_PASSWORD` as local env vars on Mac Mini
- Notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

**Windows** — currently unsigned (`forceCodeSigning=false`). SmartScreen warning expected.
