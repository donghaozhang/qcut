# QCut Skill Test Report

**Date**: 2026-03-03
**Branch**: UI-v3
**Skill Location**: `C:\Users\yanie\clawd\skills\qcut-video-edit\`
**Files Tested**: SKILL.md, REFERENCE.md, editor-core.md, editor-ai.md, editor-state-control.md

## Test Results Summary

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Health check (curl) | PASS | `curl http://127.0.0.1:8765/api/claude/health` returned `NOT_RUNNING` correctly |
| 2 | Build QCut (`bun run build`) | PASS | Built in ~35s, all assets compiled |
| 3 | Launch QCut (`bun run electron`) | PASS | Started in ~8s, all IPC handlers registered |
| 4 | Health check after launch | PASS | Full JSON response with capabilities, version `2026.03.02.2` |
| 5 | `editor:health` CLI command | PASS | Same output as curl health endpoint |
| 6 | List projects (`editor:navigator:projects`) | PASS | Returned 1 existing project |
| 7 | Create project (`editor:project:create`) | PASS | Created "Skill Test Project" with UUID |
| 8 | Verify project appears in list | PASS | Both projects visible, new one set as active |
| 9 | List media (`editor:media:list`) | PASS | Empty array for new project (correct) |
| 10 | Generate image (`generate-image`) | PASS | 1.5MB PNG in ~25s, cost $0.002 |
| 11 | List models (`list-models`) | PASS | 79 models across all categories |

**Overall: 11/11 tests passed**

## What Worked

- **Startup workflow**: The SKILL.md Step 1 flow (health check -> build -> launch -> wait -> verify) works exactly as documented.
- **Project CRUD**: `editor:navigator:projects` and `editor:project:create` both work correctly. The new project is automatically set as `activeProjectId`.
- **Media listing**: `editor:media:list --project-id <id> --json` returns proper schema_version JSON.
- **Image generation**: `generate-image -t "..." --output-dir ./path` works end-to-end. Progress events stream to stderr, final output path and cost printed to stdout.
- **Model discovery**: `list-models` returns a comprehensive list of 79 models with provider, category info.
- **Both health check methods**: Direct `curl` and `bun run pipeline editor:health` both work.
- **CLI invocation**: `bun run pipeline <command>` correctly resolves to `bun run electron/native-pipeline/cli/cli.ts <command>`.

## What Failed

Nothing failed. All 11 tests passed on first attempt.

## Issues Found in Skill Docs

### 1. SKILL.md: Shell syntax issue for Windows/Git Bash
**File**: SKILL.md, Step 1
**Issue**: The skill says `bun run electron &` to launch in background. On Windows with Git Bash this works, but on PowerShell it would need `Start-Process` or `&` as a prefix operator. The docs are Unix-centric.
**Recommendation**: Add a note for Windows users, or document that Git Bash / WSL is expected.

### 2. SKILL.md: Missing `editor:health` CLI command
**File**: SKILL.md, Step 1
**Issue**: SKILL.md uses raw `curl` for health checks, but `editor-core.md` documents `bun run pipeline editor:health` which is simpler and doesn't require knowing the port. The SKILL.md should mention the CLI alternative.
**Recommendation**: Add `bun run pipeline editor:health` as the primary health check method in SKILL.md Step 1.

### 3. SKILL.md: `sleep 5` may not be enough
**File**: SKILL.md, Step 1
**Issue**: The doc says `sleep 5` after launching Electron. In our test, QCut was ready in ~4s, but on slower machines or first launch, 5 seconds may not be enough. There's no retry loop documented.
**Recommendation**: Add a retry loop pattern, e.g., poll health every 2s for up to 30s.

### 4. editor-core.md: Quick Start says `bun run electron:dev` but SKILL.md says `bun run electron`
**File**: editor-core.md, Quick Start section
**Issue**: `editor-core.md` Quick Start says to start with `bun run electron:dev`, while SKILL.md says `bun run build` then `bun run electron`. Both work but serve different purposes (dev vs production). This inconsistency could confuse users.
**Recommendation**: Clarify in both files: use `electron:dev` for development (hot reload), `build + electron` for production testing.

### 5. editor-state-control.md: Only documents curl, not CLI
**File**: editor-state-control.md
**Issue**: All state control examples use raw `curl` commands. There are no `bun run pipeline` CLI equivalents shown. Users have to know the HTTP API port and construct URLs manually.
**Recommendation**: If CLI wrappers exist for state/events/transactions, document them. If not, note that these are HTTP-only endpoints.

### 6. REFERENCE.md: `generate-image` default model not mentioned in SKILL.md
**File**: REFERENCE.md
**Issue**: The default model for `generate-image` is `nano_banana_pro` per REFERENCE.md, but SKILL.md Quick Commands example doesn't mention which model is used by default.
**Recommendation**: Minor — add `(default: nano_banana_pro)` note in the SKILL.md quick commands section.

### 7. Capability list mismatch
**File**: editor-state-control.md vs actual health response
**Issue**: The docs list `media.screenshot` under `MEDIA` category capabilities, but the actual health response groups it separately. Also `state.moyin.pipeline` capability exists in the response but isn't listed in the docs.
**Recommendation**: Regenerate the capability table from the actual response.

### 8. `editor-core.md`: Missing `editor:project:create` from Quick Start flow
**File**: editor-core.md, Step 2 in SKILL.md
**Issue**: SKILL.md Step 2 shows how to list and open projects, but doesn't mention creating a project if none exist. The `editor:project:create` command is documented in editor-core.md but not referenced in the SKILL.md workflow.
**Recommendation**: Add project creation to SKILL.md Step 2 as an alternative when no projects exist.

## Recommendations for Improving the Skill

1. **Add a complete "First Time Setup" section** to SKILL.md that covers: build -> launch -> wait (with retry) -> check health -> create project -> verify. This is the most common workflow for new users.

2. **Standardize health check approach**: Use `bun run pipeline editor:health` as the primary method everywhere, with `curl` as the fallback/advanced option.

3. **Add a "Troubleshooting" section** covering:
   - QCut won't start (port in use, build errors)
   - Health check timeout (increase sleep, check firewall)
   - API key not configured (for generation commands)

4. **Add Windows-specific notes**: The skill is Unix-centric (`&` for background, `sleep`, `curl`). Add PowerShell equivalents or note that Git Bash is required.

5. **Add output examples** to SKILL.md for each step. Seeing expected output helps users verify things are working.

6. **Cross-reference between files**: SKILL.md should link to specific sections in the reference files more explicitly. For example, "For all project commands, see editor-core.md#project-commands".

7. **Version the skill docs**: The health response shows `apiVersion: "1.1.0"` and `protocolVersion: "1.0.0"`. The skill docs should note which API version they target.
