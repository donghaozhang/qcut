# Refactor Plan: serialize.test.ts

**File**: `packages/qagent/packages/web/src/lib/__tests__/serialize.test.ts`
**Current size**: 1018 lines
**Goal**: Split test suites, each under 800 lines

## Current Structure Analysis

The file tests session serialization and PR enrichment functions:

| Lines | Describe Block | Test Count |
|-------|---------------|------------|
| 1-26 | Imports | - |
| 28-60 | Helper factories: `createCoreSession()`, `createPRInfo()` | - |
| 63-114 | Mock factories: `createMockSCM()`, `createFailingSCM()` | - |
| 116-217 | `sessionToDashboard` | 7 tests |
| 219-271 | `resolveProject` | 5 tests |
| 273-443 | `enrichSessionPR` | 8 tests |
| 446-575 | `enrichSessionAgentSummary` | 7 tests |
| 577-728 | `enrichSessionIssueTitle` | 7 tests |
| 731-988 | `enrichSessionsMetadata` | 7 tests |
| 990-1018 | `basicPRToDashboard defaults` | 3 tests |

Shared helpers (~114 lines): `createCoreSession()`, `createPRInfo()`, `createMockSCM()`, `createFailingSCM()`.

## Proposed Split

### 1. `__tests__/serialize-test-helpers.ts` (~120 lines) — shared factories
- `createCoreSession(overrides?)` factory
- `createPRInfo(overrides?)` factory
- `createMockSCM()` factory
- `createFailingSCM()` factory
- All shared imports re-exported

### 2. `__tests__/serialize-dashboard.test.ts` (~350 lines)
- `sessionToDashboard` (7 tests)
- `resolveProject` (5 tests)
- `basicPRToDashboard defaults` (3 tests)
- These all test the synchronous `sessionToDashboard` conversion and its defaults

### 3. `__tests__/serialize-enrichment.test.ts` (~550 lines)
- `enrichSessionPR` (8 tests) — PR enrichment with SCM
- `enrichSessionAgentSummary` (7 tests) — agent summary enrichment
- `enrichSessionIssueTitle` (7 tests) — issue title enrichment
- `enrichSessionsMetadata` (7 tests) — full metadata enrichment pipeline

**Note**: `enrichSessionsMetadata` at ~257 lines is the largest block. If this file exceeds 800 lines, further split into `serialize-pr-enrichment.test.ts` and `serialize-metadata-enrichment.test.ts`.

## Estimated Line Counts

| File | Lines |
|------|-------|
| `serialize-test-helpers.ts` | ~120 |
| `serialize-dashboard.test.ts` | ~350 |
| `serialize-enrichment.test.ts` | ~550 |

## Barrel Re-export Strategy

No barrel needed. Each test file imports from `./serialize-test-helpers`:
```ts
import { createCoreSession, createPRInfo, createMockSCM, createFailingSCM } from './serialize-test-helpers';
```

Each test file also independently imports the functions under test from `../serialize` and types from `@composio/ao-core`.

**Note**: `enrichSessionIssueTitle` and `enrichSessionsMetadata` test blocks define their own local helper factories (`makeProject()`, `makeDashboard()`, `mockTracker()`, `mockAgent()`, `mockRegistry()`). These are specific to those blocks and should stay inline rather than being extracted to the shared helpers file.
