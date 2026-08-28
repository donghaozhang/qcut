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

class MetalMattingBlend {
public:
  explicit MetalMattingBlend(const MetalMattingBlendConfig &config);
  ~MetalMattingBlend();

  MetalMattingBlend(const MetalMattingBlend &) = delete;
  MetalMattingBlend &operator=(const MetalMattingBlend &) = delete;

  std::vector<std::uint8_t>
  blendAlpha(const MetalMattingBlendFrame &frame) const;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace qcut::matting
