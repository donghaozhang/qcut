# Subtask 2 — CLI Enum + Step-Executor Field Mapping

Wire `gen video -m vidu_q3_ref2v_mix --image-url <url>` end-to-end.
Two tiny edits.

## Files

- `electron/native-pipeline/cli/command-registry.ts` — `create-video`
  enum addition
- `electron/native-pipeline/execution/step-executors.ts` — branch in
  `executeImageToVideo` to write the right field name

## CLI enum (`command-registry.ts`)

Find the `create-video` entry's `--model` flag (around the `seedance`
keys). Append:

```ts
enum: [
  ...,
  "seedance_2_0_ref2v",
  "vidu_q3_ref2v_mix",          // ← new
  "luma_ray2",
  ...
],
```

The `gen-runner` (`cli-runner/handler-generate.ts`) validates the
model exists in `ModelRegistry`, then dispatches via category. Since
the new entry is `["image_to_video"]`, it routes through
`executeImageToVideo` automatically.

## Executor branch (`execution/step-executors.ts`)

Find the existing Seedance branches in `executeImageToVideo` (the
ones that special-case `gmi_seedance_2_0_260128_ref2v`,
`gmi_seedance_2_0_260128_i2v`, `seedance_2_0_ref2v`). Add a Vidu
branch alongside:

```ts
if (input.imageUrl) {
  // Seedance branches kept as-is...
  if (model.key === "gmi_seedance_2_0_260128_ref2v") {
    payload.reference_images = [input.imageUrl];
  } else if (model.key === "gmi_seedance_2_0_260128_i2v") {
    payload.first_frame = input.imageUrl;
  } else if (model.key === "seedance_2_0_ref2v") {
    payload.image_urls = [input.imageUrl];
    if (typeof payload.duration === "number") {
      payload.duration = String(payload.duration);
    }
  } else if (model.key === "vidu_q3_ref2v_mix") {
    // Vidu Q3 mix uses `reference_image_urls` (plural list, 1-4 items).
    // The CLI's `--image-url` only supports a single URL; pass it
    // wrapped in a length-1 array. Multi-image support is a follow-up.
    payload.reference_image_urls = [input.imageUrl];
  } else {
    payload.image_url = input.imageUrl;
  }
}
```

No duration coercion needed — Vidu accepts integer (verified from
spec). No `audio` field renaming either; the registry's
`default_params` already uses `audio: true`, and `executeImageToVideo`
spreads default params into the payload (or relies on FAL's
server-side default if we don't pass it explicitly).

## Why a per-model branch instead of an abstraction

Three FAL-family ref2v variants now use three different field names:

| Model | Field name |
|---|---|
| GMI Seedance 260128 ref2v | `reference_images` |
| FAL Seedance 2.0 ref2v | `image_urls` |
| Vidu Q3 ref2v mix | `reference_image_urls` |

Three is too few to abstract and the names won't converge — each
provider picked its own. A flat per-key branch is the honest
encoding; refactor only when we hit five+ entries with a clear
pattern.

## Validation

- `bunx tsc -p apps/web/tsconfig.json --noEmit` passes.
- `bun run pipeline -- gen video --help` shows `vidu_q3_ref2v_mix`
  in the `--model` enum.
- Run with `--quiet` and a placeholder URL; expect FAL to either
  accept the request and start processing or return a recognizable
  domain-level error (NOT a 422 `field validation` error — that
  would mean we sent the wrong field name).

## Acceptance

- `bun run pipeline -- gen video -m vidu_q3_ref2v_mix -t "test"
  --image-url https://example.com/x.png` reaches the FAL submit
  step (gets `IN_QUEUE` or fails for content reasons, not for
  schema reasons).
- No regressions: existing `gen video -m gmi_seedance_2_0_260128_ref2v`
  and `gen video -m seedance_2_0_ref2v` still work.
