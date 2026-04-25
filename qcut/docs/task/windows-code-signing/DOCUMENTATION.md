# Windows Code Signing — Documentation Tasks

To meet the issue's "Documentation explains required signing secrets and
release setup" criterion, the following docs land alongside the code
changes. These are written for the **maintainer** (release operator),
not end users.

## New file: `qcut/docs/setup/windows-code-signing.md`

**Audience:** anyone bringing up a new release runner, debugging a failing
release, or rotating Azure credentials.

**Outline:**

```markdown
# Windows Code Signing — Setup Guide

## Prerequisites
- Azure subscription owned by Quriosity.
- A Trusted Signing Account + Certificate Profile (see
  docs/task/windows-code-signing/CERTIFICATE-OPTIONS.md for the procurement
  walkthrough — once procurement is done, that doc becomes a historical
  record and this file is the operational reference).
- A service principal with the
  `Trusted Signing Certificate Profile Signer` role.

## GitHub Actions secrets
The following repository secrets must exist:

| Secret | Source | Example |
|--------|--------|---------|
| AZURE_TENANT_ID | Azure AD tenant of the SP | 00000000-0000-0000-0000-000000000000 |
| AZURE_CLIENT_ID | Service principal app ID | 00000000-0000-0000-0000-000000000000 |
| AZURE_CLIENT_SECRET | Service principal client secret | (rotate every 6 months) |
| AZURE_TRUSTED_SIGNING_ENDPOINT | Region endpoint | https://eus.codesigning.azure.net/ |
| AZURE_TRUSTED_SIGNING_ACCOUNT | Trusted Signing Account name | qcut-signing |
| AZURE_CERTIFICATE_PROFILE | Profile name | qcut-public-trust |
| WINDOWS_PUBLISHER_NAME | Subject CN of the issued cert | Quriosity Pty Ltd |

## Local signed builds
Maintainers with access to the Azure SP can produce a signed installer
locally:

\`\`\`powershell
$env:AZURE_TENANT_ID="..."
$env:AZURE_CLIENT_ID="..."
$env:AZURE_CLIENT_SECRET="..."
$env:AZURE_TRUSTED_SIGNING_ENDPOINT="..."
$env:AZURE_TRUSTED_SIGNING_ACCOUNT="..."
$env:AZURE_CERTIFICATE_PROFILE="..."
$env:WINDOWS_PUBLISHER_NAME="..."
cd qcut
bun run dist:win:release
\`\`\`

For an unsigned local build (no Azure access required), use:
\`\`\`bash
bun run dist:win:unsigned
\`\`\`

## Verifying a signed installer
\`\`\`powershell
signtool verify /pa /v .\dist-electron\QCut*Setup*.exe
Get-AuthenticodeSignature .\dist-electron\QCut*Setup*.exe
\`\`\`

## Troubleshooting
- "Sign error 0x80070002" → Azure SP missing role, re-run role assignment.
- "Publisher mismatch" from verify-windows-signature.ts → WINDOWS_PUBLISHER_NAME
  drifted from the cert subject; update the secret.
- Workflow hangs on signing for >5 min → Trusted Signing endpoint outage,
  check Azure status page; do not bypass signing.

## Rotating the service principal secret
1. Generate a new client secret in Azure portal (App registrations →
   <SP name> → Certificates & secrets).
2. Update `AZURE_CLIENT_SECRET` in repo secrets.
3. Trigger a `*-rc.N` release tag and confirm the workflow succeeds.
4. Delete the old client secret in Azure portal.

## Renewal
Public Trust certificate profiles auto-rotate; no manual renewal. Set a
billing alert in Azure for the Trusted Signing resource.
```

## Modified: `qcut/docs/release.md`

If this file does not exist yet, create it. Add a section near the top:

```markdown
## Prerequisites for Windows releases
Windows release builds **must** be Authenticode-signed. The release
workflow will fail if signing is misconfigured; this is intentional —
do **not** bypass signing to push a release. See
`docs/setup/windows-code-signing.md` for setup and troubleshooting.
```

## Modified: `qcut/CLAUDE.md`

Append a small section under "Architecture Guidelines → DON'T":

```markdown
- Disable Windows code signing in the release workflow (`forceCodeSigning=false`).
  See `docs/setup/windows-code-signing.md`. Local-dev unsigned builds use
  `bun run dist:win:unsigned`.
```

This makes the rule visible to future Claude Code sessions so we do not
silently regress.

## Issue / PR template note (optional, low priority)

If `qcut/.github/PULL_REQUEST_TEMPLATE.md` exists, add a checkbox:

```markdown
- [ ] If touching `release.yml` or `package.json` `build.win`, I have not
      disabled code signing.
```

Skip if the template does not already exist — do not create one just for
this.

## What NOT to document

- **The actual Azure secret values.** Never commit secrets, never include
  example values that look real.
- **End-user "this app is signed" messaging.** SmartScreen rendering is
  Microsoft's surface; we do not control it. Documenting it as a feature
  invites false promises if MSFT changes the dialog.
- **A separate user-facing FAQ entry.** The change is invisible-by-design
  for end users; only release-engineering docs need updates.
