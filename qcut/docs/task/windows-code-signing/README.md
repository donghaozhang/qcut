# Windows Code Signing — Task Folder

Plan for signing the QCut Windows installer with an Authenticode
certificate. Path chosen 2026-04-25 after eliminating other options.

**Decision:** Certum SimplySign Standard Code Signing (Organization, ~USD 200/year), purchased as Quriosity Pty Ltd. See [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) for why every other option was ruled out.

Sister task: [`docs/task/macos-code-signing/`](../macos-code-signing/).

## Files in this folder

| File | What it covers |
|------|----------------|
| [PLAN.md](PLAN.md) | Overview, subtask map, success criteria, risks. **Start here.** |
| [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) | Why Certum, why not Azure / SignPath / EV / Sectigo OV. Full vendor comparison + 2026 industry context. |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Per-subtask engineering detail with file paths and diffs. Includes the manual-signing tradeoff inherent to Certum SimplySign. |
| [TESTING.md](TESTING.md) | Unit + workflow + manual VM verification. |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Maintainer-facing docs to add/update alongside code. |

Chinese mirrors live alongside as `*.zh-CN.md`.

## Status

- [x] Plan drafted (revised 2026-04-25 — Azure/SignPath/EV ruled out, Certum chosen)
- [ ] Subtask 1: Order Certum SimplySign Standard Code Signing (Organization, 1 year)
- [ ] Subtask 2: Submit identity validation (Quriosity + D-U-N-S 893394655)
- [ ] Subtask 3: Install SimplySign mobile app + desktop signing tool on Donghao's machine
- [ ] Subtask 4: Update `electron-builder` Windows config (remove signing-disable flags)
- [ ] Subtask 5: Update GitHub Actions release workflow (build unsigned in CI, sign locally before publish)
- [ ] Subtask 6: Add local-signing helper script
- [ ] Subtask 7: Add post-signing signature verifier
- [ ] Subtask 8: Add SmartScreen-reality "first run" warning to Windows download page
- [ ] Subtask 9: Maintainer documentation
- [ ] Subtask 10: Tests
- [ ] Subtask 11: Dry-run release on clean Windows VM

## Context (why this folder was rewritten)

The earlier draft of this folder went through three failed paths before landing on Certum:

1. **SignPath Foundation (free, OSS-only)** — ruled out because QCut may close-source.
2. **Azure Trusted Signing ($120/yr)** — ruled out because Australia is not in Microsoft's eligibility list AND Quriosity is < 3 years old.
3. **SSL.com EV ($400+/yr)** — ruled out because Microsoft removed EV's instant-SmartScreen-reputation benefit in 2024. EV no longer worth the premium.

See [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) for sources.
