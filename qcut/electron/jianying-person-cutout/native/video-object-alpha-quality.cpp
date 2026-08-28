#include "video-object-alpha-quality.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>

namespace qcut::matting {

const char *videoObjectAlphaQualityCapability() {
  return "video-object-alpha-quality-v1";
}

void VideoObjectAlphaQualityGate::observe(
    const std::vector<std::uint8_t> &alpha) {
  if (alpha.empty()) {
    throw std::runtime_error("video-object graph returned an empty alpha mask");
  }
  const auto maximum = std::max_element(alpha.begin(), alpha.end());
  if (*maximum > 2) {
    hasObservedUsableAlpha_ = true;
    return;
  }
  if (*maximum > 0) {
    hasObservedQuantizedNoise_ = true;
  }
}

void VideoObjectAlphaQualityGate::finalize() const {
  if (hasObservedUsableAlpha_ || !hasObservedQuantizedNoise_) {
    return;
  }
  throw std::runtime_error(
      std::string(videoObjectAlphaQualityCapability()) +
      ": video-object graph returned only the hostless 0/1/2 Alpha signature "
      "for the complete stream; fall back to portrait GRU");
}

} // namespace qcut::matting
