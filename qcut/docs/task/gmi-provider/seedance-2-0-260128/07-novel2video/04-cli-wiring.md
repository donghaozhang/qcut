# Subtask 4 — CLI wiring

> **Status:** ✅ Landed. `qcut flow novel2video --help --json`
> lists all 8 flags. Command appears in the ViMax group and
> dispatches to `handleVimaxNovel2Video` via `handler-map.ts`.
> `bun run build` is required to refresh the global binary after
> edits to the registry or handler-map (memory notes this).

Glue the handler into the user-visible CLI surface. Parallels how
`flow novel2script` is wired — three files, each a small edit.

## Files

### Modify

- `electron/native-pipeline/cli/command-registry.ts` — add
  `vimax:novel2video` entry with flags + examples.
- `electron/native-pipeline/cli/command-groups.ts` — add
  `novel2video: "vimax:novel2video"` to the `flow` group so
  `qcut flow novel2video` dispatches correctly.
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` — import
  + register the new handler with `wrapOP(handleVimaxNovel2Video)`.
- `electron/native-pipeline/cli/cli-runner/types.ts` — extend
  `CLIRunOptions` with:
  - `maxShots?: number`
  - `concurrency?: number`
  - `fallbackModel?: string`
  - `costGate?: number`
- `electron/native-pipeline/cli/cli.ts` — in the `parseArgs`
  configuration block, register the new flags:
  `--max-shots` (number), `--concurrency` (number),
  `--fallback-model` (string), `--cost-gate` (number).

## `command-registry.ts` entry

Mirror the shape of the existing `vimax:novel2script` entry (around
line 1373). Example:

```ts
"vimax:novel2video": {
	name: "vimax:novel2video",
	description: "Generate per-shot videos from a project's scripts using Seedance 2.0 ref2v",
	category: "vimax",
	flags: [
		f("--project", "string", "Project slug under QCUT_PROJECTS_DIR", { required: true }),
		f("--max-shots", "number", "Cap total shots generated this run"),
		f("--duration", "number", "Seconds per shot (clamped 4-15)"),
		f("--resolution", "string", "Seedance resolution", { default: "720p" }),
		f("--aspect-ratio", "string", "Seedance ratio", { default: "16:9" }),
		f("--concurrency", "number", "Parallel shots in flight", { default: 1 }),
		f("--force", "boolean", "Overwrite existing shot MP4s + bypass cost gate"),
		f("--model", "string", "Primary variant", { default: "gmi_seedance_2_0_260128_ref2v" }),
		f("--fallback-model", "string", "Used when a shot has no catalogued characters", { default: "gmi_seedance_2_0_260128_t2v" }),
		f("--cost-gate", "number", "Projected-cost ceiling; override with --force"),
	],
	examples: [
		"qcut flow novel2video --project my-story",
		"qcut flow novel2video --project my-story --max-shots 5 --duration 5",
		"qcut flow novel2video --project my-story --concurrency 2 --force",
	],
},
```

## `command-groups.ts`

Single line addition inside the `flow:` mapping:

```ts
flow: {
	characters:   "vimax:extract-characters",
	portraits:    "vimax:generate-portraits",
	novel2script: "vimax:novel2script",
	novel2video:  "vimax:novel2video",   // NEW
	run:          "vimax:run",
	// ...existing entries
}
```

## `handler-map.ts`

```ts
import { handleVimaxNovel2Video } from "../vimax-cli-handlers/video-handler.js";

// ...existing map entries
"vimax:novel2video": wrapOP(handleVimaxNovel2Video),
```

## `types.ts`

Add to the `CLIRunOptions` interface (current location around the
existing `chunkSize` / `overlap` fields, ~line 57):

```ts
/** Novel2Video — cap shots generated this run */
maxShots?: number;

/** Novel2Video — concurrent shots in flight (default 1) */
concurrency?: number;

/** Novel2Video — primary variant override (default ref2v) */
model?: string;    // already exists globally, reuse

/** Novel2Video — fallback when no catalogued character */
fallbackModel?: string;

/** Novel2Video — projected-cost ceiling; overridden by --force */
costGate?: number;
```

## `cli.ts` arg parsing

Around the existing `parseArgs` config, register the new flags:

```ts
"max-shots":       { type: "string" },  // parsed to number in the runner
"concurrency":     { type: "string" },
"fallback-model":  { type: "string" },
"cost-gate":       { type: "string" },
```

…and map them in the `values → options` normalization block:

```ts
maxShots:      Number(values["max-shots"]) || undefined,
concurrency:   Number(values["concurrency"]) || undefined,
fallbackModel: values["fallback-model"] as string | undefined,
costGate:      Number(values["cost-gate"]) || undefined,
```

Follow the same coercion pattern as existing numeric flags
(`--chunk-size`) — don't silently swallow `NaN`.

## Discoverability

After wiring, `qcut --help` should list `flow novel2video` inside
the ViMax group. Spot-check:

```bash
bun run build
qcut flow --help                    # includes novel2video
qcut flow novel2video --help        # full flag list
qcut flow novel2video --help --json # machine-readable spec
```

## Backward compatibility

No existing flag names change. The four new CLI flags are all
opt-in. If `--project` is missing, the handler returns a clear error
from subtask 3 rather than this layer trying to guess.

## Definition of done

- [ ] `qcut flow novel2video --help` shows the new command and all
  10 flags.
- [ ] `qcut flow novel2video --project <slug>` dispatches to
  `handleVimaxNovel2Video` and no other handler.
- [ ] JSON help output validates (`qcut flow novel2video --help
  --json | jq .`).
- [ ] Running `bun run build` refreshes the global CLI to expose the
  new command (see memory: rebuild required).
