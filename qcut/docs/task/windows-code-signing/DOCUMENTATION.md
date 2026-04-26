# Windows Code Signing — Documentation Tasks

Maintainer-facing docs to land alongside the code, plus user-facing
download-page copy to mitigate first-run SmartScreen friction.

## New file: `qcut/docs/setup/windows-code-signing.md`

**Audience:** anyone bringing up a new release machine, debugging a
failing release, or rotating Certum credentials.

**Outline:**

```markdown
# Windows Code Signing — Setup Guide

## Certificate Vendor
- Provider: **Certum SimplySign** (https://shop.certum.eu/)
- Product: Standard Code Signing in Cloud (NOT the USB token version)
- Tier: Organization
- Cert subject: `Quriosity Pty Ltd`
- Cost: ~USD 200/year (€189/year). Annual renewal mandatory under 2026 CA/B Forum rules (max 460-day validity).

## GitHub repo settings
We do NOT store any signing credentials in GitHub Actions. Signing happens
on a maintainer's local Windows machine after CI builds an unsigned
artifact. See `docs/task/windows-code-signing/IMPLEMENTATION.md` for the
architecture rationale.

The only Windows-related repo setting:

| Name | Type | Value |
|------|------|-------|
| WINDOWS_PUBLISHER_NAME | variable | "Quriosity Pty Ltd" — used by `verify:win-signature` to assert the cert subject |

## Local signing machine setup
On the dedicated Windows signing machine (or a Windows VM if maintainer is on macOS):

1. **Install SimplySign mobile app** on phone (iOS/Android) and pair with Certum account.
2. **Install SimplySign desktop signing tool** from https://www.certum.eu/en/cert_expert_simply_sign/.
3. **Install Windows SDK signtool** via `winget install --id Microsoft.WindowsSDK`.
4. **Authenticate desktop tool** by scanning QR code on phone.
5. **Find the cert SHA1 thumbprint** with `certutil`:
   \`\`\`powershell
   certutil -store -user My
   \`\`\`
   Look for the Windows Authenticode code-signing entry whose `Subject` (CN) is `Quriosity Pty Ltd` — copy the SHA1 thumbprint (40 hex chars). (`Developer ID Application` is the Apple naming convention; do not look for it on Windows.)
6. **Set environment variable**:
   \`\`\`powershell
   [Environment]::SetEnvironmentVariable("QCUT_WIN_CERT_THUMBPRINT", "<thumbprint>", "User")
   \`\`\`

## Per-release signing workflow

\`\`\`bash
# 1. Wait for CI to finish (build-windows job)
# 2. Download the windows-build-unsigned artifact
# 3. Place QCut*Setup*.exe and latest.yml into qcut/dist-electron/
cd qcut
bun run sign:win
# 4. Approve signing on your phone (SimplySign app push notification, ~30 sec)
# 5. Verify
bun run verify:win-signature
# 6. Manually upload signed .exe + latest.yml to the GitHub Release page
\`\`\`

## Verifying a signed installer

\`\`\`powershell
# On any Windows machine:
signtool verify /pa /v .\QCut*Setup*.exe
Get-AuthenticodeSignature .\QCut*Setup*.exe
\`\`\`

Expected:
- `signtool verify` exits 0 with "Successfully verified".
- `Get-AuthenticodeSignature` reports `Status: Valid` and `SignerCertificate.Subject` containing "CN=Quriosity Pty Ltd".

## Troubleshooting

### `signtool: error 0x80092004 — Cannot find object or property`
The cert thumbprint is not findable in the user's certificate store. Check:
- SimplySign desktop tool is running and authenticated (the cert appears only when the tool exposes the Cloud HSM identity).
- `QCUT_WIN_CERT_THUMBPRINT` matches the actual thumbprint from `certutil -store -user My`.

### Phone never receives push notification
- SimplySign app needs internet on phone.
- Re-authenticate the desktop tool — sometimes the SimplySign session expires after hours of inactivity.

### `signtool sign` succeeds but `signtool verify` fails
- Timestamp service may have failed silently. Re-sign with a different `/tr` URL (alternatives: `http://timestamp.digicert.com`, `http://timestamp.sectigo.com` — HTTP-only per vendor specification; DigiCert and Sectigo do not offer HTTPS endpoints for the RFC3161 `/tr` interface, and signtool accepts both for the response-signed timestamp protocol).

### SmartScreen still warns users on signed installer
This is **expected** for the first hundreds-thousands of downloads of a new build. SmartScreen reputation is per file hash and accumulates over time. See `docs/task/windows-code-signing/CERTIFICATE-OPTIONS.md` § "SmartScreen reputation reality" for full context.

## Rotating credentials

### Cert renewal (annual)
1. Pay renewal at shop.certum.eu before expiry.
2. Re-do identity validation (Certum may shortcut this if nothing changed).
3. New cert is issued under same SimplySign account; new thumbprint.
4. Update `QCUT_WIN_CERT_THUMBPRINT` on signing machine.
5. Old signed builds remain valid (timestamp counter-signed).

### Adding a second team member
1. Add new user under Certum organization.
2. They install SimplySign app + desktop tool with their own credentials.
3. Both Donghao and the new member can now approve signings — useful for vacation coverage.

## Renewal calendar
Set a calendar reminder **60 days before cert expiry**. The Certum dashboard shows expiry date.
```

## Modified: `qcut/docs/release.md`

Add (or merge with the macOS signing section):

```markdown
## Prerequisites for Windows releases
Windows releases must be signed by Quriosity's Certum-issued Authenticode
certificate. **Signing is a manual step** that happens on a maintainer's
local machine after CI builds the unsigned artifact — see
`docs/setup/windows-code-signing.md` for the per-release workflow.

This is intentional: Certum SimplySign requires phone-based approval per
signing operation, which cannot be automated in GitHub Actions. The
tradeoff was deliberate (cost vs. automation); see
`docs/task/windows-code-signing/CERTIFICATE-OPTIONS.md`.
```

## Modified: `qcut/CLAUDE.md`

Append under "Architecture Guidelines → DON'T":

```markdown
- Auto-attach unsigned Windows `.exe` to GitHub Releases. Windows artifacts
  must be signed manually before publishing — see
  `docs/setup/windows-code-signing.md`. The Windows job intentionally
  produces a `windows-build-unsigned` artifact, NOT a published Release file.
```

This makes the constraint visible to future Claude Code sessions.

## Windows download-page user-facing copy

QCut's Windows download page (whatever route, e.g. `qcut.app/download`)
should include this paragraph near the Windows download button. This is
**user-facing**, written for end users, not maintainers.

### English version

> 💡 **First time installing? You may see a Windows security warning.**
>
> When you run `QCut.AI.Video.Editor-Setup.exe`, Windows SmartScreen may
> show "Windows protected your PC" — this is normal for new software
> versions, even after we've signed our installer.
>
> 1. Click **More info** in the warning dialog.
> 2. Confirm the publisher shown is **Quriosity Pty Ltd** — that's us.
> 3. Click **Run anyway**.
>
> The Windows User Account Control prompt that follows should also show
> **"Verified publisher: Quriosity Pty Ltd"** — you can safely click Yes.

### Chinese version

> 💡 **首次安装时可能出现 Windows 安全警告。**
>
> 运行 `QCut.AI.Video.Editor-Setup.exe` 时，Windows SmartScreen 可能弹
> "Windows protected your PC" — 这对新版本软件是正常现象，即使我们已签名。
>
> 1. 点弹窗里的 **More info（更多信息）**。
> 2. 确认发布者显示为 **Quriosity Pty Ltd** — 就是我们。
> 3. 点 **Run anyway（仍然运行）**。
>
> 接下来的 Windows 用户账户控制弹窗会显示 **"Verified publisher: Quriosity Pty Ltd"** — 可以放心点"是"。

### Why this copy matters

Without this guidance, the user from the Unblock-File screenshot
(captured 2026-04 — see conversation history) had to use a separate AI
agent to figure out PowerShell to install QCut. Each user who hits this
without guidance is likely to abandon. The copy is free to add and
immediately reduces abandonment in the SmartScreen-warning window
(roughly the first ~hundreds of installs after each release).

## What NOT to document

- Actual SHA1 thumbprint of the cert — sensitive, lives only in `QCUT_WIN_CERT_THUMBPRINT` on signing machine and Certum dashboard.
- Step-by-step "how SmartScreen works internally" — Microsoft's docs cover this.
- Microsoft Store submission — different cert path, separate task.
- iOS / mobile distribution — out of scope.
