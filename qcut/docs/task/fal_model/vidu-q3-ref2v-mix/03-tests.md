# Subtask 3 — Unit Tests

Lock down the payload shape so future refactors of
`executeImageToVideo` can't silently regress to the wrong field name.

## Files

- **New**: `electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts`
- **Optional follow-up**: extend
  `electron/native-pipeline/cli/__tests__/handler-generate.test.ts` (if it
  exists) to assert `vidu_q3_ref2v_mix` appears in the `--model`
  enum. Skip if the file doesn't exist; the type-check + registry
  lookup already gates this.

## Coverage matrix

| Test | Asserts |
|------|---------|
| Payload field name | `executeImageToVideo` produces `payload.reference_image_urls = [<url>]` for `vidu_q3_ref2v_mix` (NOT `image_url`, NOT `image_urls`, NOT `reference_images`) |
| No duration coercion | When CLI sends `duration: 5` (number), payload still has `duration: 5` (number) — different from FAL Seedance which stringifies |
| Audio field name | If the registry default `audio: true` flows through, payload has `audio: true` not `generate_audio: true` |
| Endpoint preservation | `callModelApi` is invoked with `endpoint: "fal-ai/vidu/q3/reference-to-video/mix"` |
| Other models unaffected | A spot-check on `gmi_seedance_2_0_260128_ref2v` still produces `reference_images` (regression guard) |

## Example test skeleton

```ts
import { describe, it, expect, vi } from "vitest";
import { executeStep } from "../step-executors";
import { ModelRegistry } from "../../infra/registry";

vi.mock("../../infra/api-caller", () => ({
  callModelApi: vi.fn().mockResolvedValue({
    success: true,
    outputUrl: "https://video.mp4",
    duration: 1,
  }),
  downloadOutput: vi.fn(),
}));

import { callModelApi } from "../../infra/api-caller";
import "../../registry-data/image-to-video"; // ensures Vidu entry is registered

describe("executeImageToVideo — vidu_q3_ref2v_mix", () => {
  it("maps --image-url to reference_image_urls (array, length 1)", async () => {
    const model = ModelRegistry.get("vidu_q3_ref2v_mix");
    await executeStep(
      model,
      { text: "p", imageUrl: "https://example.com/ref.png" },
      { duration: 4 },
      {}
    );
    const call = vi.mocked(callModelApi).mock.calls[0][0];
    expect(call.endpoint).toBe("fal-ai/vidu/q3/reference-to-video/mix");
    expect(call.payload.reference_image_urls).toEqual(["https://example.com/ref.png"]);
    expect(call.payload).not.toHaveProperty("image_url");
    expect(call.payload).not.toHaveProperty("image_urls");
    expect(call.payload).not.toHaveProperty("reference_images");
    expect(typeof call.payload.duration).toBe("number"); // NOT string
  });
});
```

`executeStep(model, input, params, options)` is the current public
surface — see `electron/native-pipeline/execution/step-executors.ts`.
Import the registry-data entry once per suite so the Vidu key is
populated before `ModelRegistry.get` runs.

## Running

```bash
bunx vitest run electron/native-pipeline/execution/__tests__/step-executors-vidu.test.ts
```

## Acceptance

- New test file passes.
- `bunx vitest run electron/native-pipeline` (full electron suite)
  stays green — no regressions.
- `bunx vitest run electron/native-pipeline/cli/vimax-cli-handlers/__tests__/`
  still passes (Seedance branches not affected).
