import { describe, expect, it, vi } from "vitest";
import { executePersonCutoutInferencePipeline } from "../jianying-person-cutout/inference-pipeline.js";

const exactRuntime = {
  modelRoute: "video-object" as const,
  provider: "bach-exact",
};
const directRuntime = {
  modelRoute: "video-object" as const,
  provider: "coreml-direct",
};
const portraitRuntime = {
  modelRoute: "portrait-gru" as const,
  provider: "gru",
};

describe("person cutout inference finalization", () => {
  it("finalizes only after selecting a successful provider", async () => {
    const executeInference = vi
      .fn()
      .mockRejectedValueOnce(new Error("exact unavailable"))
      .mockResolvedValueOnce("direct-alpha");
    const finalize = vi.fn().mockResolvedValue("transparent-video");

    await expect(
      executePersonCutoutInferencePipeline({
        executeInference,
        fallbackRuntimes: [directRuntime],
        finalize,
        portraitRuntime,
        selectedRuntime: exactRuntime,
      }),
    ).resolves.toMatchObject({
      finalResult: "transparent-video",
      inferenceAttempt: {
        didFallback: true,
        result: "direct-alpha",
        runtime: directRuntime,
      },
    });
    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith({
      inferenceResult: "direct-alpha",
      runtime: directRuntime,
    });
  });

  it("does not retry another provider when transparent encoding fails", async () => {
    const encoderFailure = new Error("VP9 encoder failed");
    const executeInference = vi.fn().mockResolvedValue("exact-alpha");
    const finalize = vi.fn().mockRejectedValue(encoderFailure);
    const onFallback = vi.fn();

    await expect(
      executePersonCutoutInferencePipeline({
        executeInference,
        fallbackRuntimes: [directRuntime],
        finalize,
        onFallback,
        portraitRuntime,
        selectedRuntime: exactRuntime,
      }),
    ).rejects.toBe(encoderFailure);
    expect(executeInference).toHaveBeenCalledOnce();
    expect(executeInference).toHaveBeenCalledWith(exactRuntime);
    expect(finalize).toHaveBeenCalledOnce();
    expect(onFallback).not.toHaveBeenCalled();
  });
});
