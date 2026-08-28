#pragma once

#include <cstdint>
#include <memory>
#include <vector>

namespace qcut::matting {

struct MetalMattingBlendConfig {
  void *library;
  int width;
  int height;
};

struct MetalMattingBlendFrame {
  const std::vector<std::uint8_t> &rgba;
  const std::vector<std::uint8_t> &alpha;
  int alphaWidth;
  int alphaHeight;
};

namespace detail {

void validateMetalMattingBlendFrame(const MetalMattingBlendFrame &frame,
                                    int width, int height);

std::vector<std::uint8_t> extractMetalMattingBlendAlpha(
    const MetalMattingBlendFrame &frame,
    const std::vector<std::uint8_t> &blendedRgba, int width, int height);

void clampMetalMattingBlendAlphaToSource(
    const std::vector<std::uint8_t> &rgba,
    std::vector<std::uint8_t> &alpha);

} // namespace detail

class MetalMattingBlend {
public:
  explicit MetalMattingBlend(const MetalMattingBlendConfig &config);
  ~MetalMattingBlend();

  MetalMattingBlend(const MetalMattingBlend &) = delete;
  MetalMattingBlend &operator=(const MetalMattingBlend &) = delete;

  std::vector<std::uint8_t>
  blendAlpha(const MetalMattingBlendFrame &frame);

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace qcut::matting
