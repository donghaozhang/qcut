# 01 — Prerequisites

Get `qcut` ready to make real GMI API calls.

## 1. Install the CLI

QCut ships a Bun-installed `qcut` binary that symlinks into the monorepo's
`dist/electron/native-pipeline/cli/cli.js`.

```bash
which qcut
# → /Users/peter/.bun/bin/qcut (symlink)

qcut --version
# → 1.0.0
```

Rebuild after pulling new code:

```bash
bun run build
```

## 2. Store `GMI_API_KEY` in the encrypted key store

Keys live in `~/.qcut/.env` (mode `0600`).

```bash
# Interactive prompt — paste your key when asked
qcut system set-key --name GMI_API_KEY

# Verify
qcut system check-keys --json | jq '."GMI_API_KEY"'
# → "set"
```

You can also set `FAL_KEY` the same way if you want the adapter's FAL
path as a fallback when testing.

Supported key names (`qcut system check-keys --json` surfaces all of
them):

| Key | Used by |
|---|---|
| `GMI_API_KEY` | GMI Cloud video + image + LLM (this guide's happy path) |
| `FAL_KEY` | FAL provider (Kling v1/v2, Veo 3, Hailuo, etc.) |
| `GEMINI_API_KEY` | Google Gemini LLM fallback |
| `OPENROUTER_API_KEY` | OpenRouter LLM fallback |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `QCUT_AUTH_TOKEN` | License-server proxy mode (uses server-managed keys) |

## 3. Log in (only for proxy / beta-tester mode)

If you don't have a `GMI_API_KEY` of your own, log in to route through
QCut's license-server proxy and pay with credits instead. 11 beta test
accounts have 1000 credits each — ask a maintainer for the email +
password.

### 3a. Log in

```bash
# Interactive password prompt
qcut system login --email your-tester@qcut.app

# Scripted (CI-friendly)
qcut system login \
    --email "$QCUT_TEST_EMAIL" \
    --password "$QCUT_TEST_PASSWORD"
```

On success the server returns a session JWT which gets stored as
`QCUT_AUTH_TOKEN` in `~/.qcut/.env` (mode `0600`).

### 3b. Verify the token was persisted

```bash
qcut system check-keys --json | jq '."QCUT_AUTH_TOKEN"'
# → "set"

# Peek at the raw value if you need to debug the JWT
qcut system get-key --name QCUT_AUTH_TOKEN --reveal
```

### 3c. Check your credit balance

The token works directly against the worker's `/api/credits/balance`
endpoint (`packages/license-server/src/routes/credits.ts:82`):

```bash
curl -H "Authorization: Bearer $(qcut system get-key --name QCUT_AUTH_TOKEN --reveal)" \
    https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance
# → {"balance": 1000, ...}
```

### 3d. Force a proxy-routed video generation

With a local `GMI_API_KEY` present the adapter short-circuits to
direct BYOK (`api-caller.ts:579` — `useProxy = !apiKey && isProxyAvailable()`).
To actually exercise the proxy path, hide the local key for one
invocation:

```bash
env -u GMI_API_KEY qcut gen video \
    --model gmi_veo31_lite_t2v \
    --text "a cat walking through a sunlit kitchen" \
    --output-dir /tmp/qcut-proxy-ping
```

You should see `[api_caller] Using proxy mode (QCUT_AUTH_TOKEN)` in the
debug log and a matching credit debit when you re-run step 3c.

### 3e. Log out when done

```bash
qcut system logout
# Clears QCUT_AUTH_TOKEN from ~/.qcut/.env
```

Proxy vs BYOK selection is automatic per call — see
[reference-proxy-credits.md](../../../.claude/skills/native-cli/references/reference-proxy-credits.md)
for the full decision tree.

> ⚠️ Legacy aliases `qcut login` / `qcut logout` / `qcut check-keys` /
> `qcut get-key` / `qcut create-video` still work but print a
> deprecation warning. Always prefer the `qcut system …` and
> `qcut gen video` forms above.

## 4. Sanity-check GMI connectivity

List the GMI models the CLI knows about:

```bash
qcut system models --category image_to_video --json \
  | jq '.data | map(select(.providerBackend == "gmi")) | .[].key'
```

Expected output includes:

```
"gmi_kling_v3_i2v"
"gmi_kling_v3_omni_i2v"
"gmi_skyreels_v4_i2v"
"gmi_veo31_lite_i2v"
```

If this command hangs or errors on the HTTP layer, the `qcut` process
couldn't reach the license server; check network + `~/.qcut/.env`
permissions.

## 5. Pick your workspace

CLI working directory matters because:

- `--novel` / `--script` paths are resolved relative to cwd
- `--output-dir` is resolved the same way
- `system models` / key commands work from anywhere

Use the monorepo root for this guide:

```bash
cd ~/Desktop/code/qcut/qcut
```

All walkthrough snippets in this folder assume that cwd so paths like
`electron/native-pipeline/vimax/examples/japanese-anime-example.md`
resolve.

## 6. Minimum to produce a single test image

Shortest round-trip that exercises the GMI image pipeline:

```bash
qcut gen image \
    --model gmi_gemini_31_flash_image \
    --text "A Japanese anime schoolgirl, soft pastel, Shinkai style, 16:9" \
    --aspect-ratio 16:9 \
    --output-dir /tmp/qcut-ping
```

Expected: ~1–2 minute wait, one PNG under `/tmp/qcut-ping/`, cost
printed at the end (~$0.02). If this succeeds, you're ready for the
walkthrough docs.
