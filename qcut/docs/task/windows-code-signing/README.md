# Windows Code Signing — Task Folder

Plan for [issue #289](https://github.com/Quriosity-agent/qcut/issues/289):
sign the Windows installer so SmartScreen no longer says
"Publisher: Unknown publisher".

## Files in this folder

| File | What it covers |
|------|----------------|
| [PLAN.md](PLAN.md) | Overview, subtask map, success criteria, risks. **Start here.** |
| [CERTIFICATE-OPTIONS.md](CERTIFICATE-OPTIONS.md) | The "license" decision — vendor comparison and Azure Trusted Signing procurement steps. |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Per-subtask engineering detail with file paths and diffs. |
| [TESTING.md](TESTING.md) | Unit + workflow + manual E2E tests, with target test file paths. |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Maintainer-facing docs to add/update alongside code. |

## Status

- [x] Plan drafted
- [ ] Subtask 1: Certificate procurement (manual, Azure)
- [ ] Subtask 2: `electron-builder` Windows config
- [ ] Subtask 3: `dist:win*` npm scripts
- [ ] Subtask 4: GitHub Actions workflow
- [ ] Subtask 5: Post-build signature verification + script
- [ ] Subtask 6: Maintainer documentation
- [ ] Subtask 7: Tests
- [ ] Subtask 8: Dry-run release on clean Windows VM
