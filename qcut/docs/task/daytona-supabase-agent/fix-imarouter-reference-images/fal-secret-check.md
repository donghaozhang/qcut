# FAL Secret Check

Date: 2026-05-26

## Question

Can the full local-file reference image pipeline run in the online Daytona sandbox?

Required chain:

```text
local reference image -> FAL storage URL -> IMA /v1/assets/create -> asset://... -> IMA /v1/videos
```

## Result

The online sandbox/default agent user does not have a direct `FAL_KEY` or `FAL_API_KEY` secret in `agent_secrets`.

The upload path was fixed by refreshing `QCUT_AUTH_TOKEN` for the default agent user. With a valid QCut session token, the sandbox can call the license-server `/api/ai/upload-url` proxy, and that worker uses its configured `FAL_API_KEY` secret to vend FAL upload URLs.

## Evidence

Current unauthenticated online agent session resolves to default user:

```text
userId=<redacted-default-user-id>
imageTag=ghcr.io/quriosity-agent/qcut-cli:cli-image-v12-ref2v-20260526205824
```

Supabase `agent_secrets` keys for that user:

```text
CODEX_AUTH_JSON
GEMINI_API_KEY
GMI_API_KEY
IMAROUTER_API_KEY
OPENROUTER_API_KEY
QCUT_AUTH_TOKEN
```

Targeted query for FAL secrets:

```text
[]
```

So the sandbox injection source has no:

```text
FAL_KEY
FAL_API_KEY
```

Direct Daytona sandbox environment check:

```text
sandboxId=<redacted-sandbox-id>
state=started
HAS_FAL_KEY=no
FAL_KEY_LENGTH=0
HAS_FAL_API_KEY=no
FAL_API_KEY_LENGTH=0
HAS_IMAROUTER_API_KEY=yes
IMAROUTER_API_KEY_LENGTH=52
```

This confirms the running sandbox itself has the IMA Router key but does not have either FAL upload secret.

## Fix Applied

A fresh QCut session token was inserted into `sessions` for:

```text
user_id=<redacted-default-user-id>
```

Then `agent_secrets.QCUT_AUTH_TOKEN` for that user was updated to the new token value.

Safe proxy check with that token:

```text
POST /api/ai/upload-url
status=200
response keys=fileUrl,uploadUrl
```

No FAL secret value was copied into this document.

## Local Smoke With Local File

Command shape:

```bash
QCUT_OUTPUT_DIR=/tmp/qcut-output-fal-secret-check bun run qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --reference-images /Users/peter/Desktop/code/qcut/qcut/output/gmi-five-image-smoke/gpt_image_2_gmi_a-yellow-toy-submarine-product-photo-on-white-background_1779155348312_3.png \
  -t "5 second video using the local reference image" \
  -d 5s \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --json
```

Observed result:

```text
Proxy upload URL failed: Upload URL request failed (401): Invalid token
falling back to local FAL_KEY
FAL upload initiate failed: 401
```

This proves the fallback code path runs, but the local `FAL_KEY` value currently available on this machine is also rejected by FAL.

## Code Change In PR

PR #312 now includes fallback logic:

```text
proxy upload URL -> if it fails and FAL_KEY/FAL_API_KEY exists -> direct FAL storage initiate
```

Commit:

```text
6ad904b71 Fallback to local FAL key for uploads
```

Unit coverage:

```text
electron/native-pipeline/infra/__tests__/api-caller-fal-upload.test.ts
```

## Online Local-File E2E After Fix

Harness:

```bash
bun scripts/agent-chat-imarouter-ref2v-e2e.ts --local-reference-file --generation-timeout-ms 2400000
```

Result:

```text
status=passed
session=029265bb-927c-4e6e-a844-d9d0bfa1b83f
root=/tmp/qcut-output/imarouter-ref2v-e2e-1779834324797
```

Local evidence directory:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/agent-chat-imarouter-ref2v-e2e-2026-05-26T22-25-24-797Z
```

The E2E downloaded the public reference URL to a sandbox-local file and passed that local path to the CLI:

```text
referenceInput=/tmp/qcut-output/imarouter-ref2v-e2e-1779834324797/reference.png
```

The generated sidecar confirms local-file input reached QCut:

```text
inputs.reference_images=[
  "/tmp/qcut-output/imarouter-ref2v-e2e-1779834324797/reference.png"
]
params.image_urls=[
  "/tmp/qcut-output/imarouter-ref2v-e2e-1779834324797/reference.png"
]
model=imarouter_seedance_2_0_ref2v
endpoint=v1/videos
```

Generated video:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/agent-chat-imarouter-ref2v-e2e-2026-05-26T22-25-24-797Z/imarouter_seedance_2_0_ref2v_5-second-video-using-the-reference-image-clean-product_1779834541195.mp4
```

Convenience copy:

```text
/Users/peter/Desktop/code/qcut/qcut/docs/task/daytona-supabase-agent/fix-imarouter-reference-images/evidence/imarouter-ref2v-local-file-online-e2e.mp4
```

Observed media:

```text
1280x720, h264, 24 fps, 5.041667 s, 1.8 MB
```

## What Would Be Needed For Direct BYOK FAL

The complete online local-file E2E now passes through the QCut proxy. If we also want direct BYOK FAL fallback inside the sandbox, add a valid FAL upload secret for the default agent user:

```text
user_id=<redacted-default-user-id>
key=FAL_KEY
value=<valid fal key>
```

or:

```text
key=FAL_API_KEY
```

After that, rebuild/publish the CLI image from the PR head, deploy the license server with that image tag, and rerun the local-file Ref2V E2E to verify the fallback path too.
