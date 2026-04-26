# macOS Code Signing — Documentation Tasks

Maintainer-facing docs to land alongside the code.

## New file: `qcut/docs/setup/macos-code-signing.md`

**Audience:** anyone bringing up a new release runner, debugging a
failing release, or rotating Apple credentials.

**Outline:**

```markdown
# macOS Code Signing — Setup Guide

## Apple Developer Program
- Membership tier: **Organization**, USD 99/yr.
- Apple ID: an org-shared inbox (e.g. `apple-dev@qcut.app`); never a personal email.
- 2FA: enabled on multiple trusted devices. Apple does NOT remove 2FA.
- Team ID: stored as GitHub variable `APPLE_TEAM_ID`.
- Membership renewal: auto-renews. **Set a billing alert** on the Apple ID — if renewal fails, ALL signing breaks within ~30 days.
- D-U-N-S Number: see `docs/task/macos-code-signing/PROCUREMENT.md`.

## GitHub Actions secrets / variables

| Name | Type | Source |
|------|------|--------|
| MAC_CSC_LINK | secret | base64 of `quriosity-developer-id.p12` (kept in 1Password) |
| MAC_CSC_KEY_PASSWORD | secret | the .p12 export password (1Password) |
| APPLE_ID | secret | the org Apple ID email |
| APPLE_APP_SPECIFIC_PASSWORD | secret | from appleid.apple.com → App-Specific Passwords |
| APPLE_TEAM_ID | variable | 10-char Team ID from developer.apple.com → Membership Details |

## Local signed builds
With cert in your local keychain and env vars set:

\`\`\`bash
cd qcut && \
  APPLE_ID="apple-dev@qcut.app" \
  APPLE_APP_SPECIFIC_PASSWORD="..." \
  APPLE_TEAM_ID="ABCDE12345" \
  bun run dist:mac
\`\`\`

> Bash applies the `VAR=value` prefix only to the **first** command in the
> chain. Putting the assignments before `cd qcut && bun run dist:mac` would
> scope them to `cd` and lose them by the time `bun run` starts — keep the
> assignments after the `&&` so they reach `bun run dist:mac`.

If the cert is NOT in your keychain, also set CSC_LINK + CSC_KEY_PASSWORD.

## Verifying a signed installer
\`\`\`bash
codesign --verify --deep --strict --verbose=2 /Applications/QCut.app
spctl -a -t exec -vv /Applications/QCut.app
xcrun stapler validate ~/Downloads/QCut*.dmg
\`\`\`

Expected:
- `codesign` exits 0 silently.
- `spctl` prints `accepted` and `source=Notarized Developer ID`.
- `xcrun stapler validate` prints `The validate action worked!`.

## Troubleshooting

### "User interaction is not allowed" during signing
The build is trying to use a login keychain on a CI runner. Ensure
`CSC_LINK` and `CSC_KEY_PASSWORD` are set so a temporary keychain is
created.

### "errSecInternalComponent"
The keychain is locked or the password was wrong. Verify
`CSC_KEY_PASSWORD` matches the .p12 export password from §3.3 of the
PROCUREMENT doc.

### Notarization status "Invalid"
Apple's notary rejected the bundle. Get the detailed log:

\`\`\`bash
xcrun notarytool log <submission-id> \
  --apple-id <APPLE_ID> \
  --password <APPLE_APP_SPECIFIC_PASSWORD> \
  --team-id <APPLE_TEAM_ID>
\`\`\`

Most common cause: a nested binary (FFmpeg, AICP) is unsigned or has
mismatched/missing entitlements. Re-sign or update entitlements and
retry.

### Stapling fails but notarization succeeded
Known issue with offline machines or transient Apple-side flakes.
Staple manually:

\`\`\`bash
xcrun stapler staple /path/to/QCut.dmg
\`\`\`

### Gatekeeper blocks the app despite signing
Check whether the app is *actually* notarized:
\`\`\`bash
spctl -a -t exec -vv /Applications/QCut.app
\`\`\`

If output says `signed Developer ID` (without "Notarized") the bundle
was signed but notarization failed silently. Check the build log.

## Rotating credentials

### App-Specific Password
1. Sign into appleid.apple.com → App-Specific Passwords.
2. Revoke the old one.
3. Generate a new one labeled `QCut release notarization` (date suffix optional).
4. Update GitHub secret `APPLE_APP_SPECIFIC_PASSWORD`.
5. Trigger a `*-rc.N` release tag and confirm the workflow succeeds.

### Cert (.p12)
1. Generate a new Developer ID Application cert in developer.apple.com.
2. Export as .p12 with private key (see PROCUREMENT.md §3.3).
3. base64-encode and update `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD`.
4. The old cert remains valid for already-signed builds; do not revoke unless compromised.

### Apple ID owner change
1. Invite the new owner to the team in App Store Connect.
2. Transfer ownership.
3. Update `APPLE_ID` GitHub secret.
4. Generate a new App-Specific Password under the new account.
5. Update `APPLE_APP_SPECIFIC_PASSWORD`.

## Renewal
Apple Developer Program: USD 99/yr, auto-renews. **Confirm the billing
card in the Apple ID account is current** every 6 months. If renewal
fails, ALL signing breaks within ~30 days.
```

## Modified: `qcut/docs/release.md`

Add a section near the top (or merge with the Windows signing section if both exist):

```markdown
## Prerequisites for macOS releases
macOS releases must be signed by Quriosity's Developer ID Application
certificate AND notarized by Apple. The release workflow will fail if
either step fails — do not bypass. See
`docs/setup/macos-code-signing.md` for credential setup and rotation.
```

## Modified: `qcut/CLAUDE.md`

Append under "Architecture Guidelines → DON'T":

```markdown
- Disable macOS code signing or notarization in the release workflow.
  See `docs/setup/macos-code-signing.md`. Local-dev unsigned builds use
  `bun run dist:mac` without the Apple env vars set.
```

This makes the rule visible to future Claude Code sessions so we do not
silently regress.

## Optional: PR template note

If `qcut/.github/PULL_REQUEST_TEMPLATE.md` exists, add a checkbox:

```markdown
- [ ] If touching `release.yml` build-macos job or `package.json` `build.mac`,
      I have not disabled code signing or notarization.
```

Skip if no template exists yet — do not create one solely for this.

## What NOT to document

- Actual values of any secret/variable.
- Step-by-step "how Gatekeeper works" — Apple's docs cover this.
- Mac App Store submission — different cert, different review, separate task.
- iOS distribution — out of scope.
