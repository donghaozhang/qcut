# Subtask 1 — Upload helper (local file → HTTPS URL)

> **Status:** ✅ Landed. 12 tests green. Used by `video-handler.ts`
> via dep injection. Live smoke showed the route is reachable but
> returns 503 until the worker has `FAL_API_KEY` configured — the
> helper surfaces that cleanly via `UploadError.stage = "vend-url"`.

Seedance's `reference_images` field needs fetchable URLs. Stage 2
portraits land on local disk (`portraits/<name>/front.png`). This
subtask creates a minimal helper that uploads a local file and
returns the HTTPS URL to pass into the payload.

## Files

### Add

- `electron/native-pipeline/output/upload-helper.ts` — new module.
  ~120 lines. Pure function surface so tests can inject a fetch
  stub.

### Test

- `electron/native-pipeline/output/__tests__/upload-helper.test.ts`
  — new. 8–10 tests covering success, retry, auth header presence,
  bad status handling, mime-type inference.

## Design

Exported surface (subject to discovery; keep small):

```ts
export interface UploadOptions {
	filePath: string;
	fetchImpl?: typeof fetch;       // injectable for tests
	authToken?: string;             // defaults to QCUT_AUTH_TOKEN
	signal?: AbortSignal;
}

export interface UploadResult {
	url: string;
	contentType: string;
	bytes: number;
	expiresAt?: string;
}

export async function uploadFileForReference(
	opts: UploadOptions
): Promise<UploadResult>;
```

## Where the bytes land

Two candidate backends, listed in preference order. Subtask 1 picks
one during implementation based on what's reachable from the CLI
runtime without bundling renderer-only code.

1. **License-server proxy bucket** (preferred). The license server
   (`qcut-license-server.zdhpeter.workers.dev`) already authenticates
   via `QCUT_AUTH_TOKEN`. Add or reuse a `POST
   /api/uploads/reference-image` endpoint that streams the body into
   a short-TTL R2 bucket and returns the public URL. Same auth +
   logging path as the rest of the CLI.

2. **fal-storage**. `apps/web/src/lib/fal/fal-storage.ts` wraps
   `@fal-ai/client` `fal.storage.upload()`. If we can call it from
   a Node context without importing React, it's the zero-infra
   option. Otherwise skip.

Implementation note: if the proxy endpoint doesn't exist yet, the
subtask includes the one-line Hono route to add it on the worker
side. Keep the worker change in scope of this subtask so the
feature ships atomically — but behind an env gate
(`QCUT_UPLOAD_ENDPOINT`) so it fails loudly rather than guessing a
URL.

## Failure modes the helper must handle

- **File not found / unreadable** — fail fast with a clear error
  before any network call.
- **Auth token missing** — fail with instructions ("run `qcut
  system login`").
- **Upload 5xx** — retry once with exponential backoff (500ms /
  2s), then fail.
- **Upload 413** (file too large) — surface size + limit in error.
- **Abort signal** — bail out cleanly between retries.

## Tests

`upload-helper.test.ts` cases:

1. Returns URL on 200 with JSON `{ url, content_type, bytes }`.
2. Passes `Authorization: Bearer <token>` when auth token present.
3. Reads `QCUT_AUTH_TOKEN` from `process.env` when `authToken` not
   explicitly passed.
4. Infers `image/png` from `.png` extension when server doesn't set
   a mime type back.
5. Retries once on 502; second attempt succeeds.
6. Gives up after two 502s with a descriptive error.
7. Fails before network when file path doesn't exist.
8. Fails before network when file is empty (0 bytes).
9. Propagates abort signal — cancels the in-flight fetch.
10. Bubbles 413 body content in the error message.

Mock the fetch impl directly (`fetchImpl` param) so no real network
happens. Use `vi.fn()` and assert argument shape for each call.

## Backward compatibility

New module — nothing to preserve. Don't touch the renderer-side
`fal-storage.ts`; even if we pick option 2, call it via an injectable
interface rather than importing its React-dependent setup.

## Definition of done

- [ ] `upload-helper.ts` lands with the surface above.
- [ ] License-server `/api/uploads/reference-image` route deployed
  (if option 1 chosen) or fal-storage path validated (if option 2).
- [ ] 10/10 tests pass: `bunx vitest run
  electron/native-pipeline/output/__tests__/upload-helper.test.ts`.
- [ ] Manual smoke: upload one portrait PNG, curl the returned URL,
  verify 200 + Content-Type + byte length matches source.
