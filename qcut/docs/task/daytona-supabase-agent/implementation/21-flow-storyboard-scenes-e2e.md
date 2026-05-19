# Flow Storyboard Scenes Daytona E2E

Date: 2026-05-19
Branch: `cli-image-v6`
PR: https://github.com/Quriosity-agent/qcut/pull/306

## Summary

Status: passed.

This verifies the production Chat Agent page can create a real online Daytona sandbox, run `qcut flow scenes`, then run `qcut flow storyboard` with the generated scenes JSON as input.

The tested storyboard path is:

```bash
qcut flow storyboard \
  --scenes /tmp/qcut-output/scenes.json \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/storyboard-from-scenes \
  --json
```

The deployed CLI image also exposes `--scenes` in `qcut flow storyboard --help --json`.

## Deployment Under Test

- Chat Agent page: `https://quriosity.com.au/chat-agent.html`
- License server: `https://qcut-license-server.zdhpeter.workers.dev`
- Worker deploy version: `064e862d-4c70-402b-93a5-cffaaeb9d618`
- CLI image tag: `ghcr.io/quriosity-agent/qcut-cli:cli-image-v6-storyboard-scenes-20260519195039`
- CLI image GitHub Actions run: https://github.com/Quriosity-agent/qcut/actions/runs/26121362262
- Daytona session: `a5b46292-2725-49e6-9673-7f7cb47ae072`

## Real E2E Steps

The browser test opened the production Chat Agent page, cleared any saved local session id, clicked Connect, waited for the Codex terminal inside Daytona, and sent the E2E shell prompt through the web UI.

Commands executed inside the Daytona sandbox:

```bash
set -euo pipefail
rm -rf /tmp/qcut-input /tmp/qcut-output
mkdir -p /tmp/qcut-input /tmp/qcut-output/storyboard-from-scenes

qcut flow storyboard --help --json | tee /tmp/qcut-output/storyboard-help.json

cat > /tmp/qcut-input/novel.txt <<'EOF'
At sunrise, Lina enters a glass observatory above the city and discovers a humming compass on the floor.
The compass projects one memory of her missing brother, then points toward a locked service stair glowing with blue light.
EOF

qcut flow scenes \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  --max-scenes 1 \
  -o /tmp/qcut-output \
  --json

qcut flow storyboard \
  --scenes /tmp/qcut-output/scenes.json \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/storyboard-from-scenes \
  --json
```

The test capped the generated scenes JSON to one scene and one shot before storyboard generation to keep the real provider run small and deterministic.

## Result

- `FLOW_STORYBOARD_SCENES_E2E_OK` printed inside the Daytona Codex terminal.
- `FLOW_STORYBOARD_SCENES_E2E_DONE` was returned by the sandbox Codex agent.
- `scenes.json` had `scene_count: 1`.
- `scenes.json` had `shot_count: 1`.
- Storyboard generation produced `png_count: 1`.
- Downloaded proof image was a valid PNG, `1536x1024`, `1,730,482` bytes.

Sandbox outputs:

```text
/tmp/qcut-output/scenes.json
/tmp/qcut-output/storyboard-help.json
/tmp/qcut-output/storyboard-proof.png
/tmp/qcut-output/flow-storyboard-scenes-e2e-proof-2026-05-19T20-08-25-585Z.md
/tmp/qcut-output/storyboard-from-scenes/The_Humming_Compass/scene_001_medium_The_Observatory_Discovery.png
```

Downloaded local evidence:

```text
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/01-initial.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/02-connected.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/03-after-command.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/04-files.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-scenes.json
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-flow-storyboard-scenes-e2e-proof-2026-05-19T20-08-25-585Z.md
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/downloaded-storyboard-proof.png
/Users/peter/Desktop/code/qcut/qcut/output/playwright/flow-storyboard-scenes-daytona-e2e-2026-05-19T20-08-25-585Z/result.json
```

Proof file contents:

```text
status: success
run_marker: FLOW_STORYBOARD_SCENES_DAYTONA_2026-05-19T20-08-25-585Z
image_tag: ghcr.io/quriosity-agent/qcut-cli:cli-image-v6-storyboard-scenes-20260519195039
input: /tmp/qcut-output/scenes.json
input_kind: scenes
scene_count: 1
shot_count: 1
png_count: 1
proof_image: /tmp/qcut-output/storyboard-proof.png
first_storyboard_image: /tmp/qcut-output/storyboard-from-scenes/The_Humming_Compass/scene_001_medium_The_Observatory_Discovery.png
```

## Local Checks Before Deployment

Passed:

```bash
bunx biome check --write \
  electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts \
  electron/native-pipeline/cli/cli.ts \
  electron/native-pipeline/cli/cli-runner/types.ts \
  electron/native-pipeline/cli/command-registry.ts
```

```bash
bun test \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/script-handlers.test.ts \
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/scene-handlers.test.ts
```

Result: 8 pass.

```bash
bun run pipeline flow storyboard --help --json
```

Result: `--scenes` is listed.

```bash
cd electron && bun x tsc --noEmit
```

Result: pass.

```bash
bun --cwd packages/license-server test src/routes/agent.test.ts
```

Result: 39 pass.
