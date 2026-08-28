import { describe, expect, it } from "vitest";
import { createVideoObjectBridgeArguments } from "../jianying-person-cutout/video-object-bridge-arguments.js";
import {
  VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY,
  VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY,
  VIDEO_OBJECT_PROVIDER_CAPABILITY,
  type JianyingVideoObjectRuntimeCandidate,
} from "../jianying-person-cutout/video-object-runtime.js";

const settings = {
  edgeShift: 2,
  feather: 3,
  temporalSmoothing: 0.25,
  threshold: 0.6,
};

function candidate({
  executionBackend,
}: {
  executionBackend: JianyingVideoObjectRuntimeCandidate["executionBackend"];
}): JianyingVideoObjectRuntimeCandidate {
  const isBach = executionBackend === "jianying-bach-v2-exact-d634-v1";
  const isCoreML = executionBackend === "same-model-coreml-v1";
  return {
    bridgePath: "/bridge",
    capabilitySha256: "capability",
    coreMLModelPath: isCoreML ? "/model.mlmodelc" : null,
    dependencyClosureSha256: isBach ? "dependency-closure" : null,
    effectDirectory: isBach || isCoreML ? null : "/effect",
    executionBackend,
    frameworkDirectory: isCoreML ? null : "/frameworks",
    graphDirectory: isBach ? "/graph" : null,
    libraryPath: isCoreML ? null : "/frameworks/libcccreator.dylib",
    modelDirectory: "/models",
    modelPath: "/models/video-object.model",
    modelSha256: "model",
    processorSha256: "processor",
    providerCapability: isBach
      ? VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY
      : isCoreML
        ? VIDEO_OBJECT_PROVIDER_CAPABILITY
        : VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY,
    readiness: isBach
      ? VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY.readiness
      : isCoreML
        ? VIDEO_OBJECT_PROVIDER_CAPABILITY.readiness
        : VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY.readiness,
  };
}

function args({
  executionBackend,
  inputPath = "/source.rgba",
}: {
  executionBackend: JianyingVideoObjectRuntimeCandidate["executionBackend"];
  inputPath?: string;
}) {
  return createVideoObjectBridgeArguments({
    height: 640,
    inputPath,
    outputPath: "/alpha.gray",
    settings,
    videoObject: candidate({ executionBackend }),
    width: 360,
  });
}

describe("video-object bridge arguments", () => {
  it("streams decoded frames through stdin for every provider", () => {
    for (const executionBackend of [
      "jianying-bach-v2-exact-d634-v1",
      "same-model-coreml-v1",
      "effect-host-interop-v1",
    ] as const) {
      expect(args({ executionBackend, inputPath: "-" })).toContain("-");
    }
  });

  it("passes the pinned runtime, graph, packed model, and refinement to Bach", () => {
    expect(
      args({ executionBackend: "jianying-bach-v2-exact-d634-v1" }),
    ).toEqual([
      "/frameworks/libcccreator.dylib",
      "/graph",
      "/models/video-object.model",
      "/source.rgba",
      "360",
      "640",
      "/alpha.gray",
      "0.6",
      "0.25",
      "2",
      "3",
    ]);
  });

  it("keeps direct CoreML and legacy host contracts distinct", () => {
    expect(args({ executionBackend: "same-model-coreml-v1" })).toEqual([
      "/model.mlmodelc",
      "/source.rgba",
      "360",
      "640",
      "/alpha.gray",
      "0.6",
      "0.25",
      "2",
      "3",
    ]);
    expect(args({ executionBackend: "effect-host-interop-v1" })).toEqual([
      "/frameworks/libcccreator.dylib",
      "/models",
      "/effect",
      "/source.rgba",
      "360",
      "640",
      "/alpha.gray",
      "0.6",
      "0.25",
      "2",
      "3",
      "--route",
      "video-object",
    ]);
  });

  it("fails closed when a backend-specific pinned asset is absent", () => {
    const bach = candidate({
      executionBackend: "jianying-bach-v2-exact-d634-v1",
    });
    bach.graphDirectory = null;
    expect(() =>
      createVideoObjectBridgeArguments({
        height: 640,
        inputPath: "/source.rgba",
        outputPath: "/alpha.gray",
        settings,
        videoObject: bach,
        width: 360,
      }),
    ).toThrow("Bach 物体抠像运行时不完整");
  });
});
