# Task 8: Flow Command Bug Fixes

Fix three concrete flag-contract bugs in the `qcut flow` command family before shipping user-facing docs.

## Why

Documenting a broken surface ships broken examples. Each bug is a silent UX failure: the command parses, the handler runs, but the input the user passed is never read. These must be fixed before the docs in task 9 describe them as working.

## Relevant Files

| File | Role |
|------|------|
| `electron/native-pipeline/cli/command-registry.ts` | Flag declarations (source of truth for `--help`) |
| `electron/native-pipeline/cli/vimax-cli-handlers/registry-handlers.ts` | `create-registry` + `show-registry` handlers |
| `electron/native-pipeline/cli/vimax-cli-handlers/pipeline-handlers.ts` | `idea2video` handler (reads `options.duration`) |
| `electron/native-pipeline/cli/cli.ts` | `parseCliArgs()` — flag → `CLIRunOptions` mapping |
| `electron/native-pipeline/cli/cli-runner/types.ts` | `CLIRunOptions` interface |
| **New**: `electron/__tests__/cli-flow-contracts.test.ts` | Regression tests (detailed in task 10) |

## Bug 1: `flow registry-create` — `--directory` flag not wired

**Symptom**: `qcut flow registry-create --directory ./portraits` runs but processes no directory.

**Root cause**:
- `command-registry.ts:1350–1361` declares the command with `--directory` as required.
- `registry-handlers.ts:15` reads `options.input`, never `options.directory`.
- `parseCliArgs()` in `cli.ts` does not map `--directory` to `CLIRunOptions`.

**Fix steps**:
1. In `cli-runner/types.ts`, add `directory?: string` to `CLIRunOptions` (grouped near other path fields).
2. In `cli.ts` `parseCliArgs()` option definitions, register `directory: { type: "string" }` and map `values.directory` into the returned `CLIRunOptions`.
3. In `vimax-cli-handlers/registry-handlers.ts:15`, read `options.directory ?? options.input` (keep `input` as fallback for any existing callers).
4. Verify handler's error message references the correct flag name (`--directory`, not `--input`).

**Verification**:
- `qcut flow registry-create --directory ./test-portraits` — handler sees the path.
- Regression test: parse `["flow","registry-create","--directory","./x"]` → assert `options.directory === "./x"`.

## Bug 2: `flow registry-show` — `--project-id` flag not wired

**Symptom**: `qcut flow registry-show --project-id abc123` treats `--project-id` as unknown and no project is loaded.

**Root cause**:
- `command-registry.ts:1362–1368` declares `--project-id` (optional).
- `registry-handlers.ts:96` reads `options.input`.
- `parseCliArgs()` does not map `--project-id` to `options.projectId`.

**Fix steps**:
1. In `cli-runner/types.ts`, add `projectId?: string` to `CLIRunOptions`.
2. In `cli.ts` `parseCliArgs()`, register `"project-id": { type: "string" }` and set `projectId: values["project-id"] as string | undefined`.
3. In `registry-handlers.ts:96`, read `options.projectId ?? options.input`.

**Verification**:
- `qcut flow registry-show --project-id test-proj` — handler sees the id.
- Regression test: parse `["flow","registry-show","--project-id","abc"]` → assert `options.projectId === "abc"`.

## Bug 3: `flow idea2video` — `--duration` flag undocumented

**Symptom**: `qcut flow idea2video --help` does not list `--duration`, but `qcut flow idea2video --duration 30 --idea "..."` *does* work — the handler reads it at `pipeline-handlers.ts:79`. Help output and runtime diverge.

**Root cause**: `command-registry.ts:1204–1231` omits `--duration` from the flags list for `vimax:idea2video`. The flag is already parsed by `cli.ts` (it is a shared numeric option), so runtime works, but the help and registry-driven autocomplete are wrong.

**Fix steps**:
1. In `command-registry.ts:1204–1231` (inside the `"vimax:idea2video"` `flags` array), add:
   ```ts
   f("--duration", "number", "Target clip duration in seconds", { default: 5 })
   ```
   (confirm default by reading `pipeline-handlers.ts:79` — use the same default the handler uses, or `undefined` if the handler treats undefined as "model default").
2. Audit `script2video` and `novel2movie` entries (lines 1232–1288) for the same omission — if their handlers also read `options.duration`, add the flag declaration there too.
3. Do **not** add the flag to `parseCliArgs()` unless it is missing; it likely already exists as a shared numeric option.

**Verification**:
- `qcut flow idea2video --help` lists `--duration`.
- Regression test: `getCommand("vimax:idea2video").flags` contains an entry with name `"--duration"`.
- Contract test (task 10): for every handler in the flow family, every `options.X` read in the handler body has a corresponding flag declared in `command-registry.ts`.

## Order of Operations

1. Write the regression tests first (they will fail). See task 10.
2. Fix Bug 1, Bug 2 (types + cli.ts + handlers) — one commit.
3. Fix Bug 3 (registry-only change) — one commit.
4. Re-run `bun run test` — all three regression tests go green.
5. Run `bun check-types` and `bun lint:clean`.

## Risk

Low. Changes are additive flag declarations + a fallback `??` chain in two handlers. No behavior changes for existing callers who happened to pass `--input` (the fallback preserves that path).

## Out of Scope

- Renaming `--input` to `--directory` everywhere (breaking change — out).
- Refactoring `CLIRunOptions` (246 fields — separate task, deferred).
- Updating help output formatting (task 9).
