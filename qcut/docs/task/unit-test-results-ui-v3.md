# Unit Test Results — UI-v3 Branch

**Date**: 2026-03-03
**Branch**: `UI-v3`
**Command**: `bunx vitest run`
**Duration**: 170.31s

## Summary

| Metric | Count |
|--------|-------|
| Test Files Total | 261 |
| Test Files Passed | 258 |
| Test Files Failed | 2 |
| Test Files Skipped | 1 |
| Tests Total | 3734 |
| Tests Passed | 3710 |
| Tests Failed | 2 |
| Tests Skipped | 22 |

## Comparison with Previous Baseline

| Metric | Baseline | UI-v3 | Delta |
|--------|----------|-------|-------|
| Tests Passed | 3641 | 3710 | **+69** |
| Tests Failed | 1 | 2 | +1 |
| Tests Skipped | — | 22 | — |
| Tests Total | — | 3734 | — |

- Net gain of **69 passing tests** vs baseline.
- One additional failure (`pty-session-cleanup`) compared to the baseline's single failure.

## Failed Tests (2)

### 1. `apps/web/src/lib/__tests__/pty-session-cleanup.test.ts`

**Suite**: `cleanupPtyOnEditorExit`

| Test | Error |
|------|-------|
| `disconnects an active PTY session` | `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` (line 41) |
| `reports disconnect failures` | `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` (line 75) |

**Root cause**: The `disconnect` mock is never called — likely the cleanup function does not invoke the disconnect callback as expected under the test's conditions.

### 2. `electron/__tests__/sticker-export-real.test.ts`

**Suite**: `Sticker Export — Real FFmpeg E2E`

| Test | Error |
|------|-------|
| (beforeAll setup) | `Error: Command failed: ffmpeg ... The system cannot find the path specified.` |

**Root cause**: The test requires a real FFmpeg binary at a WinGet-installed path that does not exist on this machine. This is an environment-specific failure, not a code regression.

## Skipped Tests (22)

### `electron/__tests__/sticker-export-real.test.ts` — 8 skipped

All 8 tests skipped because the `beforeAll` setup failed (FFmpeg not found):

1. should overlay a single sticker onto a video
2. should overlay multiple stickers at different positions and times
3. should overlay a rotated sticker
4. should overlay a semi-transparent sticker
5. should overlay a sticker with maintainAspectRatio using pad filter
6. should overlay stickers with rotation + opacity + timing combined
7. should overlay the sample-image.png as a scaled-down sticker
8. should produce output larger than input (video + sticker overlay re-encoding)

### `electron/__tests__/stage2-integration.test.ts` — 12 skipped

All 12 tests in this file are skipped (stage 2 integration tests require a running Electron environment).

### `electron/__tests__/pty-spawn-diagnostics.test.ts` — 2 skipped

Skipped on Windows (`skipIf(isWindows)`):

1. resolves executable command on unix-like path
2. returns null for non-executable file on unix-like path
