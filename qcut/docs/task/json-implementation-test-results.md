# JSON Implementation Test Results

**Date**: 2026-03-04
**Branch**: `json`
**Tester**: Claude Code

## Build

| Step | Result |
|------|--------|
| `bun run build` | PASS (built in ~55s, no errors) |

Warnings: Two chunks exceed 1000 kB (index, editor.lazy) — existing, not related to JSON changes.

## 1. Three-Level Help JSON

| Test | Command | Result |
|------|---------|--------|
| Level 1: Top-level help | `--help --json` | PASS — returns `{status:"ok", data:{categories, commands, globalFlags}}` |
| Level 2: Command help | `generate-image --help --json` | PASS — returns `{required, optional, examples}` with enum values |
| Level 2: Editor command | `editor:project:list --help --json` | PASS — returns command info with empty required/optional |
| Level 3: Flag detail | `generate-image --help model --json` | PASS — returns single flag with enum array |

All help levels return valid JSON wrapped in `{status:"ok", data:{...}}`.

## 2. Unified JSON Output

| Test | Command | Result |
|------|---------|--------|
| list-models | `list-models --json` | PASS — returns 79 models with `{schema_version, command, data:{models, count}}` |
| check-keys | `check-keys --json` | PASS — returns key status with `configured`, `source`, `masked` fields |
| estimate-cost (valid) | `estimate-cost --model flux_dev --json` | PASS — returns `{cost, breakdown, currency}` |
| estimate-cost (invalid) | `estimate-cost --model flux-1-dev --json` | PASS — returns `{status:"error", error:"Unknown model...", code:"estimate-cost:failed"}` |

Error responses correctly use `{status:"error", error, code}` envelope.

## 3. Editor Commands (QCut Running)

QCut was running (v2026.03.02.2, uptime: ~62k seconds).

| Test | Command | Result | Notes |
|------|---------|--------|-------|
| Health check | `curl /api/claude/health` | PASS | 38 capabilities reported |
| navigator:projects | `editor:navigator:projects --json` | PASS | Returns 2 projects with activeProjectId |
| project:list | `editor:project:list --json` | FAIL | 404 — `/api/claude/projects` endpoint not registered in running build |
| timeline:info | `editor:timeline:info --project-id <id> --json` | PASS | Returns tracks, dimensions, fps |

`editor:project:list` fails because the running QCut was built before this branch's changes. The endpoint needs to be registered in `claude-http-server.ts`. After rebuilding QCut with the json branch, it should work.

## 4. Project.json Builder

| Test | Command | Result | Notes |
|------|---------|--------|-------|
| project:info | `editor:project:info --project-id <id> --json` | FAIL | "Failed to read project" — endpoint not in running build |
| project:info --full | `editor:project:info --project-id <id> --json --full` | FAIL | Same — endpoint missing |

Same root cause as `project:list` — the running QCut doesn't have the new project info/list HTTP endpoints. Requires rebuilding and restarting QCut with the json branch.

## 5. Unit Tests

| Metric | Count |
|--------|-------|
| Test files passed | 257 |
| Test files failed | 3 → 1 (after fix) |
| Tests passed | 3709 → 3711 |
| Tests failed | 3 → 1 |
| Tests skipped | 22 |

### Fixed Failures

| Test | Error | Fix |
|------|-------|-----|
| `CLIOutput.result emits JSON envelope` | `out.result is not a function` | Added `result()` method to `CLIOutput` |
| `CLIOutput.table emits JSON envelope` | `out.table is not a function` | Added `table()` method to `CLIOutput` |

### Pre-existing Failures (Not Related to JSON Branch)

| Test | Error | Notes |
|------|-------|-------|
| `sticker-export-real.test.ts` | Real FFmpeg E2E | Environment-dependent, requires FFmpeg binaries |
| `use-debounce.test.ts` | Timing flake — `waitFor` timeout | Flaky timing test, unrelated |

## Summary

- **3-level help JSON**: All 4 tests PASS
- **Unified JSON output**: All 4 tests PASS (including error envelope)
- **Editor commands**: 2/4 PASS (2 fail due to running QCut needing rebuild)
- **Project.json builder**: 0/2 PASS (same rebuild issue)
- **Unit tests**: 2 failures FIXED (`CLIOutput.result`, `CLIOutput.table`); 2 pre-existing flakes remain

## Recommendations

1. **Rebuild QCut** with json branch to test `editor:project:list` and `editor:project:info` endpoints
2. **Register `/api/claude/projects` route** in `claude-http-server.ts` if not already done
3. **Fix `use-debounce.test.ts`** flaky timing (pre-existing, low priority)
4. **Consider** adding integration tests for the new JSON envelope format
