# IMA Router GPT Image 2 Verification

Date: 2026-05-19
Branch: `Qcut-sandbox-v6`

## Summary

Status: local live verification passed; Codex-in-Daytona preflight failed on the deployed production image because the sandbox image has not picked up this branch yet.

The implementation now uses `gpt_image_2_ima` as QCut's public default image key and keeps `gpt_image_2_gmi` as a legacy alias. Both keys route through IMA Router's documented GPT Image API:

- provider: `imarouter`
- endpoint: `v1/images/generations`
- API model field: `gpt-image-2`
- poll endpoint: `GET /v1/images/generations/{task_id}`

Note: the live evidence below was generated immediately before the key rename, so the copied sidecar JSON and filenames still show the legacy alias `gpt_image_2_gmi`. The endpoint evidence is unchanged.

## Real Codex-In-Daytona Test

Session:

- license-server agent session: `7366021f-d7d6-49b5-b7b0-d820e2ae37f5`
- Daytona sandbox id: `7aec6269-5f86-4e89-9537-142e06e785d4`
- deployed image observed by session: `ghcr.io/quriosity-agent/qcut-cli:latest`

Method:

- Sent the E2E prompt into the persistent Codex PTY session, matching the production chat-agent path.
- The prompt required Codex inside the sandbox to run preflight checks first.
- The prompt explicitly told Codex not to fallback to another model if `gpt_image_2_ima` or `--concurrency` was missing.

Sandbox-written status file:

```text
/tmp/qcut-output/codex-real-e2e-done.txt
```

Status file contents:

```text
FAILED: preflight failed because qcut system models --json does not list gpt_image_2_ima and qcut flow portraits --help --json does not list --concurrency.
```

Sandbox-written evidence file:

```text
/tmp/qcut-output/codex-real-e2e-portraits-ima-concurrency-6.md
```

Evidence conclusion:

- `qcut --version`: `1.0.0`
- `gpt_image_2_ima`: not listed in `qcut system models --json`
- `--concurrency`: not listed in `qcut flow portraits --help --json`
- 6-image generation: not executed, by design, because the preflight failed
- PNG outputs: `0`

Conclusion: the deployed Daytona image is older than this branch. The branch changes need to be committed, pushed, and published into `ghcr.io/quriosity-agent/qcut-cli:latest`, then the same Codex-in-Daytona prompt should be rerun.

## Unit And Type Checks

Passed:

```bash
bun test \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts \
  electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts
```

Result: 43 pass.

```bash
cd packages/license-server && bun run test -- src/routes/ai-proxy.test.ts
```

Result: 28 pass.

```bash
bun test \
  apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts \
  apps/web/src/lib/__tests__/credit-costs.test.ts
```

Result: 55 pass.

```bash
cd electron && bun x tsc --noEmit
```

Result: pass.

```bash
bunx biome check --write \
  electron/native-pipeline/infra/api-caller.ts \
  electron/native-pipeline/infra/api-provider-urls.ts \
  electron/native-pipeline/registry-data/text-to-image.ts \
  electron/native-pipeline/vimax/adapters/image-adapter.ts \
  electron/native-pipeline/execution/step-executors.ts \
  electron/native-pipeline/infra/proxy-client.ts \
  packages/license-server/src/routes/ai-proxy.ts
```

Result: pass after formatting 3 files.

```bash
bunx biome check \
  apps/web/src/lib/text2image-models/other-models.ts \
  apps/web/src/lib/text2image-models/index.ts \
  apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts
```

Result: pass.

## Model Catalog Check

The native CLI/flow route is the runtime path under test, but the web text-to-image catalog was also updated so model metadata does not continue to describe the default GPT Image 2 route as GMI:

- `apps/web/src/lib/text2image-models/other-models.ts`
  - `gpt-image-2-ima` provider is now `OpenAI (via IMA Router)`.
  - endpoint is now `https://api.imarouter.com/v1/images/generations`.
- `apps/web/src/lib/text2image-models/index.ts`
  - routing badge recognizes `imarouter.com` as `IMA Router`.
  - `gpt-image-2-ima` remains out of the GUI picker until a GUI IMA Router image client exists.

## Local Live Generate-Image

Command:

```bash
bun run pipeline generate-image \
  --text "a matte black cube on a clean white background" \
  --aspect-ratio 1:1 \
  --output-dir /tmp/qcut-output/imarouter-local-smoke \
  --json
```

Result: pass.

CLI result:

```json
{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "endpoint": "v1/images/generations",
    "outputPath": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "cost": 0.042,
    "duration": 231.357
  }
}
```

Sidecar evidence:

```json
{
  "model": "gpt_image_2_gmi",
  "endpoint": "v1/images/generations",
  "output": {
    "path": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "video_url": "https://zhubite-imagent-bot.oss-us-east-1.aliyuncs.com/aiagent/aigc_temp/20260519/1efb7b6a47704b3ec7fa0283124eed60_1779166803081071626_1779166803080804388_0.png"
  }
}
```

File check:

```text
/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
```

## Local Live Flow Portraits

Command:

```bash
bun run pipeline flow portraits \
  --input /tmp/qcut-input/imarouter-characters.json \
  --max-characters 2 \
  --views front \
  --image-model gpt_image_2_gmi \
  -o /tmp/qcut-output/imarouter-flow-smoke/portraits \
  --json
```

Result: pass.

CLI result:

```json
{
  "status": "ok",
  "data": {
    "command": "vimax:generate-portraits",
    "cost": 0.084,
    "duration": 217.99,
    "data": {
      "characters": 2,
      "portraits_generated": 2,
      "registry_path": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/registry.json"
    }
  }
}
```

File check:

```text
/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Mira_Chen/front.png: PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Jon_Vale/front.png:  PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
```

Registry:

```json
{
  "project_id": "cli-project",
  "portraits": {
    "Mira Chen": {
      "character_name": "Mira Chen",
      "description": "",
      "front_view": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Mira_Chen/front.png"
    },
    "Jon Vale": {
      "character_name": "Jon Vale",
      "description": "",
      "front_view": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Jon_Vale/front.png"
    }
  }
}
```

## Local Live Flow Storyboard

Command:

```bash
bun run pipeline flow storyboard \
  --script /tmp/qcut-input/imarouter-script.json \
  --style "clean cinematic storyboard frame, consistent character design" \
  --image-model gpt_image_2_gmi \
  -o /tmp/qcut-output/imarouter-storyboard-smoke/storyboard \
  --json
```

Result: pass.

CLI result:

```json
{
  "status": "ok",
  "data": {
    "command": "vimax:generate-storyboard",
    "outputPath": "/tmp/qcut-output/imarouter-storyboard-smoke/storyboard",
    "cost": 0.042,
    "duration": 125.101,
    "data": {
      "title": "Neon Repair",
      "images": 1,
      "total_cost": 0.042
    }
  }
}
```

File check:

```text
/tmp/qcut-output/imarouter-storyboard-smoke/storyboard/Neon_Repair/scene_001_medium_Workshop_Light.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

## E2E Evidence Bundle

Verifier output directory:

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z
```

The bundle copies the generated image, two portraits, one storyboard image, sidecar JSON, portrait registry, file checks, and a machine-readable verification summary.

Verification summary:

```json
{
  "status": "passed",
  "evidenceDir": "output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z",
  "checks": {
    "defaultModel": true,
    "endpoint": true,
    "generatedPath": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "portraitCount": 2,
    "storyboardCopied": true
  }
}
```

File check:

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/generate-image.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/portrait-jon.png:   PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/portrait-mira.png:  PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/storyboard.png:     PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

## Container E2E

This pass also built the CLI container image from the current branch and ran a clean-container smoke test using the same mounted output-folder behavior expected in the sandbox.

Build command:

```bash
docker buildx build \
  --file Dockerfile.cli \
  --platform linux/amd64 \
  --tag qcut-cli:imarouter-e2e \
  --build-arg QCUT_VERSION=imarouter-e2e \
  --load .
```

Result: pass.

Run command:

```bash
docker run --rm \
  --env-file ~/.qcut/.env \
  -v /tmp/qcut-docker-e2e:/tmp/qcut-output \
  qcut-cli:imarouter-e2e \
  bash -lc 'qcut generate-image --text "a matte black cube on a clean white background" --aspect-ratio 1:1 --output-dir /tmp/qcut-output/imarouter-docker-smoke --json'
```

Result: generation passed. The container image does not include the `file` utility, so the image-type check was run from the host against the mounted output folder.

CLI result:

```json
{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "endpoint": "v1/images/generations",
    "outputPath": "/tmp/qcut-output/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png",
    "cost": 0.042,
    "duration": 101.83
  }
}
```

Sidecar evidence:

```json
{
  "model": "gpt_image_2_gmi",
  "endpoint": "v1/images/generations",
  "output": {
    "path": "/tmp/qcut-output/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png",
    "video_url": "https://zhubite-imagent-bot.oss-us-east-1.aliyuncs.com/aiagent/aigc_temp/20260519/3ac2d1114a4982e614e6a73c1a4e9e8b_1779168147657614614_1779168147657367351_0.png"
  }
}
```

File check:

```text
/tmp/qcut-docker-e2e/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
```

Downloadable evidence was copied into:

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/docker-smoke
```

## Daytona Status

Real Daytona cloud was not run from this machine in this pass.

Observed blockers and constraints:

```text
daytona CLI: missing from PATH
~/.qcut/.env: available for local/container runs
branch-built cloud image: not deployed from this pass
```

Also, a meaningful Daytona verification needs a CLI image built from this branch. Testing the current production sandbox image before build/push/deploy would only verify the old image, not this implementation.

## Follow-Up Daytona Command

After building and deploying a CLI image from this branch, run this inside the sandbox:

```bash
set -eu
rm -rf /tmp/qcut-output/imarouter-e2e
mkdir -p /tmp/qcut-output/imarouter-e2e
qcut generate-image \
  --text "a matte black cube on a clean white background" \
  --aspect-ratio 1:1 \
  --output-dir /tmp/qcut-output/imarouter-e2e \
  --json | tee /tmp/qcut-output/imarouter-e2e/result.json
find /tmp/qcut-output/imarouter-e2e -maxdepth 1 -type f -print | sort > /tmp/qcut-output/imarouter-e2e/files.txt
file /tmp/qcut-output/imarouter-e2e/* > /tmp/qcut-output/imarouter-e2e/file-check.txt
```

Expected:

- sidecar JSON includes `"model": "gpt_image_2_ima"` for new default runs, or `"model": "gpt_image_2_gmi"` for legacy alias runs.
- sidecar JSON includes `"endpoint": "v1/images/generations"`
- generated image is a valid PNG or JPEG
- folder download includes result JSON, sidecar JSON, file check, and generated image
