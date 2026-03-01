# Refactor Plan: remaining-gaps.test.ts

**File**: `electron/__tests__/remaining-gaps.test.ts`
**Current size**: 1130 lines
**Goal**: Split by feature area, each under 800 lines

## Current Structure Analysis

This is a "remaining coverage" test file that covers many unrelated modules. Structure:

| Lines | Describe Block | Module Under Test | Test Count |
|-------|---------------|-------------------|------------|
| 26-119 | `Exception hierarchy & exit codes` | `output/errors.js` | 7 tests |
| 130-198 | `CLIOutput` | `cli/cli-output.js` | 7 tests |
| 200-224 | `formatTable` | `cli/cli-output.js` | 3 tests |
| 226-243 | `ANSI colors` | `cli/cli-output.js` | 2 tests |
| 252-335 | `StreamEmitter` | `infra/stream-emitter.js` | 5 tests |
| 347-405 | `XDG directory support` | `infra/xdg-paths.js` | 6 tests |
| 414-442 | `PlatformLogger` | `infra/platform-logger.js` | 4 tests |
| 448-532 | `FileManager` | `infra/file-manager.js` | 8 tests |
| 543-655 | `ConfigValidator` + `InputValidator` | `execution/validators.js` | 12 tests |
| 667-735 | `Config loader` | `execution/config-loader.js` | 7 tests |
| 757-1016 | `ViMax CLI subcommands` | `cli/cli.js`, `cli/cli-runner.js` | 18 tests |
| 1022-1048 | `ReferenceImageSelector.getViewPreference` | `vimax/agents/reference-selector.js` | 4 tests |
| 1057-1078 | `Idea2VideoPipeline.fromYaml` | `vimax/pipelines/idea2video.js` | 1 test |
| 1082-1101 | `Service-level features` | `execution/step-executors.js` | 2 tests |
| 1106-1130 | `CLI help includes new vimax commands` | `cli/cli.js` | 1 test |

## Proposed Split

Group by pipeline subsystem:

### 1. `__tests__/pipeline-errors-output.test.ts` (~300 lines)
- `Exception hierarchy & exit codes` (7 tests)
- `CLIOutput` (7 tests)
- `formatTable` (3 tests)
- `ANSI colors` (2 tests)
- `StreamEmitter` (5 tests)

### 2. `__tests__/pipeline-infra.test.ts` (~300 lines)
- `XDG directory support` (6 tests)
- `PlatformLogger` (4 tests)
- `FileManager` (8 tests)
- `ConfigValidator` + `InputValidator` (12 tests)
- `Config loader` (7 tests)

### 3. `__tests__/pipeline-vimax-cli.test.ts` (~350 lines)
- `ViMax CLI subcommands` — CLI parser + runner handlers (18 tests)
- `ReferenceImageSelector.getViewPreference` (4 tests)
- `Idea2VideoPipeline.fromYaml` (1 test)
- `Service-level features` (2 tests)
- `CLI help includes new vimax commands` (1 test)

## Estimated Line Counts

| File | Lines |
|------|-------|
| `pipeline-errors-output.test.ts` | ~300 |
| `pipeline-infra.test.ts` | ~300 |
| `pipeline-vimax-cli.test.ts` | ~350 |

## Barrel Re-export Strategy

No barrel needed. Each test file has its own imports — there is no shared test infrastructure across these files (each `describe` block imports its own module under test). The only shared import is `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`).

Delete the original `remaining-gaps.test.ts` after splitting.
