# Subtask 5 — Tests

Verify the Stage 4 path end-to-end without burning GMI credits by
mocking the provider router + the uploader. Three new test files,
plus one update to the routing matrix.

## Files

### Add

- `electron/native-pipeline/output/__tests__/upload-helper.test.ts`
  — covered by subtask 1. Listed here so the full test matrix
  lives in one place.
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts`
  — covered by subtask 2. Same note.
- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts`
  — **new for this subtask**. Integration-style: real
  `project-paths` + fs, mocked fetch / upload / provider router.
  ~300 lines.

### Modify

- `electron/native-pipeline/cli/cli-runner/__tests__/handler-map.test.ts`
  (if it exists; otherwise add a minimal assertion inside an
  existing CLI-runner test) — confirm `"vimax:novel2video"` resolves
  to `handleVimaxNovel2Video`.
- `electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts`
  — already covers the `video_url` extraction from the investigation
  fix. Re-run as regression.

## Handler integration test matrix (`video-handler.test.ts`)

Use a real temp directory (`os.tmpdir()` + unique prefix) to simulate
the project layout; mock only the network surface.

1. **Happy path (2 shots, ref2v).** Project has 2 characters,
   scripts have 2 shots referencing both. Mocked uploader returns
   deterministic URLs. Mocked provider router returns a fixed
   `{ video_url }` per shot. Assert:
   - Two `videos/shot_X.mp4` files written with mocked body.
   - `videos/registry.json` has 2 success entries with `variant:
     "gmi_seedance_2_0_260128_ref2v"`.
   - `project.json.stages_completed` ends with `["..", "videos"]`.
2. **Mixed variants.** Shot A has a catalogued character → ref2v;
   shot B has only an unknown character → t2v fallback. Assert both
   variants appear in the registry.
3. **No portraits directory.** Delete `portraits/` and run. Handler
   should degrade gracefully: all shots use t2v, no upload calls
   made. Assert uploader fetch stub called zero times.
4. **Idempotent skip.** Pre-seed `videos/shot_1-1-1.mp4` (empty
   file). Run without `--force`. Assert the first shot is skipped
   (no provider call), second shot runs normally.
5. **--force overwrites.** Same setup as 4, but with `--force`.
   Assert two provider calls happened and the pre-seeded file is
   replaced.
6. **--max-shots caps.** Project has 5 shots; run with `--max-shots
   2`. Assert exactly 2 provider calls + 2 MP4s written.
7. **Cost gate trips.** Project has 50 shots × 5s = $13. Run with
   default `$2` gate. Assert `success: false`, error mentions
   projected cost, zero provider calls made.
8. **Cost gate override.** Same as 7 but with `--force`. Assert
   provider calls happen.
9. **Per-shot failure is non-fatal.** Mock provider router to fail
   on shot 2 only. Run with 3 shots. Assert registry has `[success,
   failed, success]`, handler returns `success: true` with
   `data.errors === 1`.
10. **Abort signal mid-run.** Abort after shot 1 completes. Assert
    shot 2 gets a cancellation error, loop exits, registry partial
    but coherent.
11. **Invalid project slug.** Missing `--project`. Assert clean
    error message, no fs writes.
12. **Portrait upload failure.** Uploader throws on one portrait.
    Assert that character is treated as uncatalogued (shots
    referencing only that character drop to t2v) rather than the
    whole run failing.
13. **Progress callback fires at shot boundaries.** Collect onProgress
    calls; assert percent monotonically increases and messages
    name the current shot id.

## Shared mocks

Create `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/fixtures/`:

- `mini-project/` — a fixture project dir with 2 characters, 1
  chunk, 5 shots. Copied into tmp dir at the start of each test so
  state doesn't leak between runs.
- `mini-portraits/` — 2 tiny PNG files (≤1 KB each) used as fake
  portraits. Avoid shipping real images — generate a 1x1 PNG at
  test setup time.

Inject mocks via dependency-injection parameters on
`handleVimaxNovel2Video` (mirrors the `HandleRecordDeps` pattern
from `cli-handlers-record.ts`):

```ts
export interface HandleVimaxNovel2VideoDeps {
	uploadImpl?: typeof uploadFileForReference;
	submitImpl?: typeof providerRouter.submit;
	pollImpl?: typeof providerRouter.poll;
	downloadImpl?: typeof downloadOutput;
}
```

The real handler signature keeps deps optional; production callers
omit them. Tests inject stubs per-case.

## Running the suite

```bash
bunx vitest run \
  electron/native-pipeline/output/__tests__/upload-helper.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-handler.test.ts \
  electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts
```

All four files should be green before merging Stage 4. Expected
counts:

| File | Tests |
|------|------:|
| `upload-helper.test.ts` | 10 |
| `video-shot-adapter.test.ts` | 13 |
| `video-handler.test.ts` | 13 |
| `api-provider-urls.test.ts` | 11 (regression) |
| **Total** | **47** |

Also run the existing GMI + generator suites as regression:

```bash
bunx vitest run electron/native-pipeline/infra/__tests__/ \
  apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts \
  apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts
```

Expected: 19 + 25 = 44 green, no changes needed.

## Manual acceptance run

After the unit suite is green, run one real shot end-to-end against
the license-server proxy:

```bash
qcut flow novel2video --project cdrama-heiress-real-1776148633 \
    --max-shots 1 --duration 5
```

Expected: one `videos/shot_X.mp4` file, ~$0.26 charged, shot chooses
ref2v with the two main characters' portraits as references. Keep
the output for visual diff against the pre-fix t2v baseline already
in the project dir.

## Definition of done

- [ ] All 47 new/updated tests green via `bunx vitest run`.
- [ ] Manual acceptance run produces a playable MP4.
- [ ] No existing test regressed.
- [ ] `bunx tsc -p electron/tsconfig.json --noEmit` stays clean.
