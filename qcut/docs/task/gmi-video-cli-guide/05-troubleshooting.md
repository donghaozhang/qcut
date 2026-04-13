# 05 — Troubleshooting

Every failure mode observed in this session's end-to-end GMI video
testing, with the diagnostic command that surfaced it and the fix (or
workaround) that resolved it.

## Quick triage

If a `flow novel2movie` / `flow script2video` run looks wrong, in order:

```bash
# 1. Last completed run's summary
cat ~/Documents/QCut/Exports/novel2movie/*/summary.json | tail -1 | jq .

# 2. Is the process still running?
pgrep -fl 'node.*(novel2movie|script2video)' | head -1

# 3. Grep stderr for provider + retry evidence
grep -E '"provider"|Transient error|Failed|error \d{3}' /path/to/captured.stderr

# 4. Are the output files real media or placeholders?
file ~/Documents/QCut/Exports/**/*.{png,mp4}
```

## Failure modes

### A) `GMI API error 400: invalid payload parameters: image (Required parameter is missing)`

- **What it means:** Adapter sent `image_url` but GMI wants `image`.
- **When seen:** First Kling run in this session (before commit `f84b418df`).
- **Fix:** Already landed in `video-adapter.ts:buildImageField()` — picks
  the right field per `providerBackend`.
- **If you still see this:** You're running a dist from before
  `f84b418df`. Run `bun run build` and re-invoke.

### B) `GMI API error 500: context deadline exceeded`

- **What it means:** GMI submitted successfully but Kling upstream
  timed out.
- **When seen:** Second Kling run (`gmi_kling_v3_i2v`) despite valid
  payload.
- **Fix:** `callVideoApiWithRetry()` (commit `bb4039bd6`) now absorbs
  these with 3 attempts + exponential backoff.
- **If it still fails after retries:** Upstream is persistently down.
  Try `gmi_kling_v3_omni_i2v` instead — different endpoint, same
  provider account, more reliable in testing.

### C) `The prompt could not be submitted. This prompt contains sensitive words that violate Google's Responsible AI practices. Support codes: 58061214`

- **What it means:** Google Veo's safety filter rejected your prompt.
- **When seen:** `gmi_veo31_lite_i2v` with Japanese anime/drama prompts
  containing characters described with dark or morally ambiguous traits
  (scars, shadows, neon-noir aesthetic, dark eyes, etc.).
- **Fix (not a code fix):** Switch to a Kling model — `gmi_kling_v3_omni_i2v`.
  Kling's content policy is far more permissive than Google's.
- **Alternative:** Rewrite the novel's character descriptions to avoid
  triggering keywords. Hard to predict which ones trigger.

### D) Stock LinkedIn-headshot portraits instead of the drama's intended style

- **What it means:** Pre-fix `composePortraitPrompt()` hardcoded
  `photorealistic front portrait, shot on professional camera, …, plain
  white background, soft studio lighting`, ignoring the novel's style
  header entirely.
- **When seen:** Before commit `cc0458f76`. First J-drama run produced
  stock corporate Caucasian headshots for Japanese characters.
- **Fix:** Already landed — `composePortraitPrompt(attrs, { style })`
  replaces the wrapper with the caller's style; novel's
  `映像スタイル` / `Image Style` line is auto-extracted by
  `extractNovelStyleHeader()`.
- **Diagnostic:** After a run, quote the `portrait_prompt` field of
  any character to confirm the style flowed through:
  ```bash
  jq -r '.[0] | .portrait_prompt' ~/Documents/QCut/Exports/novel2movie/*/characters.json | head -1
  ```
  Should start with your novel's style line, not `photorealistic front portrait`.

### E) Character rendered as wrong ethnicity (Japanese → Caucasian)

- **What it means:** The extractor LLM didn't populate the optional
  `portrait.ethnicity` field, so the image model defaulted to a
  Caucasian mean face.
- **When seen:** Both J-drama and anime runs in this session; the
  ethnicity slot came back `<missing>` for all 5 characters.
- **Fix:** Schema + prompt already ask for it (`commit cc0458f76`),
  but `gemini-3.1-flash-lite` is conservative about filling it.
  Workaround: bake ethnicity into the novel's prose ("**Japanese**
  woman in her late twenties…"). That signal survives the extractor
  even when the structured field is blank.
- **Follow-up (not done):** Make `ethnicity` required in the JSON
  schema so the LLM has to emit at least `""`.

### F) Empty `videos/` folder, pipeline reports `success: false`, zero retry log lines

- **What it means:** The video API rejected the first call with a
  non-retryable error (4xx or content-policy).
- **Diagnostic:** Tail stderr:
  ```bash
  tail -20 /path/to/run.stderr | grep -E 'error|Failed'
  ```
- **Next step:** Classify the error:
  - `400 invalid payload` → mode **A** above
  - `401/403` → `GMI_API_KEY` missing or wrong — run `qcut system check-keys`
  - Content-policy rejection → mode **C** above

### G) Pipeline hangs forever without progress

- **What it means:** GMI queue pressure — a request was accepted and is
  being polled but upstream hasn't returned.
- **Diagnostic:**
  ```bash
  pgrep -fl 'node.*(novel|script)2(movie|video)'
  tail -f /path/to/run.stderr
  ```
  If the process is alive and the last stderr line was minutes ago
  without an error, it's waiting on GMI.
- **Fix:** The adapter uses a 120s per-request timeout for FAL and a
  longer GMI_TIMEOUT for GMI (see `api-caller.ts:573`). If exceeded,
  the retry layer will take over. Kill the process with `kill <pid>`
  if you're out of patience.

### H) Storyboard shows only 2 PNGs even though 5 shots were generated

- **What it means:** Filename collision — shots are named by
  `shot_type` (`medium`, `close_up`, etc.). Multiple `medium` shots in
  one scene overwrite each other on disk.
- **When seen:** Every run in this session. 3 `medium` + 2 `close_up` =
  only 2 PNGs survive even though the pipeline reports `Generated: 5
  images`.
- **Impact:** None on video generation — camera generator reads the
  images through in-memory pipeline output, not by scanning disk.
- **Fix (not done):** `storyboard-artist.ts` should include `shot_id`
  in the filename. One-line fix; separate PR.

### I) `script2video` output lands in `/tmp/`, not `~/Documents/QCut/`

- **What it means:** Unlike `novel2movie`, `script2video` doesn't have
  a Documents default — it uses `resolveOutputDir()` which falls back
  to `os.tmpdir() + /qcut/aicp-output/<session>/`.
- **Fix:** Always pass `--output-dir ~/Documents/QCut/Exports/script2video/…`
  when running `script2video`. Or edit `pipeline-handlers.ts:127` to
  mirror the `novel2movie` branch at line 243.

### J) "mock video" placeholder files instead of real MP4s

- **What it means:** The adapter didn't find a matching provider key in
  env, so it wrote `Mock video: <prompt>` as text content.
- **Diagnostic:**
  ```bash
  file ~/Documents/QCut/Exports/**/videos/*.mp4
  # Expected: ISO Media, MP4 Base Media v1
  # If you see: ASCII text
  ```
- **Fix:** Check the correct key is set for the model's provider:
  - GMI models → `GMI_API_KEY`
  - FAL models → `FAL_KEY`
  ```bash
  qcut system check-keys --json
  ```
  `_mockGenerate()` is a deliberate fallback so tests don't hit paid
  APIs; for real runs, make sure the key is present.

### K) Log shows `provider: "fal"` for a `gmi_*` model

- **What it means:** Your dist is from before commit `19cd9f184` — the
  old `VideoGeneratorAdapter` had a hardcoded FAL `MODEL_MAP` with a
  silent fallback to `MODEL_MAP.kling` (FAL Kling v1), ignoring the
  registry entirely.
- **Fix:** `bun run build` on `cli-drama` (or main after merge).
- **Diagnostic:** After a run, stderr events should include
  `"provider":"gmi"` for GMI models. If you only see `"provider":"fal"`
  for GMI model keys, you're on the old code.

## Commit list for reference

| Commit | What it fixed |
|---|---|
| `19cd9f184` | Route vimax video adapter through `ModelRegistry` so GMI models work at all |
| `cc0458f76` | Novel style + character ethnicity flow into portrait prompts |
| `f84b418df` | Provider-specific image payload (`image` for GMI, `image_url` for FAL) |
| `bb4039bd6` | Retry with exponential backoff on transient video API failures |

All four are on branch `cli-drama` as of this session.

## Still broken (not yet fixed)

| Issue | File to fix | Effort |
|---|---|---|
| `script2video` default output isn't in `~/Documents/QCut/` | `pipeline-handlers.ts:127` | 3 lines |
| Storyboard filename collision on `shot_type` | `storyboard-artist.ts` | 1 line (include `shot_id`) |
| `ethnicity` optional in schema → LLM skips it | `schemas.ts:167-192` | Make required |
| Bundled `drama-example.md` fallback fails from installed binary | Build step doesn't copy `.md` into `dist/` | Add `cp -R electron/native-pipeline/vimax/examples dist/…` to build script |
