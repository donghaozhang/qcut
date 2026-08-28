import type { JianyingVideoObjectRuntimeCandidate } from "./video-object-runtime.js";

export interface VideoObjectBridgeSettings {
  edgeShift: number;
  feather: number;
  temporalSmoothing: number;
  threshold: number;
}

export function createVideoObjectBridgeArguments({
  height,
  inputPath,
  outputPath,
  settings,
  videoObject,
  width,
}: {
  height: number;
  inputPath: string;
  outputPath: string;
  settings: VideoObjectBridgeSettings;
  videoObject: JianyingVideoObjectRuntimeCandidate;
  width: number;
}) {
  const refinementArguments = [
    String(settings.threshold),
    String(settings.temporalSmoothing),
    String(settings.edgeShift),
    String(settings.feather),
  ];
  if (videoObject.executionBackend === "jianying-bach-v2-exact-d634-v1") {
    if (!videoObject.libraryPath || !videoObject.graphDirectory) {
      throw new Error("剪映 Bach 物体抠像运行时不完整");
    }
    return [
      videoObject.libraryPath,
      videoObject.graphDirectory,
      videoObject.modelPath,
      inputPath,
      String(width),
      String(height),
      outputPath,
      ...refinementArguments,
    ];
  }
  if (videoObject.executionBackend === "same-model-coreml-v1") {
    if (!videoObject.coreMLModelPath) {
      throw new Error("同模型物体抠像运行时不完整");
    }
    return [
      videoObject.coreMLModelPath,
      inputPath,
      String(width),
      String(height),
      outputPath,
      ...refinementArguments,
    ];
  }
  if (!videoObject.libraryPath || !videoObject.effectDirectory) {
    throw new Error("剪映物体抠像宿主运行时不完整");
  }
  return [
    videoObject.libraryPath,
    videoObject.modelDirectory,
    videoObject.effectDirectory,
    inputPath,
    String(width),
    String(height),
    outputPath,
    ...refinementArguments,
    "--route",
    "video-object",
  ];
}
