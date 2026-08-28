#pragma once

#include <cstdint>
#include <vector>

namespace qcut::matting {

std::vector<std::uint8_t> resizeVideoObjectRgbaBilinear(
    const std::vector<std::uint8_t> &source, int sourceWidth, int sourceHeight,
    int targetWidth, int targetHeight);

std::vector<float>
prepareVideoObjectCoreMLInput(const std::vector<std::uint8_t> &rgba, int width,
                              int height);

std::vector<std::uint8_t>
finalizeVideoObjectCoreMLOutput(const float *mask, int width, int height);

class VideoObjectCoreMLTemporalState {
public:
  static constexpr int kImageElementCount = 3 * 256 * 256;
  static constexpr int kMaskElementCount = 256 * 256;

  VideoObjectCoreMLTemporalState();

  const float *previousImage() const;
  const float *previousMask() const;
  void advance(const float *image, const float *mask);
  void reset();

private:
  std::vector<float> previousImage_;
  std::vector<float> previousMask_;
};

} // namespace qcut::matting
