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
- [ ] Subtask 1: Look up / request D-U-N-S Number for Quriosity
- [ ] Subtask 2: Enroll in Apple Developer Program (Organization, $99/yr)
- [ ] Subtask 3: Generate Developer ID Application certificate, export .p12
- [ ] Subtask 4: Generate App-Specific Password, capture Team ID
- [ ] Subtask 5: Update `electron-builder` mac config (`identity` + `notarize`)
- [ ] Subtask 6: Update GitHub Actions release workflow (mac job env block)
- [ ] Subtask 7: Add post-build signature + notarization verifier
- [ ] Subtask 8: Maintainer documentation
- [ ] Subtask 9: Tests
- [ ] Subtask 10: Dry-run release on clean macOS VM
