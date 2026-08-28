#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

struct TemporalForegroundConfig {
  std::uint8_t minimumCurrentAlpha = 48;
  std::uint8_t minimumReferenceAlpha = 192;
  std::uint8_t maximumColorDistance = 42;
  std::uint8_t interiorSupportAlpha = 48;
  std::uint8_t interiorTargetAlpha = 244;
  float decayPerFrame = 0.985F;
  int interiorRadius = 3;
  int maximumMotionPixels = 0;
  int motionRefinementRadius = 2;
  int motionSampleStride = 8;
  int referenceInteriorRadius = 2;
  int minimumZeroAlphaReferences = 2;
};

struct TemporalForegroundFrameView {
  const std::vector<std::uint8_t> *rgba;
  const std::vector<std::uint8_t> *alpha;
  int frameOffset;
};

std::vector<std::uint8_t> stabilizeTemporalForeground(
    const std::vector<TemporalForegroundFrameView> &frames, int width,
    int height, TemporalForegroundConfig config = {});

} // namespace qcut::matting
