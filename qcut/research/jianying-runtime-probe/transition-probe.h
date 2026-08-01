#pragma once

#include <filesystem>
#include <optional>

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

void inspectTransitionCore(const TransitionInspectRequest& request);

[[nodiscard]] bool renderTransitionFrame(const TransitionFrameRequest& request);

}  // namespace jianying_probe
