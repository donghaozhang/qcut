# Plan — Route vimax video generation through the model registry

Fix `qcut flow script2video --video-model gmi_…` so it actually calls
GMI. Right now the pipeline's `VideoGeneratorAdapter` has a hardcoded
FAL-only `MODEL_MAP`, silently falls back to FAL Kling v1 for any
unknown model, and always calls `callModelApi({ provider: "fal" })` —
so GMI video keys never route correctly.

See the diagnosis in this session / the earlier replies for the full
trace. The contrast with the flat `gen video -m gmi_veo31_lite_t2v`
command is that `gen video` goes through `callModelApi` directly with
registry-backed routing, while `flow script2video` walks through the
vimax `CameraImageGenerator → VideoGeneratorAdapter` layer that
bypasses the registry.

## Goal

`flow script2video --script … --video-model gmi_kling_v3_i2v` routes
to GMI exactly the way `gen video -m gmi_kling_v3_i2v` does today. No
behavioural change for FAL callers. No new CLI flags.

## Non-goals

- No changes to `gen video`, `create-video`, or `callModelApi` — those
  already work.
- No fix to `image-adapter.ts`'s reference-image path (line ~335) right
  now. The default image-adapter path already has a secondary
  `GMI_MODEL_MAP` that covers the common GMI image models, so the
  storyboard step works for the default `gmi_gemini_3_pro_image`. The
  reference-image path is a separate, lower-priority bug — tracked as
  follow-up work at the bottom.
- No changes to `novel2movie` or `idea2video` pipelines beyond what the
  shared adapter fix gives them for free.

## Root cause

`electron/native-pipeline/vimax/adapters/video-adapter.ts`:

| Line | Problem |
|---|---|
| 45–53 | `MODEL_MAP` hardcoded — 7 FAL entries, 0 GMI entries |
| 56–64 | `COST_PER_SECOND` hardcoded — ditto |
| 83 | `initialize()` probes only `FAL_KEY` |
| 125 | `endpoint = MODEL_MAP[model] ?? MODEL_MAP.kling` — silent fallback |
| 136 | Literal `provider: "fal"` |

Meanwhile the `ModelRegistry` already has everything we need:

- 4 GMI image-to-video entries (`gmi_kling_v3_i2v`, `gmi_kling_v3_omni_i2v`, `gmi_skyreels_v4_i2v`, `gmi_veo31_lite_i2v`)
- All FAL entries
- `providerBackend: "fal" | "gmi"` field
- `endpoint` field
- `pricing` map for per-call cost

And `callModelApi` already supports both providers (`electron/native-pipeline/infra/api-caller.ts:229,260,308,484,573,688`).

## Design

Replace the adapter's hardcoded routing with registry lookups. The
adapter becomes a thin shim over `callModelApi`.

```ts
// Before
const endpoint = MODEL_MAP[model] ?? MODEL_MAP.kling;
const result = await callModelApi({ endpoint, payload, provider: "fal" });

// After
const spec = resolveModelSpec(model);            // ModelRegistry lookup + legacy alias
assertApiKeyForProvider(spec.providerBackend);   // fail fast on missing FAL_KEY/GMI_API_KEY
const result = await callModelApi({
    endpoint: spec.endpoint,
    payload,
    provider: spec.providerBackend,               // "fal" | "gmi"
    modelKey: model,
});
```

### `resolveModelSpec(model)`

```ts
function resolveModelSpec(model: string): {
    endpoint: string;
    providerBackend: "fal" | "gmi";
    costPerSecond?: number;
} {
    // Legacy aliases — callers that pass "kling" expect Kling v2.1 today.
    const canonical = LEGACY_ALIASES[model] ?? model;
    if (!ModelRegistry.has(canonical)) {
        throw new Error(
            `Unknown video model "${model}". ` +
            `Run \`qcut system models --category image_to_video\` to list supported keys.`
        );
    }
    const def = ModelRegistry.get(canonical);
    return {
        endpoint: def.endpoint,
        providerBackend: def.providerBackend ?? "fal",
        costPerSecond: extractCostPerSecond(def.pricing),
    };
}

const LEGACY_ALIASES: Record<string, string> = {
    kling: "kling_2_1",       // matches old MODEL_MAP entry
    // veo3, veo3_fast, hailuo, grok_imagine, kling_2_1, kling_2_6_pro
    // are already registered under those exact keys — no alias needed.
};
```

### `assertApiKeyForProvider`

Today's `initialize()` prints a warning for missing `FAL_KEY` and
silently switches to mock mode. That's useful for tests but hides real
configuration errors. Keep the mock fallback, but key it per-provider:

```ts
private _hasFalKey = false;
private _hasGmiKey = false;

async initialize(): Promise<boolean> {
    this._hasFalKey = Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY);
    this._hasGmiKey = Boolean(process.env.GMI_API_KEY);
    return true;
}

private _hasKeyFor(provider: "fal" | "gmi"): boolean {
    return provider === "gmi" ? this._hasGmiKey : this._hasFalKey;
}
```

Then in `generate()`:

```ts
if (!this._hasKeyFor(spec.providerBackend)) {
    console.warn(
        `[vimax.video] ${spec.providerBackend.toUpperCase()}_KEY not set — using mock mode for ${model}`
    );
    return this._mockGenerate(...);
}
```

(Note: `callModelApi` itself falls back to proxy mode when no local key
is set, but the adapter has always gated on key presence directly.
Preserving that path keeps behaviour identical for existing FAL callers
while extending the same treatment to GMI.)

### Cost lookup

`pricing` in the registry is an object per model (`{ no_sound, with_sound }`
for Kling, `{ std, pro, std_sound, pro_sound }` for Omni, single number
for simpler models). Extracting a "cost per second" is messy — just
pick the cheapest available mode as a default. For the cost field
returned to callers that's good enough; the authoritative cost is
already computed server-side for proxy mode via
`credit-estimator.ts`.

```ts
function extractCostPerSecond(pricing: unknown): number | undefined {
    if (typeof pricing === "number") return pricing;
    if (pricing && typeof pricing === "object") {
        const values = Object.values(pricing).filter(
            (v): v is number => typeof v === "number"
        );
        if (values.length) return Math.min(...values);
    }
    return undefined;
}
```

## Files changed

| File | Change |
|---|---|
| `electron/native-pipeline/vimax/adapters/video-adapter.ts` | Replace `MODEL_MAP` / `COST_PER_SECOND` / FAL-only key probe with registry lookup. ~50 line delta. |
| `electron/__tests__/vimax-video-adapter.test.ts` (new) | Unit tests — FAL model routes to FAL, GMI model routes to GMI, unknown model throws, legacy `kling` alias resolves, mock mode when key missing. |
| `docs/task/gmi-provider/vimax-video-adapter-gmi-fix.md` (this file) | Plan + status. |

Intentionally not touched:

- `camera-generator.ts` — it just forwards `video_model`; no change needed.
- `script2video.ts` — default `video_model: "kling"` stays; the new legacy alias resolves it to `kling_2_1`.
- `CLI` layer — `--video-model` is already wired through.

## Acceptance criteria

1. `qcut flow script2video --script script.json --video-model gmi_kling_v3_i2v`
   with `GMI_API_KEY` set makes one HTTP call per shot to the GMI
   endpoint (`kling-v3-image-to-video`) via `callModelApi` with
   `provider: "gmi"`.
2. Same command with `--video-model kling_2_6_pro` still routes to FAL
   exactly as before.
3. `--video-model totally_fake_key` fails fast with a
   `"Unknown video model"` error — no silent FAL fallback.
4. All existing tests in `electron/__tests__/vimax-pipelines.test.ts`
   still pass.
5. New unit tests cover the four routing cases (FAL, GMI, unknown,
   legacy alias).

## Risks

| Risk | Mitigation |
|---|---|
| Callers silently relying on the `?? MODEL_MAP.kling` fallback now get a thrown error | Accept — it's a bug-fix, not a breaking change. The one-line fallback hid misconfiguration. Callers get a clear error telling them what to run (`system models --category image_to_video`). |
| Test matrix covers FAL paths only — GMI path not exercised in CI | New unit tests inject mocks. Real end-to-end GMI verification is out of scope (needs real API key + credits). |
| Legacy key `"kling"` not in registry → alias required | One-line `LEGACY_ALIASES` map, documented. `veo3`, `hailuo`, etc. are already in the registry under those exact keys. |

## Follow-up (not in this PR)

- `image-adapter.ts:335` — reference-image path still hardcodes
  `provider: "fal"`. Low priority because GMI image-to-image with
  reference isn't in the registry yet, but file the same registry-lookup
  refactor for it.
- Both adapters should lose their hardcoded `COST_PER_*` maps in favour
  of the registry's `pricing` field. The video adapter does it as part
  of this change; the image adapter's `COST_MAP` stays as-is for now to
  keep the diff focused.

## Verification command (manual, once a GMI key is available)

```bash
# Precondition: GMI_API_KEY set
qcut flow script2video \
  --script output/gemini3-test/script.json \
  --portraits apps/web/test-output/registry.json \
  --video-model gmi_kling_v3_i2v \
  --no-references \
  --output-dir /tmp/script2video-gmi-test \
  --verbose

# Expected: JSONL events on stderr include `provider: "gmi"` per shot,
# output .mp4 files appear under /tmp/script2video-gmi-test/
# Cost field reflects GMI pricing (0.168 / 0.252 USD-per-5s from registry)
```
