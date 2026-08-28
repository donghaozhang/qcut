#include "video-object-alpha-quality.hpp"

#include <algorithm>
#include <stdexcept>

namespace qcut::matting {

void requireCalibratedVideoObjectAlpha(
    const std::vector<std::uint8_t> &alpha) {
  if (alpha.empty()) {
    throw std::runtime_error("video-object graph returned an empty alpha mask");
  }
  const auto maximum = std::max_element(alpha.begin(), alpha.end());
  if (*maximum <= 2) {
    throw std::runtime_error(
        "video-object graph requires Jianying's host Metal context; "
        "fall back to portrait GRU");
  }
}

} // namespace qcut::matting
