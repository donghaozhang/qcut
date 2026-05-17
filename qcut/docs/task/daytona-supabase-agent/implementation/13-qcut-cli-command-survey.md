# QCut CLI Command Survey

Date: 2026-05-16

## Goal

Identify which QCut CLI command families are worth smoke testing, run one
representative probe per family where practical, and record both successful and
failed results.

This survey does not add these probes to the product `qcut` CLI. It is a
coverage map for future repository tests, release checks, and Daytona Chat
Agent prompts.

## CLI Shape

The top-level CLI help reports:

| Item | Count |
| --- | ---: |
| Categories | 14 |
| Commands | 189 |
| Editor commands | 121 |

The major command families are:

```text
generation, pipeline, analysis, models, keys, project, moyin, youtube,
recording, vimax, subtitle, phota, replicate, editor
```

I used the source entry point directly because the local shell did not have a
`qcut` executable on `PATH` during this survey:

```bash
bun electron/native-pipeline/cli/cli.ts ...
```

## Evidence Folder

All raw stdout/stderr/meta files are under:

```text
output/qcut-cli-command-survey-20260516/results
```

Fixtures and generated local outputs are under:

```text
output/qcut-cli-command-survey-20260516/fixtures
output/qcut-cli-command-survey-20260516/project
```

Each probe has:

```text
<id>.meta.json
<id>.stdout.txt
<id>.stderr.txt
```

## What Should Be Tested

The CLI is too broad to test every command on every run. The useful split is:

| Layer | Run Frequency | Purpose |
| --- | --- | --- |
| Metadata and routing | Every commit touching CLI registry/parser | Catch broken help JSON, group aliases, and command discovery. |
| Local safe commands | Every commit or CI smoke | Project setup, key checks, model listing, subtitles, daemon status. |
| Editor bridge commands | Local integration job with editor running | Verify `editor:*` HTTP bridge and project/timeline/export flows. |
| Provider-backed generation/analysis | Release or nightly | Spend credits intentionally and verify image/video/audio/model integrations. |
| External side effects | Manual release checklist | YouTube upload, live Phota/Replicate jobs, screen recording permissions. |

## Probe Results

| ID | Family | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| `01-root-help` | metadata | `--help --json` | Pass | Top-level catalog returned 14 categories and 189 commands. |
| `02-generation-elements` | generation | `list-elements --json` | Pass | Safe generation-family read path returned 12 stored elements. |
| `03-generation-group-help` | generation/routing | `gen image --help --json` | Pass | Group alias resolved to `generate-image`; required `--text` was exposed. |
| `04-pipeline-status` | pipeline | `flow status --job-id qcut-cli-survey-missing --json` | Expected fail | Fails because the local editor/job backend was not running. |
| `05-analysis-help` | analysis/routing | `analyze transcribe --help --json` | Pass | Group alias resolved to `transcribe`; avoids paid transcription. |
| `06-models-list` | models | `system models --category image --json` | Warning | Exit 0 but returned `count: 0`; likely category alias mismatch. |
| `18-models-all` | models | `system models --json` | Pass | Unfiltered registry returned 143 models. |
| `07-keys-doctor` | keys/system | `system doctor --json --skip-health` | Pass | Bun, ffmpeg, env file mode, and 7/16 configured keys all OK. |
| `08-project-init` | project | `system project-init --directory ... --json` | Pass | Project scaffold existed/was created under the survey output folder. |
| `09-project-info` | project | `system project-info --directory ... --json` | Pass | Read back all expected project directories with zero files. |
| `10-moyin-help` | moyin | `moyin:parse-script --help --json` | Pass | Command shape verified without running an LLM parse. |
| `11-youtube-help` | youtube | `youtube:upload --help --json` | Pass | Help only; live upload should stay manual. |
| `12-record-daemon-status` | recording | `record-daemon --status --json` | Pass | Daemon reported `running: false`; no recording was started. |
| `13-vimax-models` | vimax | `vimax:list-models --json` | Pass | Returned 99 ViMax/video models. |
| `14-subtitle-style` | subtitle | `subtitle-style --input sample.srt --preset bold --output sample.ass --json` | Pass | Local transform produced `sample.ass` with one caption. |
| `15-phota-profile-validation` | phota | `phota:profile --input missing.zip --json` | Expected fail | Validation failed before provider upload: missing ZIP. |
| `16-replicate-help` | replicate | `replicate:analyze --help --json` | Pass | Help only; avoids paid video analysis. |
| `17-editor-health` | editor | `editor:health --json` | Expected fail | Editor bridge was not running locally. |

## Bugs / Follow-Up Candidates

1. **Model category filter warning**

   `system models --category image --json` exits successfully but returns zero
   models. The unfiltered command returns 143 models, and `gen image --help`
   lists image-generation models such as `flux_dev`, `recraft_v4`, and
   `dall_e_3`.

   Likely fix: map public help categories such as `image`, `video`, `speech`,
   and `motion` to internal registry categories like `text_to_image`,
   `text_to_video`, `text_to_speech`, and `motion_transfer`.

2. **Local executable availability**

   `qcut` was not available on `PATH` in this shell, so the survey used the
   source entry point. Release verification should also test the packaged or
   installed binary:

   ```bash
   qcut --help --json
   qcut system doctor --json --skip-health
   ```

3. **Editor-dependent commands need a separate harness**

   `flow status` and `editor:health` failed because the editor API server was
   not running. These belong in the existing editor/CLI E2E lane where
   `bun run electron:dev` or the packaged app is launched first.

4. **Transcribe provider route failure**

   The paid transcribe probe hit the real provider path but failed before
   producing an artifact:

   ```text
   Proxy call failed for fal (API error 404: {"detail":"Application \"tts\" not found"});
   falling back to local FAL_KEY
   FAL API error 401: {"detail":"invalid key credentials"}
   ```

   The command used `--provider elevenlabs`, but the proxy fallback path still
   reported provider `fal` and an endpoint/application mismatch. This should be
   investigated before promoting transcription into the release smoke suite.

### Transcribe Provider Fix - 2026-05-17

Implemented the proper direct ElevenLabs STT route:

- Added `elevenlabs_scribe_v2` with provider backend `elevenlabs`.
- Direct endpoint is `https://api.elevenlabs.io/v1/speech-to-text`.
- Request body uses `multipart/form-data` with the audio file and
  `model_id=scribe_v2`.
- `analyze transcribe --provider elevenlabs` now maps to the direct model
  instead of the legacy FAL-backed `scribe_v2` model.
- `analyze transcribe` with no provider now also defaults to
  `elevenlabs_scribe_v2`, so the common command path works without extra flags.
- The generic CLI runner no longer pre-resolves `--provider` for `transcribe`,
  so the transcribe handler owns the provider-to-model mapping.
- Unknown transcribe providers are rejected by the transcribe handler instead
  of silently falling back to the default model.
- The legacy FAL-backed `scribe_v2` compatibility route still works when
  selected explicitly with `--model scribe_v2`.
- The license-server FAL key lookup now accepts both `FAL_API_KEY` and
  `FAL_KEY`, matching the local QCut env naming.
- Proxy-mode FAL STT no longer logs a misleading missing-`outputUrl` warning
  when the provider returns text/word transcription data.

Verification:

```bash
bunx vitest run \
  electron/native-pipeline/registry-data/__tests__/speech-to-text.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-elevenlabs-stt.test.ts \
  electron/native-pipeline/cli/__tests__/cli-handlers-media-transcribe.test.ts

bunx tsc --noEmit -p electron/tsconfig.json

bun electron/native-pipeline/cli/cli.ts analyze transcribe \
  -i apps/web/src/test/e2e/fixtures/media/sample-audio.mp3 \
  --provider elevenlabs --language en --srt --raw-json --json \
  -o output/qcut-cli-transcribe-elevenlabs-direct-20260517-010224
```

Result:

- Unit tests passed: `8` tests / `3` files.
- Proxy retry/STT text-result coverage passed with the same QCut test run:
  `15` tests / `4` files.
- License-server provider/proxy tests passed: `43` tests / `2` files.
- Electron TypeScript check passed.
- `ELEVENLABS_API_KEY` was refreshed in local `~/.qcut/.env` and Supabase
  project secrets for `kbrtxitvavpuimuihppz`.
- Live CLI route reached ElevenLabs directly and no longer used FAL.
- Live transcription succeeded in `0.6s`.
- Created:
  - `output/qcut-cli-transcribe-elevenlabs-direct-20260517-010224/transcription_raw.json`
  - `output/qcut-cli-transcribe-elevenlabs-direct-20260517-010224/transcription.srt`
- Fixture output text was `[beep]`, language `eng`, probability `1`.
- Bare default command passed:
  `output/qcut-default-transcribe-elevenlabs-20260517-011327/transcription_raw.json`.
- Explicit legacy FAL-backed command passed:
  `output/qcut-fal-scribe-v2-check-20260517-011327/transcription_raw.json`.

Next subtask: add this direct ElevenLabs transcribe command to the release smoke
matrix once paid-provider smoke is allowed for the run.

## Paid Provider Verification - 2026-05-16

User requested real paid runs after the safe survey. I ran three provider-backed
probes and recorded stdout/stderr/meta under:

```text
output/qcut-cli-paid-20260516/results
```

Artifacts are under:

```text
output/qcut-cli-paid-20260516/artifacts
```

Before running, `system check-keys --json` confirmed:

- `QCUT_AUTH_TOKEN`: configured
- `FAL_KEY`: configured
- `ELEVENLABS_API_KEY`: configured
- `RUNWAY_API_KEY`: configured
- `ARK_API_KEY`: configured
- `IMAROUTER_API_KEY`: configured

| ID | Family | Command | Result | Cost | Wall Time | Artifact / Error |
| --- | --- | --- | --- | ---: | ---: | --- |
| `01-gen-image` | generation/image | `gen image -t "paid smoke test small blue square icon on a clean white background" -m flux_dev --json -o output/qcut-cli-paid-20260516/artifacts/image` | Pass | `0.003` | 7s | `flux_dev_paid-smoke-test-small-blue-square-icon-on-a-clean-white_1778965929204.jpg` |
| `02-transcribe` | analysis/transcribe | `analyze transcribe -i apps/web/src/test/e2e/fixtures/media/sample-audio.mp3 --provider elevenlabs --srt --json -o output/qcut-cli-paid-20260516/artifacts/transcribe` | Fail | unknown / likely not charged | 2s | Proxy 404 on FAL app `tts`, then local FAL 401 invalid credentials. |
| `03-gen-video` | generation/video | `gen video -t "paid smoke test simple blue square icon on white background, static clean composition" -m hailuo_pro --duration 6 --json -o output/qcut-cli-paid-20260516/artifacts/video` | Pass | `0.08` | 450s | `hailuo_pro_paid-smoke-test-simple-blue-square-icon-on-white-background_1778966429165.mp4` |

Media checks:

| Artifact | File Info |
| --- | --- |
| Image jpg | JPEG, 1024x768, 44 KB. Manually viewed: white background with a soft blue square. |
| Video mp4 | H.264 MP4, 1920x1080, 5.875s, 226 KB, video stream only. |

Raw evidence:

```text
output/qcut-cli-paid-20260516/results/01-gen-image.stdout.txt
output/qcut-cli-paid-20260516/results/02-transcribe.stdout.txt
output/qcut-cli-paid-20260516/results/02-transcribe.stderr.txt
output/qcut-cli-paid-20260516/results/03-gen-video.stdout.txt
```

## Recommended Smoke Matrix

Default fast smoke:

```bash
bun electron/native-pipeline/cli/cli.ts --help --json
bun electron/native-pipeline/cli/cli.ts gen image --help --json
bun electron/native-pipeline/cli/cli.ts list-elements --json
bun electron/native-pipeline/cli/cli.ts system models --json
bun electron/native-pipeline/cli/cli.ts system doctor --json --skip-health
bun electron/native-pipeline/cli/cli.ts system project-init --directory <tmp> --json
bun electron/native-pipeline/cli/cli.ts system project-info --directory <tmp> --json
bun electron/native-pipeline/cli/cli.ts record-daemon --status --json
bun electron/native-pipeline/cli/cli.ts vimax:list-models --json
bun electron/native-pipeline/cli/cli.ts subtitle-style --input sample.srt --preset bold --output sample.ass --json
```

Editor integration lane:

```bash
bun run electron:dev
bun run test:cli-e2e
```

Release/nightly candidates:

```bash
qcut gen image -t "small blue square icon on a clean white background" -m flux_dev --json
qcut gen video -t "one second product teaser" -m ltx23_fast_t2v --json
qcut replicate:analyze --source sample-video.mp4 --json
```

Hold transcription out of the green release lane until the provider route issue
above is fixed.

Manual-only:

```bash
qcut youtube:upload -i video.mp4 -t "Manual release upload"
qcut record --record-duration 5 --output /tmp/qcut-recording-test.mp4
qcut phota:profile -i reference-photos.zip --json
```
