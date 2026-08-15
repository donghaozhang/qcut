# License Server URL in `.env.local` — the sticker/sound lab trap

## Symptom

贴纸实验室 (Sticker Lab) shows "N 个参照素材包未能载入" and every tile fails
with "实验素材无法载入 / 重试". 音效实验室 (Sound Effects Lab) and any other
license-server-backed feature break the same way, usually silently. Meanwhile
manifests served from the app itself (e.g. `/sticker-lab/*.json`) still load,
so the catalog *lists* items but no thumbnail or asset ever arrives.

This has bitten local builds three times (2026-07-31, 2026-08-01, 2026-08-15).

## Root cause

`apps/web/.env.local` contained:

```bash
VITE_LICENSE_SERVER_URL=http://localhost:8787
```

left over from local wrangler development of `packages/license-server`.
`VITE_*` vars are **compile-time**: Vite bakes the URL into the renderer bundle
at build time (including builds run implicitly by `bun scripts/release.ts`), so
the app sends every license-server request — private sticker manifests,
thumbnails, full assets, sound-lab audio — to a localhost port that usually has
nothing listening.

Two aggravating factors:

1. **The localhost override cannot work with the current renderer CSP.** The
   `Content-Security-Policy` meta tag in `apps/web/index.html` only allows the
   production worker origin (`https://qcut-license-server.zdhpeter.workers.dev`)
   in `connect-src`; the only localhost entry is the static-server port 8080.
   The header CSP in `electron/main.ts` *does* dynamically allow a configured
   localhost origin (`electron/license-server-csp.ts`), but when both a meta CSP
   and a header CSP are present the effective policy is their **intersection**,
   so the meta tag always blocks the connection. A blocked fetch surfaces only
   as a generic "Failed to fetch".

2. **Turbo's build cache does not hash `.env.local`.** After editing the file,
   a plain `bun run build` can report `cache hit, replaying logs — FULL TURBO`
   and replay the stale bundle with the old URL still baked in. Rebuild with
   `bunx turbo run build --force`.

## Fix / prevention

- Leave `VITE_LICENSE_SERVER_URL` **unset** in `apps/web/.env.local`. The code
  falls back to the production worker
  (`apps/web/src/lib/ai-video/core/license-relay.ts`), which is already in both
  CSP allowlists.
- If you genuinely need to develop against a local worker, you must *also* add
  the localhost origin to the `index.html` meta CSP `connect-src` — and revert
  both before building anything for real use.
- After changing `.env.local`, always force-rebuild:

```bash
bunx turbo run build --force
```

- Verify the baked URL before trusting a local build (must print nothing):

```bash
grep -l "localhost:8787" apps/web/dist/assets/*.js
```
