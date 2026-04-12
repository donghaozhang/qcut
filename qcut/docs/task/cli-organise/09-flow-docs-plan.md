# Task 9: Flow Command User Documentation

Write 8 user-facing docs for the `qcut flow` command family. Depends on task 8 (bugfixes) — docs must describe the fixed surface.

## Why

Phase 1 docs ([00–06](00-overview.md)) are architecture-facing. End users running `qcut flow idea2video` need reference material answering: *what does this do, what flags exist, what's a realistic example, how does it compose with other commands*. Today that knowledge only exists in handler source code.

## Relevant Files

**New docs (written in this task)**:

| # | File | Subject | Depends on code |
|---|------|---------|-----------------|
| 1 | `docs/task/cli-organise/flow/01-flow-overview.md` | Taxonomy, workflow diagram, when-to-use matrix | `command-groups.ts` |
| 2 | `docs/task/cli-organise/flow/02-flow-run.md` | YAML pipeline executor | `handler-pipeline.ts`, example YAMLs |
| 3 | `docs/task/cli-organise/flow/03-flow-vimax-pipelines.md` | `idea2video` / `script2video` / `novel2movie` | `pipeline-handlers.ts` |
| 4 | `docs/task/cli-organise/flow/04-flow-scripts-storyboards.md` | `script` / `storyboard` / `characters` | `script-handlers.ts`, `character-handlers.ts` (extract) |
| 5 | `docs/task/cli-organise/flow/05-flow-characters-registry.md` | `portraits` / `registry-create` / `registry-show` | `character-handlers.ts`, `registry-handlers.ts` |
| 6 | `docs/task/cli-organise/flow/06-flow-flags-reference.md` | Unified flag table across all 11 commands | `command-registry.ts:419–1375` |
| 7 | `docs/task/cli-organise/flow/07-flow-integration-examples.md` | End-to-end compositions | all handlers |
| 8 | `docs/task/cli-organise/flow/08-flow-troubleshooting.md` | Common errors → fixes | stderr messages in handlers |

> **Structural note**: nested under `flow/` subdirectory to keep top-level `cli-organise/` from sprawling. Top-level keeps the phase plans (00–10); subdirectory keeps the user docs.

**Files to update**:
- `docs/task/cli-organise/00-overview.md` — append a "Phase 2" section linking the `flow/` subdirectory.
- `qcut/packages/nexusai-website` (submodule) — optional follow-up card for the website; not in this task.

## Content Outlines

### flow/01-flow-overview.md (~400 words)
- One-sentence description of each of the 11 commands.
- Workflow diagram (Mermaid or ASCII): `idea → script → characters → portraits → storyboard → video`.
- "Which command should I use?" decision tree (text-based).
- Link to per-command docs.
- Cross-link back to [02-command-groups.md](../02-command-groups.md).

### flow/02-flow-run.md (~500 words)
- Purpose: executes YAML pipeline definitions.
- Required flags: `--config` (or `-c`).
- Optional flags: `--input` / `--text` / `--prompt-file`, `--save-intermediates`, `--parallel`, `--max-workers`, `--no-confirm`, `--stream`.
- YAML schema at-a-glance (point to `packages/video-agent-skill/pipelines/` for examples).
- Examples:
  - Simple chain
  - Parallel execution with `--max-workers 4`
  - Dry-run cost preview
- Troubleshooting: YAML parse errors, worker limits, `--no-confirm` for CI.

### flow/03-flow-vimax-pipelines.md (~800 words)
One heading per command (`idea2video`, `script2video`, `novel2movie`).

For each:
- Purpose + input format.
- Required + optional flags (pulled from `command-registry.ts`).
- **Explicitly document `--duration`** (post-bugfix).
- Explicitly document `--no-portraits` / `--no-references` semantics (confirm with code read before writing).
- Shared flag section: `--llm-model`, `--image-model`, `--video-model`, `--max-scenes`.
- Two examples per command (minimal + advanced).
- Stage breakdown: idea → script → storyboard → portraits → video, with rough cost/time per stage.

### flow/04-flow-scripts-storyboards.md (~600 words)
Covers LLM-only and single-step image commands: `script`, `storyboard`, `characters`.
- Use case: "I want the script, not the full pipeline."
- Integration points: output of `script` feeds `storyboard` and `characters`; output of `characters` feeds `portraits`.
- Flag tables per command.
- Example: generate script, hand-edit, then `flow storyboard --script script.md`.

### flow/05-flow-characters-registry.md (~600 words)
Covers `portraits`, `registry-create`, `registry-show`.
- **Post-bugfix flag names**: `--directory` for `registry-create`, `--project-id` for `registry-show`.
- Registry file format (point to actual schema if one exists — read the handler to confirm).
- Workflow: extract characters → generate portraits → save to registry → reuse registry across pipelines for consistent likeness.
- Views, styles, and reference-model options for portraits.

### flow/06-flow-flags-reference.md (~400 words)
- One master table: rows = commands, columns = flags. Mark required/optional/default.
- Shared flag glossary (model selection, output control, execution control).
- Generated — or verified — against `command-registry.ts`. Contract test (task 10) asserts this doc stays in sync.

### flow/07-flow-integration-examples.md (~700 words)
- 3–4 fully worked examples:
  1. Idea → final 30s video (one command, `flow idea2video`).
  2. Idea → edited script → storyboard → video (three commands, human-in-the-loop).
  3. Novel → movie with reusable portrait registry (`registry-create` once, referenced by subsequent `flow novel2movie` calls).
  4. `flow run` composing a custom YAML pipeline across non-flow commands (e.g., `gen image` + `analyze video`).
- Each example includes exact commands, expected output paths, and cost estimates.

### flow/08-flow-troubleshooting.md (~400 words)
- "Command runs but produces no output" → check directory/project-id flag names (point to bugfix notes).
- "Model not found" → model key mismatch; point to registry listing command.
- "API key missing" → list which env var each model uses.
- "Cost too high" → use `--max-scenes`, `--max-images`, `--scripts-only`.
- "Reference consistency broken" → registry workflow.

## Authoring Conventions

- **Source from code, not memory.** Each flag table must be cross-checked against `command-registry.ts` at write time. Contract test enforces this post-hoc.
- **Examples must execute.** Before committing, run each example once against a sandbox to confirm it completes. Capture the actual output paths.
- **Link back.** Every doc links to `00-overview.md` and its sibling docs. Avoid dead-end pages.
- **No marketing voice.** Reference manual tone — "generates portraits from character descriptions" beats "AI-powered portrait magic."
- **800-line cap** per the project rule. Split if a doc grows too large.

## Ordering

1. Write `flow/06-flow-flags-reference.md` first (mechanical — extract from `command-registry.ts`). This becomes the source-of-truth table other docs link to.
2. Then `flow/01-flow-overview.md` (navigational skeleton).
3. Then command-group docs (`02` through `05`).
4. Then `07-integration-examples.md` (depends on per-command docs being accurate).
5. Finally `08-troubleshooting.md` (harvested from error messages + realistic misuse patterns).

## Verification

- Every command in `command-groups.ts:64–80` is documented somewhere in `flow/`.
- Every flag in `command-registry.ts:419–1375` for a flow command appears in the flags reference.
- Every example in docs runs successfully against the dev environment.
- Contract test in task 10 passes.

## Risk

Medium — scope is 8 docs (~4500 words). Mitigation: write the flags reference first (mechanical), keep other docs to ~500 words each, cross-link heavily instead of duplicating.

## Out of Scope

- Website/landing-page card for `flow` group (nexusai-website submodule — follow-up).
- Video walkthroughs.
- Translating docs.
