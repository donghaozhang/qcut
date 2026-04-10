# Proxy Mode & Credit System

How API calls are routed and billed when users don't have their own API keys.

## Two Modes

| Mode | When | API keys | Credits |
|------|------|----------|---------|
| **BYOK** (direct) | User has local API key (env var or encrypted store) | User's own key | No deduction |
| **Proxy** | No local key + valid `QCUT_AUTH_TOKEN` | Server-managed keys | Credits deducted per call |

The CLI auto-selects: `callModelApi()` checks for a local key first, falls back to proxy if `isProxyAvailable()` returns true.

## Proxy Flow

```
callModelApi(endpoint, modelKey, payload, provider)
  │
  ├─ Local key exists? → Direct call (BYOK, no credits)
  │
  └─ No key + session token? → Proxy mode:
       │
       ├─ estimateProxyCredits(modelKey, payload) → { amount, modelKey, description }
       ├─ callModelApiViaProxy({ ..., credits })
       ├─ proxyRequest() → POST /api/ai/proxy { provider, endpoint, body, credits }
       │
       └─ Server:
            ├─ deductCreditsForUser(userId, amount, modelKey) → 402 if insufficient
            ├─ fetch(providerEndpoint) with server-managed API key
            └─ Return provider response
```

## Credit Calculation

Credits are calculated from the model registry's USD pricing:

```
credits = USD_cost / 0.10    (1 credit ≈ $0.10)
```

**Source:** `electron/native-pipeline/infra/credit-estimator.ts`

Uses `estimateCost()` from `cost-calculator.ts` which reads pricing from the model registry. Falls back to 1 credit for unknown models.

### Examples

| Model | Pricing | 5s cost | Credits |
|-------|---------|---------|---------|
| `gmi_veo31_lite_t2v` | $0.40/video | $0.40 | 4.0 |
| `veo3` | $0.75/s (with audio) | $3.75 | 37.5 |
| `hailuo_pro` | $0.08/video | $0.08 | 0.8 |
| `flux_schnell_t2i` | $0.003/image | $0.003 | 0.1 (min) |

## Test Account Quick Start

11 pre-provisioned test accounts exist with 1000 credits each. Credentials are stored in `QCUT_TEST_EMAIL` and `QCUT_TEST_PASSWORD` environment variables. Ask the project admin for access.

A tester with no API keys uses the CLI auth commands to log in, then runs commands in proxy mode:

```bash
# 1. Log in (stores QCUT_AUTH_TOKEN in encrypted key store)
bun run pipeline login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"

# 2. Create a video (proxy mode auto-selects since no local API key)
#    Unset local provider key so it routes through proxy
env -u GMI_API_KEY bun run pipeline create-video -m gmi_veo31_lite_t2v -t "a cat walking"

# 3. Check credit balance
bun run pipeline check-keys   # shows stored QCUT_AUTH_TOKEN
curl -H "Authorization: Bearer $(bun run pipeline get-key --name QCUT_AUTH_TOKEN)" \
  https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance

# 4. Log out when done
bun run pipeline logout
```

### Other auth commands

```bash
# Sign up for a new account
bun run pipeline signup --email user@example.com --name "Jane Doe"

# Log in with password inline (for scripts/CI)
bun run pipeline login --email "$QCUT_TEST_EMAIL" --password "$QCUT_TEST_PASSWORD"
```

## CLI Usage (BYOK vs Proxy)

```bash
# BYOK mode (uses your own key, no credits)
GMI_API_KEY=your_key bun run pipeline create-video -m gmi_veo31_lite_t2v -t "a cat"

# Proxy mode (uses server key, deducts credits)
# Requires QCUT_AUTH_TOKEN set and no local provider key
env -u GMI_API_KEY bun run pipeline create-video -m gmi_veo31_lite_t2v -t "a cat"

# Check which keys are configured
bun run pipeline check-keys

# Check credit balance
curl -H "Authorization: Bearer $QCUT_AUTH_TOKEN" \
  https://qcut-license-server.zdhpeter.workers.dev/api/credits/balance
```

## Credit Plans

| Plan | Credits/Month | Devices |
|------|---------------|---------|
| Free | 50 | 1 |
| Pro | 500 | 3 |
| Team | 2000 | 10 |

Plan credits reset monthly. Plan credits are consumed first, then top-up credits.

## Admin: Managing Tester Credits

Requires `ADMIN_API_KEY` set on the Cloudflare Worker.

```bash
ADMIN_KEY="your-admin-key"
BASE="https://qcut-license-server.zdhpeter.workers.dev"

# Look up a user
curl -H "x-admin-key: $ADMIN_KEY" "$BASE/api/admin/user?email=tester@gmail.com"

# Grant credits
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"emails": ["a@gmail.com", "b@gmail.com"], "amount": 500}' \
  "$BASE/api/admin/grant-credits"

# Upgrade plan
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"email": "tester@gmail.com", "plan": "pro"}' \
  "$BASE/api/admin/upgrade-plan"
```

## Web Client Gap

The web client's `makeFalRequest()` in `apps/web/src/lib/ai-video/core/fal-request.ts` sends proxy requests **without** the `credits` field. The `credit-guard.ts` skips client-side deduction for authenticated users assuming the server handles it, but the web proxy path doesn't pass credit info.

**Current state:** Only the electron/CLI path (`callModelApi` → `callModelApiViaProxy`) sends credits. The web client proxy path is a known gap to fix.

## Key Source Files

| File | Role |
|------|------|
| `electron/native-pipeline/infra/credit-estimator.ts` | USD → credits conversion |
| `electron/native-pipeline/infra/api-caller.ts` | `callModelApi()` — selects BYOK vs proxy |
| `electron/native-pipeline/infra/proxy-client.ts` | `callModelApiViaProxy()` — sends credits to server |
| `electron/native-pipeline/infra/cost-calculator.ts` | USD cost estimation from registry |
| `packages/license-server/src/routes/ai-proxy.ts` | Server proxy — deducts credits, forwards request |
| `packages/license-server/src/routes/admin.ts` | Admin API — grant credits, upgrade plans |
| `packages/license-server/src/services/credit-service.ts` | Credit balance operations |
| `apps/web/src/lib/license/credit-guard.ts` | Web client credit enforcement |
| `apps/web/src/lib/credit-costs.ts` | Web-side credit cost table |
