# Flow Command Family — Documentation & Gap Closure

- **Phase**: CLI Architecture Refactor — Phase 2 (user-facing docs + gap closure)
- **Depends on**: [00-overview.md](00-overview.md) (refactor complete, 70 tests passing)
- **Principle**: Long-term user documentation > short-term doc churn. Ship durable reference material that tracks the code.

## Problem

Phase 1 ([00–06](00-overview.md)) completed the routing refactor — all 11 `qcut flow *` commands resolve correctly through `command-groups.ts` → `HANDLER_MAP` → handler functions. But three concrete issues remain:

1. **Silent failure in registry commands** — `vimax:create-registry` and `vimax:show-registry` read `options.input`, but the command registry declares `--directory` and `--project-id`. Users passing the documented flags get empty input.
2. **Undocumented flag** — `vimax:idea2video` handler reads `options.duration`, but `--duration` is not declared in `command-registry.ts`. Help output lies.
3. **No per-command user docs** — Phase 1 docs cover architecture (handler map, groups, aliases). Nothing explains what each `flow` subcommand *does*, its flags, or how to compose them.

## Target Coverage

```text
qcut flow run            ← YAML pipeline executor
qcut flow idea2video     ← ViMax: one-shot idea → video
qcut flow script2video   ← ViMax: screenplay → video
qcut flow novel2movie    ← ViMax: long-form novel → movie
qcut flow script         ← ViMax: idea → screenplay (LLM only)
qcut flow characters     ← ViMax: text → character list
qcut flow portraits      ← ViMax: characters → portrait images
qcut flow storyboard     ← ViMax: script → storyboard frames
qcut flow registry-create ← ViMax: directory → portrait registry
qcut flow registry-show  ← ViMax: inspect existing registry
qcut flow status         ← pipeline job status
```

All 11 commands route correctly today; coverage gap is in flags + user docs.

## Subtasks

| # | Task | Est. | Primary Files | Status |
|---|------|------|---------------|--------|
| 7 | [Flow overview plan](07-flow-overview-plan.md) *(this file)* | 10 min | — | PLANNED |
| 8 | [Flow bugfixes](08-flow-bugfixes-plan.md) | 25 min | `vimax-cli-handlers/registry-handlers.ts`, `command-registry.ts`, `cli.ts` | PLANNED |
| 9 | [Flow user docs (8 files)](09-flow-docs-plan.md) | 3–4 h | `docs/task/cli-organise/` (new md files) | PLANNED |
| 10 | [Flow contract tests](10-flow-tests-plan.md) | 30 min | `electron/__tests__/cli-flow-contracts.test.ts` | PLANNED |

Total estimate: ~5 hours. Subtasked because >20 min.

## Ordering Rationale

1. **Bugfixes first** (task 8) — docs that describe broken flags are worse than no docs. Fix the code, then document the fixed surface.
2. **Contract tests before docs** (task 10) — a regression test asserting "every handler's `options.X` reads correspond to a declared flag" prevents this class of bug from recurring. Tests lock the contract; docs describe it.
3. **Docs last** (task 9) — written against a known-good surface so examples are copy-pasteable without footnotes.

## Constraints

- **No handler rewrites.** Fix flag declarations or flag-parsing code; do not restructure handlers.
- **Backward compatible.** If `options.input` ever worked by accident, keep it as a fallback alias in the handler so existing scripts don't break.
- **800-line file limit.** Split any doc that grows past it.
- **Docs live in repo, not external site.** `docs/task/cli-organise/` is the single source of truth; the nexusai-website can embed later.

## Key Reference Files (do not modify unless noted)

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/command-groups.ts` | Flow group → internal command map | 64–80 |
| `electron/native-pipeline/cli/aliases.ts` | Deprecation aliases for old flat names | 35–45 |
| `electron/native-pipeline/cli/command-registry.ts` | Flag declarations (source of truth for help) | 419–1375 |
| `electron/native-pipeline/cli/cli-runner/handler-map.ts` | Command name → handler function | 206–216 |
| `electron/native-pipeline/cli/cli-runner/handler-pipeline.ts` | `flow run` handler | 19–164 |
| `electron/native-pipeline/cli/vimax-cli-handlers/pipeline-handlers.ts` | idea2video/script2video/novel2movie handlers | all |
| `electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts` | script/storyboard handlers | all |
| `electron/native-pipeline/cli/vimax-cli-handlers/character-handlers.ts` | characters/portraits handlers | all |
| `electron/native-pipeline/cli/vimax-cli-handlers/registry-handlers.ts` | registry-create/registry-show handlers | all |

## Definition of Done

- [ ] All 3 bugs fixed with regression tests (task 8)
- [ ] `bun run test` passes, including new flow contract tests (task 10)
- [ ] 8 user-facing docs exist and examples execute successfully (task 9)
- [ ] `00-overview.md` subtask table updated to link new files
- [ ] `qcut flow --help` output matches docs exactly (verified by CI grep, task 10)
