# Build, Deploy, And Online E2E Result

Date: 2026-05-26

## Branch And Commit

Branch:

```text
cli-image-v12
```

Commit used for the published CLI image:

```text
34378acb9 Fix IMA Router ref2v reference images
```

## CLI Image

Local build and smoke passed:

```bash
QCUT_VERSION=cli-image-v12-ref2v-20260526205824 bun run build:cli-image
```

Published image:

```text
ghcr.io/quriosity-agent/qcut-cli:cli-image-v12-ref2v-20260526205824
```

GitHub Actions publish run:

```text
https://github.com/Quriosity-agent/qcut/actions/runs/26475075951
```

Result:

```text
build-and-push passed in 11m37s
Smoke test pushed image passed
```

Manifest verification:

```text
linux/amd64 digest sha256:17bdbcc636a9ad8d49514c3b9b782b9adbf9ae9260a95cafc15237a9c1d23c87
```

Note: direct local `docker push` to GHCR failed because the local Docker/GitHub token did not have the required package-write scope, so the existing repo workflow was used.

## Deploys

Relay deploy:

```bash
bun run deploy
```

Package:

```text
packages/qcut-relay
```

Result:

```text
https://qcut-relay.zdhpeter.workers.dev
Version ID: acf68421-181f-40d6-a023-8f8be78dedce
```

License server deploy:

```bash
bun run deploy
```

Package:

```text
packages/license-server
```

Reason: online Daytona agents read `QCUT_IMAGE_TAG` from the license server, so the license server had to be deployed after changing the tag.

Result:

```text
https://qcut-license-server.zdhpeter.workers.dev
Version ID: d57a6ddb-4fe0-49a9-bd28-c8cf2a6249ff
QCUT_IMAGE_TAG = ghcr.io/quriosity-agent/qcut-cli:cli-image-v12-ref2v-20260526205824
```

## Online Sandbox Chat-Agent E2E

Harness:

```bash
bun scripts/agent-chat-imarouter-ref2v-e2e.ts --generation-timeout-ms 2400000
```

Production chat-agent URL:

```text
https://quriosity.com.au/chat-agent.html
```

Session:

```text
5b9013c2-0930-42ea-8724-ace7d24b8f0a
```

Sandbox output root:

```text
/tmp/qcut-output/imarouter-ref2v-e2e-1779830523126
```

Local evidence directory:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/agent-chat-imarouter-ref2v-e2e-2026-05-26T21-22-03-126Z
```

Result:

```text
status=passed
REF2V_READY
downloaded evidence files=8
```

Generated video:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/agent-chat-imarouter-ref2v-e2e-2026-05-26T21-22-03-126Z/imarouter_seedance_2_0_ref2v_5-second-video-using-the-reference-image-clean-product_1779830655171.mp4
```

Observed media:

```text
1280x720, h264, 24 fps, 5.041667 s, 1.4 MB
```

IMA sidecar:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/agent-chat-imarouter-ref2v-e2e-2026-05-26T21-22-03-126Z/imarouter_seedance_2_0_ref2v_5-second-video-using-the-reference-image-clean-product_1779830655171.json
```

Sidecar confirms:

```text
model=imarouter_seedance_2_0_ref2v
endpoint=v1/videos
cost=0.3
duration_seconds=94.615
inputs.reference_images contains the submitted public reference image URL
params.image_urls contains the staged reference image URL
```

The sandbox env check confirmed an IMA Router key was present, without recording the key value:

```text
HAS_IMAROUTER_API_KEY=yes
IMAROUTER_API_KEY_LENGTH=51
QCut_VERSION=1.0.0
Codex_VERSION=codex-cli 0.130.0
```

The command log included:

```text
Proxy call failed for imarouter (API error 401); falling back to local IMAROUTER_KEY
status=ok
command=create-video
cost=0.3
duration_ms=94617
```

## Verification Commands

Focused tests:

```bash
bunx vitest run electron/native-pipeline/execution/__tests__/step-executors-imarouter-ref2v.test.ts electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-duration.test.ts
```

Result:

```text
2 files passed, 10 tests passed
```

Relay tests:

```bash
bun --cwd packages/qcut-relay test
```

Result:

```text
2 files passed, 21 tests passed
```

License server tests:

```bash
bun --cwd packages/license-server test
```

Result:

```text
16 files passed, 132 tests passed
```

TypeScript:

```bash
bun x tsc --noEmit
```

Run from:

```text
/Users/peter/Desktop/code/qcut/qcut/electron
```

Result:

```text
passed
```

Biome:

```bash
bunx biome check electron/native-pipeline/execution/step-executors.ts electron/native-pipeline/cli/cli-runner/handler-generate.ts electron/native-pipeline/execution/__tests__/step-executors-imarouter-ref2v.test.ts electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-duration.test.ts packages/license-server/wrangler.toml docs/task/daytona-supabase-agent/fix-imarouter-reference-images/local-env.md docs/task/daytona-supabase-agent/fix-imarouter-reference-images/local-smoke-result.md
```

Result:

```text
passed
```

E2E harness check:

```bash
bunx biome check --write scripts/agent-chat-imarouter-ref2v-e2e.ts
bun scripts/agent-chat-imarouter-ref2v-e2e.ts --help
```

Result:

```text
passed
```

## Failure And Fix During E2E

The first online E2E connected to the deployed image but failed because the natural-language prompt asked Codex to make its own preflight decision, and Codex wrote `preflight-failed.txt` even though the downloaded `models.json` did include:

```text
imarouter_seedance_2_0_ref2v
imarouter_seedance_2_0_cn_ref2v
```

The harness prompt was tightened to ask Codex to run an exact shell script. The rerun passed.

## Remaining Local-File Gap

The online E2E used a public HTTPS reference image because the available sandbox/local secrets include `IMAROUTER_API_KEY` but not a valid `FAL_KEY`. The local-file path is implemented and unit-covered, but the exact chain `local file -> FAL storage URL -> IMA asset -> asset:// -> IMA video` still requires a valid FAL key or another public staging backend.
