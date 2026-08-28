export type PersonCutoutModelRoute =
  "portrait-gru" | "video-object" | "saliency-script";

export type VideoObjectExecutionBackend =
  | "effect-host-interop-v1"
  | "jianying-bach-v2-exact-d634-v1"
  | "same-model-coreml-v1";

export type PersonCutoutProviderId =
  | "qcut-local-person-matting-v1"
  | "qcut-jianying-video-object-bach-v2-exact-d634-v1"
  | "qcut-video-object-same-model-coreml-v1"
  | "qcut-video-object-interop-experimental-v1"
  | "qcut-saliency-interop-experimental-v1";

export type PersonCutoutPipelineId =
  | "qcut-gru-vision-fusion-v1"
  | "qcut-gru-only-v1"
  | "qcut-jianying-video-object-bach-v2-exact-d634-v1"
  | "qcut-jianying-video-object-bach-v2-refined-d634-v1"
  | "qcut-video-object-same-model-coreml-v1"
  | "qcut-video-object-same-model-coreml-refined-v1"
  | "qcut-video-object-interop-experimental-v1"
  | "qcut-saliency-script-interop-experimental-v1";

export type PersonCutoutRefinementProvider =
  | "qcut-portrait-temporal-border-refinement-v1"
  | "vendor-v2-exact-no-qcut-refinement-v1"
  | "qcut-alpha-refinement-after-vendor-v2-v1"
  | "qcut-same-model-graph-output-v1"
  | "qcut-effect-graph-alpha-refinement-v1";

interface PersonCutoutPipelineDescriptorShape {
  experimental: boolean;
  modelRoute: PersonCutoutModelRoute;
  pipelineId: PersonCutoutPipelineId;
  providerId: PersonCutoutProviderId;
  refinementProvider: PersonCutoutRefinementProvider;
}

export const GRU_VISION_PERSON_CUTOUT_PIPELINE = {
  experimental: false,
  modelRoute: "portrait-gru",
  pipelineId: "qcut-gru-vision-fusion-v1",
  providerId: "qcut-local-person-matting-v1",
  refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const GRU_ONLY_PERSON_CUTOUT_PIPELINE = {
  experimental: false,
  modelRoute: "portrait-gru",
  pipelineId: "qcut-gru-only-v1",
  providerId: "qcut-local-person-matting-v1",
  refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE = {
  experimental: false,
  modelRoute: "video-object",
  pipelineId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
  providerId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
  refinementProvider: "vendor-v2-exact-no-qcut-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE = {
  experimental: true,
  modelRoute: "video-object",
  pipelineId: "qcut-jianying-video-object-bach-v2-refined-d634-v1",
  providerId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
  refinementProvider: "qcut-alpha-refinement-after-vendor-v2-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE = {
  experimental: false,
  modelRoute: "video-object",
  pipelineId: "qcut-video-object-same-model-coreml-v1",
  providerId: "qcut-video-object-same-model-coreml-v1",
  refinementProvider: "qcut-same-model-graph-output-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE = {
  experimental: true,
  modelRoute: "video-object",
  pipelineId: "qcut-video-object-same-model-coreml-refined-v1",
  providerId: "qcut-video-object-same-model-coreml-v1",
  refinementProvider: "qcut-effect-graph-alpha-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const VIDEO_OBJECT_HOST_INTEROP_PERSON_CUTOUT_PIPELINE = {
  experimental: true,
  modelRoute: "video-object",
  pipelineId: "qcut-video-object-interop-experimental-v1",
  providerId: "qcut-video-object-interop-experimental-v1",
  refinementProvider: "qcut-effect-graph-alpha-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export const SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE = {
  experimental: true,
  modelRoute: "saliency-script",
  pipelineId: "qcut-saliency-script-interop-experimental-v1",
  providerId: "qcut-saliency-interop-experimental-v1",
  refinementProvider: "qcut-effect-graph-alpha-refinement-v1",
} as const satisfies PersonCutoutPipelineDescriptorShape;

export type PersonCutoutPipelineDescriptor =
  | typeof GRU_VISION_PERSON_CUTOUT_PIPELINE
  | typeof GRU_ONLY_PERSON_CUTOUT_PIPELINE
  | typeof JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE
  | typeof JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE
  | typeof VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE
  | typeof VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE
  | typeof VIDEO_OBJECT_HOST_INTEROP_PERSON_CUTOUT_PIPELINE
  | typeof SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE;

export function selectVideoObjectPersonCutoutPipeline({
  executionBackend,
  settings,
}: {
  executionBackend: VideoObjectExecutionBackend;
  settings: {
    edgeShift: number;
    feather: number;
    temporalSmoothing: number;
    threshold: number;
  };
}): PersonCutoutPipelineDescriptor {
  const usesIdentityGraphOutput =
    Math.fround(settings.threshold) === 0.5 &&
    Math.fround(settings.temporalSmoothing) === 0 &&
    Math.fround(settings.edgeShift) === 0 &&
    Math.fround(settings.feather) === 0;
  if (executionBackend === "jianying-bach-v2-exact-d634-v1") {
    return usesIdentityGraphOutput
      ? JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE
      : JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE;
  }
  if (executionBackend === "effect-host-interop-v1") {
    return VIDEO_OBJECT_HOST_INTEROP_PERSON_CUTOUT_PIPELINE;
  }
  return usesIdentityGraphOutput
    ? VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE
    : VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE;
}

export function defaultPersonCutoutPipelineDescriptor({
  modelRoute,
}: {
  modelRoute: PersonCutoutModelRoute;
}): PersonCutoutPipelineDescriptor {
  if (modelRoute === "video-object") {
    return JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE;
  }
  if (modelRoute === "saliency-script") {
    return SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE;
  }
  return GRU_VISION_PERSON_CUTOUT_PIPELINE;
}
