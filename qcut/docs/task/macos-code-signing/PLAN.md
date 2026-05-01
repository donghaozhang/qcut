# macOS Code Signing & Notarization — Plan

**Branch:** `gpt-image-2`
**Created:** 2026-04-25

## Goal

Sign and notarize the QCut macOS distribution (`.dmg`, `.zip`, inner
`.app`) so:

1. Gatekeeper does not block first launch with "QCut.app cannot be
   opened because the developer cannot be verified".
2. Right-click → Open is not required.
3. The verified developer name "Quriosity Pty Ltd" appears in the
   security prompt.

The verified team-decision is to **buy a commercial cert** (not use any
free path) because QCut may close-source later. Apple Developer Program
covers both worlds — works whether QCut stays open or closes.

## What you are buying

**Apple Developer Program — Organization tier, USD 99/year.**

That single membership covers:

- Mac + iOS development (we only use Mac).
- **Unlimited certificates** — Apple does *not* charge per cert.
- **Notarization** — Apple's malware-scanning service, included free.
- Adding additional team members later, at no extra cost.

Per-platform comparison:

| Platform | Vendor | Annual cost | What you get |
|----------|--------|-------------|--------------|
| **Mac** | Apple | $99 | Unlimited Developer ID certs + notarization + iOS access |
| **Windows** | Certum SimplySign (OV) | ~$200 | Cloud-HSM Authenticode cert with phone-approval signing — see [windows-code-signing/CERTIFICATE-OPTIONS.md](../windows-code-signing/CERTIFICATE-OPTIONS.md) |
| **Total** | | **~$299/yr** | Both platforms covered |

## Subtask map

| # | Subtask | Code? | Wall time | Detail |
|---|---------|-------|-----------|--------|
| 1 | Look up / request D-U-N-S Number for Quriosity | No | 5 min lookup; 5–14 days if requesting | [PROCUREMENT.md §1](PROCUREMENT.md#1-d-u-n-s-number) |
| 2 | Apple Developer Program enrollment (Organization) | No | 30 min submit + 1–2 days verification | [PROCUREMENT.md §2](PROCUREMENT.md#2-apple-developer-program-enrollment) |
| 3 | Generate Developer ID Application cert, export .p12 | No | 15 min | [PROCUREMENT.md §3](PROCUREMENT.md#3-developer-id-application-certificate) |
| 4 | App-Specific Password + capture Team ID | No | 5 min | [PROCUREMENT.md §4](PROCUREMENT.md#4-app-specific-password-and-team-id) |
| 5 | Update `electron-builder` mac config | Yes | 30 min | [IMPLEMENTATION.md §1](IMPLEMENTATION.md#1-update-electron-builder-mac-config) |
| 6 | Update GitHub Actions mac job | Yes | 30 min | [IMPLEMENTATION.md §2](IMPLEMENTATION.md#2-update-github-actions-release-workflow) |
| 7 | Post-build signature + notarization verifier | Yes | 1 hr | [IMPLEMENTATION.md §3](IMPLEMENTATION.md#3-add-signaturenotarization-verifier) |
| 8 | Documentation | Yes (docs) | 45 min | [DOCUMENTATION.md](DOCUMENTATION.md) |
| 9 | Tests | Yes | 1 hr | [TESTING.md](TESTING.md) |
| 10 | Dry-run release on clean macOS VM | No | 1 hr | [IMPLEMENTATION.md §4](IMPLEMENTATION.md#4-dry-run-release-on-clean-macos-vm) |

**Total engineering: ~5 hours. Total wall time depends on Apple — D-U-N-S can be 1–14 days, then enrollment 1–2 days.**

## Files this plan will touch

### Modified
- `qcut/package.json` — `build.mac` block (lines 265–286): add `identity` and `notarize` config.
- `qcut/.github/workflows/release.yml` — `build-macos` job (around lines 110–200): add Apple secrets to env block, add verify step.
- `qcut/docs/release.md` — signing prerequisites note (create if missing).

### Added
- `qcut/scripts/verify-macos-signature.ts` — `codesign` + `spctl` + `xcrun stapler` verification.
- `qcut/scripts/__tests__/verify-macos-signature.test.ts` — Vitest unit tests.
- `qcut/scripts/__tests__/package-json-mac-signing.test.ts` — `package.json` shape guardrail.
- `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts` — workflow YAML guardrail.
- `qcut/docs/setup/macos-code-signing.md` — maintainer-facing setup guide.
- `qcut/docs/task/macos-code-signing/` — this folder.

### Not touched
- `qcut/build/entitlements.mac.plist` — already correct. The current entitlements (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `audio-input`, `camera`, `files.user-selected.read-write`) are required for FFmpeg WASM and dynamic loading. Notarization accepts these because they are explicit entitlements, not blanket exceptions.
- `qcut/build/icon.icns` — icon stays.
- iOS code path — QCut is Electron desktop, no iOS submission.

## Risks & open questions

1. **D-U-N-S delay is the long pole.** If Quriosity does not have a D-U-N-S Number yet, this gates everything. 5–14 days. **Start subtask 1 today.**
2. **Apple verification phone call.** Apple may call the phone number on the D-U-N-S record to verify the authorized signer. If that number is wrong, enrollment stalls until fixed.
3. **Notarization can fail in non-obvious ways.** Any nested binary inside the `.app` that is unsigned or has missing entitlements rejects the whole bundle. QCut stages native binaries via `stage-ffmpeg-binaries` and `stage-aicp-binaries` (per `qcut/package.json:98-99`); these MUST sign cleanly. Plan for one or two debugging cycles.
4. **GitHub-hosted vs self-hosted Mac runner.** `release.yml` has `USE_SELF_HOSTED_MAC` toggle. Both paths work with `CSC_LINK` env var, but signing on a self-hosted Mac with the cert pre-installed in keychain is faster.
5. **App-Specific Password is tied to one Apple ID.** If the Apple ID owner leaves Quriosity, password becomes invalid. Mitigation:
   - Register the Apple ID against an org-shared inbox like `apple-dev@qcut.app` (not anyone's personal email).
   - Plan migration to App Store Connect API key as future hardening (see [`IMPLEMENTATION.md §5`](IMPLEMENTATION.md#5-future-hardening-track-separately)).
6. **Cert renewal.** Apple Developer Program auto-renews $99/yr. If renewal payment fails (expired card, etc.) ALL signing breaks within ~30 days. Set a billing alert on the Apple ID.

## Success criteria

- [x] `codesign --verify --deep --strict --verbose=2 QCut.app` exits 0. *(verified 2026-05-01 via `verify:macos-signature` script)*
- [x] `spctl -a -t exec -vv QCut.app` reports `accepted` with `source=Notarized Developer ID`. *(verified 2026-05-01)*
- [x] ~~`xcrun stapler validate QCut.dmg` reports `The validate action worked!`.~~ Adjusted: stapler validates the **`.app` inside the DMG** (passes), not the DMG itself. electron-builder 26 stopped stapling the `.dmg` directly because Gatekeeper checks the inner `.app` on launch. `verify:macos-signature` treats DMG-staple as advisory. *(verified 2026-05-01)*
- [x] On the developer's Mac (macOS 26.4.1 Tahoe), double-clicking the `.dmg`, dragging to Applications, and opening shows the standard "downloaded from Internet → Open" dialog only — no "cannot be opened" error, no right-click → Open required. *(verified 2026-05-01)*. **Not yet verified on a clean VM / fresh user account** — see "Still open" in [README.md](README.md#still-open).
- [x] Verified the macOS security dialog shows "Quriosity Pty Ltd" as the developer name. *(verified 2026-05-01)*
- [ ] Maintainer signing setup at `qcut/docs/setup/macos-code-signing.md` — partial: PROCUREMENT.md and IMPLEMENTATION.md cover the flow, but no consolidated setup guide written yet.

## Out of scope

- Mac App Store submission (different cert types, sandboxing, App Review).
- iOS / iPadOS distribution.
- Migrating from app-specific password to App Store Connect API key (future hardening, separate task).
- Universal binary (currently arm64-only — track separately if Intel Mac support is reintroduced).
