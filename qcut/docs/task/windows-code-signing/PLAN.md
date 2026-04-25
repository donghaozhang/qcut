# Windows Installer Code Signing — Plan

**Tracking issue:** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**Branch:** `gpt-image-2`
**Created:** 2026-04-25 (revised same day to add SignPath Foundation path)

## Goal

Remove the `Publisher: Unknown publisher` warning from the QCut Windows
installer by Authenticode-signing the NSIS `.exe` produced by
`electron-builder` in the GitHub Actions release pipeline.

Long-term outcome (priority order, per `CLAUDE.md`):

1. **Maintainability** — signing is configured once and works across every
   future release without per-release manual steps.
2. **Scalability** — secrets / signing identity live in cloud-hosted
   services, not on a single developer's machine. A new maintainer can
   release without owning a USB token.
3. **Performance** — signing should not noticeably extend release CI time
   (target < 60 s extra on Windows job).
4. **Short-term gains** — *not* a goal. We will not ship a self-signed
   cert or one-time hack just to silence SmartScreen for v2026.5.

## Why this might not require buying a license

`qcut/LICENSE` is MIT-style and `qcut/package.json:308` describes QCut as
"Open-source AI video editor" — both prerequisites for **SignPath
Foundation**, a free Authenticode signing program for verified
open-source projects (used by Blender, OBS Studio, Inkscape, Krita,
GIMP, KeePass, Notepad++, etc.).

**Plan:** apply to SignPath Foundation first (free, ~1–2 weeks for
review). Only if SignPath denies do we buy Azure Trusted Signing
(~USD 10/month). See [`CERTIFICATE-OPTIONS.md`](CERTIFICATE-OPTIONS.md)
for full vendor comparison and the rationale against DigiCert / Sectigo /
EV in v1.

## Path decision (gates Subtask 1 outcome)

The implementation has two flavors. Subtask 1 picks one based on the
SignPath outcome.

| | **Path A — SignPath (preferred)** | **Path B — Azure (fallback)** |
|-|-----------------------------------|-------------------------------|
| Cost | $0 | ~$120/year |
| Signing trigger | Post-build via SignPath GitHub Action | Inline during `electron-builder` via `azureSignOptions` |
| `electron-builder` win config | `forceCodeSigning: false`, `signAndEditExecutable: false` (SignPath signs post-build, otherwise builder doesn't know how) | `forceCodeSigning: true`, `signAndEditExecutable: true`, `azureSignOptions` populated |
| New CI step | "Submit signing request to SignPath" using `signpath/github-action-submit-signing-request@v1` | None — signing happens in the existing build step |
| New repo secrets | `SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_SLUG` | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_CERTIFICATE_PROFILE`, `WINDOWS_PUBLISHER_NAME` |
| Verifier script (`verify-windows-signature.ts`) | **Same** — verifies via `signtool /pa /v` and matches `WINDOWS_PUBLISHER_NAME` env var | **Same** |

The verifier script and the manual VM dry-run are path-agnostic. Most
other subtasks have an "if Path A / if Path B" detail in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md).

## Subtask map

The full implementation is **clearly > 20 minutes** (multi-day if you
count vendor review). Subtasks are sequenced so each one is independently
mergeable and reviewable.

| # | Subtask | Owner action | Code? | Est. wall time | Detail file |
|---|---------|--------------|-------|----------------|-------------|
| 1a | **Apply to SignPath Foundation** | Submit OSS application | No | 1–2 weeks (review) | [CERTIFICATE-OPTIONS.md §SignPath](CERTIFICATE-OPTIONS.md#signpath-foundation-how-to-apply) |
| 1b | Azure procurement *(fallback only — only if 1a is denied)* | Buy Trusted Signing identity, verify org | No | 1–7 days | [CERTIFICATE-OPTIONS.md §Azure](CERTIFICATE-OPTIONS.md#azure-trusted-signing-procurement-fallback-only) |
| 2 | Update `electron-builder` Windows config | Path-dependent edit to `qcut/package.json` `build.win` | Yes | 30 min | [IMPLEMENTATION.md §A1 / §B1](IMPLEMENTATION.md) |
| 3 | Update local `dist:win*` npm scripts | Remove `forceCodeSigning=false` overrides; keep one unsigned variant | Yes | 20 min | [IMPLEMENTATION.md §A2 / §B2](IMPLEMENTATION.md) |
| 4 | Update release workflow | Path A: add SignPath submit step. Path B: remove `--config.win.*=false`, inject Azure secrets. | Yes | 30–60 min | [IMPLEMENTATION.md §A3 / §B3](IMPLEMENTATION.md) |
| 5 | Add post-build signature verification | New script + CI step (path-agnostic) | Yes | 1 hr | [IMPLEMENTATION.md §4](IMPLEMENTATION.md#4-add-post-build-signature-verification-shared) |
| 6 | Documentation | Maintainer signing setup guide + release doc update | Yes (docs) | 45 min | [DOCUMENTATION.md](DOCUMENTATION.md) |
| 7 | Tests | Unit tests for verifier + workflow YAML guardrail (path-aware) | Yes | 1 hr | [TESTING.md](TESTING.md) |
| 8 | Dry-run release | Trigger release on `rc` tag, verify signed `.exe` on a clean Windows VM | No | 1 hr | [IMPLEMENTATION.md §5](IMPLEMENTATION.md#5-dry-run-release--manual-verification-shared) |

**Total engineering time (excluding vendor review): ~5 hours regardless of path.**

## Files this plan will touch

Authoritative list — keep this in sync if scope changes. Items marked
**[A]** are Path A only, **[B]** Path B only, **[shared]** apply to both.

### Modified

- `qcut/package.json` — lines 84, 86, 88, 89 (scripts) and lines 231–240 (`build.win`).
  - **[A]** `build.win` flips `verifyUpdateCodeSignature` to `true` only;
    `forceCodeSigning` stays `false` because SignPath signs post-build.
  - **[B]** all three signing flags flipped to `true`, plus
    `azureSignOptions` block added.
- `qcut/.github/workflows/release.yml` — line 96 (Build Electron application step) and surrounding env block (~lines 60–98).
  - **[A]** Removes the `forceCodeSigning=false` overrides; adds new
    "Submit signing request to SignPath" + "Download signed artifact"
    steps after the build.
  - **[B]** Removes overrides; adds Azure secret env vars to the build
    step.
- `qcut/docs/release.md` — add signing prerequisites section *(create if missing)*.

### Added

- **[shared]** `qcut/scripts/verify-windows-signature.ts` — Bun/Node wrapper that shells out to `signtool verify /pa /v` and exits non-zero if unsigned or signed by an unexpected publisher.
- **[shared]** `qcut/scripts/__tests__/verify-windows-signature.test.ts` — Vitest unit tests.
- **[shared]** `qcut/scripts/__tests__/package-json-signing.test.ts` — `package.json` shape guardrail (path-aware: validates either Path A or Path B config).
- **[shared]** `qcut/scripts/__tests__/release-workflow-signing.test.ts` — workflow YAML guardrail (path-aware).
- **[shared]** `qcut/docs/setup/windows-code-signing.md` — maintainer-facing setup guide. Covers both Path A (SignPath) and Path B (Azure) credential setup.
- `qcut/docs/task/windows-code-signing/` — this folder.

### Not touched (intentional)

- `qcut/build/icon.ico` — icon stays as-is.
- `qcut/scripts/release.ts` — release orchestrator does not need to know
  about signing.
- `qcut/package.json` `build.mac` block — macOS signing is a separate
  concern (and currently also unsigned in CI; tracked elsewhere).

## Risks & open questions

1. **SignPath review timing** — typically 1–2 weeks. Subtask 1a must
   start *before* engineering work to avoid blocking release.
2. **SignPath denial path** — if denied, Subtask 1b (Azure) adds another
   1–7 days for Microsoft identity validation. Plan release timing
   accordingly.
3. **SmartScreen reputation lag** — even after signing, the *first*
   signed builds may show "less common app" warnings until reputation
   accumulates. Document this expectation in the user-facing release
   notes.
4. **macOS / Linux unaffected** — this plan deliberately scopes to
   Windows. macOS is *also* currently unsigned in CI (no `mac.identity`,
   no Apple secrets in `release.yml`); that is a separate task.
5. **Cert renewal**
   - Path A: SignPath rotates automatically; no calendar reminder needed.
   - Path B: profile auto-rotates, but the Azure subscription billing
     should have an alert.

## Success criteria

Mirrors the issue acceptance criteria, made testable:

- [ ] `signtool verify /pa /v QCut*Setup*.exe` exits 0 on the release artifact.
- [ ] `Get-AuthenticodeSignature` reports `Status: Valid` and a
      `SignerCertificate.Subject` matching the expected publisher
      (SignPath-issued or Azure-issued).
- [ ] `qcut/package.json` `build.win` has the appropriate signing config
      for the chosen path (see Path decision table above).
- [ ] CI release job fails fast (before publishing) if signing fails.
- [ ] A first-time Windows user sees the verified publisher name on
      installer launch (verified manually on a clean VM).
- [ ] Maintainer signing setup is documented at
      `qcut/docs/setup/windows-code-signing.md`.

## Out of scope for this plan

- macOS notarization changes.
- Microsoft Store submission (mentioned in the issue as a *future*
  reputation booster — file a separate issue).
- Auto-update signature pinning beyond what `electron-builder`'s
  `verifyUpdateCodeSignature: true` already provides.
