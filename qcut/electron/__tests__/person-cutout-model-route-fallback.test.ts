import { describe, expect, it, vi } from "vitest";
import { executePersonCutoutRouteWithFallback } from "../jianying-person-cutout/model-route-fallback.js";
import {
  VIDEO_OBJECT_ALPHA_QUALITY_FAILURE,
  VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE,
  VideoObjectRuntimeCircuitBreaker,
} from "../jianying-person-cutout/video-object-circuit-breaker.js";
import {
  JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
  VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
} from "../jianying-person-cutout/pipeline-descriptor.js";

const portraitRuntime = { modelRoute: "portrait-gru" as const };
const videoObjectRuntime = {
  modelRoute: "video-object" as const,
  provider: "bach",
};
const coreMLRuntime = {
  modelRoute: "video-object" as const,
  provider: "coreml",
};
const hostRuntime = {
  modelRoute: "video-object" as const,
  provider: "legacy-host",
};

describe("person cutout model-route fallback", () => {
  it("keeps a successful selected route", async () => {
    const execute = vi.fn().mockResolvedValue("object-alpha");
    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).resolves.toEqual({
      didFallback: false,
      result: "object-alpha",
      runtime: videoObjectRuntime,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("retries an uncalibrated advanced route with portrait GRU", async () => {
    const failure = new Error("host Metal context is unavailable");
    const execute = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce("portrait-alpha");
    const onFallback = vi.fn();
    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        onFallback,
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).resolves.toEqual({
      didFallback: true,
      result: "portrait-alpha",
      runtime: portraitRuntime,
    });
    expect(execute).toHaveBeenNthCalledWith(1, videoObjectRuntime);
    expect(execute).toHaveBeenNthCalledWith(2, portraitRuntime);
    expect(onFallback).toHaveBeenCalledWith({
      error: failure,
      failedRuntime: videoObjectRuntime,
      nextRuntime: portraitRuntime,
    });
  });

  it("falls back in Bach, direct CoreML, legacy host, GRU order", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("Bach unavailable"))
      .mockRejectedValueOnce(new Error("CoreML unavailable"))
      .mockRejectedValueOnce(new Error("host unavailable"))
      .mockResolvedValueOnce("gru-alpha");
    const onFallback = vi.fn();

    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        fallbackRuntimes: [coreMLRuntime, hostRuntime],
        onFallback,
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).resolves.toEqual({
      didFallback: true,
      result: "gru-alpha",
      runtime: portraitRuntime,
    });
    expect(execute.mock.calls.map(([runtime]) => runtime)).toEqual([
      videoObjectRuntime,
      coreMLRuntime,
      hostRuntime,
      portraitRuntime,
    ]);
    expect(onFallback).toHaveBeenCalledTimes(3);
  });

  it("stops at the first successful fallback provider", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("Bach unavailable"))
      .mockResolvedValueOnce("coreml-alpha");

    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        fallbackRuntimes: [coreMLRuntime, hostRuntime],
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).resolves.toEqual({
      didFallback: true,
      result: "coreml-alpha",
      runtime: coreMLRuntime,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("reports direct CoreML after exact Bach fails and opens only the failed capability", async () => {
    const exact = {
      capabilitySha256: "exact-capability",
      modelRoute: "video-object" as const,
      pipelineDescriptor: JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
    };
    const direct = {
      capabilitySha256: "coreml-capability",
      modelRoute: "video-object" as const,
      pipelineDescriptor: VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
    };
    const gru = {
      capabilitySha256: "gru-capability",
      modelRoute: "portrait-gru" as const,
      pipelineDescriptor: undefined,
    };
    const circuitBreaker = new VideoObjectRuntimeCircuitBreaker();
    const exactFailure = new Error(
      `${VIDEO_OBJECT_ALPHA_QUALITY_FAILURE}: ${VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE}`,
    );
    const execute = vi
      .fn()
      .mockRejectedValueOnce(exactFailure)
      .mockResolvedValueOnce("coreml-alpha");

    const attempt = await executePersonCutoutRouteWithFallback({
      execute,
      fallbackRuntimes: [direct],
      onFallback: ({ error, failedRuntime }) => {
        circuitBreaker.reject({
          capabilitySha256: failedRuntime.capabilitySha256,
          error,
        });
      },
      portraitRuntime: gru,
      selectedRuntime: exact,
    });

    expect(attempt).toMatchObject({
      didFallback: true,
      result: "coreml-alpha",
      runtime: {
        pipelineDescriptor: VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
      },
    });
    expect(
      circuitBreaker.isOpen({ capabilitySha256: "exact-capability" }),
    ).toBe(true);
    expect(
      circuitBreaker.isOpen({ capabilitySha256: "coreml-capability" }),
    ).toBe(false);
  });

  it("fails closed when an object candidate rejects its Alpha output", async () => {
    const badAlpha = new Error(
      "video-object graph returned an empty alpha mask",
    );
    const execute = vi
      .fn()
      .mockRejectedValueOnce(badAlpha)
      .mockResolvedValueOnce("portrait-alpha");

    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).resolves.toMatchObject({
      didFallback: true,
      result: "portrait-alpha",
      runtime: portraitRuntime,
    });
  });

  it("does not hide a portrait GRU failure", async () => {
    const failure = new Error("GRU failed");
    const execute = vi.fn().mockRejectedValue(failure);
    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        portraitRuntime,
        selectedRuntime: portraitRuntime,
      }),
    ).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not retry cancellation", async () => {
    const cancelled = new Error("cancelled");
    cancelled.name = "AbortError";
    const execute = vi.fn().mockRejectedValue(cancelled);
    await expect(
      executePersonCutoutRouteWithFallback({
        execute,
        portraitRuntime,
        selectedRuntime: videoObjectRuntime,
      }),
    ).rejects.toBe(cancelled);
    expect(execute).toHaveBeenCalledOnce();
  });
});
