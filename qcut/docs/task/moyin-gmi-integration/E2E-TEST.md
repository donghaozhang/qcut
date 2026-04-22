# Moyin GMI Integration — End-to-End Test Guide

**Purpose**: Verify the Moyin LLM path (Subtask A) and media path (Subtask B) work
end-to-end across all three execution surfaces — standalone CLI, Electron IPC,
and the rendered Director UI — without depending on a human click.

**Audience**: Anyone verifying a release, bisecting a regression, or testing a
new GMI model addition.

## 1. Preconditions

Set these once per machine. Each test below asserts they remain true.

| Requirement | Check | Fix |
| --- | --- | --- |
| `~/.qcut/.env` exists, mode 0600 | `ls -la ~/.qcut/.env` | `qcut-pipeline system setup` |
| Either `GMI_API_KEY` (BYOK) **or** a valid `QCUT_AUTH_TOKEN` is present | `grep -E '^(GMI_API_KEY\|QCUT_AUTH_TOKEN)=' ~/.qcut/.env` | Sign in via the app OR paste a GMI key |
| `bun run build:electron` has been run since last code change | `stat -f %m dist/electron/moyin-llm.js electron/moyin-llm.ts` | `bun run build:electron` |
| No stale Electron is holding old compiled code | `ps aux \| grep -iE 'Electron\s\.$' \| grep -v grep` | ⌘Q the app |

Also keep a small sample script available for the parse tests:

```bash
printf 'Scene 1\n\nINT. KITCHEN - DAY\n\nALICE makes coffee. BOB enters.\n\nBOB\nMorning.\n' \
  > /tmp/moyin-sample.txt
```

## 2. Test Matrix

The Moyin feature has **three independent surfaces** that can each route to
GMI. They share underlying primitives (`proxy-client.ts`,
`buildProviderUrl`, `api-caller.ts`) but dispatch differently — so all three
are worth verifying.

| # | Surface | Code path | How to invoke |
| --- | --- | --- | --- |
| A | Pipeline CLI (bun) | `electron/native-pipeline/cli/cli-handlers-moyin.ts` → `llm-adapter.ts` → `callModelApi` | `bun run pipeline moyin:parse-script …` |
| B | Main-process IPC | `electron/moyin-handler.ts` → `moyin-llm.ts` → `proxyRequest` | `electron --run-cli` helper OR standalone node script (§4) |
| C | Director UI | renderer store → preload → `moyin:parse-script` IPC → path B | Click *Parse Script* in the app |

## 3. Test A — CLI (fastest, no Electron required)

Runs the same `~/.qcut/.env` resolution and the same license-server proxy
path, but never touches the Electron renderer. ~5 seconds per run.

### A1 · BYOK with a local GMI key

```bash
bun run pipeline moyin:parse-script \
  --script /tmp/moyin-sample.txt \
  --model kimi \
  --json
```

Expected:
- Exit code `0`
- JSON payload with `title`, `characters`, `scenes`, `episodes`
- Stderr contains `provider=openrouter` (Kimi alias resolves to OpenRouter) or
  `provider=gmi-llm` when you pick a GMI model (see §A3)

### A2 · Proxy mode — signed-in user, no local LLM key

Remove any BYOK LLM keys first so we force the proxy path:

```bash
# Sanity: only a session token should remain for this test
grep -vE '^(GMI_API_KEY|OPENROUTER_API_KEY|GEMINI_API_KEY)=' ~/.qcut/.env \
  > ~/.qcut/.env.tmp && mv ~/.qcut/.env.tmp ~/.qcut/.env
grep -E '^QCUT_AUTH_TOKEN=' ~/.qcut/.env || echo 'FAIL: no session token'
```

```bash
bun run pipeline moyin:parse-script \
  --script /tmp/moyin-sample.txt \
  --model gmi-glm-5.1 \
  --json
```

Expected:
- Exit code `0`
- Stderr/logs show the call hit `https://qcut-license-server.zdhpeter.workers.dev/api/ai/proxy`
  with `provider=gmi-llm`
- No 401 (auth), no 403 (endpoint-allowlist), no 402 (credits)

Troubleshooting table:

| HTTP status from proxy | Most likely cause | Fix |
| --- | --- | --- |
| 401 Invalid token | `QCUT_AUTH_TOKEN` in env is stale or `stable-token` | Re-sign in via the app; confirm real JWT lands in `~/.qcut/.env` |
| 403 Endpoint not allowed | Relative endpoint sent instead of full URL | Already fixed in `moyin-llm.ts` — ensure `bun run build:electron` ran |
| 402 Insufficient credits | Empty plan balance | Buy credits; same license server shows the ledger |
| 503 | License server upstream error | Retry; check `wrangler tail` on the Worker |

### A3 · Verify GMI model alias resolution

The CLI's `--model` flag accepts our new aliases. Confirm each lands on the
expected provider model:

```bash
for alias in gmi-glm-5.1 gmi-gemini-3.1-flash-lite gmi-gemini-3.1-pro; do
  echo "--- $alias ---"
  bun run pipeline moyin:parse-script \
    --script /tmp/moyin-sample.txt \
    --model "$alias" \
    --json 2>&1 | head -5
done
```

Expected: each alias produces valid JSON and never errors with
`"No GMI API key configured"`.

## 4. Test B — Main-process IPC (exercises `moyin-llm.ts` directly)

The CLI path does **not** cover `moyin-llm.ts` — it uses a parallel LLM adapter
in `electron/native-pipeline/vimax/adapters/llm-adapter.ts`. To test the code
we actually shipped, run a tiny standalone node script against the compiled
main-process module.

Save this as `scripts/test-moyin-llm.ts` (or run it inline):

```ts
import { callLLM, resolveLlmProvider } from "../dist/electron/moyin-llm.js";
import { loadEnvFile } from "../dist/electron/native-pipeline/infra/key-manager.js";
import { setSessionTokenProvider } from "../dist/electron/native-pipeline/infra/proxy-client.js";
import { getKey } from "../dist/electron/native-pipeline/infra/key-manager.js";

loadEnvFile();
setSessionTokenProvider(async () => getKey("QCUT_AUTH_TOKEN") ?? "");

async function main() {
  console.log("resolveLlmProvider('gmi-glm-5.1') =",
    resolveLlmProvider("gmi-glm-5.1"));

  const reply = await callLLM(
    "You are a terse assistant.",
    "Reply with the single word OK.",
    { model: "gmi-glm-5.1", maxTokens: 16 }
  );
  console.log("callLLM reply:", reply);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run it:

```bash
bun run scripts/test-moyin-llm.ts
```

Expected:
- `resolveLlmProvider` returns `{ provider: "gmi-llm", model: "zai-org/GLM-5.1-FP8" }`
- `callLLM reply:` starts with `OK` (or similar short affirmative)
- Exit code `0`

Failure modes:

| Error | Likely cause |
| --- | --- |
| `No GMI API key configured. Sign in …` | Neither local GMI key nor session token; see §1 |
| `Proxy GMI LLM error (401)` | Session token expired |
| `Proxy GMI LLM error (403)` | SSRF allowlist; confirm `buildProviderUrl("gmi-llm", ...)` produces a URL starting with `https://api.gmi-serving.com/` |
| `fetch failed` | Running under a sandbox that blocks outbound HTTPS — run on dev machine |

## 5. Test C — Director UI (manual smoke, final gate)

This is the only test that also covers the renderer store, the preload
bridge, and the UI's provider selectors.

### Setup

1. `bun run build:electron` (must be fresh)
2. `bun dev` (Vite server) in one terminal
3. `bun run electron:dev` in another terminal

### Checklist

| Step | Expected in the Electron terminal |
| --- | --- |
| Open Director panel (script-editor view) | no errors |
| Pick **GMI · GLM-5.1** under Parse Model | no errors |
| Paste sample script, click **Parse Script** | `[Moyin] callLLM using GMI via proxy (zai-org/GLM-5.1-FP8, prompt: N chars)` |
| Characters + Scenes tabs populate | no errors |
| Switch **Image Provider** to GMI | store update, no errors |
| Generate a shot image | `[Moyin] generate-image { provider: 'gmi', model: undefined }` then success |
| Switch **Video Provider** to GMI, generate a shot video | `[Moyin] generate-video { provider: 'gmi', ... }` then success |
| Quit (⌘Q), restart, reopen project | provider selections restored (persisted state) |

### Known non-blockers to ignore

- Missing `credits` field in proxy request payload (Subtask B3 follow-up)
- `useLicenseStore.checkLicense()` not called after generation (follow-up)
- "Top up" CTA not shown on 402 (follow-up) — you'll just see a generic
  error string in the UI

## 6. Regression Automation (future work)

These tests are currently manual because they hit a live license server. For
CI we should:

1. **Playwright test** that drives Test C via `tests/e2e/moyin-gmi.spec.ts`
   using a fixture QCUT_AUTH_TOKEN pointing at a staging worker.
2. **Record/replay** of the proxy-server response for Test A2 using
   `msw` or similar, so PRs don't need a live session token.
3. **Unit tests already in place:** see `electron/__tests__/moyin-handler-proxy.test.ts`
   and `electron/__tests__/moyin-media-handler.test.ts` — 23 tests covering
   the routing and proxy fallback logic.

## 7. Relevant File Paths (quick reference)

| Area | Path |
| --- | --- |
| Moyin LLM dispatch | `electron/moyin-llm.ts` |
| Moyin media dispatch | `electron/moyin-media-handler.ts` |
| CLI handler | `electron/native-pipeline/cli/cli-handlers-moyin.ts` |
| License-server proxy route | `packages/license-server/src/routes/ai-proxy.ts` |
| Provider allowlist | `packages/license-server/src/services/provider-keys.ts` |
| Env/key manager | `electron/native-pipeline/infra/key-manager.ts` |
| Proxy client | `electron/native-pipeline/infra/proxy-client.ts` |
| Provider URL builder | `electron/native-pipeline/infra/api-provider-urls.ts` |
| Director UI | `apps/web/src/components/editor/media-panel/views/moyin/script-input.tsx` |
| Moyin store | `apps/web/src/stores/moyin/moyin-store.ts` |
| Moyin parse actions + model aliases | `apps/web/src/stores/moyin/moyin-parse-actions.ts` |

## 8. Quick One-Liner for "is this working?"

When you just want a yes/no:

```bash
bun run pipeline moyin:parse-script \
  --text 'Scene 1: Alice makes coffee.' \
  --model gmi-glm-5.1 \
  --json 2>&1 | head -c 200
```

If that prints a JSON object starting with `{"title":`, ship it.
