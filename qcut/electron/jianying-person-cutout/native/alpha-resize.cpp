#include "alpha-resize.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace qcut::matting {

std::vector<std::uint8_t>
resizeAlphaBilinear(const std::vector<std::uint8_t> &source, int sourceWidth,
                    int sourceHeight, int targetWidth, int targetHeight) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 ||
      targetHeight <= 0 ||
      source.size() != static_cast<std::size_t>(sourceWidth) * sourceHeight) {
    throw std::invalid_argument("invalid alpha resize dimensions");
  }
  std::vector<std::uint8_t> target(static_cast<std::size_t>(targetWidth) *
                                   targetHeight);
  for (int targetY = 0; targetY < targetHeight; ++targetY) {
    const float sourceY =
        (static_cast<float>(targetY) + 0.5F) * sourceHeight / targetHeight -
        0.5F;
    const int top = std::clamp(static_cast<int>(std::floor(sourceY)), 0,
                               sourceHeight - 1);
    const int bottom = std::min(top + 1, sourceHeight - 1);
    const float verticalWeight = std::clamp(sourceY - top, 0.0F, 1.0F);
    for (int targetX = 0; targetX < targetWidth; ++targetX) {
      const float sourceX =
          (static_cast<float>(targetX) + 0.5F) * sourceWidth / targetWidth -
          0.5F;
      const int left = std::clamp(static_cast<int>(std::floor(sourceX)), 0,
                                  sourceWidth - 1);
      const int right = std::min(left + 1, sourceWidth - 1);
      const float horizontalWeight = std::clamp(sourceX - left, 0.0F, 1.0F);
      const float topValue =
          source[static_cast<std::size_t>(top) * sourceWidth + left] *
              (1.0F - horizontalWeight) +
          source[static_cast<std::size_t>(top) * sourceWidth + right] *
              horizontalWeight;
      const float bottomValue =
          source[static_cast<std::size_t>(bottom) * sourceWidth + left] *
              (1.0F - horizontalWeight) +
          source[static_cast<std::size_t>(bottom) * sourceWidth + right] *
              horizontalWeight;
      target[static_cast<std::size_t>(targetY) * targetWidth + targetX] =
          static_cast<std::uint8_t>(std::round(
              topValue * (1.0F - verticalWeight) +
              bottomValue * verticalWeight));
    }
  }
  return target;
}

} // namespace qcut::matting
