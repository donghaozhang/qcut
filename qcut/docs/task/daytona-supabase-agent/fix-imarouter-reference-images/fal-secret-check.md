# FAL Secret Check

Date: 2026-05-26

## Question

Can the full local-file reference image pipeline run in the online Daytona sandbox?

Required chain:

```text
local reference image -> FAL storage URL -> IMA /v1/assets/create -> asset://... -> IMA /v1/videos
```

## Result

No. The online sandbox/default agent user does not currently have a `FAL_KEY` or `FAL_API_KEY` secret in `agent_secrets`.

## Evidence

Current unauthenticated online agent session resolves to default user:

```text
userId=79bf60b02770d2cc510da53e471590f4
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
sandboxId=daa84f1c-9989-4dc9-a86a-e0d7f44c4d59
state=started
HAS_FAL_KEY=no
FAL_KEY_LENGTH=0
HAS_FAL_API_KEY=no
FAL_API_KEY_LENGTH=0
HAS_IMAROUTER_API_KEY=yes
IMAROUTER_API_KEY_LENGTH=52
```

This confirms the running sandbox itself has the IMA Router key but does not have either FAL upload secret.

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

## What Is Needed

To run the complete online local-file E2E, add a valid FAL upload secret for the default agent user:

```text
user_id=79bf60b02770d2cc510da53e471590f4
key=FAL_KEY
value=<valid fal key>
```

or:

```text
key=FAL_API_KEY
```

After that, rebuild/publish the CLI image from the PR head, deploy the license server with that image tag, and rerun the local-file Ref2V E2E.
