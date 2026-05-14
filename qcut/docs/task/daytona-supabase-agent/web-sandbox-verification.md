# Verifying qcut runs in the sandbox

"Make sure qcut cli runs" — the concrete smoke-test recipe, exit-code contract, failure-mode catalogue, and CI hook.

## Layers of verification

Three layers, run at different cadences. Each catches a different failure class.

| Layer | When | Catches |
|-------|------|---------|
| Image build smoke test | CI on `qcut-cli` image build | Binary missing, FFmpeg broken, postinstall fail |
| Sandbox spawn probe | Before every sandbox is shown to the user | Bad env, missing secrets, provider drift |
| Interactive user check | First prompt in every session | Provider auth/quota specific to the workspace |

Each layer is fast (< 10 s) and writes structured rows to `agent_events` so a regression is observable from the dashboard.

## Layer 1 — image build smoke test

Runs on the CI pipeline that builds and pushes the `qcut-cli:vX` image. After build, spin a throwaway container from the image and run:

```bash
#!/usr/bin/env bash
# qcut-cli/smoke.sh
set -euo pipefail
qcut --version                                  # binary exists
qcut system doctor --json                       # env sanity, FFmpeg, paths
ffmpeg -version | head -n 1                     # FFmpeg actually executes
node -e 'require("sharp")' 2>&1 | head -n 1     # native deps loaded
bun --version
```

If any line exits non-zero, fail the build. CI invokes it as `docker run --rm qcut-cli:vX /smoke.sh`.

What this does **not** catch:

- Missing API keys (no keys baked into the image — that is correct).
- Network egress problems (the test container is offline).
- Sandbox-provider–specific PTY behavior.

Those are the next two layers.

## Layer 2 — sandbox spawn probe

Runs inside the Spawn Edge Function, *after* the sandbox is up but *before* the WS URL is returned to the browser. From [`web-sandbox-integration.md`](web-sandbox-integration.md):

```typescript
const probe = await sandbox.commands.run('qcut system doctor --json --skip-health', {
  timeoutMs: 8_000,
});
if (probe.exitCode !== 0) {
  await sandbox.kill();
  return new Response('sandbox_unhealthy', { status: 502 });
}
```

Probe contract:

- Completes in < 8 s.
- One JSON object on stdout.
- `status: "ok"`.
- Confirms `~/.qcut/.env` was loaded with > 0 keys.

Failure here means the image is fine but the *workspace*'s sandbox is not usable — almost always a secrets problem (missing required key, mode bits wrong, decryption failed). The user sees a clear "Sandbox failed to initialise — check API keys" message, not a hung terminal.

`--skip-health` matters: the doctor command must not call out to providers during the probe — that is an external SLO dependency, not a CLI smoke test. Network reachability is a separate check, run lazily on the user's first real command.

## Layer 3 — interactive user check

When the WS attaches, the relay writes a short message to the terminal before passing control to `bash`:

```
qcut sandbox · workspace acme-prod · session expires 14:32 UTC
type 'qcut system doctor' to verify all providers are reachable
type 'qcut --help' for command reference
```

This is a hint, not a gate. The session is healthy by Layer 2; we just nudge the user to run the deeper, network-touching doctor before doing real work.

`qcut system doctor` (without `--skip-health`) calls each registered provider with a tiny ping:

- FAL: `GET /v1/models`
- Gemini: `GET /v1beta/models`
- OpenRouter: `GET /api/v1/auth/key`
- ElevenLabs: `GET /v1/user`
- Anthropic: `POST /v1/messages` with `max_tokens=1`

Each result becomes an `agent_events` row with `kind = 'doctor_probe'`, `payload = { provider, latency_ms, status }`. This also powers a "provider health" widget without standing up a separate monitoring path.

## What counts as "qcut runs"

A sandbox session is verified end-to-end when **all three** of these succeed:

1. **Boot probe** (Layer 2) — `qcut system doctor --json --skip-health` exits 0.
2. **Trivial generation** — `qcut gen txt2img --provider fal --prompt 'red panda' --skip-health --dry-run --json` exits 0 and prints a non-empty `outputPath` (no actual API call when `--dry-run` is set; this verifies routing + arg validation).
3. **JSON contract** — every stream line emitted with `--json` parses as JSON and contains a `status` field. Garbage on stdout that bypasses the JSON contract is a regression.

All three are short enough (< 5 s each) to run unattended in CI.

## Exit code contract

The CLI commits to these exit codes; CI gates on them. (Mirrors [`architecture.md`](architecture.md); restated here because Layer 1/2 scripts gate on these explicitly.)

| Code | Meaning | Retryable |
|------|---------|-----------|
| 0    | Success | n/a       |
| 1    | Generic failure | Maybe (read message) |
| 2    | Invalid arguments | No |
| 3    | Missing/invalid credential | No (fix `.env`) |
| 4    | Network unreachable | Yes |
| 5    | Provider 5xx | Yes |
| 6    | Provider 4xx (rate limit) | Yes after backoff |
| 7    | Provider 4xx (auth/quota) | No |
| 8    | Timeout (CLI-side) | Yes |
| 9    | Local FS error | Maybe |
| 10   | Internal panic | No (file a bug) |

## Failure mode catalogue

| Symptom | Most likely cause | Quick check | Fix |
|---------|-------------------|-------------|-----|
| `qcut: command not found` | Image build broken | Re-run Layer 1 | Roll back image tag |
| Doctor exits 3 | Workspace has no secrets | `select count(*) from agent_secrets where workspace_id=$1` | Add keys via settings UI |
| Doctor exits 4 | Egress blocked / DNS | `curl -sS https://1.1.1.1` from sandbox | Provider outage; surface + retry |
| Doctor exits 7 on FAL | Key revoked | Hit FAL dashboard | Rotate key; UPDATE row |
| WS connects then hangs | Relay's PTY pipe dropping frames | Durable Object logs | Increase frame buffer; backoff stdin |
| `--json` emits non-JSON to stdout | Library writing to stdout instead of stderr | `bun run pipeline` locally, look for regression | Quarantine the noisy lib; PR |
| Exit 8 on fast commands | Sandbox image starting cold | Layer 2 latency log | Warm pool the image, or accept first-call latency |
| `cannot create file '~/.qcut/.env'` | Image runs as non-root, home not writable | `id` in spawn probe | Adjust Dockerfile USER / chown $HOME |
| FFmpeg "Permission denied" | Image cooked on a different arch / glibc | `file $(which ffmpeg)` | Rebuild image for the target arch |
| Sandbox killed at 5 min | Idle timer fired on a long generation | `last_input_at` from row | Bump idle threshold, or stream keepalives from the CLI |

## Manual verification (one-shot)

For a human on call to verify "is the sandbox healthy right now":

```bash
# from a laptop with the service role JWT
SESSION=$(curl -s -X POST "$SPAWN_URL" \
  -H "Authorization: Bearer $SR_JWT" \
  -d '{"workspace_id":"<id>","resource_class":"standard"}' | jq -r .session_id)

# tail the audit row stream
psql "$DATABASE_URL" -c "
  select kind, payload from agent_events
  where session_id='$SESSION'
  order by created_at limit 20"
```

Expected rows in order: `spawn_started`, `spawn_probe_ok`, `pty_attached`, `motd_sent`. If `spawn_probe_ok` is missing, the image is broken. If `pty_attached` is missing, the relay is broken. If both are present but the user reports a black terminal, the browser side dropped — check `WebSocket` console errors.

## CI integration

`.github/workflows/sandbox-smoke.yml` (skeleton):

```yaml
name: Sandbox smoke
on:
  schedule: [{ cron: '0 */6 * * *' }]            # every 6 h
  workflow_dispatch:
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - run: |
          SESSION=$(curl -fsS -X POST "$SPAWN_URL" \
            -H "Authorization: Bearer $SR_JWT" \
            -d '{"workspace_id":"$SMOKE_WS","resource_class":"standard"}' | jq -r .session_id)
          bun run scripts/sandbox-exec.ts "$SESSION" 'qcut system doctor --json'
          bun run scripts/sandbox-exec.ts "$SESSION" \
            'qcut gen txt2img --provider fal --prompt smoke --skip-health --dry-run --json'
```

`scripts/sandbox-exec.ts` is a small harness that calls `sandbox.commands.run` against the live session, capturing exit code + stdout. Failures alert the same channel as agent-path failures — one signal for "the sandbox surface is broken," not two.

## Defining "done"

The sandbox feature ships when:

- All three layers green in CI for two consecutive deploys.
- Spawn-probe latency p95 < 6 s in the last 24 h.
- Audit rows in `agent_events` follow the documented kinds (no `kind` is null or unexpected).
- The runbook entry for each row in "Failure mode catalogue" exists, even if it is just a one-paragraph wiki page.

Until those four hold, ship as a feature-flagged beta. After them, default-on per workspace plan tier.

## See also

- [`web-sandbox-architecture.md`](web-sandbox-architecture.md) — what is being verified
- [`web-sandbox-integration.md`](web-sandbox-integration.md) — where the probe is wired
- [`architecture.md`](architecture.md) — exit codes and `agent_events` schema referenced above
- [`vm0-job-pipeline.md`](vm0-job-pipeline.md) — masker module reused for audit redaction
