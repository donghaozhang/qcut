# Stage 4 — `flow novel2video` (Seedance + Vidu ref2v)

> **Status:** ✅ Implemented on 2026-04-14 (branch `cli-movie`).
> End-to-end smoke on `cdrama-heiress-real-1776148633` produced
> `videos/shot_1-1-1.mp4` (2.7 MB, $0.26, 6m 3s). Handler + adapter
> + upload helper all landed with 47 new + 19 regression tests green.
>
> **2026-04-14 follow-up:** adapter extended to a third family —
> `vidu_q3_ref2v_mix` (FAL). Vidu ships with only a ref2v endpoint;
> shots without catalogued characters or with a `firstFrameUrl`
> degrade cross-family to FAL Seedance 2.0 t2v / i2v. 110 tests
> green (47 Stage-4 + Vidu branches + 63 regression).
>
> **Known limitation:** server-side FAL key isn't configured on
> `qcut-license-server`, so `/api/ai/upload-url` returns 503. The
> adapter's designed fallback triggers — every shot degrades to
> `t2v` and the run still succeeds. Character-consistent `ref2v`
> awaits a `wrangler secret put FAL_API_KEY` on the worker.
>
> Peer stage to `flow characters` / `flow portraits` / `flow novel2script`.
> Reads `scripts/chunk_NNN.json` + `portraits/registry.json` from the
> project dir and generates one MP4 per shot using
> `gmi_seedance_2_0_260128_ref2v` (character-consistent), with
> `gmi_seedance_2_0_260128_t2v` as the fallback for shots that
> reference no catalogued character.
>
> **Target command:** `qcut flow novel2video --project <slug>`
>
> **Why ref2v instead of t2v:** Stage 2 already produced portrait PNGs
> per character. `ref2v` feeds those portraits back as
> `reference_images`, so Seedance keeps character appearance consistent
> across shots — the reason the staged workflow exists in the first
> place. The Apr-14 smoke run proved pure-t2v generates fresh faces
> every call, breaking continuity.

## Motivation

Stages 1–3 emit artifacts on disk that humans can inspect and edit.
Stage 4 was left on the monolithic `flow novel2movie` path for one
reason: the GMI ref2v wiring didn't exist. It landed on 2026-04-14
([seedance-2-0-260128-plan.md](../seedance-2-0-260128-plan.md)). The
backend is ready; what remains is the CLI-level orchestration and a
file-to-URL upload helper.

A separate **Stage 4 CLI** also unlocks:

- **Iteration without re-running earlier stages.** Re-generate one
  shot with a tweaked prompt without burning Stage 1/2/3 credits.
- **Explicit cost control.** `--max-shots N` mirrors
  `novel2script --max-scenes N` so you can cap a run before it
  balloons (Apr-14 Stage-3 run produced 59 shots → ~$15 at 5s each).
- **Idempotency.** Skip shots whose MP4 already exists on disk, so a
  crashed run resumes cheaply.
- **Project-portable output.** Videos land at
  `<proj>/videos/shot_NNN.mp4` next to their source scripts and
  portraits, matching the convention every other stage follows.

## Prerequisites

- [x] Seedance 2.0 260128 model wiring (`seedance-2-0-260128-plan.md`
  subtasks 1–5). Already shipped on branch `cli-movie`.
- [x] Proxy-mode `extractOutputUrl` fix — `api-provider-urls.ts`
  learned to read `video_url` at top-level so proxy-side GMI responses
  surface the output URL. Shipped with this planning doc's
  investigation.
- [ ] Local-file → HTTPS upload helper (subtask 1).

## Subtasks

All five subtasks landed in a single session; each subtask doc is
annotated with its implementation notes.

| # | Subtask | Status | Doc |
|---|---------|:-----:|-----|
| 1 | Upload helper: local file → HTTPS URL | ✅ | [07-novel2video/01-upload-helper.md](./07-novel2video/01-upload-helper.md) |
| 2 | Per-shot adapter: prompt + characters → Seedance call | ✅ | [07-novel2video/02-shot-adapter.md](./07-novel2video/02-shot-adapter.md) |
| 3 | `handleVimaxNovel2Video` CLI handler | ✅ | [07-novel2video/03-handler.md](./07-novel2video/03-handler.md) |
| 4 | CLI wiring: flags, registry, handler-map | ✅ | [07-novel2video/04-cli-wiring.md](./07-novel2video/04-cli-wiring.md) |
| 5 | Unit + integration tests | ✅ | [07-novel2video/05-tests.md](./07-novel2video/05-tests.md) |

## Guiding principles

- **Long-term maintainability > short-term shortcuts.** Prefer reusing
  `providerRouter` / `project-paths` / `stage-reporter` over inlining
  fresh HTTP calls, duplicate path helpers, or hand-rolled banners.
- **Variant routing is explicit.** A shot chooses ref2v / i2v / t2v
  based on its data, not a hidden heuristic. Adapter returns
  `{ variant, reason }` so the CLI can log it.
- **Omit rather than default.** Missing optional fields are omitted
  from the Seedance payload (matches subtask 2 of the original plan).
- **No silent spend.** Cost + shot count printed before any API call
  fires; `--confirm` or `--force` required when projected cost
  exceeds `$2` (configurable via `QCUT_COST_GATE`).
- **Files stay <800 lines.** The handler + adapter split is
  deliberate; if the handler grows past 500 lines, split shot-loop
  helpers into a third file.

## Directory layout (post-Stage 4)

```
~/Documents/QCut/projects/<slug>/
├── project.json
├── novel.md
├── characters.json
├── portraits/
│   ├── <character>/front.png
│   └── registry.json
├── scripts/
│   └── chunk_NNN.json
└── videos/                                 # NEW
    ├── shot_001-001-001.mp4                #  per-shot outputs
    ├── shot_001-001-002.mp4
    └── registry.json                       # shot_id → mp4 path + cost
```

Shot filenames use the `shot_id` already present in `chunk_NNN.json`
(format `scene-subscene-shot`, e.g. `1-1-1`), sanitized to `shot_1-1-1.mp4`.
`videos/registry.json` records each shot's outcome so downstream
concatenation can resolve MP4s by `shot_id` without globbing.

## CLI surface

```bash
qcut flow novel2video \
    --project cdrama-heiress-v3 \
    [--max-shots 10] \
    [--duration 5] \
    [--resolution 720p] \
    [--aspect-ratio 16:9] \
    [--concurrency 1] \
    [--force]
```

Flags (full specs in subtask 4):

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--project` | string | (required) | Project slug under `$QCUT_PROJECTS_DIR` |
| `--max-shots` | number | ∞ | Cap total shots generated this run |
| `--duration` | number | per-shot from script, clamped to 4–15 | Seconds per shot |
| `--resolution` | string | `720p` | Forwarded to ref2v payload |
| `--aspect-ratio` | string | `16:9` | Forwarded as `ratio` |
| `--concurrency` | number | 1 | Parallel shots in flight |
| `--force` | boolean | false | Overwrite existing `shot_*.mp4` |
| `--model` | string | `gmi_seedance_2_0_260128_ref2v` | Primary variant |
| `--fallback-model` | string | `gmi_seedance_2_0_260128_t2v` | No-character shots |

## Payload contract (per shot)

For shots with ≥1 character that has a catalogued portrait:

```jsonc
{
  "model": "seedance-2-0-260128",
  "payload": {
    "prompt": "<shot.description — dialogue stripped>",
    "duration": 5,
    "resolution": "720p",
    "ratio": "16:9",
    "reference_images": [
      "https://<upload-host>/portraits/<slug>/<character>.png"
    ],
    "generate_audio": true
  }
}
```

For shots with no referenceable character, fall back to
`gmi_seedance_2_0_260128_t2v` (same payload minus `reference_images`).
For shots that already have a `first_frame` URL provided by an earlier
continuity pass, use `gmi_seedance_2_0_260128_i2v`.

## Rollout steps

1. Subtask 1 — upload helper (blocks 2, 3, 5).
2. Subtask 2 — shot adapter (blocks 3, 5; parallel with wiring).
3. Subtask 3 — handler (blocks 4).
4. Subtask 4 — CLI wiring (end-user visible; final glue).
5. Subtask 5 — tests (should land in same PR as 1–4, not after).

Stage 4 is gated behind its registry entry + handler — landing 1–3
without 4 causes no regression.

## Open questions

- **Upload destination.** Two options:
  1. License-server proxy asset bucket (preferred — we already trust
     the proxy, and auth piggy-backs on `QCUT_AUTH_TOKEN`).
  2. fal-storage (existing integration in
     `apps/web/src/lib/fal/fal-storage.ts`) — unclear if the CLI
     path can call it cleanly without bundling React-side code.

  Subtask 1 picks option 1 unless discovery reveals a cheaper path.

- **Continuity between shots.** Seedance 2.0 can accept a `last_frame`
  URL for chaining. Deferred to a follow-up plan; the MVP stays
  shot-independent.

- **Audio.** `generate_audio: true` is on by default. Probably want a
  `--no-audio` flag once we see real output — defer the knob until
  we've seen whether native audio is usable for cdrama-style dialogue.

## Files changed / added (actually shipped)

### Added

- `electron/native-pipeline/output/upload-helper.ts` — local → URL
  uploader via `POST /api/ai/upload-url` + signed PUT.
- `electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter.ts`
  — pure per-shot variant + payload builder (no fs, no fetch).
- `electron/native-pipeline/cli/vimax-cli-handlers/video-handler.ts`
  — `handleVimaxNovel2Video` orchestrator (~400 lines).

### Modified

- `electron/native-pipeline/cli/command-registry.ts` — new
  `vimax:novel2video` entry + appended to the `vimax` group list.
- `electron/native-pipeline/cli/command-groups.ts` — alias
  `flow novel2video` → `vimax:novel2video`.
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` —
  registered `wrapOP(handleVimaxNovel2Video)`.
- `electron/native-pipeline/cli/vimax-cli-handlers.ts` — re-export
  `handleVimaxNovel2Video`.
- `electron/native-pipeline/cli/cli-runner/types.ts` — added
  `maxShots`, `concurrency`, `fallbackModel`, `costGate` to
  `CLIRunOptions`.
- `electron/native-pipeline/cli/cli.ts` — parseArgs config +
  normalization for `--max-shots`, `--concurrency`,
  `--fallback-model`, `--cost-gate`.
- `electron/native-pipeline/output/project-paths.ts` — added
  `safeShotFilename`, `shotVideoPath`, `videoRegistryPath`.
- `electron/native-pipeline/output/stage-reporter.ts` — added
  `estimateNovel2Video(shots, averageShotSeconds)`.

### Tests

- `electron/native-pipeline/output/__tests__/upload-helper.test.ts`
  — 12 tests (incl. `inferContentType` suite).
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts`
  — 22 tests (clamp + sanitize + adapter matrices).
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts`
  — 13 integration tests (real tmp dirs, mocked network).

## Verification

```
bunx vitest run \
  electron/native-pipeline/output/__tests__/upload-helper.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts \
  electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts
→ 5 files · 66 tests · all green (1.22s)

cd electron && bunx tsc --noEmit → clean
bun run build                    → dist rebuilt
qcut flow novel2video --help     → command discoverable
```

Live smoke (2026-04-14 on `cdrama-heiress-real-1776148633`):
- `qcut flow novel2video --project <slug> --max-shots 1 --duration 5`
- Portrait uploads returned 503 (FAL key missing on worker)
- Adapter degraded shot 1-1-1 to `t2v` per design
- `videos/shot_1-1-1.mp4` (2.7 MB) + `videos/registry.json`
  written
- `project.json.stages_completed` now includes `"videos"`
- Duration: 6m 3s · Cost: $0.260

## Supported model families

| `--model` value | Family | Ref2V field | Duration type | $/s (worst case) | Notes |
|---|---|---|---|---|---|
| `gmi_seedance_2_0_260128` (default) | GMI | `reference_images` | integer | **$0.052** | Cheapest; all three variants (t2v/i2v/ref2v) on one endpoint |
| `seedance_2_0` | FAL | `image_urls` (up to 9) | string literal | $0.60 | Fallback for GMI outages; three distinct endpoints |
| `vidu_q3_ref2v_mix` | FAL | `reference_image_urls` (up to 4) | integer | $0.154 | Character-consistent ref2v only. Shots without catalogued characters or with a `firstFrameUrl` degrade to FAL Seedance 2.0 (same provider, adjacent model) |

Variant selection within the chosen family is automatic (adapter
reads `shot.characters` + `shot.firstFrameUrl`). `--model` picks the
**family**, not a specific variant.

## Follow-up

- **Worker FAL key.** `wrangler secret put FAL_API_KEY` on
  `qcut-license-server` unlocks the ref2v path end-to-end. Until
  that lands, `flow novel2video` operates in t2v-only mode.
- **Concurrency `> 1`.** Flag is wired and typed but the handler
  still runs shots serially. Parallelism needs a `runPool()`
  helper (or reuse of `parallel-executor.ts`); deferred.
- **`--fallback-model` flag.** Accepted by the parser but the
  handler currently hard-codes `_t2v` as the fallback. The
  adapter supports a runtime override — wiring it through the
  handler is a ~5-line follow-up.
- **Vidu cost tiers.** Registry distinguishes $0.07/s (360p/540p)
  from $0.154/s (720p+). Handler uses the worst-case rate for the
  gate; a resolution-aware lookup would tighten cost estimates
  for 360p/540p runs.
