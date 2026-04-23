# GPT-Image-2 (FAL) — CLI commands for testing the GUI path

This doc records the exact CLI invocations that exercise the **same main-process generation path** the GUI uses (`NativePipelineManager` → `callModelApi` → proxy-first → FAL queue poll → auto-import to timeline). Use these when you want to verify gpt-image-2 end-to-end without clicking through the UI, or to bypass the renderer `fal-ai-client` while debugging.

**Branch**: `GPT-Image2`
**Status** (as of 2026-04-23):
- FAL variant (`openai/gpt-image-2`): reaches queue and completes, but intermittently returns a FastAPI-style `{detail:[...]}` `downstream_service_error` envelope from FAL's OpenAI passthrough. End-to-end runs *have* succeeded on this date (see §6 table) — fail-rate is provider-side, not QCut code.
- GMI variant (`gpt-image-2-gmi`): backend returns HTTP 500 after retries (GMI tenant/backend issue).

Both failure modes originate at the provider, not in QCut routing or auth. See [fal-provider-plan.md](./fal-provider-plan.md) §7 for the downstream-error evidence.

---

## Prerequisites

Follow steps **0**, **0.1**, and **0.2** below in order — they build the CLI, launch the editor, and log in. After that, pick whichever generation path you want (§1 standalone CLI, §2 editor HTTP bridge, etc.).

- Step **0** is required whenever you've touched any `electron/native-pipeline/*` source since the last build — the `qcut` binary is a compiled snapshot.
- Step **0.1** is only required for the `editor:generate:*` variant in §2 (it hits the editor's HTTP bridge on 8765). Skip it if you're only running §1.
- Step **0.2** is required for any path that uses the license-server proxy (anything other than pure BYOK with `VITE_FAL_API_KEY`).

---

## 0. Build the CLI

Rebuilds `qcut` + `electron/native-pipeline` from source. Required after pulling new commits or editing any CLI handler / registry data.

```bash
cd /Users/peter/Desktop/code/qcut/qcut
bun run build
# → vite build (apps/web), tsc (electron), esbuild preload → ~25-40s total
```

Expected output ends with:
```
$ cd electron && bun x tsc && bun x esbuild ../electron/preload.ts ...
  ../dist/electron/preload.js  47.2kb
⚡ Done in 2ms
```

If `bun run build` fails, fix the build before running any of the commands below — the compiled `qcut` binary won't pick up new registry entries or CLI handlers otherwise.

### Troubleshooting — "Cannot read properties of undefined (reading 'resolve')" or "src/App.js (25:16): Expression expected"

Symptom: Vite fails to load the config or parses an unexpected `.js` file:

```
qcut:build: failed to load config from .../apps/web/vite.config.js
qcut:build: TypeError: Cannot read properties of undefined (reading 'resolve')
```
or
```
qcut:build: src/App.js (25:16): Expression expected
```

Cause: a prior `tsc` run (without `--noEmit`, or from an IDE / out-of-scope build task) emitted compiled `.js` files next to their `.ts`/`.tsx` sources across `apps/web/src/`, `electron/`, and `packages/`. Vite prefers `.js` over `.ts` when both exist, so the broken compiled output takes precedence.

Fix: delete every untracked `.js` that has a paired `.ts`/`.tsx` sibling, then rebuild:

```bash
cd /Users/peter/Desktop/code/qcut/qcut

for scope in apps/web/src electron packages; do
  git ls-files --others --exclude-standard "$scope" | grep '\.js$' | while read -r f; do
    base="${f%.js}"
    if [ -f "${base}.ts" ] || [ -f "${base}.tsx" ]; then
      rm "$f"
    fi
  done
done

# Confirm none remain
git ls-files --others --exclude-standard apps/web/src electron packages \
  | grep '\.js$' | wc -l   # → 0

bun run build   # now passes in ~25s
```

Observed on 2026-04-23: ~2,200 stale `.js` files under `apps/web/src/` + `electron/` + `packages/`, zero orphan `.js` without a source pair, zero `.js.map` or `.d.ts` alongside them. The filter keeps legitimate non-tsc JS scripts intact (e.g. reference material in `docs/task/`, binary build artifacts).

---

## 0.1. Launch Electron in the background

Only needed for §2 (editor HTTP bridge) — skip if you're only running §1 standalone CLI.

```bash
# From the qcut subdirectory
cd /Users/peter/Desktop/code/qcut/qcut

# Launch the packaged build; disown so closing the terminal doesn't kill it
bun run electron &
disown
```

Or, if you prefer a detached launch that survives the shell:

```bash
nohup bun run electron > /tmp/qcut-electron.log 2>&1 &
```

Verify the editor HTTP bridge is up before moving on:

```bash
qcut editor:health --json | jq '.status'
# → "ok"
```

If `editor:health` returns `"No active window"`, kill any stale Electron processes and relaunch — the single-instance lock can leave a zombie with no window attached:

```bash
pkill -f "qcut/node_modules/.bun/electron@"
sleep 2
bun run electron &
disown
```

---

## 0.2. Log in with the QCut test account

Credentials live in `.env.test-accounts` (gitignored) — ask the project admin. Once logged in, `qcut` writes the token to `~/.qcut/.env` as `QCUT_AUTH_TOKEN`, and both the standalone CLI and the editor's main process will pick it up automatically.

```bash
# Load test credentials into the shell
source .env.test-accounts

# Log in — persists the session token
qcut system login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"
# → "Logged in as <email>"

# Verify the token was stored
qcut system check-keys | grep QCUT_AUTH_TOKEN
# → QCUT_AUTH_TOKEN    configured (env) xxxx****xxxx

# Quick credit / plan check against the license server
TOKEN=$(grep '^QCUT_AUTH_TOKEN=' ~/.qcut/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://qcut-license-server.zdhpeter.workers.dev/api/license/status | jq .
# → {"plan":"free","status":"active","credits":{"totalCredits":...}}
```

> **BYOK users**: set any one of `VITE_FAL_API_KEY`, `FAL_API_KEY`, or `FAL_KEY` in your environment instead and skip this step — runtime key lookup accepts all three. The CLI will call FAL directly; no credits are deducted. Note this path hits FAL's `openai/gpt-image-2` with *your* FAL key + OpenAI passthrough credentials, which is usually where gpt-image-2 specifically breaks.

---

## 1. Direct CLI generation (no editor needed)

This is the fastest path and the one we used to pinpoint the FAL `downstream_service_error`. It runs the full native pipeline (proxy submit, queue poll, result fetch, download) and writes the PNG to `$TMPDIR/qcut/aicp-output/<session>/`.

```bash
# FAL variant — default tier ($0.042/image, high quality, landscape_4_3)
bun run pipeline gen image \
  -m gpt_image_2_fal \
  -t "Photorealistic orange cat sitting on a tree branch at dawn"

# JSON output (for scripting)
bun run pipeline gen image \
  -m gpt_image_2_fal \
  -t "..." \
  --json

# Custom output dir (absolute path)
bun run pipeline gen image \
  -m gpt_image_2_fal \
  -t "..." \
  -o ~/Desktop/gpt2-tests
```

### Expected outcomes

| Provider state | Output |
|---|---|
| FAL OpenAI passthrough working | `Output: /path/to/output_<ts>.png` + `Cost: $0.0420 USD` + exit 0 |
| FAL returns `detail[]` error (current) | `FAL returned error: Downstream service error — full payload: ...` + exit 1 |
| Proxy 500 / GMI backend error | Falls back to local `VITE_FAL_API_KEY` if set; else exits 1 with real error |

The detail-envelope detection landed in commit `1b08c8c2d` — before that, FAL errors were silently mapped to exit 0 with an empty outputPath.

---

## 2. GUI-equivalent path via editor HTTP bridge

This calls the **same handler the GUI Generate button invokes** (`POST /api/claude/generate/:projectId/start` → `startGenerateJob` → `NativePipelineManager`). Useful when you want to verify the GUI flow without touching the renderer.

Requires a running QCut editor (`bun run electron:dev` or packaged). Find your `project-id` via `qcut editor:project:list` (look for `activeProjectId`) or from the editor URL (`/editor/<project-id>`).

### 2a. Open the project in the editor first

The editor must have the target project loaded before `editor:generate:*` will work — otherwise generation jobs are created but immediately fail with an internal project-state error. Open it with:

```bash
# List projects + find the active one
qcut editor:project:list

# Navigate the running editor to the project you want to generate into
qcut editor:navigator:open --project-id <project-id>
# → { "navigated": true, "projectId": "<project-id>" }
```

If the editor window is unfocused or still booting, `navigator:open` can return `"Timeout waiting for navigation confirmation"`. The navigation usually still lands — confirm with `qcut editor:timeline:export --project-id <pid>` and retry `navigator:open` if the timeline isn't loaded yet.

### 2b. Run the generation commands

```bash
# Fire-and-forget (returns jobId, then poll manually)
qcut editor:generate:start \
  --project-id <project-id> \
  --model gpt_image_2_fal \
  --text "A lone wolf howling at a blood moon, cinematic"

# Poll until complete
qcut editor:generate:start \
  --project-id <project-id> \
  --model gpt_image_2_fal \
  --text "..." \
  --poll --poll-interval 5

# Auto-add result to timeline (same as GUI "Add to Media" + drop on track)
qcut editor:generate:start \
  --project-id <project-id> \
  --model gpt_image_2_fal \
  --text "..." \
  --poll \
  --add-to-timeline --track-id track-1 --start-time 0
```

Poll / cancel / list jobs explicitly:

```bash
qcut editor:generate:status    --project-id <pid> --job-id <jid>
qcut editor:generate:list-jobs --project-id <pid>
qcut editor:generate:cancel    --project-id <pid> --job-id <jid>
```

### What this proves

A successful run via `editor:generate:start` means the GUI's Generate button would also succeed for that model, because both paths funnel into `startGenerateJob` → `NativePipelineManager.execute`. Conversely, if the CLI fails here, the GUI click will too — and the CLI gives you the full error chain in stderr instead of a toast.

---

## 3. Credit accounting verification

```bash
# Estimated cost only (no API call)
bun run pipeline gen image -m gpt_image_2_fal -t "test" --dry-run --json

# Confirm registry pricing matches what the license server expects
bun run pipeline system models --json | jq '.data.models[] | select(.key | startswith("gpt_image_2"))'
```

Expected: `costEstimate: 0.042`, `provider: "OpenAI (via FAL)"`, `endpoint: "openai/gpt-image-2"`, `providerBackend: "fal"`.

---

## 4. Comparing with a known-good FAL model

If you suspect a QCut-side regression rather than a provider-side outage, run the same command against a model FAL **does** serve to your tenant:

```bash
# Works today (~60s, $0.04)
bun run pipeline gen image -m gpt_image_1_5 -t "Photorealistic fox on snow"
```

A successful `gpt_image_1_5` run with a failing `gpt_image_2_fal` run confirms the failure is model-specific (FAL OpenAI passthrough for gpt-image-2), not a QCut routing or auth bug.

---

## 5. Debug flags

```bash
# Stream every pipeline step to stderr as JSONL (plus progress to stdout)
bun run pipeline gen image -m gpt_image_2_fal -t "..." --stream

# Verbose — adds debug logger output to stderr
bun run pipeline gen image -m gpt_image_2_fal -t "..." --verbose
```

The diagnostic log added in `1b08c8c2d` fires on any unrecognized FAL payload shape:

```text
[proxy-client] FAL openai/gpt-image-2 returned no recognized outputUrl.
Raw keys: detail. Data preview: {"detail":[{...}]}
```

If you see this line, copy the full raw payload into a follow-up ticket — it's exactly the evidence needed to tell FAL ops what went wrong on their side.

---

## 6. Known failure modes seen during development

| Date | Command | Result | Cause |
|---|---|---|---|
| 2026-04-23 | `gen image -m gpt_image_2_gmi` | HTTP 500 after 3 retries — "Generation failed due to a temporary backend error." | GMI tenant/backend broken |
| 2026-04-23 (early) | `gen image -m gpt_image_2_fal` | Queue COMPLETED with `{detail:[{type:"downstream_service_error", input:{..., openai_api_key:null}}]}`, billed $0.042 | Intermittent — FAL OpenAI passthrough flakiness |
| 2026-04-23 | Same after `1b08c8c2d` | Proxy reports failure → falls back to local key → 401 "invalid key credentials" → exit 1 | Surfaced the failure loudly instead of silent exit 0 |
| 2026-04-23 | `editor:generate:start -m gpt_image_2_fal` | Instant 401 "invalid key credentials" inside editor | **Utility process had no session token provider** — fixed by wiring `setSessionTokenProvider` in `electron/utility/utility-process.ts` against `~/.qcut/.env` |

---

## 7. Verified working — 2026-04-23 20:47 (end-to-end pass)

After landing (a) the renderer proxy-first routing, (b) the FAL `{detail:[…]}` detector, and (c) the utility-process `setSessionTokenProvider` wiring — all three `editor:generate:start` variants produced real PNGs via the license-server proxy in one session:

| Test | Job ID | Duration | Output |
|---|---|---|---|
| Fire-and-forget | `gen_1776940809253_8weua` | 120.9s | `~/Documents/QCut/Projects/ecf93d99…/media/output_1776940927907.png` |
| `--poll` | `gen_1776940942187_h8pb5` | 133.2s | `~/Documents/QCut/Projects/ecf93d99…/media/output_1776941073077.png` |
| `--poll --add-to-timeline` | `gen_1776941086255_fwv7c` | 167.1s | `~/Documents/QCut/Projects/ecf93d99…/media/output_1776941251740.png` |

Each run also wrote a session copy to `$TMPDIR/qcut/aicp-output/<jobId>/output_<ts>.png` (the native pipeline's raw output before project import). Every job returned `"status":"completed"`, `cost: undefined` from the manager (FAL doesn't echo cost in the queue result; the CLI shows the registry estimate), and the auto-imported `mediaId` in the Claude HTTP response.

The session-token provider fix moves the editor path from "silently direct-to-FAL with a stale local key → 401" to "proxy-first → succeed". The GUI Generate button uses the same renderer path as the CLI, so it should behave the same once you re-login in the app's Settings UI and restart.
