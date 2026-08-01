#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <span>
#include <vector>

namespace jianying_probe {

struct TransitionInspectRequest {
  std::filesystem::path runtimeRoot;
  std::optional<std::filesystem::path> packagePath;
  bool enableTransitionII = false;
};

struct TransitionFrameRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  double progress = 0.5;
};

struct TransitionPixelFrameRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  int width;
  int height;
  std::span<const std::uint8_t> inputAPixels;
  std::span<const std::uint8_t> inputBPixels;
  double progress;
};

struct TransitionPixelFrameResult {
  bool rendered = false;
  std::vector<std::uint8_t> outputPixels;
};

void inspectTransitionCore(const TransitionInspectRequest& request);

[[nodiscard]] bool renderTransitionFrame(const TransitionFrameRequest& request);

[[nodiscard]] TransitionPixelFrameResult renderTransitionPixelFrame(
    const TransitionPixelFrameRequest& request);

}  // namespace jianying_probe
