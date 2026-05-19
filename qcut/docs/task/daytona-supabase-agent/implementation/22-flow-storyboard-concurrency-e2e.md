# Flow Storyboard Concurrency Daytona E2E

Date: 2026-05-19
Branch: `cli-image-v6`
Commit: `d3fdf166f`
PR: https://github.com/Quriosity-agent/qcut/pull/306

## Summary

Status: passed.

`qcut flow storyboard` now generates storyboard image tasks with bounded concurrency. The default is 6, and explicit `--concurrency` values are clamped so they never exceed 6.

The real Daytona E2E passed with `--concurrency 99` and proved the runtime clamp:

```text
[storyboard] Running 6 image task(s) with concurrency 6
[storyboard] Generated: 6 images, $0.252 cost
```

## Implementation

Changed files:

```text
electron/native-pipeline/vimax/agents/storyboard-artist.ts
electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts
electron/native-pipeline/cli/command-registry.ts
electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts
packages/license-server/wrangler.toml
```

Behavior:

- `StoryboardArtistConfig.concurrency` defaults to `6`.
- `normalizeConcurrency()` clamps to `1...6` and also caps by task count.
- `StoryboardArtist.process()` now builds independent image tasks first, then runs a worker pool.
- Results are stored by original task index, so output order remains deterministic.
- Storyboard output filenames now include global `shot_###`, preventing same-scene same-shot-type overwrites during concurrent writes.
- `qcut flow storyboard --concurrency <n>` is passed from the CLI handler and shown in command registry help.

## Deployment Under Test

- CLI image tag: `ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347`
- CLI image GitHub Actions run: https://github.com/Quriosity-agent/qcut/actions/runs/26126197782
- License server deploy version: `8eb2c06f-fc1e-4b6e-96ef-6a11bf5bf6a4`
- Worker URL: `https://qcut-license-server.zdhpeter.workers.dev`
- Daytona-backed job: `d07b5174-94f6-4582-ac91-6b654a961e5a`

## Local Verification

Passed:

```bash
bunx vitest run \
  electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts \
  electron/native-pipeline/vimax/agents/__tests__/character-portraits.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts
```

Result: 3 files, 7 tests passed.

Passed:

```bash
cd electron && bun x tsc --noEmit
```

Passed:

```bash
npx @biomejs/biome check \
  electron/native-pipeline/vimax/agents/storyboard-artist.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts \
  electron/native-pipeline/cli/command-registry.ts \
  electron/native-pipeline/vimax/agents/__tests__/storyboard-artist.test.ts
```

Local CLI smoke also passed in isolated mock mode:

```bash
env -i PATH="$PATH" HOME="$tmp_home" \
  bun run qcut flow storyboard \
  --scenes "$tmpdir/scenes.json" \
  --image-model gpt_image_2_ima \
  --concurrency 99 \
  -o "$tmpdir/out" \
  --json
```

Observed:

```text
[storyboard] Running 4 image task(s) with concurrency 4
```

## Real Daytona E2E

The first browser PTY attempt through `https://quriosity.com.au/chat-agent.html` did not reach a stable WebSocket-ready state in headless Chrome. The license-server `pty-token` endpoint did return a Daytona session using the new image tag, but the UI-side WebSocket stayed at `Connecting to Daytona Codex...`.

To keep the test on the real online Daytona path, the final verification used the production Supabase queue and a local `agent-worker` pointed at the new CLI image tag. That worker claimed the production job and created a real Daytona sandbox with:

```text
QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347
```

The Codex prompt asked the Daytona sandbox to run:

```bash
qcut flow storyboard \
  --scenes /tmp/qcut-input/storyboard-concurrency/scenes.json \
  --image-model gpt_image_2_ima \
  --concurrency 99 \
  -o /tmp/qcut-output/storyboard-concurrency/images \
  --json 2>&1 | tee /tmp/qcut-output/storyboard-concurrency-run.log
```

The sandbox then copied exactly six PNGs to `/tmp/qcut-output/storyboard-concurrency-01.png` through `storyboard-concurrency-06.png`, wrote `storyboard-concurrency-done.json`, and wrote `storyboard-concurrency-proof.md`.

## Result

Downloaded proof:

```json
{"status":"success","run_id":"2026-05-19T21-55-47-610Z","image_tag":"ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347","png_count":6,"requested_concurrency":99,"observed_concurrency":6,"duration_seconds":113}
```

Downloaded proof markdown:

```text
status: success
run_id: 2026-05-19T21-55-47-610Z
image_tag: ghcr.io/quriosity-agent/qcut-cli:storyboard-concurrency-20260519212347
observed_log: Running 6 image task(s) with concurrency 6
png_count: 6
duration_seconds: 113
```

All six downloaded images are valid PNGs:

```text
downloaded-storyboard-concurrency-01.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-02.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-03.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-04.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-05.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
downloaded-storyboard-concurrency-06.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

Local evidence folder:

```text
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/
```

Key evidence files:

```text
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-run.log
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-done.json
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-proof.md
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-01.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-02.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-03.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-04.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-05.png
output/playwright/storyboard-concurrency-worker-job-2026-05-19T21-59-36-678Z/downloaded-storyboard-concurrency-06.png
```

## Notes

- The production license-server was deployed with the new immutable image tag.
- The old default persistent Chat Agent test session was still present and made the headless UI PTY path unreliable in this run.
- The successful run still used the production Supabase/Daytona agent-worker path and a real Daytona sandbox, not a local mock.
