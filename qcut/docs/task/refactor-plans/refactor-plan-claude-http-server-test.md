# Refactor Plan: claude-http-server.test.ts

**File**: `electron/claude/__tests__/claude-http-server.test.ts`
**Current size**: 1058 lines
**Goal**: Split test suites, each under 800 lines

## Current Structure Analysis

The file has extensive mock setup, a custom `fetch` helper, and two describe blocks:

| Lines | Section | Test Count |
|-------|---------|------------|
| 1-15 | Imports | - |
| 21-238 | Mock declarations (`vi.mock()` for 8 modules) | - |
| 244-253 | Post-mock imports | - |
| 259-310 | Custom `fetch` helper function | - |
| 317-334 | Server lifecycle (`beforeAll`/`afterAll`) | - |
| 340-1011 | `Claude HTTP Server` (main test suite) | 30 tests |
| 1013-1058 | `Claude HTTP Server - Auth` | 4 tests |

The main test suite covers:
- Timeline operations: split, move, batch add/update/delete, range delete, arrange, selection, import (12 tests)
- Transaction operations: begin, commit, undo, history (4 tests)
- Health, capabilities, commands registry (5 tests)
- CORS, media, export, project, diagnostics, MCP (7 tests)
- Notifications: status, enable/disable, history (2 tests)

## Proposed Split

### 1. `__tests__/claude-http-test-setup.ts` (~310 lines) — shared infrastructure
- All `vi.mock()` declarations (MUST be at top level for hoisting)
- Post-mock imports
- Custom `fetch` helper
- Server lifecycle (`serverPort`, `beforeAll`/`afterAll`)
- Export `serverPort`, `fetch`, and mock references

**Note**: Due to Vitest's `vi.mock()` hoisting requirement, each test file must declare its own mocks at module scope. The setup file can export the mock factories and the `fetch` helper, but the `vi.mock()` calls must be duplicated. Alternatively, use `vitest.config.ts` `setupFiles` to share mock setup.

### 2. `__tests__/claude-http-timeline.test.ts` (~450 lines)
- Timeline tests: split, move, batch CRUD, range delete, arrange, import (12 tests)
- Selection tests: set, get, clear, timeout (4 tests)

### 3. `__tests__/claude-http-server.test.ts` (~400 lines)
- Transaction tests: begin, commit, undo, history (4 tests)
- Health, capabilities, commands registry (5 tests)
- CORS, media, export, project, diagnostics, MCP (7 tests)
- Notifications flow (2 tests)
- 404 handling, 503 handling, timestamp (3 tests)
- Auth tests (4 tests)

## Estimated Line Counts

| File | Lines |
|------|-------|
| `claude-http-test-setup.ts` | ~310 |
| `claude-http-timeline.test.ts` | ~450 |
| `claude-http-server.test.ts` | ~400 |

## Barrel Re-export Strategy

No barrel needed. Each test file imports from `./claude-http-test-setup`:
```ts
import { fetch, serverPort } from './claude-http-test-setup';
```

**Critical**: Since this test starts a real HTTP server on a random port, both test files must share the same server instance. Options:
1. Use Vitest `globalSetup` to start the server once
2. Use a shared module-level variable exported from the setup file
3. Keep all tests in a single `describe` block within one file, splitting into sub-files that are imported

Option 2 (shared module with server lifecycle in setup file) is simplest. The setup file starts the server in its module-level `beforeAll` and exports the port.

**Alternative simpler approach**: Since the file is only ~1058 lines (close to limit), a two-file split may suffice — extract timeline tests (~500 lines) into a separate file, leaving the rest (~550 lines) in the original.
