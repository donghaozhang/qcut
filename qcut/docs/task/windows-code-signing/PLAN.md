# Windows Installer Code Signing — Plan

**Tracking issue:** [Quriosity-agent/qcut#289](https://github.com/Quriosity-agent/qcut/issues/289)
**Branch:** `gpt-image-2`
**Created:** 2026-04-25 (revised same day after eliminating Azure / SignPath / EV paths)

## Goal

Sign the QCut Windows NSIS installer with an Authenticode certificate
issued to **Quriosity Pty Ltd**, so:

1. The UAC dialog shows "Verified publisher: Quriosity Pty Ltd" instead of yellow "Unknown publisher".
2. Enterprise IT policies that block unsigned executables stop blocking QCut.
3. Antivirus false-positive rate drops.
4. SmartScreen "Windows protected your PC" warning at least shows the publisher name (still triggers on early downloads — see [CERTIFICATE-OPTIONS.md §SmartScreen reputation reality](CERTIFICATE-OPTIONS.md#smartscreen-reputation-reality-2026)).

Long-term outcome (priority order, per `CLAUDE.md`):
1. **Maintainability** — signing fits into the release workflow with manageable manual overhead.
2. **Scalability** — credentials and identity live in cloud HSM, not on a single laptop.
3. **Performance** — signing should not extend release wall time by more than a few minutes.
4. **Short-term gains** — *not* a goal. We are not buying a cheap OV reseller cert that comes with USB-token operational debt.

## Why we are buying

QCut may close-source. Free/OSS-only paths (SignPath Foundation) are
incompatible. The team has elected to buy a commercial certificate.

## Path chosen: Certum SimplySign Standard Code Signing

- **Cost:** ~USD 200/year (€189/year)
- **Type:** OV (Organization Validation), Cloud HSM
- **Subject:** "Quriosity Pty Ltd"
- **Why this and not others:** see [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md). Short version: Azure unavailable (country + age), SignPath OSS-only, EV no longer worth premium since 2024, Sectigo/DigiCert OV needs USB token.
- **Tradeoff to accept:** Each `signtool sign` operation prompts Donghao's phone via SimplySign mobile app for approval. Releases are no longer fully unattended — the signing step is manual, taking ~30 seconds of human input per release.

If signing-step manual overhead becomes painful (e.g. weekly hotfix releases), the migration path is **SSL.com eSigner OV** (~$250/year, full REST API automation). See [IMPLEMENTATION.md §future hardening](IMPLEMENTATION.md#5-future-hardening-track-separately).

## Subtask map

| # | Subtask | Owner action | Code? | Wall time | Detail |
|---|---------|--------------|-------|-----------|--------|
| 1 | Order Certum cert | Pay €189 at shop.certum.eu | No | 15 min | [CERTIFICATE-OPTIONS.md §how to apply](CERTIFICATE-OPTIONS.md#certum-simplysign-how-to-apply) |
| 2 | Submit identity validation docs | Upload ASIC, D-U-N-S, passport, address proof | No | 30 min submit + 3–7 days Certum review | [CERTIFICATE-OPTIONS.md §how to apply](CERTIFICATE-OPTIONS.md#certum-simplysign-how-to-apply) |
| 3 | Install SimplySign mobile app + desktop signing tool | On Donghao's phone + signing machine | No | 30 min | [IMPLEMENTATION.md §0](IMPLEMENTATION.md#0-tooling-setup) |
| 4 | Update `electron-builder` Windows config | Remove signing-disable flags from `qcut/package.json` | Yes | 20 min | [IMPLEMENTATION.md §1](IMPLEMENTATION.md#1-update-electron-builder-windows-config) |
| 5 | Update GitHub Actions release workflow | CI builds unsigned, exposes artifact for manual signing | Yes | 30 min | [IMPLEMENTATION.md §2](IMPLEMENTATION.md#2-update-github-actions-release-workflow) |
| 6 | Add local signing helper script | New `qcut/scripts/sign-windows-release.ts` | Yes | 1 hr | [IMPLEMENTATION.md §3](IMPLEMENTATION.md#3-add-local-signing-helper-script) |
| 7 | Add post-signing signature verifier | New `qcut/scripts/verify-windows-signature.ts` | Yes | 1 hr | [IMPLEMENTATION.md §4](IMPLEMENTATION.md#4-add-post-signing-signature-verifier) |
| 8 | Add Windows download-page warning copy | Explain SmartScreen first-run experience | Yes (web) | 30 min | [DOCUMENTATION.md](DOCUMENTATION.md) |
| 9 | Maintainer documentation | New `qcut/docs/setup/windows-code-signing.md` | Yes (docs) | 45 min | [DOCUMENTATION.md](DOCUMENTATION.md) |
| 10 | Tests | Verifier + workflow guardrails | Yes | 1 hr | [TESTING.md](TESTING.md) |
| 11 | Dry-run release on clean Windows VM | Manual verification | No | 1 hr | [IMPLEMENTATION.md §6](IMPLEMENTATION.md#6-dry-run-release-on-clean-windows-vm) |

**Total engineering time: ~5 hours. Wall time: dominated by Certum's 3–7 day identity review.**

## Files this plan will touch

### Modified

- `qcut/package.json`
  - Lines 84, 86, 88, 89 (`scripts` block) — remove `forceCodeSigning=false` overrides
  - Lines 231–240 (`build.win` block) — keep `forceCodeSigning: false` because we sign **after** electron-builder finishes (manual local signing); flip `verifyUpdateCodeSignature` to `true`
- `qcut/.github/workflows/release.yml` — line 96 area: remove `--config.win.*=false` overrides; document that signing happens manually after CI
- `qcut/docs/release.md` — signing prerequisites note (create if missing)

### Added

- `qcut/scripts/sign-windows-release.ts` — wrapper that calls `signtool sign` with Certum SimplySign Cloud HSM identity; expects SimplySign desktop tool installed and authenticated.
- `qcut/scripts/verify-windows-signature.ts` — runs `signtool verify /pa /v` against the signed artifact, fails non-zero on missing signature or wrong publisher.
- `qcut/scripts/__tests__/verify-windows-signature.test.ts` — Vitest unit tests.
- `qcut/scripts/__tests__/package-json-signing.test.ts` — `package.json` shape guardrail.
- `qcut/scripts/__tests__/release-workflow-signing.test.ts` — workflow YAML guardrail.
- `qcut/docs/setup/windows-code-signing.md` — maintainer-facing setup guide.
- `qcut/docs/task/windows-code-signing/` — this folder.

### Not touched (intentional)

- `qcut/build/icon.ico` — icon stays.
- `qcut/scripts/release.ts` — release orchestrator does not need to know about signing.
- `qcut/package.json` `build.mac` block — macOS signing is a separate task.

## Risks & open questions

1. **Certum identity review delay.** Typical 3–7 business days. With D-U-N-S already issued, expect the faster end of that range.
2. **SimplySign desktop tool platform support.** Certum officially supports Windows. Mac/Linux signing requires running the Windows tool through a VM or finding alternatives. Donghao currently uses macOS — verify SimplySign workflow works for him before relying on it.
3. **Phone availability for every release.** Donghao must approve each `signtool` operation via SimplySign app. If he's offline (flight, vacation), no signed release possible. Mitigation: add a second team member to the Certum account once cert is issued.
4. **SmartScreen reputation will not be instant.** Even after signing, the first ~hundreds of downloads of each new build will still trigger SmartScreen. This is unavoidable in 2026 (see [CERTIFICATE-OPTIONS.md §SmartScreen reputation reality](CERTIFICATE-OPTIONS.md#smartscreen-reputation-reality-2026)). Mitigation: add a download-page note explaining the first-run warning is expected.
5. **Cert renewal.** 460-day max validity (2026 CA/B Forum rule). Calendar reminder 60 days before expiry. Renewal preserves nothing — each cert renewal effectively starts fresh on SmartScreen reputation per file hash anyway.
6. **macOS / Linux unaffected.** This plan deliberately scopes to Windows. macOS is *also* currently unsigned in CI (no `mac.identity`, no Apple secrets in `release.yml`); that is tracked at [`docs/task/macos-code-signing/`](../macos-code-signing/).

## Success criteria

Mirrors GitHub issue #289 acceptance, made testable:

- [ ] `signtool verify /pa /v QCut*Setup*.exe` exits 0 on the released artifact.
- [ ] `Get-AuthenticodeSignature` reports `Status: Valid` with `SignerCertificate.Subject` containing "Quriosity Pty Ltd".
- [ ] `qcut/package.json` `build.win` no longer has `forceCodeSigning: false` overrides in npm scripts.
- [ ] On a clean Windows VM, double-clicking the installer shows blue UAC dialog with "Verified publisher: Quriosity Pty Ltd" (not yellow "Unknown publisher").
- [ ] Maintainer signing setup is documented at `qcut/docs/setup/windows-code-signing.md`.
- [ ] Windows download page on QCut website has a one-paragraph note explaining the first-run SmartScreen warning is normal and how to proceed.

## Out of scope for this plan

- macOS notarization changes (separate task).
- Microsoft Store submission (different cert path entirely; mentioned in issue as future reputation booster).
- Auto-update signature pinning beyond what `electron-builder`'s `verifyUpdateCodeSignature: true` already provides.
- Migration to fully-automated CI signing (SSL.com eSigner) — track as future hardening once Certum manual flow is operational.
