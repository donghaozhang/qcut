# 06 — Novel2Movie stage decomposition plan

**Status:** ✅ Implemented (stages 1–3). Verified end-to-end on
`japanese-anime-example.md` 2026-04-13 — see
[07-stage-workflow.md](07-stage-workflow.md) for usage.
**Scope for this iteration:** Stages 1–3 only (characters → portraits → scripts).
Storyboard + video + concat stay untouched for now; `flow novel2movie`
keeps working as the monolithic fallback.

## Motivation

`flow novel2movie` today is a 30+ min one-shot that combines six agents.
Last full run on `japanese-anime-example.md`: 36 min / $5.83 / no good
way to pinpoint which stage drifted if output quality was off.

The user wants explicit **stage checkpoints** so each step lands on disk
as a plain JSON/PNG artifact you can inspect, edit, or re-run without
burning cost on earlier stages.

## Design: Option A + Directory Convention

Keep every existing command doing its narrow job; add **one missing
piece** (`flow novel2script`) and a **predictable project directory**
that every stage reads/writes by convention.

### Directory layout

```
~/Documents/QCut/projects/<project-slug>/
├── project.json                 # { slug, novel_path, created_at,
│                                #   style, stages_completed: [...] }
├── novel.md                     # copy of source novel
├── characters.json              # stage 1 output
├── portraits/
│   ├── <character-name>/
│   │   └── front.png
│   └── registry.json            # portrait registry (canonical path)
└── scripts/
    ├── chunk_001.json
    ├── chunk_002.json
    └── ...                      # one per novel chunk
```

**Project slug** defaults to `safeSlug(path.basename(novelPath, ext))` so
`japanese-anime-example.md` → `japanese-anime-example` (no timestamp —
re-running the same novel reuses the same directory, with idempotency
checks skipping already-completed stages unless `--force`).

### Stage commands (what we ship this iteration)

| Stage | Command | Input | Output |
|---|---|---|---|
| 1 | `flow characters --novel <path> [--project <slug>]` | novel markdown | `<proj>/characters.json` + `novel.md` |
| 2 | `flow portraits --project <slug>` (or explicit `--input <characters.json>`) | characters.json | `<proj>/portraits/*/front.png` + `registry.json` |
| 3 | `flow novel2script --novel <path> [--project <slug>]` | novel markdown | `<proj>/scripts/chunk_NNN.json` |

All three stages can also run in one go via the existing `flow
novel2movie --scripts-only` — we're not replacing that path, just
giving users a knob to execute each stage independently.

## What exists vs. what's new

| Piece | Status | Notes |
|---|---|---|
| `flow characters -t <text>` | ✅ exists (`character-handlers.ts:21`) | Extend to accept `--novel <path>` + `--project <slug>` |
| `flow portraits -p <json>` | ✅ exists (`character-handlers.ts:87`) | Extend with `--project <slug>` auto-resolution |
| `flow novel2script` | ❌ **NEW** | Extract novel segmentation from `novel2movie.ts:_splitText` + `NovelSegmenter.process()` |
| Project dir helper | ❌ **NEW** | `ProjectPaths` module — single source of truth for `<root>/projects/<slug>/*` paths |
| `project.json` metadata | ❌ **NEW** | Tracks which stages are complete so downstream can validate |
| `extractNovelStyleHeader()` | ✅ exists (`pipeline-handlers.ts:210`) | Reuse in stage 1 to persist `style` into `project.json` |
| `NovelSegmenter` class | ✅ exists (`novel-segmenter.ts:187`) | Already self-contained, already accepts text chunks |
| `_splitText()` chunker | ✅ exists (`novel2movie.ts:672`) | **Private method** — needs to be exported or reimplemented in the new handler |

## Files changed / added

### Add
- `electron/native-pipeline/output/project-paths.ts` — `ProjectPaths`
  helper (resolve project root, ensure dirs, read/write `project.json`).
  Pure, no Electron deps. ~80 lines.
- `electron/native-pipeline/cli/vimax-cli-handlers/novel-script-handler.ts`
  — `handleVimaxNovel2Script`. Depends on `NovelSegmenter` and a
  **newly exported** chunker helper. ~120 lines.

### Modify
- `electron/native-pipeline/vimax/pipelines/novel2movie.ts` — export
  `splitNovelText()` as a free function (currently `_splitText` private
  method). The class keeps calling it. ~5 lines net.
- `electron/native-pipeline/cli/vimax-cli-handlers/character-handlers.ts`
  — add `--novel <path>` + `--project <slug>` handling to
  `handleVimaxExtractCharacters` (read markdown, extract style header,
  write to project dir) and `--project <slug>` resolution to
  `handleVimaxGeneratePortraits` (auto-locate `characters.json`, write
  to `<proj>/portraits/`). ~60 lines added across the two functions.
- `electron/native-pipeline/cli/vimax-cli-handlers/index.ts` — re-export
  the new handler.
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` — register
  `"vimax:novel2script": wrapOP(handleVimaxNovel2Script)`.
- `electron/native-pipeline/cli/command-registry.ts` — add the
  `vimax:novel2script` spec with `--novel`, `--project`, `--title`,
  `--llm-model`, `--chunk-size`, `--overlap` flags.
- `electron/native-pipeline/cli/command-groups.ts` — add
  `novel2script: "vimax:novel2script"` under the `flow` group.
- `electron/native-pipeline/cli/aliases.ts` — no change (new command
  doesn't have a legacy alias).
- `electron/native-pipeline/cli/cli-runner/types.ts` — add `project?:
  string` to `CLIRunOptions` if not already there (reuse `projectId`
  if suitable — we already have `projectId?: string` on line 119, so
  parse `--project` into `projectId`).
- `electron/native-pipeline/cli/cli.ts` — ensure `--project` is parsed
  (alias for the existing `--project-id`).

### Test
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/project-paths.test.ts`
  — unit tests for the path helper (slug generation, existing-dir
  reuse, `project.json` round-trip). Vitest.
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/novel-script-handler.test.ts`
  — unit test for the chunker + handler happy path using a tiny fake
  `NovelSegmenter` (stub `.process()` to return a deterministic
  `Script`). Asserts files land in the right paths.
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/character-handlers.test.ts`
  — extend (or create) to cover `--novel` + `--project` behaviour for
  both extract-characters and generate-portraits.

### Docs
- `docs/task/gmi-video-cli-guide/07-stage-workflow.md` — NEW walkthrough
  that runs all three stages sequentially on
  `japanese-anime-example.md`, showing the project dir, the JSON
  inspection step between stages, and how to edit characters.json
  before running portraits.
- `docs/task/gmi-video-cli-guide/00-overview.md` — add the three new
  stage commands to the table of contents.

## Backwards compatibility

- `flow novel2movie` stays identical. It still writes to the legacy
  `~/Documents/QCut/Exports/novel2movie/<slug>_<timestamp>/` path when
  no `--project` is given. When `--project <slug>` **is** given,
  novel2movie can detect the project dir and write there instead
  (follow-up iteration — not required for this milestone).
- `flow characters -t <text>` and `flow portraits -p <json>` continue
  to work as today. The `--novel` and `--project` flags are additive.
- No existing JSON schema changes. `characters.json`,
  `portrait_registry.json`, and chunk `Script` JSON retain their
  current shape so any downstream code that consumes them keeps
  working.

## Failure modes & idempotency

- `ProjectPaths.ensureProject(slug)` creates `<proj>/` if missing;
  re-runs find the existing dir.
- Stage 1 re-run: overwrites `characters.json` unless `--force` is
  required (for now: always overwrite; add `--force` gate in follow-up
  if users request it).
- Stage 2 re-run: overwrites portrait files. No per-character retry
  yet — listed as a follow-up.
- Stage 3 re-run: rewrites `scripts/chunk_*.json`. Chunk boundaries are
  deterministic given `--chunk-size`/`--overlap` so the same novel
  produces the same chunk count; the LLM output inside each chunk
  can vary.
- `project.json.stages_completed` is advisory — each stage just
  appends its name when successful. Downstream stages check the flag
  but can be overridden with `--force`.

## Out of scope for this iteration

- Stage 4 (storyboard), 5 (video), 6 (concat) — remain accessed via
  `novel2movie` monolith or existing `flow storyboard` /
  `flow script2video` commands. Folding them into the project dir
  convention is a follow-up.
- Wizard / interactive mode. No TTY prompting — stay scriptable.
- Per-character portrait retry command. Punt.
- Migration of older `novel2movie_<slug>_<ts>` dirs into the new
  `projects/<slug>/` layout. Not automated; users can copy manually.

## Acceptance criteria

A user should be able to run:

```bash
# Stage 1 — extract + review
qcut flow characters \
    --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
    --project japanese-anime-example
cat ~/Documents/QCut/projects/japanese-anime-example/characters.json | jq length  # → 5

# Stage 2 — portraits from characters.json (which can now be hand-edited)
qcut flow portraits --project japanese-anime-example
ls ~/Documents/QCut/projects/japanese-anime-example/portraits/   # → 5 subdirs

# Stage 3 — novel → script chunks
qcut flow novel2script \
    --novel electron/native-pipeline/vimax/examples/japanese-anime-example.md \
    --project japanese-anime-example
ls ~/Documents/QCut/projects/japanese-anime-example/scripts/      # → chunk_001..NNN.json

# Metadata confirms progress
jq '.stages_completed' ~/Documents/QCut/projects/japanese-anime-example/project.json
# → ["characters", "portraits", "scripts"]
```

Each command completes independently, errors do not affect prior
stages, and the user can edit `characters.json` between stages 1 and
2 (rename, adjust ethnicity, drop a character) and have stage 2 pick
up the edits.

## Implementation order

1. **ProjectPaths helper + tests** — pure logic, no API calls, fast to
   verify.
2. **Export `splitNovelText()`** from `novel2movie.ts` — refactor only.
3. **New `novel-script-handler.ts` + registry wiring** — smoke-test
   against the anime example with `--llm-model gemini-3.1-flash-lite`
   (cheap, ~$0.01).
4. **Extend `character-handlers.ts`** for `--novel` / `--project`.
5. **`handler-map.ts` + `command-registry.ts` + `command-groups.ts`**
   wire-up.
6. **Docs** — `07-stage-workflow.md`, update `00-overview.md`.
7. **Run the three-stage sequence end-to-end** on the anime example,
   fix anything that breaks, commit.

## Open questions before coding

- Keep CLI flag `--project` and map it to `options.projectId`, or
  rename `projectId` → `project` everywhere? → **Decision: keep both;
  `--project` populates `options.projectId`.** No breaking change.
- Root path: `~/Documents/QCut/projects/` vs `~/Documents/QCut/Exports/projects/`?
  → **Decision: `~/Documents/QCut/projects/`** — clearly distinct from
  the timestamped `Exports/` ad-hoc runs. Expose a
  `QCUT_PROJECTS_DIR` env var override for users who want to relocate.
- Should `project.json` be versioned? → **Yes, include
  `schema_version: 1`** so we can evolve the metadata shape safely.
