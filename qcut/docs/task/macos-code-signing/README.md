# macOS Code Signing — Task Folder

Plan for signing the macOS `.dmg` / `.zip` / inner `.app` with an Apple
Developer ID and notarizing them through Apple's notary service.

**Decision context:** QCut may go closed-source in the future, so the
team is buying a commercial Apple Developer Program membership rather
than relying on a free OSS path. This makes Mac signing identical
whether QCut stays open or closes.

Sister task: [`docs/task/windows-code-signing/`](../windows-code-signing/).

## Files in this folder

| File | What it covers |
|------|----------------|
| [PLAN.md](PLAN.md) | Overview, subtask map, success criteria, risks. **Start here.** |
| [PROCUREMENT.md](PROCUREMENT.md) | Apple Developer Program enrollment — D-U-N-S, cert generation, App-Specific Password, Team ID. **The user does this manually.** |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Per-subtask engineering detail with file paths and diffs. |
| [TESTING.md](TESTING.md) | Unit + workflow + manual VM verification, with target test file paths. |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Maintainer-facing docs to add/update alongside code. |

Chinese mirrors live alongside as `*.zh-CN.md`.

## Status

- [x] Plan drafted
- [x] Subtask 1: D-U-N-S Number — `893394655` (Quriosity Pty Ltd, 2026-04-25)
- [x] Subtask 2: Apple Developer Program enrolled — Team ID `JQ3Q27U24X`, account holder `zdhpeter@gmail.com` (active 2026-04-30)
- [x] Subtask 3: Developer ID Application certificate generated, imported into login keychain, exported as `.p12` (cert hash `363E778CF99E6C0D76484ECFDEF45927DC7EEE86`)
- [x] Subtask 4: App-Specific Password generated, Team ID captured
- [x] Subtask 5: `electron-builder` `mac.identity` + `mac.notarize: true` wired in `package.json` — see commit `39eb7169d`
- [x] Subtask 6: GitHub Actions `release.yml` `build-macos` job has `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` plumbed; secrets pushed to `Quriosity-agent/qcut` — see commit `3803151ef`
- [x] Subtask 7: `scripts/verify-macos-signature.ts` + `verify:macos-signature` npm script
- [x] ~~Subtask 8~~ Maintainer documentation — partial; PROCUREMENT/IMPLEMENTATION pages cover the setup, but no separate `docs/setup/macos-code-signing.md` written yet
- [ ] Subtask 9: Automated tests for the verify script (deferred)
- [x] Subtask 10: Local dry-run on this Mac (2026-05-01) — DMG mount, drag-to-Applications, double-click launch all succeed; `spctl: accepted, source=Notarized Developer ID`

### Bonus (not in original plan)

- [x] **Custom hdiutil DMG (`scripts/build-mac-dmg.ts`)** to sidestep dmg-builder@26.8.1 dropping the 175 MB Electron Framework binary on macOS Tahoe — see commit `3803151ef` and [memory note](../../../../.claude/projects/-Users-peter-Desktop-code-qcut/memory/dmg_builder_tahoe_bug.md). `mac.target` reduced to `["zip"]`; the DMG is built post-electron-builder via direct `hdiutil create` against the already-signed/notarized/stapled `.app`.

### Still open

- [ ] Recommended: push an RC tag to dry-run the actual `release.yml` `build-macos` job end-to-end on a GitHub-hosted Mac runner — local builds work but the CI path (cert decoded from `CSC_LINK` base64 into a temporary keychain) hasn't been exercised yet.
- [ ] Optional: file an upstream issue at `electron-userland/electron-builder` for the Tahoe DMG bug, with reproduction steps from this task.
