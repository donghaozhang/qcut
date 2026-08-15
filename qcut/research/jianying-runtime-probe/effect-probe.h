#pragma once

#include <cstdint>
#include <filesystem>
#include <memory>
#include <span>
#include <vector>

namespace jianying_probe {

/** One adjustable slider, keyed by the package's `effects_adjust_*` name. */
struct EffectAdjustParameter {
  std::string key;
  double value = 0.0;  // normalized 0..1, exactly as stored in a draft
};

struct EffectSessionFrameRequest {
  std::span<const std::uint8_t> inputPixels;
  /** Seconds since the effect segment's start; drives the package's seek. */
  double seconds = 0.0;
};

struct EffectPixelFrameResult {
  bool rendered = false;
  std::vector<std::uint8_t> outputPixels;
};

struct EffectPixelFrameRequest {
  std::filesystem::path runtimeRoot;
  std::filesystem::path packagePath;
  int width;
  int height;
  std::span<const std::uint8_t> inputPixels;
  double seconds = 0.0;
  std::span<const EffectAdjustParameter> adjustParameters;
};

/**
 * Renders a Jianying video-effect (特效) package over a single input frame.
 *
 * The package is loaded once per session; every frame reuses the same swing
 * manager, so a clip's frames cost one setup instead of N.
 */
class EffectPixelSession {
 public:
  EffectPixelSession(const std::filesystem::path& runtimeRoot,
                     const std::filesystem::path& packagePath, int width,
                     int height,
                     std::span<const EffectAdjustParameter> adjustParameters);
  ~EffectPixelSession();

  EffectPixelSession(const EffectPixelSession&) = delete;
  EffectPixelSession& operator=(const EffectPixelSession&) = delete;
  EffectPixelSession(EffectPixelSession&&) noexcept;
  EffectPixelSession& operator=(EffectPixelSession&&) noexcept;

  [[nodiscard]] EffectPixelFrameResult renderFrame(
      const EffectSessionFrameRequest& request);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

[[nodiscard]] EffectPixelFrameResult renderEffectPixelFrame(
    const EffectPixelFrameRequest& request);

/** Loads a package and reports whether it rendered at the given timestamp. */
[[nodiscard]] bool inspectEffectPackage(
    const std::filesystem::path& runtimeRoot,
    const std::filesystem::path& packagePath, double seconds);

}  // namespace jianying_probe
