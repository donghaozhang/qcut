#include "video-object-coreml-preprocess.hpp"

#include "alpha-resize.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdexcept>

namespace qcut::matting {
namespace {

constexpr int kModelDimension = 256;

} // namespace

std::vector<std::uint8_t> resizeVideoObjectRgbaBilinear(
    const std::vector<std::uint8_t> &source, int sourceWidth, int sourceHeight,
    int targetWidth, int targetHeight) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 ||
      targetHeight <= 0 ||
      source.size() !=
          static_cast<std::size_t>(sourceWidth) * sourceHeight * 4) {
    throw std::runtime_error("video-object RGBA input size is invalid");
  }
  std::vector<std::uint8_t> target(
      static_cast<std::size_t>(targetWidth) * targetHeight * 4);
  const float scaleX = static_cast<float>(sourceWidth) / targetWidth;
  const float scaleY = static_cast<float>(sourceHeight) / targetHeight;
  for (int y = 0; y < targetHeight; ++y) {
    const float sourceY = std::clamp((y + 0.5F) * scaleY - 0.5F, 0.0F,
                                     static_cast<float>(sourceHeight - 1));
    const int y0 = static_cast<int>(std::floor(sourceY));
    const int y1 = std::min(y0 + 1, sourceHeight - 1);
    const float fractionY = sourceY - y0;
    for (int x = 0; x < targetWidth; ++x) {
      const float sourceX = std::clamp((x + 0.5F) * scaleX - 0.5F, 0.0F,
                                       static_cast<float>(sourceWidth - 1));
      const int x0 = static_cast<int>(std::floor(sourceX));
      const int x1 = std::min(x0 + 1, sourceWidth - 1);
      const float fractionX = sourceX - x0;
      for (int channel = 0; channel < 4; ++channel) {
        const auto sample = [&](int sampleX, int sampleY) {
          return static_cast<float>(
              source[(static_cast<std::size_t>(sampleY) * sourceWidth +
                      sampleX) *
                         4 +
                     channel]);
        };
        const float top = std::lerp(sample(x0, y0), sample(x1, y0), fractionX);
        const float bottom =
            std::lerp(sample(x0, y1), sample(x1, y1), fractionX);
        target[(static_cast<std::size_t>(y) * targetWidth + x) * 4 + channel] =
            static_cast<std::uint8_t>(
                std::clamp(std::lround(std::lerp(top, bottom, fractionY)), 0L,
                           255L));
      }
    }
  }
  return target;
}

std::vector<float>
prepareVideoObjectCoreMLInput(const std::vector<std::uint8_t> &rgba, int width,
                              int height) {
  const auto modelInput = resizeVideoObjectRgbaBilinear(
      rgba, width, height, kModelDimension, kModelDimension);
  constexpr std::size_t plane = kModelDimension * kModelDimension;
  std::vector<float> bgr(plane * 3);
  for (std::size_t pixel = 0; pixel < plane; ++pixel) {
    bgr[pixel] = modelInput[pixel * 4 + 2] / 255.0F;
    bgr[plane + pixel] = modelInput[pixel * 4 + 1] / 255.0F;
    bgr[plane * 2 + pixel] = modelInput[pixel * 4] / 255.0F;
  }
  return bgr;
}

std::vector<std::uint8_t>
finalizeVideoObjectCoreMLOutput(const float *mask, int width, int height) {
  if (mask == nullptr) {
    throw std::runtime_error("video-object CoreML output is missing");
  }
  std::vector<std::uint8_t> modelMask(kModelDimension * kModelDimension);
  for (std::size_t index = 0; index < modelMask.size(); ++index) {
    if (!std::isfinite(mask[index])) {
      throw std::runtime_error("video-object CoreML output is not finite");
    }
    const float value = std::clamp(mask[index], 0.0F, 1.0F);
    modelMask[index] =
        static_cast<std::uint8_t>(std::lround(value * 255.0F));
  }
  return resizeAlphaBilinear(modelMask, kModelDimension, kModelDimension, width,
                             height);
}

VideoObjectCoreMLTemporalState::VideoObjectCoreMLTemporalState()
    : previousImage_(kImageElementCount), previousMask_(kMaskElementCount) {}

const float *VideoObjectCoreMLTemporalState::previousImage() const {
  return previousImage_.data();
}

const float *VideoObjectCoreMLTemporalState::previousMask() const {
  return previousMask_.data();
}

void VideoObjectCoreMLTemporalState::advance(const float *image,
                                             const float *mask) {
  if (image == nullptr || mask == nullptr) {
    throw std::runtime_error("video-object temporal input is missing");
  }
  std::copy_n(image, kImageElementCount, previousImage_.begin());
  std::copy_n(mask, kMaskElementCount, previousMask_.begin());
}

void VideoObjectCoreMLTemporalState::reset() {
  std::fill(previousImage_.begin(), previousImage_.end(), 0.0F);
  std::fill(previousMask_.begin(), previousMask_.end(), 0.0F);
}

} // namespace qcut::matting
