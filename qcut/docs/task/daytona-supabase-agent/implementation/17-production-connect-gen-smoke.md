# Production Connect Gen Smoke

Date: 2026-05-17

## Goal

Verify the production `chat-agent.html` Connect path against the real Daytona
sandbox terminal, then run representative QCut generation commands from the
persistent Codex session:

- `qcut gen image`
- `qcut gen video`
- `qcut gen music`

This tests the website-hosted path, not the local CLI:

```text
quriosity.com.au/chat-agent.html
  -> qcut-license-server /api/agent/sessions
  -> Daytona sandbox
  -> qcut-relay /pty WebSocket
  -> persistent Codex terminal
  -> qcut CLI inside /home/qcut/qcut
  -> /tmp/qcut-output
  -> license-server sandbox file API
```

## Evidence

Local evidence folder:

```text
output/playwright/agent-chat-production-connect-20260517-163752
output/playwright/agent-chat-production-gen-connect-20260517-163752
```

Important files:

```text
output/playwright/agent-chat-production-connect-20260517-163752/result.json
output/playwright/agent-chat-production-connect-20260517-163752/05-artifact-visible-failed.png
output/playwright/agent-chat-production-gen-connect-20260517-163752/result.json
output/playwright/agent-chat-production-gen-connect-20260517-163752/remote-summary.md
output/playwright/agent-chat-production-gen-connect-20260517-163752/video-retry-result.json
output/playwright/agent-chat-production-gen-connect-20260517-163752/video-retry-summary.md
```

Production Daytona session observed by the file API:

```text
session_id: af73cd39-87ba-4665-ae97-e78742f4a621
```

## Baseline Connect E2E

Command:

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --out-dir output/playwright/agent-chat-production-connect-20260517-163752 \
  --connect-timeout-ms 300000 \
  --prompt-timeout-ms 240000 \
  --artifact-timeout-ms 240000
```

Result: partial pass, then fail.

Passed:

- Page loaded with terminal status `disconnected`.
- Page stayed disconnected before the user click.
- Manual Connect opened Codex in a Daytona PTY.
- First prompt reached the persistent Codex session.
- Codex ran the requested shell command and created:
  `/tmp/qcut-output/agent-e2e-1779061116340.txt`.

Failed:

- The E2E waited for the artifact filename in the visible file browser, but the
  current file-browser path was `/`, not `/tmp/qcut-output`.
- The failure was:
  `forFunction: Timeout 240000ms exceeded`.

Conclusion: production Connect and command execution worked. The existing E2E
artifact assertion is stale after the file browser changed to full sandbox path
browsing.

## Gen Smoke

Remote output directory:

```text
/tmp/qcut-output/qcut-gen-connect-1779088800762
```

Harness result: passed. The harness connected to production, sent a prompt into
the persistent Codex terminal, and downloaded `summary.md` through:

```text
/api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/...
```

Commands and outcomes:

| Command | Result | Details |
| --- | --- | --- |
| `qcut gen image -t ... -m flux_dev --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/image` | Pass | Exit `0`; produced JPG and JSON. Cost `0.003`; duration `6.903s`. |
| `qcut gen music -t ... --instrumental --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/music` | Pass | Exit `0`; produced `output.mp3` (`3,212,649` bytes). Duration `117.176s`. |
| `qcut gen video -m ltx23_fast_t2v ... -d 1s --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/video` | Fail | Exit `1`; provider rejected invalid duration. |

Video failure:

```text
FAL returned error: Input should be 6, 8, 10, 12, 14, 16, 18 or 20
```

The failed video command used `-d 1s`. That is not accepted by
`ltx23_fast_t2v`.

## Video Retry

Remote output directory:

```text
/tmp/qcut-output/qcut-gen-video-retry-1779089310970
```

Command:

```bash
qcut gen video \
  -m ltx23_fast_t2v \
  -t "production connect smoke small blue square moving left to right on a clean white background" \
  -d 6s \
  --json \
  -o /tmp/qcut-output/qcut-gen-video-retry-1779089310970
```

Result: pass.

Output:

```text
/tmp/qcut-output/qcut-gen-video-retry-1779089310970/ltx23_fast_t2v_production-connect-smoke-small-blue-square-moving-left-to_1779089351962.mp4
```

Details:

```text
exit_code: 0
bytes: 1,885,601
cost: 0
duration: 21.763s
```

## Findings

1. Production Connect path is working end-to-end for real Daytona PTY sessions.
2. Codex starts inside the sandbox and can run QCut CLI commands.
3. `/tmp/qcut-output` files are downloadable through the production
   license-server full-path file API.
4. `gen image`, `gen music`, and `gen video` all succeeded when called with
   valid command parameters.
5. The existing `scripts/agent-chat-e2e.ts` artifact assertion should be updated
   to either switch the file browser to `/tmp/qcut-output` or use the full-path
   file API directly.
6. `gen video` docs/help should avoid examples that imply arbitrary `1s`
   durations for `ltx23_fast_t2v`; the provider accepts fixed durations
   `6, 8, 10, 12, 14, 16, 18, 20`.

## Recommended Follow-Up

Update the production E2E artifact check to poll:

```text
GET /api/agent/sessions/:sessionId/files?path=/tmp/qcut-output
```

or download the expected full path directly:

```text
GET /api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/<file>
```

This matches the current file-browser model and avoids false negatives when the
visible browser path is `/`.

## 2026-05-18 CLI Fix

The video duration failure is now guarded locally in the QCut CLI:

- `create-video` uses the documented default model
  `imarouter_seedance_2_0_fast_t2v` when `--model` is omitted.
- `--duration` is validated against the selected model's registry
  `durationOptions` before dispatching to the provider.
- `qcut gen video -t "small blue square" -d 1s --json` now fails immediately
  with:
  `Invalid --duration '1s' for imarouter_seedance_2_0_fast_t2v. Supported durations: 5s, 6s, 7s, 8s, 9s, 10s.`

## 2026-05-18 Video E2E Retest

Ran the production Connect video retry harness again against:

```text
https://quriosity.com.au/chat-agent.html
```

Remote output directory:

```text
/tmp/qcut-output/qcut-gen-video-retry-1779092057435
```

Command outcome:

```text
status: ok
command: create-video
duration: 27.619s
cost: 0
```

Generated output:

```text
/tmp/qcut-output/qcut-gen-video-retry-1779092057435/ltx23_fast_t2v_production-connect-smoke-small-blue-square-moving-left-to_1779092108425.mp4
```

File size:

```text
2,459,534 bytes
```

Conclusion: production `chat-agent.html` Connect -> Daytona -> Codex -> QCut
video generation works with a valid `ltx23_fast_t2v` duration (`6s`).

## 2026-05-18 Deploy Target

Deployment image tag:

```text
ghcr.io/quriosity-agent/qcut-cli:seedance-fast-default-20260518-012452
```

Production `qcut-license-server` should point `QCUT_IMAGE_TAG` at this image so
new Daytona sessions start with the CLI default video model fix.
