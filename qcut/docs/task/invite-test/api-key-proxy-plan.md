# API Key Proxy — Implementation Plan

## Problem

Company API keys (FAL, Gemini, ElevenLabs, etc.) are stored on user machines.
Even with Electron safeStorage encryption, a determined user can extract them from
memory, network traffic, or the running process. One leaked key = entire company bill.

## Current Architecture

```
Electron App  ──(API key in header)──→  FAL / Gemini / etc.
     ↑
Keys stored locally:
  - Electron safeStorage (encrypted)
  - ~/.qcut/.env (plaintext)
  - process.env
```

## Target Architecture

```
Electron App  ──(session token)──→  License Server  ──(API key)──→  Provider
                                         ↑
                                   Keys in Wrangler
                                   secrets (never
                                   leaves server)
```

### Hybrid Strategy

| Request type | Route | Why |
|---|---|---|
| Small JSON (text gen, transcription, image gen) | Full proxy through license server | Low bandwidth, full control |
| Large binary upload (video to FAL CDN) | Server vends signed upload URL, client uploads direct | Avoids proxying GB-scale video through CF Worker |
| Async polling (FAL queue, GMI queue) | Client polls proxy, proxy polls provider | Keeps provider key server-side |

---

## Subtasks

### 1. AI Proxy Route on License Server

**Goal**: Add `/api/ai/proxy` route that accepts provider requests, injects the real API key, and forwards to the provider.

**Estimated time**: ~30 min

**Files to create/modify**:
- `packages/license-server/src/routes/ai-proxy.ts` — new route file
- `packages/license-server/src/services/provider-keys.ts` — new service: reads provider keys from env
- `packages/license-server/src/index.ts` — register the new route

**Design**:
```
POST /api/ai/proxy
Headers: Authorization: Bearer <session-token>
Body: {
  provider: "fal" | "gemini" | "openrouter" | "elevenlabs" | "gmi" | "runway",
  endpoint: "/fal-ai/kling-video/v2/master/text-to-video",
  method: "POST",
  body: { ...provider-specific payload }
}
```

**Server does**:
1. Authenticate user via session token (existing `authMiddleware`)
2. Check + deduct credits (atomic, before calling provider)
3. Look up provider API key from Wrangler secrets (`FAL_API_KEY`, `GEMINI_API_KEY`, etc.)
4. Build provider request with correct auth header format per provider
5. Forward request, return response to client

**Provider auth header mapping** (in `provider-keys.ts`):
| Provider | Env var | Header format |
|---|---|---|
| fal | `FAL_API_KEY` | `Authorization: Key {key}` |
| gemini | `GEMINI_API_KEY` | `x-goog-api-key: {key}` |
| openrouter | `OPENROUTER_API_KEY` | `Authorization: Bearer {key}` |
| elevenlabs | `ELEVENLABS_API_KEY` | `xi-api-key: {key}` |
| gmi | `GMI_API_KEY` | `Authorization: Bearer {key}` |
| runway | `RUNWAY_API_KEY` | `Authorization: Bearer {key}` + `X-Runway-Version: 2024-11-06` |

**Allowed endpoint prefixes** (whitelist to prevent SSRF):
- fal: `https://queue.fal.run/`, `https://fal.run/`
- gemini: `https://generativelanguage.googleapis.com/`
- openrouter: `https://openrouter.ai/api/`
- elevenlabs: `https://api.elevenlabs.io/`
- gmi: `https://console.gmicloud.ai/api/`
- runway: `https://api.runwayml.com/`

**Test file**: `packages/license-server/src/routes/ai-proxy.test.ts`
- Test auth rejection (no token → 401)
- Test unknown provider → 400
- Test endpoint whitelist rejection → 403
- Test credit deduction before forward
- Test correct header injection per provider

---

### 2. FAL Upload URL Vending Endpoint

**Goal**: Instead of giving the client the FAL key to upload files, the server initiates the upload and returns only the signed URL.

**Estimated time**: ~20 min

**Files to create/modify**:
- `packages/license-server/src/routes/ai-proxy.ts` — add `POST /api/ai/upload-url` endpoint

**Design**:
```
POST /api/ai/upload-url
Headers: Authorization: Bearer <session-token>
Body: {
  provider: "fal",
  fileName: "input.mp4",
  contentType: "video/mp4",
  fileSize: 52428800
}
Response: {
  uploadUrl: "https://storage.fal.ai/signed/...",  (client PUTs file here)
  fileUrl: "https://cdn.fal.ai/..."                 (use this in subsequent API calls)
}
```

**Server does**:
1. Authenticate user
2. Call `POST https://rest.alpha.fal.ai/storage/upload/initiate` with the real FAL key
3. Return `{ uploadUrl, fileUrl }` — client never sees the key

**Test file**: `packages/license-server/src/routes/ai-proxy.test.ts` (extend)
- Test upload URL generation with mocked FAL response
- Test auth required
- Test file size limits

---

### 3. Async Polling Proxy

**Goal**: Proxy FAL/GMI queue status polling so the client never needs the API key for polling.

**Estimated time**: ~20 min

**Files to create/modify**:
- `packages/license-server/src/routes/ai-proxy.ts` — add `GET /api/ai/status` endpoint

**Design**:
```
GET /api/ai/status?provider=fal&endpoint=/fal-ai/kling-video/...&requestId=abc123
Headers: Authorization: Bearer <session-token>
Response: { status: "COMPLETED", response: {...} }
```

**Server does**:
1. Authenticate user
2. Build status URL from provider + endpoint + requestId
3. Call provider with real API key
4. Return status/result to client

**Test file**: `packages/license-server/src/routes/ai-proxy.test.ts` (extend)
- Test status polling with mocked provider response
- Test request ID validation (no path traversal)

---

### 4. Electron Client — Switch to Proxy

**Goal**: Update the Electron API caller to route through the license server proxy instead of calling providers directly.

**Estimated time**: ~40 min

**Files to modify**:
- `electron/native-pipeline/infra/api-caller.ts` — main change: route through proxy
- `electron/native-pipeline/infra/key-manager.ts` — add proxy mode (skip local key lookup)
- `electron/main-ipc/fal-upload-handlers.ts` — use upload URL vending instead of direct FAL upload
- `electron/api-key-handler.ts` — add `getProxyConfig()` returning server URL + session token

**Design for api-caller.ts**:
```typescript
// Before (direct)
const headers = { Authorization: `Key ${apiKey}` };
const response = await fetch(`https://queue.fal.run/${endpoint}`, { headers, body });

// After (proxied)
const response = await fetch(`${LICENSE_SERVER}/api/ai/proxy`, {
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: JSON.stringify({
    provider: "fal",
    endpoint: `https://queue.fal.run/${endpoint}`,
    method: "POST",
    body: payload,
  }),
});
```

**Fallback**: If proxy is unreachable or user has their own key (BYOK), fall back to direct mode. This keeps the app functional for power users who prefer their own keys.

**Key change in key-manager.ts**:
```typescript
export type KeyMode = "proxy" | "local";

export function getKeyMode(): KeyMode {
  // If user has a session token and no local key override → proxy
  // If user set their own key in settings → local (BYOK)
}
```

**Test file**: `electron/native-pipeline/infra/__tests__/api-caller.test.ts`
- Test proxy mode routes through license server
- Test BYOK fallback to direct mode
- Test proxy failure falls back to local key

---

### 5. Web Client — Switch to Proxy

**Goal**: Update browser-side AI clients to use the proxy.

**Estimated time**: ~30 min

**Files to modify**:
- `apps/web/src/lib/ai-video/core/fal-request.ts` — route through proxy
- `apps/web/src/lib/ai-clients/fal-ai-client.ts` — proxy mode
- `apps/web/src/lib/gemini/gemini-utils.ts` — proxy mode
- `apps/web/src/lib/license/credit-guard.ts` — credit deduction now happens server-side, remove client-side deduction to avoid double-charging

**Key change in credit-guard.ts**:
```typescript
// Before: client deducts credits, then calls provider
// After: proxy deducts credits server-side, client just sends request
// Remove enforceCreditRequirement() calls from AI request flows
// Keep it only for BYOK mode where calls go direct
```

**Test considerations**:
- Existing credit-guard tests may need updating
- Verify no double-deduction (proxy deducts + client deducts)

---

### 6. Wrangler Secrets Setup

**Goal**: Store all provider API keys as Cloudflare Worker secrets.

**Estimated time**: ~5 min

**Files to modify**:
- `packages/license-server/wrangler.toml` — document expected secrets (as comments)
- `packages/license-server/.env.example` — add all provider key vars

**Commands to run**:
```bash
cd packages/license-server
wrangler secret put FAL_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put GMI_API_KEY
wrangler secret put RUNWAY_API_KEY
wrangler secret put FREESOUND_API_KEY
wrangler secret put ADMIN_API_KEY
```

---

### 7. Remove Local Key Storage for Company Keys

**Goal**: Stop shipping/storing company keys on user machines. Keep BYOK path for power users.

**Estimated time**: ~20 min

**Files to modify**:
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` — change UI: show "Connected via QCut account" when proxied, only show key input fields for BYOK users
- `electron/api-key-handler.ts` — remove auto-sync of company keys from AICP/CLI stores; keep user-provided keys
- `apps/web/.env.example` — remove `VITE_FAL_API_KEY` etc. (no longer needed in client builds)

---

### 8. Rate Limiting & Abuse Prevention

**Goal**: Prevent proxy abuse (one user flooding the API).

**Estimated time**: ~20 min

**Files to create/modify**:
- `packages/license-server/src/middleware/rate-limit.ts` — new middleware
- `packages/license-server/src/routes/ai-proxy.ts` — apply rate limit middleware

**Design**:
- Per-user rate limit: 60 requests/minute (configurable via env var)
- Use CF Worker's built-in `cf.cacheApi` or a simple in-memory counter with TTL
- Return `429 Too Many Requests` with `Retry-After` header
- Credit system already limits spend, but rate limiting prevents rapid-fire abuse

**Test file**: `packages/license-server/src/middleware/rate-limit.test.ts`

---

## Implementation Order

```
Phase 1 — Server (no client changes, no user impact):
  1. Provider keys service
  2. AI proxy route
  3. Upload URL vending
  4. Async polling proxy
  5. Wrangler secrets setup
  6. Deploy & test with curl

Phase 2 — Client migration (feature-flagged):
  4. Electron client switch
  5. Web client switch
  7. Remove local key storage

Phase 3 — Hardening:
  8. Rate limiting
  Monitoring & alerting on proxy usage
```

## Environment Variables (New)

| Variable | Where | Purpose |
|---|---|---|
| `FAL_API_KEY` | Wrangler secret | FAL provider key |
| `GEMINI_API_KEY` | Wrangler secret | Google Gemini key |
| `OPENROUTER_API_KEY` | Wrangler secret | OpenRouter key |
| `ELEVENLABS_API_KEY` | Wrangler secret | ElevenLabs key |
| `GMI_API_KEY` | Wrangler secret | GMI Cloud key |
| `RUNWAY_API_KEY` | Wrangler secret | Runway key |
| `FREESOUND_API_KEY` | Wrangler secret | Freesound key |
| `ADMIN_API_KEY` | Wrangler secret | Admin API auth |
| `AI_PROXY_RATE_LIMIT` | wrangler.toml var | Requests/min per user (default: 60) |

## Security Considerations

- **SSRF prevention**: Whitelist allowed endpoint prefixes per provider. Reject any URL not matching.
- **Request size limits**: Cap proxy request body at 10MB (JSON payloads only; binary goes through signed URLs).
- **No key leakage in errors**: Never include the provider API key in error messages returned to client.
- **Audit log**: Log provider, endpoint, userId, creditsCost per proxy request for debugging.
- **BYOK escape hatch**: Users who prefer their own keys can still enter them in settings and bypass the proxy entirely.
