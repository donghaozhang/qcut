# E2E Testing Guide

## Principle

This must verify the real Daytona chat agent path, not only the local CLI.

Minimum requirements:

- Start from the Web / Daytona chat agent.
- Run commands inside a real sandbox.
- Use the real `qcut gen image` binary or the CLI inside the deployed image.
- Send real IMA Router GPT Image 2 requests.
- Generate real image files.
- Read final image dimensions programmatically.
- After the first generation finishes, submit a second command in the same Codex terminal / PTY session.

Do not use mocks, do not stop at parser tests, and do not fall back to another model.

## Recommended E2E Scenarios

### Scenario A: Ratio Parameters

Run these commands through the Daytona chat agent:

```bash
set -euo pipefail

RUN_ID="$(date +%s)"
ROOT="/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID"
mkdir -p "$ROOT"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, clean studio lighting" \
  --aspect-ratio 16:9 \
  -o "$ROOT/aspect-16-9" \
  --json | tee "$ROOT/aspect-16-9.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, vertical poster crop" \
  --ratio 9:16 \
  -o "$ROOT/ratio-9-16" \
  --json | tee "$ROOT/ratio-9-16.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, portrait editorial crop" \
  --aspect-ratio 3:4 \
  -o "$ROOT/aspect-3-4" \
  --json | tee "$ROOT/aspect-3-4.json"

qcut gen image \
  -m gpt_image_2_ima \
  -t "minimal product photo of a matte black coffee mug on a neutral table, landscape catalog crop" \
  --aspect-ratio 4:3 \
  -o "$ROOT/aspect-4-3" \
  --json | tee "$ROOT/aspect-4-3.json"
```

Expected:

- All four commands succeed.
- Each output directory contains an image file and sidecar JSON.
- The final dimensions match `16:9`, `9:16`, `3:4`, and `4:3`.
- Sidecar JSON records `gpt_image_2_ima` as the model.

### Scenario B: Custom Width And Height

```bash
set -euo pipefail

RUN_ID="${RUN_ID:-$(date +%s)}"
ROOT="${ROOT:-/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID}"
mkdir -p "$ROOT"

qcut gen image \
  -m gpt_image_2_ima \
  -t "wide editorial hero image of a matte black coffee mug on a neutral table, clean studio lighting" \
  --width 2000 \
  --height 1152 \
  -o "$ROOT/custom-2000x1152" \
  --json | tee "$ROOT/custom-2000x1152.json"
```

Expected:

- The command succeeds.
- The final image size is `2000x1152`.
- The sidecar JSON params include `size: "2000x1152"`.

### Scenario C: Second Input In The Same Terminal

In the same Daytona Codex terminal / PTY session, after all image generation commands finish, submit another independent command:

```bash
echo "SECOND_INPUT_OK $(date -Iseconds)" > "$ROOT/second-input-ok.txt"
qcut --version | tee "$ROOT/qcut-version-after-second-input.txt"
```

Expected:

- The second message submits successfully.
- The terminal is not stuck in composer/editor state.
- `$ROOT/second-input-ok.txt` exists.
- `$ROOT/qcut-version-after-second-input.txt` contains version output.

## Dimension Validation Script

Run this inside the sandbox:

```bash
set -euo pipefail

ROOT="${ROOT:-/tmp/qcut-output/gen-image-ratio-size-e2e-$RUN_ID}"

bun - <<'BUN'
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadImage } from "@napi-rs/canvas";

const root = process.env.ROOT;
if (!root) throw new Error("ROOT is required");

const cases = [
  { name: "aspect-16-9", ratio: 16 / 9 },
  { name: "ratio-9-16", ratio: 9 / 16 },
  { name: "aspect-3-4", ratio: 3 / 4 },
  { name: "aspect-4-3", ratio: 4 / 3 },
  { name: "custom-2000x1152", width: 2000, height: 1152 },
];

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function findImage({ dir }) {
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const lower = file.name.toLowerCase();
    const isImage = [...imageExtensions].some((ext) => lower.endsWith(ext));
    if (isImage) return join(dir, file.name);
  }
  throw new Error(`No image found in ${dir}`);
}

const results = [];
for (const testCase of cases) {
  const filePath = findImage({ dir: join(root, testCase.name) });
  const image = await loadImage(filePath);
  const width = image.width;
  const height = image.height;
  const ratio = width / height;
  const ratioOk =
    testCase.ratio === undefined || Math.abs(ratio - testCase.ratio) <= 0.01;
  const widthOk = testCase.width === undefined || width === testCase.width;
  const heightOk = testCase.height === undefined || height === testCase.height;
  results.push({
    name: testCase.name,
    filePath,
    width,
    height,
    ratio,
    ok: ratioOk && widthOk && heightOk,
  });
}

const failed = results.filter((item) => !item.ok);
const report = {
  status: failed.length === 0 ? "SUCCESS" : "FAILED",
  results,
  failed,
};

writeFileSync(
  join(root, "dimension-validation.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exit(1);
BUN
```

Expected output:

```json
{
  "status": "SUCCESS",
  "failed": []
}
```

## Suggested Prompt For The Chat Agent

Send this to the Daytona chat agent:

```text
Please run a real QCut image ratio/size E2E in the current Daytona sandbox. Do not mock anything and do not fall back to another model.

Requirements:
1. Run qcut gen image with model fixed to gpt_image_2_ima.
2. Test --aspect-ratio 16:9, --ratio 9:16, --aspect-ratio 3:4, and --aspect-ratio 4:3.
3. Also test --width 2000 --height 1152.
4. Put all outputs under /tmp/qcut-output/gen-image-ratio-size-e2e-<timestamp>.
5. Use @napi-rs/canvas or another reliable method to read final image dimensions and write dimension-validation.json.
6. In the same terminal session, after image generation finishes, submit a second command that writes second-input-ok.txt and runs qcut --version into qcut-version-after-second-input.txt.
7. If qcut system models --json does not include gpt_image_2_ima, or qcut generate-image --help --json does not include --ratio, --width, and --height, fail immediately and write preflight-failed.txt. Do not switch models.
8. Final response must include: run directory, each image path, dimensions, sidecar JSON paths, and whether the second input succeeded.
```

## Preflight

Run before real generation:

```bash
set -euo pipefail

qcut --version
qcut system models --json | tee /tmp/qcut-output/models.json
qcut generate-image --help --json | tee /tmp/qcut-output/gen-image-help.json

grep -q "gpt_image_2_ima" /tmp/qcut-output/models.json
grep -q -- "--ratio" /tmp/qcut-output/gen-image-help.json
grep -q -- "--width" /tmp/qcut-output/gen-image-help.json
grep -q -- "--height" /tmp/qcut-output/gen-image-help.json
```

If preflight fails, the Daytona image or deployed environment does not include this fix. Do not continue generation, because that would only test an old image.

## Failure Diagnosis

### `--ratio` did not take effect

Check whether the final image is still at the default ratio. Then inspect sidecar JSON for:

```json
{
  "params": {
    "aspect_ratio": "9:16"
  }
}
```

If the sidecar has no `aspect_ratio`, the CLI/session parser did not capture the alias.

### `--width/--height` did not take effect

Check sidecar JSON for:

```json
{
  "params": {
    "size": "2000x1152"
  }
}
```

If the sidecar has `size` but the final dimensions are not `2000x1152`, the provider behavior or deployed backend needs deeper investigation.

### Second input failed

Check whether chat-agent / relay wrote this Codex config:

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

If it is missing, the issue is in PTY session bootstrap or an old image. If it is present and still fails, capture terminal events and Codex TUI state.

## Run Results

### 2026-05-26: Passed

Environment:

- Chat page: `https://quriosity.com.au/chat-agent.html`
- License server: `https://qcut-license-server.zdhpeter.workers.dev`
- License server deployment: `8aab4d06-35de-4330-997a-b743244e9e15`
- CLI image: `ghcr.io/quriosity-agent/qcut-cli:gen-image-ratio-size-20260526034624`
- GitHub Actions image build: `26431056624`
- Daytona session: `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`
- Remote root: `/tmp/qcut-output/gen-image-ratio-size-e2e-1779769061133`
- Local proof directory: `output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z`

Validation:

| Case | Command input | Dimensions | Result |
| --- | --- | ---: | --- |
| `aspect-16-9` | `--aspect-ratio 16:9` | `2048x1152` | Pass |
| `ratio-9-16` | `--ratio 9:16` | `1152x2048` | Pass |
| `aspect-3-4` | `--aspect-ratio 3:4` | `1536x2048` | Pass |
| `aspect-4-3` | `--aspect-ratio 4:3` | `2048x1536` | Pass |
| `custom-2000x1152` | `--width 2000 --height 1152` | `2000x1152` | Pass |

Proof artifacts:

- `dimension-validation.json`: `status=SUCCESS`, `failed=[]`.
- Local downloaded images:
  - `downloaded-aspect-16-9-gpt_image_2_ima_minimal-product-photo-of-a-matte-black-coffee-mug-on-a_1779769163509.png`
  - `downloaded-ratio-9-16-gpt_image_2_ima_minimal-product-photo-of-a-matte-black-coffee-mug-on-a_1779769218141.png`
  - `downloaded-aspect-3-4-gpt_image_2_ima_minimal-product-photo-of-a-matte-black-coffee-mug-on-a_1779769288568.png`
  - `downloaded-aspect-4-3-gpt_image_2_ima_minimal-product-photo-of-a-matte-black-coffee-mug-on-a_1779769353823.png`
  - `downloaded-custom-2000x1152-gpt_image_2_ima_wide-editorial-hero-image-of-a-matte-black-coffee-mug-on-a_1779769409357.png`
- Final terminal screenshot: `07-final-proof.png`.
- Second natural-language input proof: `second-input-ok.txt` contains `SECOND_INPUT_OK 2026-05-26T04:25:07+00:00`, and `qcut-version-after-second-input.txt` contains `1.0.0`.

Failures fixed during this run:

- The first real provider run returned `IMA Router submit error 403` for `size: "16:9"`. A diagnostic run in the same Web / Daytona path proved the key and model were valid by generating a real `1024x1024` image. Fix: map GPT Image 2 ratio flags to pixel dimensions before calling IMA Router.
- The original preflight checked `qcut gen image --help`, which prints top-level help. Fix: check `qcut generate-image --help --json`.
