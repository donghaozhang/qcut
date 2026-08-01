#pragma once

#include <cstdint>
#include <filesystem>
#include <memory>
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

struct TransitionSessionFrameRequest {
  std::span<const std::uint8_t> inputAPixels;
  std::span<const std::uint8_t> inputBPixels;
  double progress;
};

class TransitionPixelSession {
 public:
  TransitionPixelSession(const std::filesystem::path& runtimeRoot,
                         const std::filesystem::path& packagePath, int width,
                         int height);
  ~TransitionPixelSession();

  TransitionPixelSession(const TransitionPixelSession&) = delete;
  TransitionPixelSession& operator=(const TransitionPixelSession&) = delete;
  TransitionPixelSession(TransitionPixelSession&&) noexcept;
  TransitionPixelSession& operator=(TransitionPixelSession&&) noexcept;

  [[nodiscard]] TransitionPixelFrameResult renderFrame(
      const TransitionSessionFrameRequest& request);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

void inspectTransitionCore(const TransitionInspectRequest& request);

[[nodiscard]] bool renderTransitionFrame(const TransitionFrameRequest& request);

[[nodiscard]] TransitionPixelFrameResult renderTransitionPixelFrame(
    const TransitionPixelFrameRequest& request);

}  // namespace jianying_probe
