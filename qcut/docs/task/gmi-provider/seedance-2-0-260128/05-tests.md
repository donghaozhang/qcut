# Subtask 5 — Unit Tests

Cover the payload shape, the registry entry, and the handler wiring.
Tests must not hit the network — stub the provider router / fetch.

## Files

- `apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts`
- `apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts`
- `electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts` (existing — add a Seedance fixture)
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts`

## Coverage matrix

| Test | Asserts |
|------|---------|
| T2V happy path | Submits `{ model: "seedance-2-0-260128", payload: { prompt, duration, resolution, ratio, generate_audio } }` with no stray keys |
| T2V field rename | `aspectRatio: "16:9"` serialises to payload `ratio: "16:9"` (not `aspect_ratio`) |
| T2V omits undefined | No `seed`, `watermark`, `web_search`, `reference_*` keys in payload when caller doesn't set them |
| T2V failure | `pollResult.status === "failed"` → generator throws with upstream error message |
| I2V requires first frame | Handler throws when `imageUrl` is empty |
| I2V payload | `firstFrame` / `lastFrame` map to `first_frame` / `last_frame` |
| Registry lookup | `ModelRegistry.get("gmi_seedance_2_0_260128_t2v").providerBackend === "gmi"` and endpoint matches |
| Handler routing | `model: "gmi_seedance_2_0_260128_t2v"` dispatches to the new handler (mirror the existing Omni routing test) |

## Example — T2V generator test

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSeedance260128TextVideo } from "../gmi-text-to-video";
import { providerRouter } from "../../core/provider-router";

vi.mock("../../core/provider-router", () => ({
  providerRouter: {
    submit: vi.fn(),
    poll: vi.fn(),
  },
}));

describe("generateSeedance260128TextVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits the documented payload shape", async () => {
    vi.mocked(providerRouter.submit).mockResolvedValue({
      requestId: "req-1",
      provider: "gmi",
    });
    vi.mocked(providerRouter.poll).mockResolvedValue({
      status: "succeeded",
      videoUrl: "https://example.com/out.mp4",
    });

    await generateSeedance260128TextVideo({
      prompt: "An astronaut on Mars",
      duration: 8,
      resolution: "720p",
      ratio: "16:9",
      generateAudio: true,
    });

    expect(providerRouter.submit).toHaveBeenCalledWith(
      "seedance-2-0-260128",
      {
        prompt: "An astronaut on Mars",
        duration: 8,
        resolution: "720p",
        ratio: "16:9",
        generate_audio: true,
      },
      "gmi"
    );
  });

  it("omits undefined optional fields", async () => {
    vi.mocked(providerRouter.submit).mockResolvedValue({
      requestId: "r",
      provider: "gmi",
    });
    vi.mocked(providerRouter.poll).mockResolvedValue({
      status: "succeeded",
      videoUrl: "x",
    });

    await generateSeedance260128TextVideo({ prompt: "p" });

    const payload = vi.mocked(providerRouter.submit).mock.calls[0][1];
    expect(payload).toEqual({ prompt: "p" });
    expect(payload).not.toHaveProperty("seed");
    expect(payload).not.toHaveProperty("watermark");
    expect(payload).not.toHaveProperty("reference_images");
  });
});
```

## Running

```sh
bun run test apps/web/src/lib/ai-video/generators/__tests__/gmi-text-to-video.test.ts
bun run test apps/web/src/lib/ai-video/generators/__tests__/gmi-image-to-video.test.ts
bun run test electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts
bun run test apps/web/src/components/editor/media-panel/views/ai/hooks/generation/__tests__/model-handlers-routing.test.ts
```

## Acceptance

- All new tests pass.
- `bun run test` (full suite) stays green.
- No network calls are made during tests (verify by running offline).
