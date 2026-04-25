# Windows Installer Code Signing — Plan

**Tracking issue:** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**Branch:** `gpt-image-2`
**Created:** 2026-04-25

## Goal

Remove the `Publisher: Unknown publisher` warning from the QCut Windows
installer by Authenticode-signing the NSIS `.exe` produced by
`electron-builder` in the GitHub Actions release pipeline.

Long-term outcome (priority order, per `CLAUDE.md`):

1. **Maintainability** — signing is configured once and works across every
   future release without per-release manual steps.
2. **Scalability** — secrets live in GitHub Actions / cloud KMS, not on a
   single developer's machine. A new maintainer can release without owning
   the cert.
3. **Performance** — signing should not noticeably extend release CI time
   (target < 60 s extra on Windows job).
4. **Short-term gains** — *not* a goal. We will not ship a self-signed cert
   or one-time hack just to silence SmartScreen for v2026.5.

## Why this requires buying a license

Authenticode signing requires a **commercial code-signing certificate**
issued by a CA that Windows trusts. Self-signed certs do not remove the
SmartScreen warning. See [`CERTIFICATE-OPTIONS.md`](CERTIFICATE-OPTIONS.md)
for vendor comparison, cost, and a recommendation.

**Recommended:** Azure Trusted Signing (Public Trust identity), ~USD 10/month,
because:
- Cloud-native, no HSM token to ship around.
- Native `electron-builder` support via `azureSignOptions`.
- Required identity validation is light (org or individual) compared to EV.
- The issue author already proposed this path.

## Subtask map

The full implementation is **clearly > 20 minutes** (multi-day if you count
certificate validation by Microsoft). Subtasks are sequenced so each one is
independently mergeable and reviewable.

| # | Subtask | Owner action | Code? | Est. wall time | Detail file |
|---|---------|--------------|-------|----------------|-------------|
| 1 | Certificate procurement | Buy Azure Trusted Signing identity, verify org | No | 1–7 days (Microsoft validation) | [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) |
| 2 | Update `electron-builder` Windows config | Flip three flags + add `azureSignOptions` | Yes | 30 min | [IMPLEMENTATION.md §1](IMPLEMENTATION.md#1-update-electron-builder-windows-config) |
| 3 | Update local `dist:win*` npm scripts | Remove `forceCodeSigning=false` overrides; keep one unsigned variant for local dev | Yes | 20 min | [IMPLEMENTATION.md §2](IMPLEMENTATION.md#2-update-local-distwin-npm-scripts) |
| 4 | Update release workflow | Remove `--config.win.*=false` overrides, inject Azure secrets | Yes | 30 min | [IMPLEMENTATION.md §3](IMPLEMENTATION.md#3-update-github-actions-release-workflow) |
| 5 | Add post-build signature verification | New script + CI step, fail release if unsigned | Yes | 1 hr | [IMPLEMENTATION.md §4](IMPLEMENTATION.md#4-add-post-build-signature-verification) |
| 6 | Documentation | Maintainer signing setup guide + release doc update | Yes (docs) | 45 min | [DOCUMENTATION.md](DOCUMENTATION.md) |
| 7 | Tests | Unit tests for verifier script + workflow YAML lint | Yes | 1 hr | [TESTING.md](TESTING.md) |
| 8 | Dry-run release | Trigger release workflow on a `rc` tag, verify signed `.exe` on a clean Windows VM | No | 1 hr | [IMPLEMENTATION.md §5](IMPLEMENTATION.md#5-dry-run-release--manual-verification) |

**Total engineering time (excluding cert procurement wait): ~5 hours.**

## Files this plan will touch

Authoritative list — keep this in sync if scope changes.

### Modified

- `qcut/package.json` — lines 84, 86, 88, 89 (scripts) and lines 231–240 (`build.win`).
- `qcut/.github/workflows/release.yml` — line 96 (Build Electron application step) and surrounding env block (~line 60–98).
- `qcut/docs/release.md` — add signing prerequisites section *(create if missing)*.

### Added

- `qcut/scripts/verify-windows-signature.ts` — Node/Bun wrapper that shells out to `signtool verify /pa /v` (or PowerShell `Get-AuthenticodeSignature`) and exits non-zero if the artifact is unsigned or signed by an unexpected publisher.
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — Vitest unit tests for the wrapper (mock child_process).
- `qcut/docs/setup/windows-code-signing.md` — maintainer-facing setup guide (Azure tenant, GitHub secrets, local dev signing).
- `qcut/docs/task/windows-code-signing/` — this folder.

### Not touched (intentional)

- `qcut/build/icon.ico` — icon stays as-is.
- `qcut/scripts/release.ts` — release orchestrator does not need to know about signing; electron-builder handles it.

## Risks & open questions

1. **Azure validation time** — Microsoft's identity validation can take up to a week. Subtask 1 must start *before* engineering work to avoid blocking release.
2. **SmartScreen reputation lag** — even after signing, the *first* signed builds may still show "less common app" warnings until reputation accumulates. Document this expectation in the user-facing release notes.
3. **Cert renewal** — set a calendar reminder for renewal 30 days before expiry. Add to `IMPLEMENTATION.md §6` once cert is purchased.
4. **macOS / Linux unaffected** — this plan deliberately scopes to Windows. macOS already signs via Apple Developer ID (verify in `qcut/package.json` `build.mac` once we get to it).

## Success criteria

Mirrors the issue acceptance criteria, made testable:

- [ ] `signtool verify /pa /v QCut*Setup*.exe` exits 0 on the release artifact.
- [ ] `Get-AuthenticodeSignature` reports `Status: Valid` and a `SignerCertificate.Subject` matching the expected publisher.
- [ ] `qcut/package.json` `build.win.forceCodeSigning` is `true`.
- [ ] CI release job fails fast (before publishing) if signing fails.
- [ ] A first-time Windows user sees the verified publisher name on installer launch (verified manually on a clean VM).
- [ ] Maintainer signing setup is documented at `qcut/docs/setup/windows-code-signing.md`.

## Out of scope for this plan

- macOS notarization changes.
- Microsoft Store submission (mentioned in the issue as a *future* reputation booster — file a separate issue).
- Auto-update signature pinning beyond what `electron-builder`'s `verifyUpdateCodeSignature: true` already provides.
