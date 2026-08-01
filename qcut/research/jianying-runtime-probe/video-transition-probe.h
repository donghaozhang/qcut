#pragma once

#include <cstddef>
#include <filesystem>

namespace jianying_probe {

struct RawVideoTransitionRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  std::filesystem::path inputAPath;
  std::filesystem::path inputBPath;
  std::filesystem::path outputPath;
  int width;
  int height;
  double frameRate;
  double transitionDurationSeconds;
  bool holdExactEndpoints;
};

struct RawVideoTransitionResult {
  std::size_t inputAFrames;
  std::size_t inputBFrames;
  std::size_t transitionFrames;
  std::size_t outputFrames;
};

[[nodiscard]] RawVideoTransitionResult renderRawVideoTransition(
    const RawVideoTransitionRequest& request);

}  // namespace jianying_probe
