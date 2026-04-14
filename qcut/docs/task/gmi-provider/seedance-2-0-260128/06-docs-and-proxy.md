# Subtask 6 — Docs, Credit Costs, and Proxy Allowlist

## Files

- `docs/task/gmi-video-cli-guide/04-gmi-models.md` — document the new model
- `apps/web/src/lib/credit-costs.ts` — optional per-second entry
- `packages/license-server/src/services/provider-keys.ts` — add endpoint to allowlist if the license-server proxies GMI video

## 1. User-facing docs

In `docs/task/gmi-video-cli-guide/04-gmi-models.md`, add a row to the
GMI models table for Seedance 2.0 260128 with:

- **Model ID:** `seedance-2-0-260128`
- **Registry key (T2V):** `gmi_seedance_2_0_260128_t2v`
- **Registry key (I2V):** `gmi_seedance_2_0_260128_i2v`
- **Price:** $0.052 / second
- **Duration:** 4–15s
- **Resolutions:** 480p, 720p, 1080p
- **Aspect ratios:** 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive
- **Features:** native audio, first/last frame, reference images/videos/audios, seed, web-search grounding

Add a short "when to pick this" paragraph — Seedance is the cheapest
native-audio option with long durations (15s) and reference-audio
support, so it's a good default for audio-driven storytelling.

## 2. Credit cost table

In `apps/web/src/lib/credit-costs.ts`, in the per-second section, add:

```ts
"seedance-2-0-260128": {
  credits: 0.52, // $0.052/s × 10 credits/$
  label: "Seedance 2.0 260128",
  unit: "per second",
},
```

(Match the existing naming convention — confirm by reading the file
around the per-second block.)

## 3. License server / proxy allowlist

Inspect `packages/license-server/src/services/provider-keys.ts` to
determine whether GMI video endpoints are routed through the proxy:

- If the file enumerates **individual model IDs**, add
  `seedance-2-0-260128`.
- If it whitelists the GMI base path `/api/v1/ie/requestqueue/apikey/requests`
  wholesale, no change is required — confirm by reading the allowlist.

If the proxy path uses a per-model credit estimator, ensure
`estimateProxyCredits("gmi_seedance_2_0_260128_t2v", { duration })`
returns the right amount. This happens automatically via
`estimateCost` once the registry entry from subtask 1 is in place.

## Acceptance

- Doc table shows the new model.
- `bun run test packages/license-server` passes (if allowlist changed).
- A test call with proxy mode on returns a valid video URL and
  deducts the expected credit count.

## Rollout note

After merging, surface in the changelog under **AI / Video** with a
one-liner: "Added GMI Seedance 2.0 260128 (T2V + I2V) at $0.052/s
with native audio and reference assets."
