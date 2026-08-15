#pragma once

#include <cstddef>
#include <filesystem>
#include <span>
#include <vector>

#include "effect-probe.h"

namespace jianying_probe {

struct RawVideoEffectRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  std::filesystem::path inputPath;
  std::filesystem::path outputPath;
  int width;
  int height;
  double frameRate;
  /**
   * Where the effect segment starts inside the input, and how long it runs.
   * Frames outside the window are copied through untouched, which is what an
   * effect clip on its own track does to the frames it does not cover.
   */
  double startSeconds = 0.0;
  double durationSeconds = 3.0;
  std::span<const EffectAdjustParameter> adjustParameters;
};

struct RawVideoEffectResult {
  std::size_t inputFrames = 0;
  std::size_t effectFrames = 0;
  std::size_t outputFrames = 0;
};

[[nodiscard]] RawVideoEffectResult renderRawVideoEffect(
    const RawVideoEffectRequest& request);

}  // namespace jianying_probe
