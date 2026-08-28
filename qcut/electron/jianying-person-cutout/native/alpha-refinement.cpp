#include "alpha-refinement.hpp"

#include <algorithm>
#include <array>
#include <cmath>

namespace {

std::vector<float> morphAlpha(const std::vector<float> &input, int width,
                              int height, int radius, bool dilate) {
  if (radius == 0) {
    return input;
  }
  std::vector<float> horizontal(input.size());
  std::vector<float> output(input.size());
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      float value = dilate ? 0.0F : 1.0F;
      for (int sampleX = std::max(0, x - radius);
           sampleX <= std::min(width - 1, x + radius); ++sampleX) {
        const float sample =
            input[static_cast<std::size_t>(y) * width + sampleX];
        value = dilate ? std::max(value, sample) : std::min(value, sample);
      }
      horizontal[static_cast<std::size_t>(y) * width + x] = value;
    }
  }
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      float value = dilate ? 0.0F : 1.0F;
      for (int sampleY = std::max(0, y - radius);
           sampleY <= std::min(height - 1, y + radius); ++sampleY) {
        const float sample =
            horizontal[static_cast<std::size_t>(sampleY) * width + x];
        value = dilate ? std::max(value, sample) : std::min(value, sample);
      }
      output[static_cast<std::size_t>(y) * width + x] = value;
    }
  }
  return output;
}

} // namespace

namespace qcut::matting {

std::vector<std::uint8_t> applyJianyingPortraitBorderLut(
    const std::vector<std::uint8_t> &input) {
  static const std::array<std::uint8_t, 256> lut = [] {
    constexpr float slope = 8.0F;
    constexpr float center = 0.65F;
    constexpr float halfPi = 1.57079632679489661923F;
    const float halfWidth = halfPi / slope;
    std::array<std::uint8_t, 256> values{};
    for (std::size_t index = 0; index < values.size(); ++index) {
      const float normalized = static_cast<float>(
          static_cast<double>(index) * (1.0 / 255.0));
      if (normalized < center - halfWidth) {
        values[index] = 0;
        continue;
      }
      if (normalized > center + halfWidth) {
        values[index] = 255;
        continue;
      }
      const float mapped = static_cast<float>(
          static_cast<double>(std::sin((normalized - center) * slope)) * 0.5 +
          0.5);
      values[index] = static_cast<std::uint8_t>(mapped * 255.0F);
    }
    return values;
  }();

  std::vector<std::uint8_t> output(input.size());
  for (std::size_t index = 0; index < input.size(); ++index) {
    output[index] = lut[input[index]];
  }
  return output;
}

std::vector<std::uint8_t>
refineAlpha(const std::vector<std::uint8_t> &input,
            std::vector<float> &temporalState, int width, int height,
            float threshold, float temporalSmoothing, float edgeShift,
            float feather) {
  std::vector<float> current(input.size());
  for (std::size_t index = 0; index < input.size(); ++index) {
    current[index] = static_cast<float>(input[index]) / 255.0F;
  }
  if (temporalState.size() != current.size()) {
    temporalState = current;
  } else {
    for (std::size_t index = 0; index < current.size(); ++index) {
      temporalState[index] = temporalState[index] * temporalSmoothing +
                             current[index] * (1.0F - temporalSmoothing);
    }
  }
  const int radius =
      std::min(12, static_cast<int>(std::round(std::abs(edgeShift))));
  const auto shifted =
      morphAlpha(temporalState, width, height, radius, edgeShift > 0.0F);
  if (std::abs(threshold - 0.5F) < 0.0001F && feather == 0.0F) {
    std::vector<std::uint8_t> output(input.size());
    for (std::size_t index = 0; index < shifted.size(); ++index) {
      output[index] = static_cast<std::uint8_t>(
          std::round(std::clamp(shifted[index], 0.0F, 1.0F) * 255.0F));
    }
    return output;
  }
  const float transition =
      std::min(0.45F, 0.04F + std::max(0.0F, feather) * 0.04F);
  const float lower = threshold - transition;
  const float upper = threshold + transition;
  std::vector<std::uint8_t> output(input.size());
  for (std::size_t index = 0; index < shifted.size(); ++index) {
    const float normalized =
        std::clamp((shifted[index] - lower) /
                       std::max(0.0001F, upper - lower),
                   0.0F, 1.0F);
    const float alpha = normalized * normalized * (3.0F - 2.0F * normalized);
    output[index] = static_cast<std::uint8_t>(std::round(alpha * 255.0F));
  }
  return output;
}

} // namespace qcut::matting
