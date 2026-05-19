# MaaS Seedance 2.0 Provider - Implementation And Testing Script

## Source

- Local reference PDF: `/Users/peter/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/a36269669_a0d4/msg/file/2026-05/maas seedance2.0调用说明 (1).pdf`
- Provider docs referenced by the PDF: `https://docs.byteplus.com/en/docs/ModelArk/1520757`
- Provider base URL from the PDF: `https://api.cloudwise.ai`

This is a separate provider path from FAL, GMI, and IMA Router. Treat it as a new Cloudwise MaaS provider, not as another alias for the existing GMI Seedance adapter.

## API Shape From The PDF

Submit video generation:

```bash
curl https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MAAS_API_KEY" \
  -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
      { "type": "text", "text": "cinematic product video" }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 11,
    "watermark": false
  }'
```

Submit response:

```json
{ "id": "MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng==" }
```

Poll task:

```bash
curl "https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/$TASK_ID" \
  -H "Authorization: Bearer $MAAS_API_KEY"
```

Success response:

```json
{
  "id": "1504931821587668992",
  "model": "dreamina-seedance-2-0-260128",
  "status": "succeeded",
  "content": {
    "video_url": "https://download.cloudwise.ai/arts/1504931821587668992",
    "expireAt": 1778932174
  },
  "usage": {
    "completion_tokens": 411300,
    "total_tokens": 411300
  },
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 11,
  "framespersecond": 24,
  "generate_audio": true
}
```

Reference inputs use a `content` array:

- text: `{ "type": "text", "text": "..." }`
- reference image: `{ "type": "image_url", "image_url": { "url": "https://..." }, "role": "reference_image" }`
- reference video: `{ "type": "video_url", "video_url": { "url": "https://..." }, "role": "reference_video" }`
- reference audio: `{ "type": "audio_url", "audio_url": { "url": "https://..." }, "role": "reference_audio" }`
- uploaded asset image reference: `image_url.url = "asset://asset-..."`

Asset flow:

1. `POST /api/v1/assets/groups/create`
2. `POST /api/v1/assets/create`
3. `POST /api/v1/assets/get`
4. use `asset://asset-id` inside the Seedance `content` array

Enhance models from the PDF:

- `dreamina-seedance-2-0-260128-enhance` supports `720p` and `1080p`
- `dreamina-seedance-2-0-260128-fast-enhance` supports `720p`

## Implementation Plan

Add a provider named `maas` or `cloudwise-maas`. Prefer `maas` only if there is no ambiguity in the registry UI; otherwise use `cloudwise-maas` to make logs and credit rows clear.

Integration points:

- `electron/native-pipeline/infra/api-provider-urls.ts`
  - add provider name
  - add `CLOUDWISE_MAAS_BASE = "https://api.cloudwise.ai"`
  - route endpoints under `/api/v1/...`
- `electron/native-pipeline/infra/api-caller.ts`
  - add a MaaS async submit/poll branch
  - submit response task id can be `id`
  - poll statuses must treat `succeeded` as success and `failed` as terminal failure
  - output URL is `content.video_url`
- `electron/native-pipeline/infra/proxy-client.ts`
  - decide whether MaaS goes direct from sandbox or through license-server relay
  - for Daytona production, prefer relay so the browser/sandbox never needs the raw key
- `electron/native-pipeline/registry-data/text-to-video.ts`
  - add a text-to-video registry entry for `maas_seedance_2_0_260128_t2v`
  - include defaults `{ duration: "11", ratio: "16:9", generate_audio: true, watermark: false }`
- `electron/native-pipeline/registry-data/image-to-video.ts`
  - add i2v/ref2v entries only if the existing video-shot adapter can produce the MaaS `content` array cleanly
- `electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter.ts`
  - add a MaaS family branch so `prompt + references` becomes MaaS `content`
  - do not reuse FAL `image_urls` or GMI `input.images`; this provider expects typed content items with roles

Suggested public model keys:

```text
maas_seedance_2_0_260128_t2v
maas_seedance_2_0_260128_i2v
maas_seedance_2_0_260128_ref2v
maas_seedance_2_0_260128_enhance_t2v
maas_seedance_2_0_fast_260128_enhance_t2v
```

Open questions before coding:

- Does MaaS support the non-enhance fast base model, or only fast enhance?
- Does `duration` accept only integer seconds, and what exact range is allowed?
- Does `ratio` use `ratio`, while the rest of QCut normalizes on `aspect_ratio`?
- Should `generate_audio` default to true for MaaS, even when other providers default false?
- Are local reference files supported directly, or must every reference be uploaded to public URL/asset first?

## Local Smoke Testing Script

Implemented script:

```text
docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-smoke.sh
```

The script writes timestamped evidence under:

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/<run-id>/
```

It expects a real Cloudwise MaaS credential in `MAAS_API_KEY`. Generated media is ignored from git; summarize successful runs in markdown under `evidence/`.

Reference shell logic:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${MAAS_API_KEY:?MAAS_API_KEY is required}"

OUT_DIR="${OUT_DIR:-/tmp/qcut-output/maas-seedance-smoke}"
BASE_URL="${MAAS_BASE_URL:-https://api.cloudwise.ai}"
MODEL="${MODEL:-dreamina-seedance-2-0-260128}"
mkdir -p "$OUT_DIR"

SUBMIT_JSON="$OUT_DIR/submit.json"
STATUS_JSON="$OUT_DIR/status.json"
VIDEO_PATH="$OUT_DIR/maas-seedance.mp4"

TASK_ID="$(
  curl -fsS "$BASE_URL/api/v1/aiproducts/video/seedance" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MAAS_API_KEY" \
    -d "{
      \"model\": \"$MODEL\",
      \"content\": [
        {
          \"type\": \"text\",
          \"text\": \"A 3 second cinematic shot of a glass cube on a white table, soft daylight, slow camera push.\"
        }
      ],
      \"generate_audio\": false,
      \"ratio\": \"16:9\",
      \"duration\": 3,
      \"watermark\": false
    }" | tee "$SUBMIT_JSON" | jq -r '.id'
)"

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
  echo "Missing task id" >&2
  exit 1
fi

for attempt in $(seq 1 120); do
  curl -fsS "$BASE_URL/api/v1/aiproducts/video/seedance/tasks/$TASK_ID" \
    -H "Authorization: Bearer $MAAS_API_KEY" \
    | tee "$STATUS_JSON"

  STATUS="$(jq -r '.status // empty' "$STATUS_JSON")"
  if [ "$STATUS" = "succeeded" ]; then
    VIDEO_URL="$(jq -r '.content.video_url // empty' "$STATUS_JSON")"
    test -n "$VIDEO_URL"
    curl -fL "$VIDEO_URL" -o "$VIDEO_PATH"
    ffprobe -v error -show_entries format=duration -of json "$VIDEO_PATH" > "$OUT_DIR/ffprobe.json"
    jq -n \
      --arg task_id "$TASK_ID" \
      --arg video "$VIDEO_PATH" \
      --slurpfile status "$STATUS_JSON" \
      --slurpfile ffprobe "$OUT_DIR/ffprobe.json" \
      '{status:"passed", task_id:$task_id, video:$video, provider_status:$status[0], ffprobe:$ffprobe[0]}' \
      > "$OUT_DIR/result.json"
    echo "MAAS_SEEDANCE_SMOKE_OK $TASK_ID $VIDEO_PATH"
    exit 0
  fi

  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
    echo "Provider task failed: $STATUS" >&2
    exit 1
  fi

  sleep 5
done

echo "Timed out waiting for MaaS Seedance task $TASK_ID" >&2
exit 1
```

Note: the PDF example uses duration `11`. The smoke script uses `3` to reduce cost, but the first live call may need to switch to the documented `11` if the provider rejects shorter durations.

## Daytona Online E2E Script Plan

The Daytona test should use the same pattern as the Chat Agent E2E runs:

1. Open `https://quriosity.com.au/chat-agent.html` with a cache-buster query.
2. Clear `qcut_agent_session_id` before page load when a fresh image is required.
3. Click `Connect` and wait for the terminal status to be `connected` and the terminal text to include `OpenAI Codex`.
4. Submit a prompt that tells Codex to run the MaaS smoke command inside the sandbox.
5. Write artifacts under `/tmp/qcut-output/maas-seedance-smoke`.
6. Download and validate:
   - `/tmp/qcut-output/maas-seedance-smoke/result.json`
   - `/tmp/qcut-output/maas-seedance-smoke/maas-seedance.mp4`
   - `/tmp/qcut-output/maas-seedance-smoke/status.json`
7. Save browser screenshots under `output/playwright/maas-seedance-daytona-e2e-<timestamp>/`.

Recommended Codex prompt:

```text
Run a MaaS Seedance smoke test in the Daytona sandbox. Do not edit source code.
Use MAAS_API_KEY from the environment. Write all outputs under /tmp/qcut-output/maas-seedance-smoke.
After validation succeeds, reply with MAAS_SEEDANCE_E2E_DONE and the output paths.
```

Pass criteria:

- `qcut system doctor --json` shows the MaaS provider key is available, or the script verifies `MAAS_API_KEY` directly.
- submit response has a non-empty task id.
- poll response reaches `status: succeeded`.
- downloaded video is a non-empty MP4.
- `ffprobe` can read duration and stream metadata.
- online page file API can list and download the result files.

Fail-fast cases:

- missing `MAAS_API_KEY`
- HTTP 401/403 from submit or poll
- unsupported duration/ratio/model
- task reaches provider `failed`
- output URL expires before download
- `ffprobe` cannot parse the downloaded file

## Test Matrix

| Case | Model | References | Audio | Expected |
|------|-------|------------|-------|----------|
| t2v-minimal | `dreamina-seedance-2-0-260128` | none | false | one valid MP4 |
| t2v-audio | `dreamina-seedance-2-0-260128` | none | true | MP4 with provider audio behavior recorded |
| ref-image-url | `dreamina-seedance-2-0-260128` | public image URL | false | content includes `role: reference_image` |
| asset-image | `dreamina-seedance-2-0-260128` | `asset://...` | false | asset group/create/get path works |
| enhance-720p | `dreamina-seedance-2-0-260128-enhance` | none | false | MP4, response resolution records `720p` |
| enhance-1080p | `dreamina-seedance-2-0-260128-enhance` | none | false | MP4, response resolution records `1080p` if supported |

## Done Criteria

- Unit tests cover submit payload, poll parsing, output URL extraction, and failure mapping.
- One local live smoke run passes with the new provider after a valid Cloudwise MaaS key is available.
- One Daytona online E2E run passes through `chat-agent.html`.
- The final E2E evidence is recorded in this subfolder with session id, task id, output paths, and screenshots.

## Current Live Test Status

Recorded in [`evidence/cloudwise-maas-real-2026-05-19.md`](./evidence/cloudwise-maas-real-2026-05-19.md).

The script reached the real Cloudwise MaaS endpoint, but the available legacy BytePlus `SEEDANCE_2_0_API` credential was rejected by Cloudwise with HTTP `401`. A real Cloudwise MaaS `MAAS_API_KEY` is required for the first successful video artifact.

Updated key test is recorded in [`evidence/cloudwise-maas-key-real-person-2026-05-19.md`](./evidence/cloudwise-maas-key-real-person-2026-05-19.md).

Results:

- `MAAS_API_KEY` authenticated successfully.
- Text-to-video completed and downloaded a valid 11 second MP4.
- Direct face reference upload was blocked by `InputImageSensitiveContentDetected.PrivacyInformation`.
- Public real-person asset upload created a group and asset, then asset processing failed with `InputImageSensitiveContentDetected.PolicyViolation`.
